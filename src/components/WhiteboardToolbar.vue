<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DrawingTool } from '../types'
import BoardIcon from './BoardIcon.vue'

const props = withDefaults(defineProps<{
  tool: DrawingTool
  color: string
  strokeWidth: number
  canUndo?: boolean
  canRedo?: boolean
  tools?: DrawingTool[]
  colors?: string[]
  strokeWidths?: number[]
  variant?: 'default' | 'teaching'
}>(), {
  canUndo: false,
  canRedo: false,
  tools: () => ['browse', 'select', 'pen', 'rect', 'ellipse', 'triangle', 'star', 'arrow', 'straight', 'eraser'],
  colors: () => ['#111827', '#ffffff', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'],
  strokeWidths: () => [2, 4, 6, 8, 10, 12],
})
const emit = defineEmits<{
  'update:tool': [tool: DrawingTool]
  'update:color': [color: string]
  'update:strokeWidth': [width: number]
  undo: []
  redo: []
  clear: []
}>()

const shapeTools: DrawingTool[] = ['rect', 'ellipse', 'triangle', 'star', 'arrow', 'straight']
const labels: Record<DrawingTool | 'shape', string> = {
  browse: '浏览', select: '选择', pen: '画笔', shape: '图形', eraser: '橡皮',
  rect: '矩形', ellipse: '圆形', triangle: '三角形', star: '五角星', arrow: '箭头', straight: '直线',
}
const panel = ref<'' | 'pen' | 'shape'>('')
const penStyle = ref({ color: props.color, width: props.strokeWidth })
const shapeStyle = ref({ color: props.color, width: props.strokeWidth })
const availableShapes = computed(() => [...new Set(props.tools.filter(tool => shapeTools.includes(tool)))])
const buttons = computed(() => [...new Set(props.tools.map(tool => shapeTools.includes(tool) ? 'shape' as const : tool))])
const currentStyle = computed(() => panel.value === 'shape' ? shapeStyle.value : penStyle.value)

// 外部受控值也参与样式记忆；切换工具后不会悄悄覆盖宿主刚设置的颜色与线宽。
watch(() => [props.color, props.strokeWidth] as const, ([color, width]) => {
  if (props.tool === 'pen') penStyle.value = { color, width }
  else if (shapeTools.includes(props.tool)) shapeStyle.value = { color, width }
  else {
    penStyle.value = { color, width }
    shapeStyle.value = { color, width }
  }
})
watch(() => props.tools, () => { panel.value = '' }, { deep: true })
watch(() => props.tool, tool => {
  if (tool !== 'pen' && !shapeTools.includes(tool)) panel.value = ''
})

const isActive = (tool: DrawingTool | 'shape') => tool === 'shape' ? shapeTools.includes(props.tool) : tool === props.tool
const applyStyle = (style: { color: string; width: number }) => {
  emit('update:color', style.color)
  emit('update:strokeWidth', style.width)
}
const selectTool = (tool: DrawingTool | 'shape') => {
  if (tool === 'shape') {
    panel.value = panel.value === 'shape' ? '' : 'shape'
    const nextTool = availableShapes.value.includes(props.tool) ? props.tool : availableShapes.value[0]
    if (!nextTool) return
    applyStyle(shapeStyle.value)
    emit('update:tool', nextTool)
  } else {
    panel.value = tool === 'pen' && panel.value !== 'pen' ? 'pen' : ''
    if (tool === 'pen') applyStyle(penStyle.value)
    emit('update:tool', tool)
  }
}
const selectShape = (tool: DrawingTool) => {
  applyStyle(shapeStyle.value)
  emit('update:tool', tool)
}
const selectColor = (color: string) => {
  currentStyle.value.color = color
  emit('update:color', color)
}
const selectWidth = (width: number) => {
  currentStyle.value.width = width
  emit('update:strokeWidth', width)
}
</script>

<template>
  <div class="wb-toolbar" :class="{ 'wb-toolbar--teaching': variant === 'teaching' }" role="toolbar" aria-label="画板工具" data-testid="whiteboard-toolbar" @keydown.esc="panel = ''">
    <button v-for="item in buttons" :key="item" type="button" :aria-label="labels[item]"
      :aria-pressed="isActive(item)" :class="{ active: isActive(item) }" :data-tool="item"
      @click="selectTool(item)">
      <BoardIcon :name="item" /><span>{{ labels[item] }}</span>
    </button>
    <span class="divider" aria-hidden="true"></span>
    <button type="button" aria-label="撤销" :disabled="!canUndo" @click="emit('undo')"><BoardIcon name="undo" /><span>撤销</span></button>
    <button type="button" aria-label="恢复" :disabled="!canRedo" @click="emit('redo')"><BoardIcon name="redo" /><span>恢复</span></button>
    <button type="button" aria-label="清除当前页" @click="emit('clear')"><BoardIcon name="clear" /><span>清除</span></button>
    <slot />
    <div v-if="panel" class="options" :aria-label="panel === 'pen' ? '画笔选项' : '图形选项'">
      <div v-if="panel === 'shape'" class="shape-options" aria-label="图形类型">
        <button v-for="shape in availableShapes" :key="shape" type="button" :aria-label="labels[shape]"
          :aria-pressed="tool === shape" :class="{ active: tool === shape }" :data-tool="shape" @click="selectShape(shape)">
          <BoardIcon :name="shape" />
        </button>
      </div>
      <div class="style-options">
        <div class="width-options" aria-label="线条粗细">
          <button v-for="width in strokeWidths" :key="width" type="button" :aria-label="`${width}像素`"
            :aria-pressed="currentStyle.width === width" :class="{ active: currentStyle.width === width }" @click="selectWidth(width)">
            <span :style="{ borderTopWidth: `${width}px` }"></span>
          </button>
        </div>
        <div class="color-options" aria-label="线条颜色">
          <button v-for="item in colors" :key="item" type="button" :aria-label="`颜色 ${item}`" :title="item"
            :aria-pressed="currentStyle.color === item" :class="{ selected: currentStyle.color === item }"
            :style="{ backgroundColor: item }" @click="selectColor(item)"></button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wb-toolbar { position: relative; z-index: 10; box-sizing: border-box; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 3px; padding: 5px; color: #c8d0dc; background: #111c2d; }
button { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-width: 50px; min-height: 54px; padding: 5px 8px; border: 0; border-radius: 5px; color: inherit; background: transparent; font: inherit; cursor: pointer; touch-action: manipulation; }
button > span { font-size: 12px; }
button:hover:not(:disabled) { background: #283d59; color: #fff; }
button.active { color: #fff; background: #2672ff; }
button:disabled { color: #59677a; cursor: default; }
button:focus-visible { outline: 2px solid #8fc5ff; outline-offset: -2px; }
.divider { height: 30px; width: 1px; margin: 0 4px; background: #3d4b60; }
.options { position: absolute; right: 8px; bottom: calc(100% + 10px); left: 8px; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 12px; box-sizing: border-box; padding: 12px; border: 1px solid #3d4b60; border-radius: 7px; background: #111c2d; box-shadow: 0 4px 18px #0003; }
.shape-options, .width-options, .color-options { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 4px; }
.shape-options button { min-width: 36px; min-height: 40px; padding: 5px; }
.style-options { display: grid; gap: 8px; }
.width-options button { min-width: 32px; min-height: 32px; padding: 4px; }
.width-options span { display: block; width: 20px; border-top: solid currentColor; border-radius: 4px; }
.color-options button { width: 28px; min-width: 28px; min-height: 28px; height: 28px; padding: 0; border: 2px solid #64748b; }
.color-options button.selected { outline: 2px solid #fff; outline-offset: 2px; }
.wb-toolbar--teaching{flex-wrap:nowrap;justify-content:flex-start;gap:0;padding:0;height:64px;border-radius:5px 5px 0 0;background:#111c2d}.wb-toolbar--teaching>button{min-width:64px;height:64px;border-radius:0;padding:8px 10px 6px}.wb-toolbar--teaching>.divider{display:none}.wb-toolbar--teaching :deep(svg){width:20px;height:20px}
@media(max-width:1100px){.wb-toolbar--teaching>button{min-width:56px;padding-inline:8px}}@media(max-width:760px){.wb-toolbar--teaching>button{min-width:44px;padding-inline:4px}}
</style>
