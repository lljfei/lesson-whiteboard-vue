<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { createWhiteboardSession } from '../session'
import type { DrawingTool, HistoryChange, SessionChange, WhiteboardSession } from '../types'
import AnnotationCanvas from './AnnotationCanvas.vue'
import BoardIcon from './BoardIcon.vue'
import PageThumbnail from './PageThumbnail.vue'
import WhiteboardToolbar from './WhiteboardToolbar.vue'

const props = withDefaults(defineProps<{
  session?: WhiteboardSession
  showToolbar?: boolean
  tools?: DrawingTool[]
  colors?: string[]
  strokeWidths?: number[]
  variant?: 'default' | 'teaching'
}>(), { showToolbar: true })
const tool = defineModel<DrawingTool>('tool', { default: 'pen' })
const color = defineModel<string>('color', { default: '#111827' })
const strokeWidth = defineModel<number>('strokeWidth', { default: 4 })
const open = defineModel<boolean>('open', { default: true })
const expanded = defineModel<boolean>('expanded', { default: false })
const emit = defineEmits<{ change: [event: SessionChange]; 'history-change': [event: HistoryChange] }>()

// 外部会话由宿主拥有；内部会话在首次需要时创建，关闭画板不会销毁它。
let ownedSession: WhiteboardSession | undefined
const session = computed(() => props.session ?? (ownedSession ??= createWhiteboardSession()))
const pages = computed(() => session.value.state.pages)
const pageIndex = computed(() => pages.value.findIndex(page => page.id === session.value.state.activePageId))
const previewOpen = ref(false)
const canUndo = computed(() => session.value.canUndo())
const canRedo = computed(() => session.value.canRedo())
const undo = () => session.value.undo()
const redo = () => session.value.redo()
const clear = () => session.value.clearPage()
const setTool = (value: DrawingTool) => { tool.value = value }
const setColor = (value: string) => { color.value = value }
const setStrokeWidth = (value: number) => { strokeWidth.value = value }
const goToPage = (id: string) => {
  session.value.setActivePage(id)
  previewOpen.value = false
}
const goRelative = (offset: number) => {
  const page = pages.value[pageIndex.value + offset]
  if (page) goToPage(page.id)
}
const addPage = () => { session.value.addPage(); previewOpen.value = false }
const close = () => { open.value = false; previewOpen.value = false }

defineExpose({ undo, redo, clear, exportJSON: () => session.value.exportJSON(), importJSON: (json: string) => session.value.importJSON(json) })

watch(session, (next, _previous, onCleanup) => {
  previewOpen.value = false
  emit('history-change', { pageId: next.state.activePageId, canUndo: next.canUndo(), canRedo: next.canRedo() })
  const unsubscribe = next.subscribe(event => {
    emit('change', event)
    emit('history-change', { pageId: event.activePageId, canUndo: event.canUndo, canRedo: event.canRedo })
  })
  onCleanup(unsubscribe)
}, { immediate: true, flush: 'sync' })
watch(open, value => { if (!value) previewOpen.value = false })
onBeforeUnmount(() => { ownedSession?.dispose() })
</script>

<template>
  <section class="wb-root" :class="{ 'wb-root--teaching': variant === 'teaching' }" aria-label="多页画板" data-testid="whiteboard" :data-open="open">
    <div class="wb-viewport">
      <div v-show="open" class="wb-panel" :class="[session.state.background, { expanded }]" data-testid="board-panel">
        <AnnotationCanvas :session="session" :tool="tool" :color="color" :stroke-width="strokeWidth" :active="open" />
      </div>
      <button v-if="!open" type="button" class="wb-reopen" aria-label="打开画板" @click="open = true">
        <BoardIcon name="board" />打开画板
      </button>
      <section v-if="open && previewOpen" class="wb-preview" aria-label="白板页面预览" data-testid="page-preview" @keydown.esc="previewOpen = false">
        <header><span>白板预览（共 {{ pages.length }} 页）</span>
          <button type="button" aria-label="关闭白板预览" @click="previewOpen = false"><BoardIcon name="close" /></button>
        </header>
        <div class="wb-preview-grid">
          <div v-for="(page, index) in pages" :key="page.id" class="wb-preview-item" :data-page-id="page.id">
            <button type="button" class="wb-page-choice" :class="{ selected: page.id === session.state.activePageId }"
              :aria-label="`切换到第 ${index + 1} 页`" :aria-current="page.id === session.state.activePageId ? 'page' : undefined"
              @click="goToPage(page.id)">
              <PageThumbnail :page="page" :background="session.state.background" /><span>第 {{ index + 1 }} 页</span>
            </button>
            <button type="button" class="wb-page-delete" :aria-label="`删除第 ${index + 1} 页`" :disabled="pages.length <= 1"
              @click="session.removePage(page.id)"><BoardIcon name="clear" /></button>
          </div>
        </div>
      </section>
      <nav v-if="open" class="wb-pages" aria-label="白板页面操作">
        <button type="button" aria-label="新增白板页" title="新增白板页" @click="addPage"><BoardIcon name="plus" /></button>
        <button type="button" aria-label="上一白板页" :disabled="pageIndex <= 0" @click="goRelative(-1)"><BoardIcon name="left" /></button>
        <button type="button" class="wb-page-count" aria-label="查看全部白板" :aria-expanded="previewOpen" @click="previewOpen = !previewOpen">
          <b>{{ pageIndex + 1 }}</b> / {{ pages.length }}
        </button>
        <button type="button" aria-label="下一白板页" :disabled="pageIndex >= pages.length - 1" @click="goRelative(1)"><BoardIcon name="right" /></button>
        <button type="button" :aria-label="session.state.background === 'green' ? '切换为白板' : '切换为黑板'"
          @click="session.setBackground(session.state.background === 'green' ? 'white' : 'green')">{{ session.state.background === 'green' ? '白板' : '黑板' }}</button>
        <button type="button" :aria-label="expanded ? '收起画板' : '铺满画板'" :aria-pressed="expanded" @click="expanded = !expanded">
          <BoardIcon :name="expanded ? 'collapse' : 'expand'" /><span>{{ expanded ? '收起' : '铺满' }}</span>
        </button>
        <button type="button" aria-label="关闭画板" @click="close">关闭</button>
        <slot name="page-actions" :session="session" />
      </nav>
    </div>
    <div v-if="showToolbar && open" class="wb-footer">
      <slot name="toolbar" :session="session" :tool="tool" :color="color" :stroke-width="strokeWidth"
        :set-tool="setTool" :set-color="setColor" :set-stroke-width="setStrokeWidth" :can-undo="canUndo" :can-redo="canRedo"
        :undo="undo" :redo="redo" :clear="clear">
        <WhiteboardToolbar v-model:tool="tool" v-model:color="color" v-model:stroke-width="strokeWidth"
          :variant="variant" :tools="tools" :colors="colors" :stroke-widths="strokeWidths" :can-undo="canUndo" :can-redo="canRedo"
          @undo="undo" @redo="redo" @clear="clear">
          <slot name="toolbar-actions" :session="session" />
        </WhiteboardToolbar>
      </slot>
    </div>
  </section>
</template>

<style scoped>
.wb-root { position: relative; box-sizing: border-box; display: grid; grid-template-rows: minmax(0, 1fr) auto; width: 100%; height: 100%; min-height: 320px; overflow: hidden; border: 1px solid #d4dce5; border-radius: 8px; color: #273142; background: #e8edf2; font-family: system-ui, sans-serif; }
.wb-viewport { position: relative; min-width: 0; min-height: 0; }
.wb-panel { position: absolute; top: 0; right: 0; left: 0; height: 88%; overflow: hidden; background: #39766f; box-shadow: 0 5px 15px #0002; }
.wb-panel.white { background: #fffdf8; }
.wb-panel.expanded { height: 100%; }
.wb-footer { min-width: 0; }
button { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 38px; min-height: 38px; padding: 7px 9px; border: 0; border-radius: 5px; color: inherit; background: transparent; font: inherit; font-size: 13px; cursor: pointer; touch-action: manipulation; }
button:hover:not(:disabled) { background: #e7effb; color: #1d5bc4; }
button:focus-visible { outline: 2px solid #2672ff; outline-offset: -2px; }
button:disabled { color: #a5b0bd; cursor: default; }
.wb-pages { position: absolute; z-index: 4; right: 12px; bottom: 12px; left: 12px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 2px; width: fit-content; max-width: calc(100% - 24px); box-sizing: border-box; margin-left: auto; padding: 5px; border-radius: 7px; background: #fff; box-shadow: 0 3px 14px #0003; }
.wb-page-count { font-variant-numeric: tabular-nums; }
.wb-page-count b { color: #2672ff; }
.wb-reopen { position: absolute; top: 16px; left: 16px; padding: 10px 16px; color: #fff; background: #1c2b42; }
.wb-preview { position: absolute; z-index: 6; right: 12px; bottom: 80px; box-sizing: border-box; width: min(640px, calc(100% - 24px)); max-height: calc(100% - 92px); overflow: auto; padding: 12px; border-radius: 7px; background: #fff; box-shadow: 0 4px 18px #0003; }
.wb-preview header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 14px; }
.wb-preview-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); gap: 12px; }
.wb-preview-item { position: relative; min-width: 0; }
.wb-page-choice { display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 3px; border: 2px solid transparent; }
.wb-page-choice.selected { border-color: #2672ff; }
.wb-page-delete { position: absolute; top: 9px; right: 9px; min-width: 30px; min-height: 30px; padding: 5px; color: #fff; background: #213246dd; }
.wb-page-delete:disabled { color: #d5dde6; background: #526173cc; }
.wb-page-delete :deep(svg) { width: 17px; height: 17px; }
.wb-root--teaching { min-height: 0; border: 0; border-radius: 0; background: transparent; font-family: inherit; }
.wb-root--teaching .wb-footer { position: relative; z-index: 30; }
.wb-root--teaching .wb-pages { z-index: 22; right: 22px; bottom: 14px; left: auto; padding: 6px; }
.wb-root--teaching .wb-pages button { min-width: 46px; min-height: 42px; }
.wb-root--teaching .wb-preview { z-index: 24; right: 22px; bottom: 74px; max-height: calc(100% - 88px); }
.wb-root--teaching .wb-preview-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px 16px; }
@container teaching (max-width: 600px) {
  .wb-root--teaching .wb-pages { right: 8px; bottom: 8px; max-width: calc(100% - 16px); gap: 0; }
  .wb-root--teaching .wb-pages button { min-width: 36px; padding-inline: 6px; }
  .wb-root--teaching .wb-preview { right: 8px; width: calc(100% - 16px); }
  .wb-root--teaching .wb-preview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
}
@container teaching (max-width: 360px) {
  .wb-root--teaching .wb-pages button { min-width: 32px; padding-inline: 4px; }
  .wb-root--teaching .wb-pages :deep(svg) { width: 18px; height: 18px; }
  .wb-root--teaching .wb-pages button > span { display: none; }
}
</style>
