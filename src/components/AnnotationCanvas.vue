<template>
  <div ref="container" class="lwb-canvas" :class="{ 'lwb-canvas--passthrough': !interactive || tool === 'browse', 'lwb-canvas--drawing': tool !== 'select' }" role="group" aria-label="绘图区域" data-testid="annotation-canvas">
    <VStage ref="stageRef" :config="stageConfig" @mousedown="startDrawing" @mousemove="draw" @mouseup="finishDrawing" @mouseleave="handleLeave" @touchstart="startDrawing" @touchmove="draw" @touchend="finishDrawing" @touchcancel="cancelGesture">
      <VLayer>
        <VGroup :key="renderEpoch" :config="groupConfig">
          <component :is="shapeComponents[shape.kind]" v-for="shape in shapes" :key="shape.id" :config="nodeConfig(shape)" @click="selectShape" @tap="selectShape" @mouseenter="enterShape" @mouseleave="leaveShape" @dragstart="startTransform" @transformstart="startTransform" @dragend="finishTransform" @transformend="finishTransform" />
          <VTransformer ref="transformerRef" :config="transformerConfig" />
        </VGroup>
      </VLayer>
    </VStage>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type Konva from 'konva'
import {
  Stage as VStage, Layer as VLayer, Group as VGroup, Line as VLine,
  Rect as VRect, Ellipse as VEllipse, Arrow as VArrow,
  RegularPolygon as VRegularPolygon, Transformer as VTransformer
} from 'vue-konva'
import type { VueKonvaRef } from 'vue-konva'
import type { DrawingTool, Shape, ShapeStyle, WhiteboardSession } from '../types'

const props = withDefaults(defineProps<{
  session: WhiteboardSession
  pageId?: string
  tool?: DrawingTool
  color?: string
  strokeWidth?: number
  active?: boolean
}>(), { tool: 'select', color: '#111827', strokeWidth: 4, active: true })

type PointerEvent = Konva.KonvaEventObject<MouseEvent | TouchEvent>
const shapeComponents = { line: VLine, straight: VLine, rect: VRect, ellipse: VEllipse, arrow: VArrow, triangle: VRegularPolygon, star: VLine }
const container = ref<HTMLDivElement>()
const stageRef = ref<VueKonvaRef<Konva.Stage>>()
const transformerRef = ref<VueKonvaRef<Konva.Transformer>>()
const pageId = computed(() => props.pageId ?? props.session.state.activePageId)
const page = computed(() => props.session.getPage(pageId.value))
const interactive = computed(() => props.active && !props.session.state.disposed && Boolean(page.value))
const logicalSize = computed(() => page.value?.contentSize ?? { width: 1920, height: 1080 })
const size = ref({ width: 0, height: 0 })
const scale = computed(() => Math.min(size.value.width / logicalSize.value.width, size.value.height / logicalSize.value.height) || 1)
const offsetX = computed(() => (size.value.width - logicalSize.value.width * scale.value) / 2)
const offsetY = computed(() => (size.value.height - logicalSize.value.height * scale.value) / 2)
const stageConfig = computed(() => ({ width: size.value.width, height: size.value.height }))
const groupConfig = computed(() => ({
  x: offsetX.value, y: offsetY.value, scaleX: scale.value, scaleY: scale.value,
  clipX: 0, clipY: 0, clipWidth: logicalSize.value.width, clipHeight: logicalSize.value.height
}))
const shapes = ref<Shape[]>([])
const selectedId = ref('')
const renderEpoch = ref(0)
let drawing = false
let transforming = false
let activeId = ''
let gestureTool: DrawingTool = 'select'
let gestureStart = { x: 0, y: 0 }
let gesturePage = ''
let gestureRevision = -1
let gestureSession: WhiteboardSession | undefined
let committing = false
let selectionEpoch = 0
let resizeObserver: ResizeObserver | undefined

const transformerConfig = { resizeEnabled: true, rotateEnabled: true, keepRatio: false, anchorSize: 12, ignoreStroke: true }
const copyCommitted = (): Shape[] => JSON.parse(JSON.stringify(page.value?.shapes ?? []))
const starPoints = (inner: number, outer: number) => Array.from({ length: 10 }, (_, index) => {
  const radius = index % 2 ? inner : outer
  const angle = index * Math.PI / 5
  return [radius * Math.sin(angle), -radius * Math.cos(angle)]
}).flat()
const drawSelectionHitArea = (context: Konva.Context, node: Konva.Shape) => {
  const bounds = node.getSelfRect()
  const absolute = node.getAbsoluteScale()
  const width = Math.max(Math.abs(bounds.width), 16 / Math.abs(absolute.x || 1))
  const height = Math.max(Math.abs(bounds.height), 16 / Math.abs(absolute.y || 1))
  context.beginPath()
  context.rect(bounds.x + bounds.width / 2 - width / 2, bounds.y + bounds.height / 2 - height / 2, width, height)
  context.closePath()
  context.fillShape(node)
}
const nodeConfig = (shape: Shape) => {
  const selected = props.tool === 'select' && selectedId.value === shape.id
  return {
    ...shape,
    ...(shape.kind === 'star' ? { points: starPoints(shape.innerRadius, shape.outerRadius), closed: true } : {}),
    name: 'annotation', draggable: interactive.value && props.tool === 'select',
    hitStrokeWidth: Math.max(shape.strokeWidth, 12 / scale.value), strokeScaleEnabled: false,
    fill: selected ? 'rgba(0,0,0,0)' : shape.fill, fillEnabled: selected || shape.fillEnabled,
    hitFunc: selected ? drawSelectionHitArea : undefined
  }
}
const setCursor = (cursor: string) => {
  const stage = stageRef.value?.getNode()
  if (stage) stage.container().style.cursor = cursor
}
const setSelection = async (node?: Konva.Node) => {
  const epoch = ++selectionEpoch
  selectedId.value = node?.id() ?? ''
  setCursor(node ? 'move' : '')
  transformerRef.value?.getNode().nodes([])
  await nextTick()
  // 切页/取消可能发生在 nextTick 之前，不能重新绑定已经被移除的节点。
  if (epoch !== selectionEpoch || !interactive.value || props.tool !== 'select') return
  transformerRef.value?.getNode().nodes(node?.getStage() ? [node] : [])
}
const resetGesture = () => {
  drawing = false
  transforming = false
  activeId = ''
  gestureSession = undefined
}
const cancelGesture = () => {
  const hadGesture = drawing || transforming
  resetGesture()
  // Konva 在拖动时会直接修改节点，取消必须同时复原渲染节点与草稿数据。
  transformerRef.value?.getNode().stopTransform()
  stageRef.value?.getNode().find('.annotation').forEach((node) => node.stopDrag())
  setSelection()
  shapes.value = copyCommitted()
  if (hadGesture) renderEpoch.value++
}
const beginGesture = () => {
  gesturePage = pageId.value
  gestureRevision = page.value?.revision ?? -1
  gestureSession = props.session
  gestureTool = props.tool
}
const gestureIsCurrent = () => interactive.value && gestureSession === props.session && gesturePage === pageId.value && gestureRevision === page.value?.revision
const pointer = () => {
  const position = stageRef.value?.getNode().getPointerPosition()
  return position && { x: (position.x - offsetX.value) / scale.value, y: (position.y - offsetY.value) / scale.value }
}
const commit = () => {
  // 自己的提交无需重载草稿；来自外部的更新则通过 revision watcher 立即取消旧手势。
  committing = true
  try { props.session.commitPage(pageId.value, shapes.value) }
  finally { committing = false }
}
const eraseAtPointer = () => {
  const stage = stageRef.value?.getNode()
  const point = stage?.getPointerPosition()
  const node = point && stage?.getIntersection(point)
  if (node?.hasName('annotation')) shapes.value = shapes.value.filter((shape) => shape.id !== node.id())
}
const startDrawing = (event: PointerEvent) => {
  if (!interactive.value || props.tool === 'browse') return
  if ('button' in event.evt && event.evt.button !== 0) return
  if ('touches' in event.evt && event.evt.touches.length !== 1) { cancelGesture(); return }
  if (props.tool === 'select') {
    if (event.target === event.target.getStage()) setSelection()
    return
  }
  event.evt.preventDefault()
  const start = pointer()
  if (!start || start.x < 0 || start.y < 0 || start.x > logicalSize.value.width || start.y > logicalSize.value.height) return
  beginGesture()
  drawing = true
  setSelection()
  if (props.tool === 'eraser') { eraseAtPointer(); return }
  gestureStart = start
  // 授课项目支持局域网 HTTP 地址；randomUUID 仅在安全上下文可用。
  activeId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const base: ShapeStyle = {
    id: activeId, stroke: props.color, strokeWidth: props.strokeWidth,
    fillEnabled: false, lineCap: 'round', lineJoin: 'round'
  }
  let shape: Shape
  switch (props.tool) {
    case 'pen': shape = { ...base, kind: 'line', points: [start.x, start.y, start.x, start.y] }; break
    case 'rect': shape = { ...base, kind: 'rect', x: start.x, y: start.y, width: 0, height: 0 }; break
    case 'ellipse': shape = { ...base, kind: 'ellipse', x: start.x, y: start.y, radiusX: 0, radiusY: 0 }; break
    case 'triangle': shape = { ...base, kind: 'triangle', x: start.x, y: start.y, radius: 1, sides: 3, scaleX: 0, scaleY: 0 }; break
    case 'star': shape = { ...base, kind: 'star', x: start.x, y: start.y, innerRadius: 0.45, outerRadius: 1, numPoints: 5, scaleX: 0, scaleY: 0 }; break
    case 'arrow': shape = { ...base, kind: 'arrow', points: [start.x, start.y, start.x, start.y], pointerLength: 12, pointerWidth: 12 }; break
    case 'straight': shape = { ...base, kind: 'straight', points: [start.x, start.y, start.x, start.y] }; break
    default: resetGesture(); return
  }
  shapes.value.push(shape)
}
const draw = (event: PointerEvent) => {
  if (!drawing) return
  if (!gestureIsCurrent() || ('touches' in event.evt && event.evt.touches.length !== 1)) { cancelGesture(); return }
  event.evt.preventDefault()
  if (gestureTool === 'eraser') { eraseAtPointer(); return }
  const end = pointer()
  const shape = shapes.value.find((item) => item.id === activeId)
  if (!end || !shape) return
  if (shape.kind === 'line') shape.points = [...shape.points, end.x, end.y]
  else if (shape.kind === 'rect') { shape.width = end.x - gestureStart.x; shape.height = end.y - gestureStart.y }
  else if (shape.kind === 'ellipse' || shape.kind === 'triangle' || shape.kind === 'star') {
    shape.x = (gestureStart.x + end.x) / 2
    shape.y = (gestureStart.y + end.y) / 2
    const rx = Math.abs(end.x - gestureStart.x) / 2
    const ry = Math.abs(end.y - gestureStart.y) / 2
    if (shape.kind === 'ellipse') { shape.radiusX = rx; shape.radiusY = ry }
    else { shape.scaleX = rx; shape.scaleY = ry }
  } else shape.points = [gestureStart.x, gestureStart.y, end.x, end.y]
}
const finishDrawing = () => {
  if (!drawing) return
  if (!gestureIsCurrent()) { cancelGesture(); return }
  resetGesture()
  commit()
}
const startTransform = (event: PointerEvent) => {
  if (!interactive.value || props.tool !== 'select' || !event.target.hasName('annotation')) return
  beginGesture()
  transforming = true
}
const finishTransform = (event: PointerEvent) => {
  if (!transforming || !gestureIsCurrent()) return
  const shape = shapes.value.find((item) => item.id === event.target.id())
  if (!shape) return
  Object.assign(shape, {
    x: event.target.x(), y: event.target.y(), scaleX: event.target.scaleX(),
    scaleY: event.target.scaleY(), rotation: event.target.rotation()
  })
  resetGesture()
  commit()
}
const selectShape = (event: PointerEvent) => { if (interactive.value && props.tool === 'select') setSelection(event.target) }
const enterShape = (event: PointerEvent) => { if (props.tool === 'select' && selectedId.value === event.target.id()) setCursor('move') }
const leaveShape = () => setCursor('')
const handleLeave = () => { finishDrawing(); setCursor('') }

watch(() => [props.session, pageId.value, page.value, page.value?.revision, props.active, props.session.state.disposed], () => {
  if (!committing) cancelGesture()
}, { flush: 'sync', immediate: true })
watch(() => props.tool, cancelGesture, { flush: 'sync' })
onMounted(() => {
  resizeObserver = new ResizeObserver(([entry]) => {
    const next = { width: entry.contentRect.width, height: entry.contentRect.height }
    if (next.width !== size.value.width || next.height !== size.value.height) {
      if (drawing || transforming) cancelGesture()
      size.value = next
    }
  })
  if (container.value) resizeObserver.observe(container.value)
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  cancelGesture()
})
</script>

<style scoped>
.lwb-canvas { position: absolute; inset: 0; z-index: 1; touch-action: none; overflow: hidden; }
.lwb-canvas--drawing { cursor: crosshair; }
.lwb-canvas--passthrough { pointer-events: none; }
</style>
