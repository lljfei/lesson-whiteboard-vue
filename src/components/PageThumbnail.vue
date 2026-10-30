<script setup lang="ts">
import type { DeepReadonly } from 'vue'
import type { BoardBackground, Shape, WhiteboardPage } from '../types'

defineProps<{ page: DeepReadonly<WhiteboardPage>; background: BoardBackground }>()

type PreviewShape = DeepReadonly<Shape>
const transform = (shape: PreviewShape) =>
  `translate(${shape.x ?? 0} ${shape.y ?? 0}) rotate(${shape.rotation ?? 0})`
const points = (shape: PreviewShape) => {
  if (!('points' in shape)) return ''
  const result: string[] = []
  for (let index = 0; index < shape.points.length; index += 2) {
    result.push(`${shape.points[index]! * (shape.scaleX ?? 1)},${shape.points[index + 1]! * (shape.scaleY ?? 1)}`)
  }
  return result.join(' ')
}
const rectanglePath = (shape: PreviewShape) => shape.kind === 'rect'
  ? `M0 0 H${shape.width * (shape.scaleX ?? 1)} V${shape.height * (shape.scaleY ?? 1)} H0 Z`
  : ''
const arrowPath = (shape: PreviewShape) => {
  if (shape.kind !== 'arrow') return ''
  const sx = shape.scaleX ?? 1
  const sy = shape.scaleY ?? 1
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = shape.points
  const startX = x1 * sx
  const startY = y1 * sy
  const endX = x2 * sx
  const endY = y2 * sy
  const length = Math.hypot(x2 - x1, y2 - y1)
  const shaft = `M${startX} ${startY} L${endX} ${endY}`
  if (!length) return shaft
  const ux = (x2 - x1) / length
  const uy = (y2 - y1) / length
  const headLength = shape.pointerLength ?? 12
  const halfWidth = (shape.pointerWidth ?? 12) / 2
  const baseX = x2 - ux * headLength
  const baseY = y2 - uy * headLength
  // 箭头头部与杆一起做非等比缩放，描边宽度保持不变，与画布的变换一致。
  return `${shaft} M${(baseX - uy * halfWidth) * sx} ${(baseY + ux * halfWidth) * sy} L${endX} ${endY} L${(baseX + uy * halfWidth) * sx} ${(baseY - ux * halfWidth) * sy}`
}
const polygonPoints = (shape: PreviewShape) => {
  if (shape.kind !== 'triangle' && shape.kind !== 'star') return ''
  const count = shape.kind === 'triangle' ? 3 : shape.numPoints * 2
  return Array.from({ length: count }, (_, index) => {
    const radius = shape.kind === 'triangle' ? shape.radius : index % 2 ? shape.innerRadius : shape.outerRadius
    const angle = index * 2 * Math.PI / count
    return `${radius * Math.sin(angle) * (shape.scaleX ?? 1)},${-radius * Math.cos(angle) * (shape.scaleY ?? 1)}`
  }).join(' ')
}
</script>

<template>
  <div class="wb-thumbnail" :class="background" data-testid="page-thumbnail">
    <svg v-if="page.shapes.length" :viewBox="`0 0 ${page.contentSize.width} ${page.contentSize.height}`"
      preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g v-for="shape in page.shapes" :key="shape.id" :transform="transform(shape)"
        :stroke="shape.stroke" :stroke-width="shape.strokeWidth"
        :stroke-linecap="shape.lineCap ?? 'round'" :stroke-linejoin="shape.lineJoin ?? 'round'"
        :fill="shape.fillEnabled ? (shape.fill ?? 'none') : 'none'">
        <polyline v-if="shape.kind === 'line' || shape.kind === 'straight'" :points="points(shape)" fill="none" />
        <path v-else-if="shape.kind === 'rect'" :d="rectanglePath(shape)" />
        <ellipse v-else-if="shape.kind === 'ellipse'" cx="0" cy="0"
          :rx="Math.abs(shape.radiusX * (shape.scaleX ?? 1))" :ry="Math.abs(shape.radiusY * (shape.scaleY ?? 1))" />
        <path v-else-if="shape.kind === 'arrow'" :d="arrowPath(shape)" fill="none" />
        <polygon v-else :points="polygonPoints(shape)" />
      </g>
    </svg>
    <span v-else>空白白板</span>
  </div>
</template>

<style scoped>
.wb-thumbnail { display: grid; place-items: center; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; color: #e5f1ef; background: #39766f; border-radius: 5px; }
.wb-thumbnail.white { color: #64748b; background: #fffdf8; }
svg { display: block; width: 100%; height: 100%; }
span { font-size: 12px; }
</style>
