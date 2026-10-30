/**
 * 跨域 RPC 完成和浏览器合成画面不是同一时刻。保持 iframe 正常渲染，
 * 在进入放映并定位后跨过两次绘制机会，才允许外层撤掉加载遮罩。
 * 关闭/重试会取消尚未执行的帧，后台标签也不能凭固定计时提前露出编辑器。
 */
const waitForPresentationPaint = (signal) =>
  new Promise((resolve, reject) => {
    let frame
    const abort = () => {
      cancelAnimationFrame(frame)
      reject(signal.reason)
    }
    if (signal.aborted) return reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        signal.removeEventListener('abort', abort)
        resolve()
      })
    })
  })

/**
 * 授课文档的一次性会话：创建 -> 就绪 -> 放映，直到关闭才销毁。
 * active 和浏览器全屏不属于会话状态，切换标签/尺寸不能 Exit 或 Run，
 * 否则会丢失页内动画进度并重复支付跨域初始化成本。
 */
export function createOfficePlayer({
  resource,
  mount,
  loadSDK,
  appId,
  token,
  initialPage = 1,
  onState = () => {},
  onPage = () => {},
  beforePageChange = async () => {},
  waitForPaint = waitForPresentationPaint,
  readyTimeout = 30000,
  operationTimeout = 10000
}) {
  const code = String(resource.code)
  const isPpt = code === '4'
  const lifetime = new AbortController()
  const state = { status: 'loading', page: initialPage, totalPages: 0, error: '', timings: {} }
  let instance
  let view
  let disposed = false
  let navigating = false
  let readingPage = false
  let pendingPageRead = false
  let navigationRevision = 0
  let startTask
  const startedAt = performance.now()

  const publish = (patch = {}) => {
    if (disposed) return
    Object.assign(state, patch)
    onState({ ...state, timings: { ...state.timings } })
  }
  const checkAlive = () => {
    if (lifetime.signal.aborted) throw lifetime.signal.reason
  }

  /** 每个 RPC 都可取消并有上限；超时不是固定等待，成功会立即清除计时器。 */
  const bounded = (operation, timeout, label) =>
    new Promise((resolve, reject) => {
      if (lifetime.signal.aborted) return reject(lifetime.signal.reason)
      const abort = () => finish(reject, lifetime.signal.reason)
      const timer = setTimeout(() => finish(reject, new Error(`${label}超时，请重试`)), timeout)
      const finish = (settle, value) => {
        clearTimeout(timer)
        lifetime.signal.removeEventListener('abort', abort)
        settle(value)
      }
      lifetime.signal.addEventListener('abort', abort, { once: true })
      Promise.resolve()
        .then(() => {
          checkAlive()
          return operation()
        })
        .then(
          (value) => finish(resolve, value),
          (error) => finish(reject, error)
        )
    })

  const measure = async (name, operation, timeout = operationTimeout) => {
    const begin = performance.now()
    const result = await bounded(operation, timeout, name)
    checkAlive()
    state.timings[name] = Math.round(performance.now() - begin)
    publish()
    return result
  }

  const release = () => {
    const owned = instance
    instance = undefined
    view = undefined
    try {
      owned?.destroy?.()
    } catch {
      // SDK 错误页可能未完全初始化；仍移除 iframe，避免残留内容盖住重试实例。
    }
    mount.replaceChildren()
  }
  const fail = (reason) => {
    if (disposed || state.status === 'error') return
    const message = reason?.message || '文档加载失败，请重试'
    // 文件名错误属于后端 WPS 文件回调契约；绝不能换成图片后声称动画可用。
    const error = /name.*后缀|后缀名错误/i.test(message)
      ? '课件文件名缺少有效扩展名，请修复文件服务返回的文件名后重试'
      : message
    lifetime.abort(reason || new Error(error))
    release()
    publish({ status: 'error', error })
  }
  const setPage = (page) => {
    if (!Number.isInteger(page) || page < 1 || disposed) return
    state.page = page
    onPage(page)
    publish()
  }
  // 沿 SDK 路径代理直接读取标量，避免先获取整页对象及其内容。
  const readPage = async () => Number(await view.Slide.SlideIndex)
  const clamp = (page) => Math.max(1, Math.min(state.totalPages || Infinity, page))

  /**
   * WPS 原生定时换页/内部操作也可能改变页码。事件只触发回读，不采信延迟
   * 事件附带的旧页码；手动导航期间统一由导航事务提交，避免批注错页。
   */
  const refreshPage = async () => {
    if (state.status !== 'ready' || disposed) return
    // WPS 连续发事件时合并为一次尾部回读，不能直接丢弃最后一次换页。
    if (navigating || readingPage) {
      pendingPageRead = true
      return
    }
    pendingPageRead = false
    readingPage = true
    const revision = navigationRevision
    try {
      const page = await bounded(readPage, operationTimeout, '读取放映页码')
      if (!navigating && !disposed && revision === navigationRevision && page !== state.page) {
        await beforePageChange()
        checkAlive()
        // 导航可能已在 nextTick 期间开始并结束，单查 navigating 无法识别旧读数。
        if (revision === navigationRevision) setPage(page)
        else if (!navigating) onPage(state.page)
      }
    } catch {
      // 后台回读是校验而非放映前提。服务抖动不能销毁已正常播放的会话；
      // 外层仍使用成功导航提交的页码，下一次内核事件再尝试同步。
      if (!disposed && !navigating) onPage(state.page)
    } finally {
      readingPage = false
      if (pendingPageRead && !navigating && !disposed) void refreshPage()
    }
  }

  const initialize = async () => {
    publish()
    try {
      if (!resource.fileId) throw new Error('课件缺少文件 ID，无法打开文档')
      const sdk = await measure('SDK', loadSDK, readyTimeout)
      const officeType = {
        1: sdk.OfficeType.Writer,
        3: sdk.OfficeType.Pdf,
        4: sdk.OfficeType.Presentation
      }[code]
      if (!officeType) throw new Error('不支持的文档类型')
      const reportError = (_, data) => {
        // 回调只归属此会话；卸载或重试后的迟到消息不能覆盖新文档状态。
        if (!disposed)
          fail(new Error(data?.message || data?.reason || data?.msg || 'WPS 文档打开失败，请重试'))
      }
      await measure('创建文档', async () => {
        const created = await sdk.init({
          mount,
          officeType,
          appId,
          token,
          fileId: resource.fileId,
          readOnly: true,
          mode: 'simple',
          commonOptions: {
            isShowHeader: false,
            isShowTopArea: false,
            // 放映固定在 iframe 内，禁止 SDK 接管宿主 fullscreenElement。
            isIframeViewFullscreen: true
          },
          pptOptions: {
            isShowBottomStatusBar: false,
            isShowRemarkView: false,
            isShowInsertMedia: false,
            isShowComment: false
          },
          wordOptions: { isShowDocMap: false, isBestScale: true },
          pdfOptions: { isShowComment: false, isBestScale: true, isShowBottomStatusBar: false },
          commandBars: [
            { cmbId: 'PlayComponentToolbar', attributes: { visible: false, enable: false } },
            { cmbId: 'TaskPane', attributes: { visible: false } },
            { cmbId: 'ToolBarFullScreenBtn', attributes: { visible: false, enable: false } }
          ],
          subscriptions: {
            ready: () => {
              state.timings['iframe连接'] = Math.round(performance.now() - startedAt)
              publish()
            },
            error: reportError,
            'open.result': (_, data) => {
              if (
                data?.success === false ||
                data?.result === 'Fail' ||
                (data?.status !== undefined && ![0, '0', 'ok'].includes(data.status))
              )
                reportError(_, data)
              else {
                state.timings['文件打开'] = Math.round(performance.now() - startedAt)
                publish()
              }
            }
          }
        })
        // init 返回前用户可能已关闭文件；只释放迟到实例，不能清理新的 mount。
        if (lifetime.signal.aborted) {
          created?.destroy?.()
          checkAlive()
        }
        instance = created
        if (instance.iframe) instance.iframe.tabIndex = -1
      })
      await measure('文档就绪', () => instance.ready(), readyTimeout)
      const app = instance.Application
      if (isPpt) {
        publish({ status: 'starting' })
        const presentation = app.ActivePresentation
        const settings = presentation.SlideShowSettings
        app.Sub.SlideShowEnd = () => {
          // 从启动起就监听退出；异常结束不能在绘制等待完成后误报 ready。
          if (['starting', 'ready'].includes(state.status))
            fail(new Error('PPT 放映已结束，请点击重试继续放映'))
        }
        // 必须先订阅再 Run；RPC 返回只代表指令被接受，不能作为撤罩依据。
        // 事件可能早于 Run 回包，也可能晚到，Promise 会保留首次进入的通知。
        const presentationEntered = new Promise((resolve) => {
          app.Sub.SlideShowBegin = () => {
            if (lifetime.signal.aborted) return
            state.timings['进入放映'] = Math.round(performance.now() - startedAt)
            publish()
            resolve()
          }
        })
        // 与 Run 并行获取比例；逻辑坐标统一为宽1920，保持画笔粗细跨课件一致。
        const slideSizeTask = bounded(
          async () => {
            const [width, height] = await Promise.all([
              presentation.PageSetup.SlideWidth,
              presentation.PageSetup.SlideHeight
            ])
            const ratio = Number(height) / Number(width)
            if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('课件页面尺寸无效')
            return { width: 1920, height: 1920 * ratio }
          },
          1500,
          '读取幻灯片尺寸'
        ).catch(() => undefined)
        // 总页数与 Run 并行获取；不加载分页图片、不等待工具栏 RPC 或固定延时。
        await measure(
          '启动放映',
          async () => {
            const [, count, slideSize] = await Promise.all([
              measure('Run', () => settings.Run(), readyTimeout),
              measure('读取页数', () => presentation.Slides.Count),
              slideSizeTask
            ])
            checkAlive()
            state.totalPages = Number(count)
            state.slideSize = slideSize
            if (!Number.isInteger(state.totalPages) || state.totalPages < 1)
              throw new Error('课件没有可放映的页面')
            view = presentation.SlideShowWindow.View
            const target = clamp(initialPage)
            // Run 可能继承上次的位置，因此显式定位。GotoSlide 成功即提交目标页；
            // 当前内核首次读取 SlideIndex 会多等5～7秒，回读放到后台校验，
            // 不能让这条只读查询把已可放映的课件锁住。
            await measure('定位初始页', () => view.GotoSlide(target))
            checkAlive()
            setPage(target)
            await measure('等待进入放映', () => presentationEntered, readyTimeout)
          },
          readyTimeout
        )
        // 辅助 UI 设置失败不影响放映。独立超时，避免它们把首次操作拖慢几秒。
        void bounded(
          async () => {
            // 使用可捕获拒绝的方法；ShowPlayToolbar 属性 setter 的异步失败无法 await。
            await Promise.allSettled(
              [
                // 授课使用手动推进，取消文档自带的自动轮播计时。
                () => settings.StopAutoPlay(),
                () => settings.SetMiniThumbnailVisible(false),
                () =>
                  settings.SetPlayToolbarPosition({
                    Style: { Show: { top: '-100px' }, Hidden: { top: '-100px' } }
                  })
              ].map((operation) => Promise.resolve().then(operation))
            )
          },
          1500,
          '隐藏放映工具栏'
        ).catch(() => {})
        app.Sub.ActiveSlideChange = refreshPage
        app.Sub.SlideSelectionChanged = refreshPage
        // 工具栏仍后台配置；这里只等绘制机会，不等首次 SlideIndex 慢查询。
        await measure('放映绘制', () => waitForPaint(lifetime.signal), readyTimeout)
      } else {
        if (code === '3') {
          const pdf = app.ActivePDF
          state.totalPages = Number(await measure('读取页数', () => pdf.PagesCount)) || 0
          if (initialPage > 1) await measure('恢复页码', () => pdf.JumpToPage(clamp(initialPage)))
          setPage(Number(await measure('读取页码', () => pdf.CurrentPage)))
          app.Sub.CurrentPageChange = (value) => {
            const page = Number(value?.pageIndex || value?.PageIndex || value)
            if (!navigating && state.status === 'ready') setPage(page)
          }
        } else {
          if (initialPage > 1)
            await measure('恢复页码', () =>
              app.Selection.GoTo({ What: 1, Which: 1, Count: initialPage })
            )
          setPage(initialPage)
        }
      }
      checkAlive()
      state.timings['可操作'] = Math.round(performance.now() - startedAt)
      publish({ status: 'ready' })
      if (isPpt) void refreshPage()
    } catch (error) {
      fail(error)
    }
  }

  /**
   * 快速连点不排队，防止迟到指令在切换标签后连续翻页。整页切换先卸旧批注，
   * 页内动画只调用点击 API，不触发批注切页；最后一页动画播完后停留原地。
   */
  const navigate = async (direction, page) => {
    if (disposed || state.status !== 'ready' || navigating) return false
    navigating = true
    navigationRevision++
    try {
      await bounded(
        async () => {
          let target = clamp(page ?? state.page + direction)
          if (isPpt && page === undefined) {
            const [index, count] = await Promise.all([view.GetClickIndex(), view.GetClickCount()])
            checkAlive()
            if (!Number.isFinite(Number(index)) || !Number.isFinite(Number(count)))
              throw new Error('无法读取 PPT 动画进度，请重试')
            if (direction > 0 && Number(index) < Number(count)) {
              await view.GotoNextClick()
              return
            }
            if (direction < 0 && Number(index) > 0) {
              await view.GotoPreClick()
              return
            }
          }
          if (target === state.page) return
          await beforePageChange()
          checkAlive()
          if (isPpt) {
            await view.GotoSlide(target)
          } else if (code === '3') {
            await instance.Application.ActivePDF.JumpToPage(target)
            target = Number(await instance.Application.ActivePDF.CurrentPage)
          } else await instance.Application.Selection.GoTo({ What: 1, Which: 1, Count: target })
          checkAlive()
          setPage(target)
        },
        operationTimeout,
        '切换课件'
      )
      return true
    } catch (error) {
      fail(error)
      return false
    } finally {
      navigating = false
      // 事件可能在动画操作期间已卸下旧批注；导航统一负责解锁，不能留到下次翻页。
      if (!disposed) onPage(state.page)
      if (pendingPageRead && !disposed) void refreshPage()
    }
  }

  return {
    start: () => (startTask ||= initialize()),
    next: () => navigate(1),
    previous: () => navigate(-1),
    goTo: (page) =>
      Number.isInteger(Number(page)) ? navigate(0, Number(page)) : Promise.resolve(false),
    resize: () => {
      // SDK 只监听 window.resize；ResizeObserver 补齐画板/原生全屏尺寸变化。
      if (!disposed && instance) instance.forceIframeResize?.()
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      lifetime.abort(new Error('文档已关闭'))
      release()
    }
  }
}
