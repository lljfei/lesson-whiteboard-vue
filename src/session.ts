import { reactive, readonly } from 'vue'
import type {
  BoardBackground,
  ContentSize,
  SessionChange,
  SessionChangeType,
  SessionPage,
  Shape,
  WhiteboardDocument,
  WhiteboardSession,
  WhiteboardSessionOptions,
  WhiteboardSessionState
} from './types'

interface History {
  entries: Shape[][]
  index: number
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} 必须是对象`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} 必须是非空字符串`)
  return value
}

function number(value: unknown, path: string, minimum?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} 必须是有限数值`)
  }
  if (minimum !== undefined && value < minimum) throw new Error(`${path} 不能小于 ${minimum}`)
  return value
}

function contentSize(value: unknown, path: string): ContentSize {
  const source = record(value, path)
  const width = number(source.width, `${path}.width`)
  const height = number(source.height, `${path}.height`)
  if (width <= 0 || height <= 0) throw new Error(`${path} 的宽高必须大于 0`)
  return { width, height }
}

function background(value: unknown): BoardBackground {
  if (value !== 'green' && value !== 'white') throw new Error('background 必须是 green 或 white')
  return value
}

// JSON 是外部数据边界：只复制支持的绘图字段，不能把任意 Konva 配置传入渲染层。
function shape(value: unknown, path: string): Shape {
  const source = record(value, path)
  const result: Record<string, unknown> = {
    id: text(source.id, `${path}.id`),
    kind: source.kind,
    stroke: text(source.stroke, `${path}.stroke`),
    strokeWidth: number(source.strokeWidth, `${path}.strokeWidth`, 0)
  }
  for (const field of ['x', 'y', 'scaleX', 'scaleY', 'rotation']) {
    if (source[field] !== undefined) result[field] = number(source[field], `${path}.${field}`)
  }
  if (source.fill !== undefined) result.fill = text(source.fill, `${path}.fill`)
  if (source.fillEnabled !== undefined) {
    if (typeof source.fillEnabled !== 'boolean') throw new Error(`${path}.fillEnabled 必须是布尔值`)
    result.fillEnabled = source.fillEnabled
  }
  if (source.strokeScaleEnabled !== undefined) {
    if (source.strokeScaleEnabled !== false) throw new Error(`${path}.strokeScaleEnabled 仅支持 false`)
    result.strokeScaleEnabled = false
  }
  const enums = {
    lineCap: ['butt', 'round', 'square'],
    lineJoin: ['miter', 'round', 'bevel'],
    composite: ['source-over']
  }
  for (const [field, values] of Object.entries(enums)) {
    if (source[field] !== undefined) {
      if (!values.includes(source[field] as string)) throw new Error(`${path}.${field} 不受支持`)
      result[field] = source[field]
    }
  }

  switch (source.kind) {
    case 'line':
    case 'straight':
    case 'arrow': {
      const points = source.points
      if (!Array.isArray(points) || points.length < 4 || points.length % 2 !== 0) {
        throw new Error(`${path}.points 必须包含至少两组坐标`)
      }
      if (source.kind !== 'line' && points.length !== 4) {
        throw new Error(`${path}.points 必须恰好包含起点和终点`)
      }
      result.points = points.map((value, index) => number(value, `${path}.points[${index}]`))
      if (source.kind === 'arrow') {
        for (const field of ['pointerLength', 'pointerWidth']) {
          if (source[field] !== undefined) result[field] = number(source[field], `${path}.${field}`, 0)
        }
      }
      break
    }
    case 'rect':
      for (const field of ['x', 'y', 'width', 'height']) {
        // 反向拖绘产生负宽高，是现有矩形的合法表示。
        result[field] = number(source[field], `${path}.${field}`)
      }
      break
    case 'ellipse':
      for (const field of ['x', 'y']) result[field] = number(source[field], `${path}.${field}`)
      for (const field of ['radiusX', 'radiusY']) result[field] = number(source[field], `${path}.${field}`, 0)
      break
    case 'triangle':
      for (const field of ['x', 'y']) result[field] = number(source[field], `${path}.${field}`)
      result.radius = number(source.radius, `${path}.radius`, 0)
      if (source.sides !== undefined) {
        if (source.sides !== 3) throw new Error(`${path}.sides 必须为 3`)
        result.sides = 3
      }
      break
    case 'star':
      for (const field of ['x', 'y']) result[field] = number(source[field], `${path}.${field}`)
      for (const field of ['innerRadius', 'outerRadius']) result[field] = number(source[field], `${path}.${field}`, 0)
      if (source.numPoints !== 5) throw new Error(`${path}.numPoints 必须为 5`)
      result.numPoints = 5
      break
    default:
      throw new Error(`${path}.kind 不受支持`)
  }
  return result as unknown as Shape
}

function document(value: unknown): WhiteboardDocument {
  const source = record(value, '文档')
  if (source.version !== 1) throw new Error('仅支持 version 为 1 的白板文档')
  const activePageId = text(source.activePageId, 'activePageId')
  const boardBackground = background(source.background)
  if (!Array.isArray(source.pages) || !source.pages.length) throw new Error('pages 必须至少包含一页')
  const pageIds = new Set<string>()
  const pages = source.pages.map((value, index) => {
    const path = `pages[${index}]`
    const page = record(value, path)
    const id = text(page.id, `${path}.id`)
    if (pageIds.has(id)) throw new Error(`${path}.id 重复`)
    pageIds.add(id)
    if (!Array.isArray(page.shapes)) throw new Error(`${path}.shapes 必须是数组`)
    const shapeIds = new Set<string>()
    const shapes = page.shapes.map((value, index) => {
      const parsed = shape(value, `${path}.shapes[${index}]`)
      if (shapeIds.has(parsed.id)) throw new Error(`${path} 存在重复图形 ID`)
      shapeIds.add(parsed.id)
      return parsed
    })
    return { id, contentSize: contentSize(page.contentSize, `${path}.contentSize`), shapes }
  })
  if (!pageIds.has(activePageId)) throw new Error('activePageId 对应的页面不存在')
  return { version: 1, activePageId, background: boardBackground, pages }
}

export function createWhiteboardSession(options: WhiteboardSessionOptions = {}): WhiteboardSession {
  const historyLimit = options.historyLimit ?? 51
  if (!Number.isInteger(historyLimit) || historyLimit < 1) throw new Error('historyLimit 必须是正整数')
  const initial = options.document ? document(options.document) : {
    version: 1 as const,
    activePageId: 'page-1',
    background: 'green' as const,
    pages: [{ id: 'page-1', contentSize: { width: 1920, height: 1080 }, shapes: [] }]
  }
  const state = reactive<WhiteboardSessionState>({
    ...initial,
    pages: initial.pages.map(page => ({ ...page, revision: 0 })),
    revision: 0,
    disposed: false
  })
  const histories = new Map<string, History>()
  const listeners = new Set<(event: SessionChange) => void>()
  let pageSequence = 1
  for (const page of state.pages) histories.set(page.id, { entries: [copy(page.shapes)], index: 0 })

  const assertLive = () => {
    if (state.disposed) throw new Error('白板会话已销毁')
  }
  const requirePage = (id = state.activePageId): SessionPage => {
    const page = state.pages.find(page => page.id === id)
    if (!page) throw new Error(`页面不存在：${id}`)
    return page
  }
  const getDocument = (): WhiteboardDocument => ({
    version: 1,
    activePageId: state.activePageId,
    background: state.background,
    pages: state.pages.map(({ id, contentSize, shapes }) => ({
      id,
      contentSize: copy(contentSize),
      shapes: copy(shapes)
    }))
  })
  const canUndo = (id = state.activePageId) => {
    // 历史 Map 本身不响应式；查询依赖文档版本，供宿主 computed 同步按钮状态。
    void state.revision
    return (histories.get(id)?.index ?? 0) > 0
  }
  const canRedo = (id = state.activePageId) => {
    void state.revision
    const history = histories.get(id)
    return Boolean(history && history.index < history.entries.length - 1)
  }
  const notify = (type: SessionChangeType, pageId = state.activePageId) => {
    // 每位订阅者收到独立快照，不能通过修改事件污染会话或后续订阅者。
    for (const listener of [...listeners]) {
      listener({ type, pageId, activePageId: state.activePageId, document: getDocument(), canUndo: canUndo(), canRedo: canRedo() })
    }
  }
  const invalidate = (page?: SessionPage) => {
    if (page) page.revision += 1
    state.revision += 1
  }
  const commit = (page: SessionPage, shapes: Shape[], type: 'draw' | 'clear') => {
    if (same(page.shapes, shapes)) return
    const history = histories.get(page.id)!
    const entries = history.entries.slice(0, history.index + 1)
    entries.push(copy(shapes))
    if (entries.length > historyLimit) entries.shift()
    histories.set(page.id, { entries, index: entries.length - 1 })
    page.shapes = copy(shapes)
    invalidate(page)
    notify(type, page.id)
  }
  const restore = (id: string, offset: number) => {
    assertLive()
    const page = requirePage(id)
    const history = histories.get(id)!
    const index = Math.max(0, Math.min(history.entries.length - 1, history.index + offset))
    if (index === history.index) return
    history.index = index
    page.shapes = copy(history.entries[index]!)
    invalidate(page)
    notify(offset < 0 ? 'undo' : 'redo', id)
  }
  const insertPage = (id: string, size?: ContentSize) => {
    const sizeCopy = contentSize(size ?? requirePage().contentSize, 'contentSize')
    state.pages.push({ id, contentSize: sizeCopy, shapes: [], revision: 0 })
    histories.set(id, { entries: [[]], index: 0 })
  }

  return {
    state: readonly(state),
    getPage(id = state.activePageId) {
      const page = state.pages.find(page => page.id === id)
      return page ? readonly(page) : undefined
    },
    getDocument,
    canUndo,
    canRedo,
    ensurePage(id, size) {
      assertLive()
      text(id, 'pageId')
      if (state.pages.some(page => page.id === id)) return id
      insertPage(id, size)
      invalidate()
      notify('page-add', id)
      return id
    },
    addPage(size) {
      assertLive()
      let id: string
      do { id = `page-${++pageSequence}` } while (state.pages.some(page => page.id === id))
      insertPage(id, size)
      state.activePageId = id
      invalidate()
      notify('page-add', id)
      return id
    },
    removePage(id) {
      assertLive()
      const index = state.pages.findIndex(page => page.id === id)
      if (index === -1 || state.pages.length === 1) return false
      const wasActive = state.activePageId === id
      state.pages.splice(index, 1)
      histories.delete(id)
      if (wasActive) state.activePageId = state.pages[Math.min(index, state.pages.length - 1)]!.id
      invalidate()
      notify('page-remove', id)
      return true
    },
    setActivePage(id) {
      assertLive()
      requirePage(id)
      if (state.activePageId === id) return
      state.activePageId = id
      invalidate()
      notify('page-change', id)
    },
    setContentSize(id, size) {
      assertLive()
      const page = requirePage(id)
      const parsed = contentSize(size, 'contentSize')
      if (same(page.contentSize, parsed)) return
      page.contentSize = parsed
      invalidate(page)
      notify('page-size', id)
    },
    commitPage(id, shapes) {
      assertLive()
      // 图形由已校验文档或本库绘图层产生；内部提交遵循 Shape 契约，不重复解析全部字段。
      commit(requirePage(id), copy(shapes) as Shape[], 'draw')
    },
    undo(id = state.activePageId) { restore(id, -1) },
    redo(id = state.activePageId) { restore(id, 1) },
    clearPage(id = state.activePageId) {
      assertLive()
      commit(requirePage(id), [], 'clear')
    },
    resetPage(id = state.activePageId) {
      assertLive()
      const page = requirePage(id)
      const history = histories.get(id)!
      const changed = page.shapes.length > 0 || history.entries.length !== 1 || history.index !== 0
      page.shapes = []
      histories.set(id, { entries: [[]], index: 0 })
      // 空页也可能有未提交的绘制草稿；失效它，但不通知宿主重复保存。
      invalidate(page)
      if (changed) notify('reset', id)
    },
    setBackground(value) {
      assertLive()
      const parsed = background(value)
      if (state.background === parsed) return
      state.background = parsed
      invalidate()
      notify('background')
    },
    exportJSON: () => JSON.stringify(getDocument()),
    importJSON(json) {
      assertLive()
      let parsed: unknown
      try { parsed = JSON.parse(json) }
      catch { throw new Error('白板 JSON 格式错误') }
      const next = document(parsed)
      const changed = !same(getDocument(), next) || [...histories.values()].some(history => history.entries.length !== 1 || history.index !== 0)
      // 校验全部完成后再替换，导入失败不会损坏现有内容或历史。
      const revision = state.revision + 1
      histories.clear()
      for (const page of next.pages) histories.set(page.id, { entries: [copy(page.shapes)], index: 0 })
      state.pages = next.pages.map(page => ({ ...page, revision }))
      state.activePageId = next.activePageId
      state.background = next.background
      state.revision = revision
      if (changed) notify('import')
    },
    subscribe(listener) {
      assertLive()
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose() {
      if (state.disposed) return
      listeners.clear()
      histories.clear()
      state.disposed = true
      state.revision += 1
    }
  }
}
