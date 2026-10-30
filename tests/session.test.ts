import { describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'
import { createWhiteboardSession } from '../src/session'
import type { Shape, WhiteboardDocument } from '../src/types'

const line = (x = 10, id = 'line-1') => ({
  id,
  kind: 'line' as const,
  stroke: '#111827',
  strokeWidth: 4,
  points: [0, 0, x, x]
})

it('keeps computed history availability reactive across same-page edits', () => {
  const session = createWhiteboardSession()
  const availability = computed(() => [session.canUndo(), session.canRedo()])
  expect(availability.value).toEqual([false, false])
  session.commitPage(session.state.activePageId, [line()])
  expect(availability.value).toEqual([true, false])
  session.undo()
  expect(availability.value).toEqual([false, true])
  session.redo()
  expect(availability.value).toEqual([true, false])
  session.dispose()
  expect(availability.value).toEqual([false, false])
})

const rect = (width = 20): Shape => ({
  id: 'rect-1', kind: 'rect', stroke: '#fff', strokeWidth: 2,
  x: 40, y: 30, width, height: -10
})

describe('independent session and snapshots', () => {
  it('isolates contents, history, and disposal even when page IDs match', () => {
    const first = createWhiteboardSession()
    const second = createWhiteboardSession()
    first.commitPage(first.state.activePageId, [line()])
    expect(first.canUndo()).toBe(true)
    expect(second.getPage()?.shapes).toEqual([])
    expect(second.canUndo()).toBe(false)
    first.dispose()
    second.commitPage(second.state.activePageId, [rect()])
    expect(second.getPage()?.shapes).toEqual([rect()])
  })

  it('clones constructor, commit, returned document, and event data', () => {
    const document = createWhiteboardSession().getDocument()
    const session = createWhiteboardSession({ document })
    document.pages[0]!.contentSize.width = 99
    expect(session.getPage()?.contentSize.width).toBe(1920)
    const shapes = [line()]
    session.commitPage(session.state.activePageId, shapes)
    shapes[0]!.stroke = 'red'
    const snapshot = session.getDocument()
    snapshot.pages[0]!.shapes[0]!.stroke = 'blue'
    expect(session.getPage()?.shapes[0]?.stroke).toBe('#111827')

    session.subscribe(event => { event.document.pages[0]!.shapes.length = 0 })
    const listener = vi.fn()
    session.subscribe(listener)
    session.commitPage(session.state.activePageId, [rect()])
    expect(listener.mock.calls[0]![0].document.pages[0].shapes).toEqual([rect()])
    expect(session.getPage()?.shapes).toEqual([rect()])
  })

  it('exposes deeply readonly state and pages', () => {
    const session = createWhiteboardSession()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    ;(session.state as unknown as { background: string }).background = 'white'
    ;(session.getPage()!.contentSize as { width: number }).width = 123
    expect(session.state.background).toBe('green')
    expect(session.getPage()?.contentSize.width).toBe(1920)
    warning.mockRestore()
  })
})

describe('per-page undo history', () => {
  it('discards redo branch after a new commit and keeps immutable snapshots', () => {
    const session = createWhiteboardSession()
    const id = session.state.activePageId
    session.commitPage(id, [line(10)])
    session.commitPage(id, [line(20)])
    session.undo()
    expect(session.getPage()?.shapes).toEqual([line(10)])
    expect(session.canRedo()).toBe(true)
    session.commitPage(id, [line(30)])
    expect(session.canRedo()).toBe(false)
    session.undo()
    expect(session.getPage()?.shapes).toEqual([line(10)])
    session.undo()
    expect(session.getPage()?.shapes).toEqual([])
    session.redo()
    expect(session.getPage()?.shapes).toEqual([line(10)])
  })

  it('retains exactly 51 snapshots by default, including the current snapshot', () => {
    const session = createWhiteboardSession()
    const id = session.state.activePageId
    for (let index = 1; index <= 55; index++) session.commitPage(id, [line(index)])
    let steps = 0
    while (session.canUndo()) { session.undo(); steps++ }
    expect(steps).toBe(50)
    expect(session.getPage()?.shapes).toEqual([line(5)])
  })

  it('supports a custom history limit and rejects invalid limits', () => {
    const session = createWhiteboardSession({ historyLimit: 2 })
    session.commitPage(session.state.activePageId, [line(10)])
    session.commitPage(session.state.activePageId, [line(20)])
    session.undo()
    expect(session.getPage()?.shapes).toEqual([line(10)])
    expect(session.canUndo()).toBe(false)
    for (const historyLimit of [0, -1, 1.5, Number.NaN]) {
      expect(() => createWhiteboardSession({ historyLimit })).toThrow('historyLimit')
    }
  })

  it('clear is undoable, while reset discards contents and both history branches', () => {
    const session = createWhiteboardSession()
    session.commitPage(session.state.activePageId, [line()])
    session.clearPage()
    session.undo()
    expect(session.getPage()?.shapes).toEqual([line()])
    session.resetPage()
    expect(session.getPage()?.shapes).toEqual([])
    expect(session.canUndo()).toBe(false)
    expect(session.canRedo()).toBe(false)
  })

  it('does not notify for no-op operations or add duplicate history snapshots', () => {
    const session = createWhiteboardSession()
    const listener = vi.fn()
    session.subscribe(listener)
    session.undo()
    session.redo()
    session.clearPage()
    session.commitPage(session.state.activePageId, [])
    session.setActivePage(session.state.activePageId)
    session.setBackground('green')
    session.setContentSize(session.state.activePageId, { width: 1920, height: 1080 })
    expect(session.removePage(session.state.activePageId)).toBe(false)
    expect(session.removePage('missing')).toBe(false)
    expect(listener).not.toHaveBeenCalled()
    session.commitPage(session.state.activePageId, [line()])
    session.commitPage(session.state.activePageId, [line()])
    expect(listener).toHaveBeenCalledTimes(1)
    session.undo()
    expect(session.canUndo()).toBe(false)
  })

  it('invalidates pending drafts on reset without notifying a repeated empty save', () => {
    const session = createWhiteboardSession()
    const listener = vi.fn()
    session.subscribe(listener)
    const revision = session.getPage()!.revision
    session.resetPage()
    expect(session.getPage()!.revision).toBeGreaterThan(revision)
    expect(listener).not.toHaveBeenCalled()
    session.commitPage(session.state.activePageId, [line()])
    session.undo()
    listener.mockClear()
    session.resetPage()
    expect(session.canRedo()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('page lifecycle', () => {
  it('preserves each page history, inherits dimensions, and keeps the last page', () => {
    const session = createWhiteboardSession()
    const first = session.state.activePageId
    session.setContentSize(first, { width: 800, height: 600 })
    session.commitPage(first, [line()])
    const second = session.addPage()
    expect(session.getPage()?.contentSize).toEqual({ width: 800, height: 600 })
    session.commitPage(second, [rect()])
    session.setActivePage(first)
    session.undo()
    expect(session.getPage()?.shapes).toEqual([])
    expect(session.getPage(second)?.shapes).toEqual([rect()])
    session.removePage(second)
    expect(session.removePage(first)).toBe(false)
    expect(session.state.pages).toHaveLength(1)
  })

  it('deleting a page before the active page preserves active identity', () => {
    const session = createWhiteboardSession()
    const first = session.state.activePageId
    session.addPage()
    const third = session.addPage()
    session.removePage(first)
    expect(session.state.activePageId).toBe(third)
  })

  it('page-remove reports the deleted ID but history of the new active page', () => {
    const session = createWhiteboardSession()
    const first = session.state.activePageId
    session.commitPage(first, [line()])
    const second = session.addPage()
    const listener = vi.fn()
    session.subscribe(listener)
    session.removePage(second)
    expect(listener.mock.calls[0]![0]).toMatchObject({
      type: 'page-remove', pageId: second, activePageId: first, canUndo: true, canRedo: false
    })
  })

  it('ensurePage does not switch active page or overwrite an existing page', () => {
    const session = createWhiteboardSession()
    const activeId = session.state.activePageId
    session.ensurePage('resource-1', { width: 640, height: 480 })
    session.ensurePage('resource-1', { width: 1, height: 1 })
    expect(session.state.activePageId).toBe(activeId)
    expect(session.getPage('resource-1')?.contentSize).toEqual({ width: 640, height: 480 })
    expect(session.state.pages).toHaveLength(2)
    expect(() => session.ensurePage('')).toThrow()
    expect(() => session.setActivePage('missing')).toThrow('页面不存在')
  })

  it('dimension validation happens before page creation or mutation', () => {
    const session = createWhiteboardSession()
    const original = session.exportJSON()
    expect(() => session.addPage({ width: 0, height: 600 })).toThrow()
    expect(() => session.setContentSize(session.state.activePageId, { width: Infinity, height: 600 })).toThrow()
    expect(session.exportJSON()).toBe(original)
  })
})

describe('JSON document boundary', () => {
  const allShapes: Shape[] = [
    line(), rect(),
    { ...line(), id: 'straight', kind: 'straight' },
    { ...line(), id: 'arrow', kind: 'arrow', pointerLength: 12, pointerWidth: 12 },
    { id: 'ellipse', kind: 'ellipse', stroke: 'red', strokeWidth: 2, x: 10, y: 20, radiusX: 30, radiusY: 40 },
    { id: 'triangle', kind: 'triangle', stroke: 'red', strokeWidth: 2, x: 20, y: 30, radius: 1, sides: 3, scaleX: 80, scaleY: 90, rotation: 35 },
    { id: 'star', kind: 'star', stroke: 'red', strokeWidth: 2, x: 20, y: 30, innerRadius: 0.45, outerRadius: 1, numPoints: 5, scaleX: -90, scaleY: 80 }
  ]

  it('round-trips all supported shapes and multiple pages, without histories or view state', () => {
    const session = createWhiteboardSession()
    session.commitPage(session.state.activePageId, allShapes)
    const second = session.addPage({ width: 800, height: 600 })
    session.commitPage(second, [line()])
    session.setBackground('white')
    const json = session.exportJSON()
    expect(json).not.toContain('revision')
    expect(json).not.toContain('history')
    const restored = createWhiteboardSession()
    restored.importJSON(json)
    expect(restored.getDocument()).toEqual(session.getDocument())
    expect(restored.canUndo()).toBe(false)
    restored.setActivePage(restored.state.pages[0]!.id)
    expect(restored.canUndo()).toBe(false)
    expect(restored.getPage()?.shapes).toEqual(allShapes)
  })

  it('drops unknown fields instead of forwarding arbitrary Konva config', () => {
    const session = createWhiteboardSession()
    const source = session.getDocument()
    source.pages[0]!.shapes = [{ ...line(), draggable: true, listening: false, sceneFunc: 'bad' } as unknown as Shape]
    const input = { ...source, token: 'unwanted', revision: 99 }
    session.importJSON(JSON.stringify(input))
    expect(session.getDocument()).toEqual({ ...source, pages: [{ ...source.pages[0]!, shapes: [line()] }] })
    expect(session.exportJSON()).not.toContain('sceneFunc')
  })

  const corruptions: Array<[string, (document: WhiteboardDocument) => unknown]> = [
    ['unsupported version', doc => ({ ...doc, version: 2 })],
    ['empty pages', doc => ({ ...doc, pages: [] })],
    ['duplicate page IDs', doc => ({ ...doc, pages: [doc.pages[0], doc.pages[0]] })],
    ['missing active page', doc => ({ ...doc, activePageId: 'missing' })],
    ['invalid background', doc => ({ ...doc, background: 'black' })],
    ['invalid dimensions', doc => { doc.pages[0]!.contentSize.width = -1; return doc }],
    ['unknown shape', doc => { doc.pages[0]!.shapes = [{ ...line(), kind: 'unknown' } as unknown as Shape]; return doc }],
    ['duplicate shape IDs', doc => { doc.pages[0]!.shapes = [line(), line()]; return doc }],
    ['odd coordinate count', doc => { doc.pages[0]!.shapes = [{ ...line(), points: [1, 2, 3] } as Shape]; return doc }],
    ['non-numeric coordinate', doc => { doc.pages[0]!.shapes = [{ ...line(), points: [0, 0, '5', 10] } as unknown as Shape]; return doc }],
    ['missing required shape field', doc => { doc.pages[0]!.shapes = [{ ...rect(), width: undefined } as unknown as Shape]; return doc }],
    ['negative ellipse radius', doc => { doc.pages[0]!.shapes = [{ ...allShapes[4], radiusX: -1 } as Shape]; return doc }],
    ['legacy pixel eraser', doc => { doc.pages[0]!.shapes = [{ ...line(), composite: 'destination-out' } as unknown as Shape]; return doc }]
  ]

  it.each(corruptions)('rejects %s atomically', (_, corrupt) => {
    const session = createWhiteboardSession()
    session.commitPage(session.state.activePageId, [line()])
    const original = session.exportJSON()
    const revision = session.state.revision
    const listener = vi.fn()
    session.subscribe(listener)
    expect(() => session.importJSON(JSON.stringify(corrupt(session.getDocument())))).toThrow()
    expect(session.exportJSON()).toBe(original)
    expect(session.state.revision).toBe(revision)
    expect(session.canUndo()).toBe(true)
    expect(listener).not.toHaveBeenCalled()
  })

  it('rejects invalid syntax and non-finite constructor coordinates', () => {
    const session = createWhiteboardSession()
    expect(() => session.importJSON('{')).toThrow('JSON 格式错误')
    const document = session.getDocument()
    document.pages[0]!.shapes = [{ ...line(), scaleX: Infinity }]
    expect(() => createWhiteboardSession({ document })).toThrow('有限数值')
  })

  it('same-document import resets history and invalidates pending gestures', () => {
    const session = createWhiteboardSession()
    session.commitPage(session.state.activePageId, [line()])
    const json = session.exportJSON()
    const previousPage = session.getPage()
    const listener = vi.fn()
    session.subscribe(listener)
    session.importJSON(json)
    expect(session.canUndo()).toBe(false)
    expect(session.getPage()).not.toBe(previousPage)
    expect(listener).toHaveBeenCalledTimes(1)
    listener.mockClear()
    const revision = session.getPage()!.revision
    session.importJSON(session.exportJSON())
    expect(session.getPage()!.revision).toBeGreaterThan(revision)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('subscriptions and disposal', () => {
  it('unsubscribes independently and disposal is idempotent', () => {
    const session = createWhiteboardSession()
    const removed = vi.fn()
    const retained = vi.fn()
    const unsubscribe = session.subscribe(removed)
    session.subscribe(retained)
    unsubscribe()
    unsubscribe()
    session.commitPage(session.state.activePageId, [line()])
    expect(removed).not.toHaveBeenCalled()
    expect(retained).toHaveBeenCalledTimes(1)
    const json = session.exportJSON()
    session.dispose()
    session.dispose()
    expect(session.state.disposed).toBe(true)
    expect(session.exportJSON()).toBe(json)
    expect(session.getPage()?.shapes).toEqual([line()])
    expect(session.canUndo()).toBe(false)
    expect(() => session.clearPage()).toThrow('会话已销毁')
    expect(() => session.addPage()).toThrow('会话已销毁')
    expect(() => session.subscribe(vi.fn())).toThrow('会话已销毁')
    expect(() => session.importJSON(json)).toThrow('会话已销毁')
    expect(retained).toHaveBeenCalledTimes(1)
  })
})
