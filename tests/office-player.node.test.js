import assert from 'node:assert/strict'
import { setImmediate as nextTurn, setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { createOfficePlayer } from '../src/office-player.js'

const deferred = () => {
  let resolve
  const promise = new Promise((done) => (resolve = done))
  return { promise, resolve }
}

/**
 * 模拟跨 iframe RPC 的契约：对象路径同步取得代理，标量属性和方法异步完成。
 * 可控 gate 用于精确安排迟到回包，不依赖耗时猜测；这些测试不替代真实 WPS 验证。
 */
function fixture(options = {}) {
  const calls = []
  const states = []
  const pages = []
  const subscriptions = {}
  const raw = { page: 1, click: 0, running: false, destroyed: 0 }
  const mount = options.mount || {
    children: [],
    replaceChildren() {
      this.children = []
    }
  }
  const clicks = options.clicks || [2, 1, 0]
  const remote = (properties) =>
    new Proxy(
      {},
      {
        get: (_, name) => {
          if (name === 'then') return undefined
          const property = properties[name]
          return typeof property === 'function' ? property() : property
        }
      }
    )
  const rpc =
    (name, action = () => {}) =>
    async (...args) => {
      calls.push({ name, args })
      await Promise.resolve()
      return action(...args)
    }
  const view = remote({
    Slide: remote({
      SlideIndex: () => {
        calls.push({ name: 'ReadSlideIndex' })
        // 读数在请求发出时固定；即使导航已完成，迟到响应仍可能携带旧页码。
        const snapshot = raw.page
        return options.readGate
          ? options.readGate.promise.then(() => snapshot)
          : Promise.resolve(snapshot)
      }
    }),
    GetClickIndex: () => rpc('GetClickIndex', () => raw.click),
    GetClickCount: () => rpc('GetClickCount', () => clicks[raw.page - 1]),
    GotoNextClick: () => rpc('GotoNextClick', () => raw.click++),
    GotoPreClick: () => rpc('GotoPreClick', () => raw.click--),
    GotoSlide: () =>
      rpc('GotoSlide', async (page) => {
        if (options.navigationGate && page !== raw.page) await options.navigationGate.promise
        raw.page = page
        raw.click = 0
      }),
    Exit: () =>
      rpc('Exit', () => {
        raw.running = false
      })
  })
  const settings = remote({
    Run: () =>
      rpc('Run', () => {
        raw.running = true
        // 默认模拟事件先于 RPC 回包；独立 gate 覆盖真实服务事件迟到的情况。
        if (!options.manualPresentationEvent) subscriptions.SlideShowBegin?.()
      }),
    StopAutoPlay: () => rpc('StopAutoPlay'),
    SetMiniThumbnailVisible: () =>
      rpc('SetMiniThumbnailVisible', async () => {
        if (options.toolbarGate) await options.toolbarGate.promise
      }),
    SetPlayToolbarPosition: () =>
      rpc('SetPlayToolbarPosition', async () => {
        if (options.toolbarGate) await options.toolbarGate.promise
      })
  })
  const presentation = remote({
    Slides: remote({ Count: () => Promise.resolve(clicks.length) }),
    PageSetup: remote({
      SlideWidth: () => Promise.resolve(options.slideWidth ?? 960),
      SlideHeight: () => Promise.resolve(options.slideHeight ?? 540)
    }),
    SlideShowSettings: settings,
    SlideShowWindow: remote({ View: view })
  })
  const pdf = remote({
    PagesCount: () => Promise.resolve(options.pdfPages ?? 3),
    CurrentPage: () => Promise.resolve(raw.page),
    JumpToPage: () =>
      rpc('JumpToPage', (page) => {
        // 模拟服务端按实际页数定位，以及内核未到达请求页时的真实回读结果。
        const target = Math.min(options.pdfPages ?? 3, Math.max(1, page))
        raw.page = options.pdfJumpResult ? options.pdfJumpResult(target) : target
      })
  })
  const instance = {
    iframe: { tabIndex: 0 },
    Application: remote({ ActivePresentation: presentation, ActivePDF: pdf, Sub: subscriptions }),
    ready: rpc('ready', async () => {
      if (options.readyGate) await options.readyGate.promise
    }),
    forceIframeResize: () => calls.push({ name: 'resize' }),
    destroy: () => {
      raw.destroyed++
      mount.children = mount.children.filter((child) => child !== instance.iframe)
    }
  }
  let configuration
  const sdk = {
    OfficeType: { Writer: 'writer', Pdf: 'pdf', Presentation: 'presentation' },
    init: rpc('init', async (config) => {
      configuration = config
      mount.children.push(instance.iframe)
      if (options.initGate) await options.initGate.promise
      return instance
    })
  }
  const player = createOfficePlayer({
    resource: { fileId: options.fileId || 'slides', code: options.code || '4' },
    mount,
    loadSDK: async () => sdk,
    initialPage: options.initialPage || 1,
    readyTimeout: options.readyTimeout || 500,
    operationTimeout: options.operationTimeout || 500,
    onState: (state) => states.push(state),
    onPage: (page) => pages.push(page),
    beforePageChange: options.beforePageChange || (async () => {}),
    waitForPaint: async (signal) => {
      calls.push({ name: 'WaitForPaint', signal })
      if (options.paintGate) await options.paintGate.promise
    }
  })
  return {
    player,
    raw,
    calls,
    states,
    pages,
    mount,
    subscriptions,
    get configuration() {
      return configuration
    },
    get state() {
      return states.at(-1)
    },
    count: (name) => calls.filter((call) => call.name === name).length
  }
}

test('Run 和定位已返回但放映事件未到时继续遮罩，绘制完成后才就绪', async (t) => {
  const paintGate = deferred()
  const f = fixture({ manualPresentationEvent: true, paintGate })
  t.after(() => {
    paintGate.resolve()
    f.player.dispose()
  })
  const started = f.player.start()
  await nextTurn()
  assert.equal(f.count('Run'), 1)
  assert.equal(f.count('GotoSlide'), 1)
  assert.equal(f.state.status, 'starting')
  assert.equal(f.count('WaitForPaint'), 0)
  assert.equal(await f.player.next(), false)

  f.subscriptions.SlideShowBegin()
  await nextTurn()
  assert.equal(f.count('WaitForPaint'), 1)
  assert.equal(f.state.status, 'starting')
  paintGate.resolve()
  await started
  assert.equal(f.state.status, 'ready')
  // 已打开课件切回和尺寸变化不重复走首开绘制等待。
  f.player.resize()
  await f.player.start()
  assert.equal(f.count('WaitForPaint'), 1)
})

test('放映事件缺失时明确报错，迟到事件不能撤除错误遮罩', async () => {
  const f = fixture({ manualPresentationEvent: true, readyTimeout: 15 })
  await f.player.start()
  assert.equal(f.state.status, 'error')
  assert.match(f.state.error, /超时/)
  assert.equal(f.count('WaitForPaint'), 0)
  const states = f.states.length
  f.subscriptions.SlideShowBegin()
  await nextTurn()
  assert.equal(f.states.length, states)
  f.player.dispose()
})

test('绘制等待期间关闭会话会取消信号，迟到完成不能恢复 ready', async () => {
  const paintGate = deferred()
  const f = fixture({ paintGate })
  const started = f.player.start()
  await nextTurn()
  const painting = f.calls.find((call) => call.name === 'WaitForPaint')
  assert.ok(painting)
  f.player.dispose()
  await started
  assert.equal(painting.signal.aborted, true)
  const states = f.states.length
  paintGate.resolve()
  await nextTurn()
  assert.equal(f.states.length, states)
  assert.equal(
    f.states.some((state) => state.status === 'ready'),
    false
  )
})

test('启动时放映被内核结束，迟到的开始事件不能恢复就绪', async () => {
  const f = fixture({ manualPresentationEvent: true })
  const started = f.player.start()
  await nextTurn()
  f.subscriptions.SlideShowEnd()
  await started
  assert.equal(f.state.status, 'error')
  assert.match(f.state.error, /放映已结束/)
  const states = f.states.length
  f.subscriptions.SlideShowBegin()
  await nextTurn()
  assert.equal(f.states.length, states)
  f.player.dispose()
})

test('并发 start 共享一次初始化，切换尺寸不会重新启动或退出放映', async (t) => {
  const f = fixture()
  t.after(() => f.player.dispose())
  const first = f.player.start()
  assert.equal(f.player.start(), first)
  await first
  f.player.resize()
  f.player.resize()
  await f.player.start()
  assert.equal(f.state.status, 'ready')
  assert.equal(f.state.totalPages, 3)
  assert.equal(f.count('init'), 1)
  assert.equal(f.count('ready'), 1)
  assert.equal(f.count('Run'), 1)
  assert.equal(f.count('GotoSlide'), 1)
  assert.equal(f.count('Exit'), 0)
  assert.equal(f.configuration.commonOptions.isIframeViewFullscreen, true)
  assert.equal(f.configuration.readOnly, true)
})

test('工具栏 RPC 未完成也允许进入 ready 和播放动画', async (t) => {
  const toolbarGate = deferred()
  const f = fixture({ toolbarGate })
  t.after(() => {
    toolbarGate.resolve()
    f.player.dispose()
  })
  await f.player.start()
  await nextTurn()
  assert.equal(f.state.status, 'ready')
  assert.equal(f.count('SetPlayToolbarPosition'), 1)
  assert.equal(await f.player.next(), true)
  assert.equal(f.raw.click, 1)
})

test('下一步和上一步优先动画，动画结束才换页，末页停留而不退出', async (t) => {
  let pageChanges = 0
  const f = fixture({
    beforePageChange: async () => {
      pageChanges++
    }
  })
  t.after(() => f.player.dispose())
  await f.player.start()
  await f.player.next()
  assert.equal(f.raw.click, 1)
  await f.player.previous()
  assert.equal(f.raw.click, 0)
  assert.equal(pageChanges, 0)
  await f.player.next()
  await f.player.next()
  assert.equal(f.state.page, 1)
  await f.player.next()
  assert.equal(f.state.page, 2)
  assert.equal(pageChanges, 1)
  await f.player.next()
  await f.player.next()
  assert.equal(f.state.page, 3)
  await f.player.next()
  assert.equal(f.state.page, 3)
  assert.equal(f.count('Exit'), 0)
  assert.equal(f.count('GotoNextClick'), 4)
  await f.player.previous()
  assert.equal(f.state.page, 2)
})

test('指定页码受边界限制，恢复目标页只定位一次', async (t) => {
  const f = fixture({ initialPage: 2 })
  t.after(() => f.player.dispose())
  await f.player.start()
  assert.equal(f.state.page, 2)
  assert.equal(f.count('GotoSlide'), 1)
  await f.player.goTo(999)
  assert.equal(f.state.page, 3)
  await f.player.goTo(-10)
  assert.equal(f.state.page, 1)
  assert.equal(await f.player.goTo('bad'), false)
  assert.equal(f.count('Run'), 1)
})

test('两份文档的页码和动画互相独立，关闭只销毁对应实例', async (t) => {
  const a = fixture({ fileId: 'a' })
  const b = fixture({ fileId: 'b' })
  t.after(() => {
    a.player.dispose()
    b.player.dispose()
  })
  await Promise.all([a.player.start(), b.player.start()])
  await a.player.goTo(2)
  await b.player.next()
  a.player.dispose()
  a.player.dispose()
  assert.equal(a.raw.destroyed, 1)
  assert.equal(b.raw.destroyed, 0)
  assert.equal(b.raw.page, 1)
  assert.equal(b.raw.click, 1)
  assert.equal(b.mount.children.length, 1)
  assert.equal(await a.player.next(), false)
  await b.player.next()
  assert.equal(b.raw.click, 2)
  assert.equal(b.count('Run'), 1)
})

test('ready 超时销毁实例，迟到 ready 不启动放映或恢复就绪', async () => {
  const readyGate = deferred()
  const f = fixture({ readyGate, readyTimeout: 15 })
  await f.player.start()
  assert.equal(f.state.status, 'error')
  assert.match(f.state.error, /文档就绪超时/)
  assert.equal(f.raw.destroyed, 1)
  const stateCount = f.states.length
  readyGate.resolve()
  await nextTurn()
  assert.equal(f.states.length, stateCount)
  assert.equal(f.count('Run'), 0)
  f.player.dispose()
})

test('init 返回前关闭，迟到实例被释放且不会清空新 mount 内容', async () => {
  const initGate = deferred()
  const f = fixture({ initGate })
  const started = f.player.start()
  await nextTurn()
  assert.equal(f.count('init'), 1)
  f.player.dispose()
  const newContent = { belongsTo: 'replacement-player' }
  f.mount.children.push(newContent)
  const stateCount = f.states.length
  initGate.resolve()
  await started
  await nextTurn()
  assert.equal(f.raw.destroyed, 1)
  assert.deepEqual(f.mount.children, [newContent])
  assert.equal(f.states.length, stateCount)
  assert.equal(f.count('ready'), 0)
})

test('导航超时使旧会话失效，迟到页码与错误事件不污染新实例', async (t) => {
  const navigationGate = deferred()
  const old = fixture({ navigationGate, operationTimeout: 15 })
  await old.player.start()
  assert.equal(await old.player.goTo(2), false)
  assert.equal(old.state.status, 'error')
  assert.equal(old.raw.destroyed, 1)
  const fresh = fixture({ mount: old.mount, fileId: 'replacement' })
  t.after(() => {
    old.player.dispose()
    fresh.player.dispose()
  })
  await fresh.player.start()
  const stateCount = old.states.length
  navigationGate.resolve()
  await nextTurn()
  old.configuration.subscriptions.error(null, { message: '迟到错误' })
  assert.equal(old.states.length, stateCount)
  assert.equal(old.state.page, 1)
  assert.equal(fresh.state.status, 'ready')
  assert.equal(fresh.mount.children.length, 1)
  assert.equal(fresh.raw.destroyed, 0)
})

test('原生翻页事件回读实际页码，忽略事件载荷中的旧页码', async (t) => {
  let pageChanges = 0
  const f = fixture({
    beforePageChange: async () => {
      pageChanges++
    }
  })
  t.after(() => f.player.dispose())
  await f.player.start()
  await nextTurn()
  f.raw.page = 2
  await f.subscriptions.ActiveSlideChange({ pageIndex: 1 })
  assert.equal(f.state.page, 2)
  assert.equal(f.pages.at(-1), 2)
  assert.equal(pageChanges, 1)
  await f.subscriptions.SlideSelectionChanged({ pageIndex: 1 })
  assert.equal(pageChanges, 1)
})

test('事件回读等待批注卸载时，随后完成的导航不能被旧事件覆盖', async (t) => {
  const eventBeforeChange = deferred()
  let beforeCalls = 0
  const f = fixture({
    beforePageChange: async () => {
      if (++beforeCalls === 1) await eventBeforeChange.promise
    }
  })
  t.after(() => {
    eventBeforeChange.resolve()
    f.player.dispose()
  })
  await f.player.start()
  f.raw.page = 2
  const eventTask = f.subscriptions.ActiveSlideChange({ pageIndex: 2 })
  await nextTurn()
  assert.equal(beforeCalls, 1)
  await f.player.goTo(3)
  assert.equal(f.state.page, 3)
  eventBeforeChange.resolve()
  await eventTask
  assert.equal(f.state.page, 3)
  assert.equal(f.pages.at(-1), 3)
})

test('服务端文件名错误明确报错，不能用静态预览冒充放映成功', async () => {
  const readyGate = deferred()
  const f = fixture({ readyGate })
  const started = f.player.start()
  await nextTurn()
  f.configuration.subscriptions.error(null, { message: '字段name 后缀名错误' })
  await started
  assert.equal(f.state.status, 'error')
  assert.match(f.state.error, /文件名缺少有效扩展名/)
  assert.equal(f.raw.destroyed, 1)
  assert.equal(f.count('Run'), 0)
  readyGate.resolve()
  f.player.dispose()
})

test('原生换页连发时完成尾部回读，不丢失等待批注卸载期间的最后一页', async (t) => {
  const firstBeforeChange = deferred()
  let beforeCalls = 0
  const f = fixture({
    beforePageChange: async () => {
      if (++beforeCalls === 1) await firstBeforeChange.promise
    }
  })
  t.after(() => {
    firstBeforeChange.resolve()
    f.player.dispose()
  })
  await f.player.start()
  f.raw.page = 2
  const firstEvent = f.subscriptions.ActiveSlideChange()
  await nextTurn()
  assert.equal(beforeCalls, 1)

  // 第一次回读已拿到2，此时WPS又翻到3；后一事件不能被 readingPage 锁丢弃。
  f.raw.page = 3
  await f.subscriptions.SlideSelectionChanged()
  firstBeforeChange.resolve()
  await firstEvent
  await nextTurn()
  assert.equal(f.state.page, 3)
  assert.equal(f.pages.at(-1), 3)
  assert.equal(beforeCalls, 2)
})

test('旧事件恢复时新导航尚未完成，不能提前发 page-change 解除批注锁', async (t) => {
  const eventBeforeChange = deferred()
  const navigationGate = deferred()
  let beforeCalls = 0
  const f = fixture({
    navigationGate,
    beforePageChange: async () => {
      if (++beforeCalls === 1) await eventBeforeChange.promise
    }
  })
  t.after(() => {
    eventBeforeChange.resolve()
    navigationGate.resolve()
    f.player.dispose()
  })
  await f.player.start()
  f.raw.page = 2
  const eventTask = f.subscriptions.ActiveSlideChange()
  await nextTurn()
  const navigating = f.player.goTo(3)
  await nextTurn()
  assert.equal(f.count('GotoSlide'), 2)
  const pagesBeforeNavigationCompletes = f.pages.length

  eventBeforeChange.resolve()
  await eventTask
  assert.equal(f.pages.length, pagesBeforeNavigationCompletes)
  assert.equal(f.state.page, 1)
  navigationGate.resolve()
  await navigating
  assert.equal(f.state.page, 3)
  assert.equal(f.pages.at(-1), 3)
})

test('4:3 幻灯片按固定逻辑宽度归一化，批注比例不依赖PPT内部单位', async (t) => {
  const f = fixture({ slideWidth: 720, slideHeight: 540 })
  t.after(() => f.player.dispose())
  await f.player.start()
  assert.equal(f.state.status, 'ready')
  assert.deepEqual(f.state.slideSize, { width: 1920, height: 1440 })
  // 停止自动轮播属于后台辅助配置，不要求它在 ready 提交之前完成。
  await nextTurn()
  assert.equal(f.count('StopAutoPlay'), 1)
})

test('无 status 的 open.result Fail 立即显示服务端原因，不等待 ready 超时', async (t) => {
  const readyGate = deferred()
  const f = fixture({ readyGate })
  t.after(() => {
    readyGate.resolve()
    f.player.dispose()
  })
  const started = f.player.start()
  await nextTurn()
  f.configuration.subscriptions['open.result'](null, {
    result: 'Fail',
    reason: '文件服务拒绝打开'
  })
  await started
  assert.equal(f.state.status, 'error')
  assert.equal(f.state.error, '文件服务拒绝打开')
  assert.equal(f.raw.destroyed, 1)
  assert.equal(f.count('Run'), 0)
})

test('PDF 恢复页码受总页数限制，末页下一页不向内核发送越界定位', async (t) => {
  const f = fixture({ code: '3', initialPage: 8, pdfPages: 3 })
  t.after(() => f.player.dispose())
  await f.player.start()
  assert.equal(f.state.status, 'ready')
  assert.equal(f.state.totalPages, 3)
  assert.equal(f.state.page, 3)
  assert.equal(f.count('JumpToPage'), 1)
  assert.equal(f.count('Run'), 0)
  await f.player.next()
  assert.equal(f.state.page, 3)
  assert.equal(f.count('JumpToPage'), 1)
  await f.player.previous()
  assert.equal(f.state.page, 2)
  assert.equal(f.count('JumpToPage'), 2)
})

test('PDF 定位以实际页码回读结果为准，不把未到达的请求页提交给批注', async (t) => {
  const f = fixture({ code: '3', pdfJumpResult: (page) => page - 1 })
  t.after(() => f.player.dispose())
  await f.player.start()
  await f.player.goTo(3)
  assert.equal(f.raw.page, 2)
  assert.equal(f.state.page, 2)
  assert.equal(f.pages.at(-1), 2)
})

test('首次页码只读RPC挂起时，首开与下一页及指定页导航仍立即提交', async (t) => {
  const readGate = deferred()
  const f = fixture({ readGate, clicks: [0, 0, 0] })
  t.after(() => {
    readGate.resolve()
    f.player.dispose()
  })

  const started = f.player.start()
  await nextTurn()
  // 不用耗时阈值推断速度：未放行只读请求前，ready 必须已经完成。
  assert.equal(f.state.status, 'ready')
  assert.equal(f.state.page, 1)
  assert.equal(f.count('ReadSlideIndex'), 1)
  await started

  const next = f.player.next()
  await nextTurn()
  assert.equal(f.state.page, 2)
  assert.equal(await next, true)
  const specified = f.player.goTo(3)
  await nextTurn()
  assert.equal(f.state.page, 3)
  assert.equal(await specified, true)
  assert.equal(f.count('ReadSlideIndex'), 1)
  assert.equal(f.raw.destroyed, 0)

  readGate.resolve()
  await nextTurn()
  assert.equal(f.state.status, 'ready')
  assert.equal(f.state.page, 3)
  assert.equal(f.pages.at(-1), 3)
})

test('后台事件读数在新导航之后返回旧页码时，不覆盖已提交页码和批注', async (t) => {
  const readGate = deferred()
  const f = fixture({ readGate })
  t.after(() => {
    readGate.resolve()
    f.player.dispose()
  })
  await f.player.start()
  await nextTurn()
  // 启动后的后台回读已锁定第一页，随后用户指定第三页。
  assert.equal(f.count('ReadSlideIndex'), 1)
  await f.player.goTo(3)
  const committedPageEvents = f.pages.length
  readGate.resolve()
  await nextTurn()
  assert.equal(f.state.page, 3)
  assert.equal(f.pages.length, committedPageEvents)
  assert.equal(f.count('Run'), 1)
  assert.equal(f.raw.destroyed, 0)
})

test('后台页码校验超时保持放映就绪，仍可操作且迟到查询不能回退页码', async (t) => {
  const readGate = deferred()
  const f = fixture({ readGate, operationTimeout: 15 })
  t.after(() => {
    readGate.resolve()
    f.player.dispose()
  })
  await f.player.start()
  await nextTurn()
  assert.equal(f.count('ReadSlideIndex'), 1)
  const pageEventsBeforeTimeout = f.pages.length

  // 跨过专用于此用例的短超时上限，确保断言覆盖超时分支而非仍在等待的状态。
  await delay(30)
  assert.equal(f.state.status, 'ready')
  assert.equal(f.state.error, '')
  assert.equal(f.raw.destroyed, 0)
  assert.equal(f.mount.children.length, 1)
  assert.equal(f.pages.length, pageEventsBeforeTimeout + 1)
  assert.equal(await f.player.next(), true)
  assert.equal(f.raw.click, 1)
  assert.equal(await f.player.goTo(2), true)
  assert.equal(f.state.page, 2)

  readGate.resolve()
  await nextTurn()
  assert.equal(f.state.status, 'ready')
  assert.equal(f.state.page, 2)
  assert.equal(f.count('Run'), 1)
  assert.equal(f.raw.destroyed, 0)
})


test('Word 使用 Writer 类型打开并就绪，不启动 PPT 放映', async (t) => {
  const f = fixture({ code: '1' })
  t.after(() => f.player.dispose())
  await f.player.start()
  assert.equal(f.configuration.officeType, 'writer')
  assert.equal(f.state.status, 'ready')
  assert.equal(f.count('Run'), 0)
})
