// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createWhiteboardSession } from '../src/session'
import AnnotationCanvas from '../src/components/AnnotationCanvas.vue'
import Whiteboard from '../src/components/Whiteboard.vue'

const mocks = vi.hoisted(() => ({ point: { x: 100, y: 100 }, resized: undefined as undefined | ((entries: unknown[]) => void) }))
vi.mock('vue-konva', async () => {
  const { defineComponent, h } = await import('vue')
  const component = (name: string) => defineComponent({ name, props: ['config'], setup(_p, { expose, slots }) {
    expose({ getNode: () => ({
      getPointerPosition: () => mocks.point, container: () => ({ style: {} }),
      nodes: () => {}, stopTransform: () => {}, find: () => [], getIntersection: () => undefined
    }) })
    return () => h('div', slots.default?.())
  } })
  return Object.fromEntries(['Stage', 'Layer', 'Group', 'Line', 'Rect', 'Ellipse', 'Arrow', 'RegularPolygon', 'Transformer'].map(name => [name, component(name)]))
})
class Observer {
  constructor(callback: (entries: unknown[]) => void) { mocks.resized = callback }
  observe() { mocks.resized?.([{ contentRect: { width: 1920, height: 1080 } }]) }
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', Observer)
const event = () => ({ evt: { button: 0, preventDefault() {} }, target: {} })
afterEach(() => { mocks.point = { x: 100, y: 100 } })

describe('gesture commit and cancellation', () => {
  it('draws on LAN HTTP where crypto.randomUUID is unavailable', async () => {
    const original = globalThis.crypto
    vi.stubGlobal('crypto', {})
    const session = createWhiteboardSession()
    const wrapper = mount(AnnotationCanvas, { props: { session, tool: 'pen' } })
    try {
      await nextTick()
      const stage = wrapper.findComponent({ name: 'Stage' })
      stage.vm.$emit('mousedown', event())
      stage.vm.$emit('mouseup', event())
      expect(session.getPage()?.shapes[0]?.id).toMatch(/^\d+-/)
    } finally { wrapper.unmount(); vi.stubGlobal('crypto', original) }
  })
  it('commits one history entry for a completed simulated touch gesture', async () => {
    const session = createWhiteboardSession()
    const wrapper = mount(AnnotationCanvas, { props: { session, tool: 'pen' } })
    await nextTick()
    const stage = wrapper.findComponent({ name: 'Stage' })
    const touch = { evt: { touches: [{}], preventDefault() {} }, target: {} }
    stage.vm.$emit('touchstart', touch)
    mocks.point = { x: 240, y: 180 }
    stage.vm.$emit('touchmove', touch)
    stage.vm.$emit('touchend', { evt: { touches: [], preventDefault() {} }, target: {} })
    expect(session.getPage()?.shapes).toHaveLength(1)
    session.undo()
    expect(session.getPage()?.shapes).toHaveLength(0)
    expect(session.canUndo()).toBe(false)
    wrapper.unmount()
  })
  it('commits shape movement, scaling and rotation together', async () => {
    const session = createWhiteboardSession()
    session.commitPage(session.state.activePageId, [{ id: 'rect', kind: 'rect', stroke: 'red', strokeWidth: 4, x: 10, y: 20, width: 30, height: 40 }])
    const wrapper = mount(AnnotationCanvas, { props: { session, tool: 'select' } })
    await nextTick()
    const node = { hasName: () => true, id: () => 'rect', x: () => 50, y: () => 60, scaleX: () => 2, scaleY: () => 3, rotation: () => 25 }
    const rect = wrapper.findComponent({ name: 'Rect' })
    rect.vm.$emit('transformstart', { target: node })
    rect.vm.$emit('transformend', { target: node })
    expect(session.getPage()?.shapes[0]).toMatchObject({ x: 50, y: 60, scaleX: 2, scaleY: 3, rotation: 25 })
    session.undo()
    expect(session.getPage()?.shapes[0]).toMatchObject({ x: 10, y: 20 })
    wrapper.unmount()
  })
  for (const action of ['finish', 'touchcancel', 'tool', 'page', 'import', 'resize', 'close'] as const) {
    it(`${action} handles the draft without writing to another page`, async () => {
      const session = createWhiteboardSession()
      const wrapper = mount(AnnotationCanvas, { props: { session, tool: 'pen' } })
      await nextTick()
      const stage = wrapper.findComponent({ name: 'Stage' })
      stage.vm.$emit('mousedown', event())
      mocks.point = { x: 200, y: 200 }
      stage.vm.$emit('mousemove', event())
      expect(session.getPage()?.shapes).toHaveLength(0)
      if (action === 'touchcancel') stage.vm.$emit('touchcancel', event())
      if (action === 'tool') await wrapper.setProps({ tool: 'browse' })
      if (action === 'page') session.addPage()
      if (action === 'import') session.importJSON(session.exportJSON())
      if (action === 'resize') mocks.resized?.([{ contentRect: { width: 960, height: 540 } }])
      if (action === 'close') await wrapper.setProps({ active: false })
      stage.vm.$emit('mouseup', event())
      expect(session.state.pages.flatMap(page => page.shapes)).toHaveLength(action === 'finish' ? 1 : 0)
      expect(session.canUndo()).toBe(action === 'finish')
      wrapper.unmount()
    })
  }
})

describe('component session ownership and public controls', () => {
  it('keeps external sessions live, unsubscribes, and follows replacement', async () => {
    const first = createWhiteboardSession()
    const second = createWhiteboardSession()
    const wrapper = mount(Whiteboard, { props: { session: first }, global: { stubs: { AnnotationCanvas: true } } })
    expect(wrapper.get('[aria-label="撤销"]').attributes('disabled')).toBeDefined()
    first.commitPage(first.state.activePageId, [{ id: 'r', kind: 'rect', stroke: 'red', strokeWidth: 4, x: 1, y: 2, width: 30, height: 40 }])
    await nextTick()
    expect(wrapper.get('[aria-label="撤销"]').attributes('disabled')).toBeUndefined()
    await wrapper.setProps({ session: second })
    const changes = wrapper.emitted('change')?.length ?? 0
    first.clearPage()
    expect(wrapper.emitted('change')?.length ?? 0).toBe(changes)
    expect(wrapper.get('[aria-label="撤销"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
    expect(first.state.disposed).toBe(false)
    expect(second.state.disposed).toBe(false)
    second.addPage()
    expect(second.state.pages).toHaveLength(2)
  })
  it('disposes the internally owned session on unmount', () => {
    let owned: ReturnType<typeof createWhiteboardSession> | undefined
    const wrapper = mount(Whiteboard, { global: { stubs: { AnnotationCanvas: true } }, slots: { toolbar: ({ session }: { session: typeof owned }) => { owned = session; return h('span') } } })
    expect(owned?.state.disposed).toBe(false)
    wrapper.unmount()
    expect(owned?.state.disposed).toBe(true)
  })
  it('close and reopen preserve the current page contents', async () => {
    const session = createWhiteboardSession()
    const parent = defineComponent({ setup: () => () => h(Whiteboard, { session }) })
    const wrapper = mount(parent, { global: { stubs: { AnnotationCanvas: true } } })
    session.addPage()
    const document = session.exportJSON()
    await wrapper.get('[aria-label="关闭画板"]').trigger('click')
    await wrapper.get('[aria-label="打开画板"]').trigger('click')
    expect(session.exportJSON()).toBe(document)
    wrapper.unmount()
  })
})
