<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DocumentWhiteboard, TeachingLayout, Whiteboard, WhiteboardToolbar, createWhiteboardSession } from '../src'
import type { DrawingTool, OfficeState } from '../src'
import BoardIcon from '../src/components/BoardIcon.vue'
const root = ref<InstanceType<typeof TeachingLayout>>()
const document = ref<InstanceType<typeof DocumentWhiteboard>>()
const format = ref<'pptx' | 'docx'>('pptx')
const boardOpen = ref(false)
const pickerOpen = ref(false)
const picker = ref<HTMLDialogElement>()
const documentOpen = ref(true)
const openedFormats = ref<Array<'pptx' | 'docx'>>(['pptx', 'docx'])
const isFullscreen = ref(false)
const tool = ref<DrawingTool>('browse')
const color = ref('#ef4444')
const width = ref(4)
const page = ref(1)
const count = ref(2)
const ready = ref(false)
const source = computed(() => `/fixtures/demo.${format.value}`)
const documentId = computed(() => `teaching-demo-${format.value}`)
const docSession = createWhiteboardSession()
const boardSession = createWhiteboardSession()
const key = computed(() => boardOpen.value ? boardSession.state.activePageId : `${documentId.value}:${page.value}`)
const session = computed(() => boardOpen.value ? boardSession : docSession)
const notice = ref('')
// 原生模态对话框负责焦点约束、Esc 关闭和关闭后的焦点恢复。
watch(pickerOpen, open => { if (open) picker.value?.showModal(); else picker.value?.close() })
const setState = (state: OfficeState) => { count.value = state.totalPages; ready.value = state.status === 'ready' }
const select = (next: 'pptx' | 'docx') => {
  if (!openedFormats.value.includes(next)) openedFormats.value.push(next)
  if (format.value !== next || !documentOpen.value) { page.value = 1; ready.value = false }
  format.value = next; documentOpen.value = true; boardOpen.value = false; tool.value = 'browse'; pickerOpen.value = false
}
const closeDocument = (type: 'pptx' | 'docx') => {
  openedFormats.value = openedFormats.value.filter(item => item !== type)
  if (format.value !== type) return
  const next = openedFormats.value[0]
  if (next) select(next)
  else { documentOpen.value = false; ready.value = false }
}
const toggleBoard = () => { boardOpen.value = !boardOpen.value; if (boardOpen.value && tool.value === 'browse') tool.value = 'pen' }
const fullscreen = async () => {
  const element = root.value?.element
  if (!element) return
  try { if (window.document.fullscreenElement === element) await window.document.exitFullscreen(); else await element.requestFullscreen() }
  catch { notice.value = '浏览器未允许进入全屏' }
}
const syncFullscreen = () => { isFullscreen.value = window.document.fullscreenElement === root.value?.element }
onMounted(() => window.document.addEventListener('fullscreenchange', syncFullscreen))
onBeforeUnmount(() => { window.document.removeEventListener('fullscreenchange', syncFullscreen); docSession.dispose(); boardSession.dispose() })
</script>
<template>
  <TeachingLayout ref="root" class="demo-room" :page="page" :total-pages="count" :show-navigation="!boardOpen && documentOpen" show-resource-entries resource-label="我的备课" :navigable="ready" @previous="document?.previous()" @next="document?.next()" @close="closeDocument(format)" @resources="pickerOpen = true">
    <template #stage>
      <DocumentWhiteboard v-if="documentOpen" ref="document" v-model:tool="tool" v-model:color="color" v-model:stroke-width="width" :source="source" :format="format" :document-id="documentId" :session="docSession" :show-controls="false" :show-toolbar="false" @page-change="page = $event" @ready="setState" @error="notice = $event.message" />
      <div v-else class="empty-stage"><BoardIcon name="board" /><p>从“我的备课”中打开授课资源</p><button type="button" @click="pickerOpen = true">选择课件</button></div>
      <Whiteboard v-if="boardOpen" v-model:tool="tool" v-model:color="color" v-model:stroke-width="width" :session="boardSession" variant="teaching" :show-toolbar="false" @update:open="boardOpen = $event" class="demo-board" />
    </template>
    <template #tabs>
      <div v-for="type in openedFormats" :key="type" class="resource-tab" :class="{ selected: format === type && documentOpen }">
        <button type="button" class="tab-name" :title="type === 'pptx' ? '示例教学课件.pptx' : '示例教学文档.docx'" :aria-pressed="format === type && documentOpen" @click="select(type)">{{ type === 'pptx' ? '示例教学课件.pptx' : '示例教学文档.docx' }}</button>
        <button type="button" class="tab-close" :aria-label="`关闭${type === 'pptx' ? '课件' : '文档'}标签`" @click="closeDocument(type)"><BoardIcon name="close" /></button>
      </div>
      <button type="button" class="add-resource" aria-label="打开我的备课" title="打开我的备课" @click="pickerOpen = true"><BoardIcon name="plus" /></button>
    </template>
    <template #tools>
      <WhiteboardToolbar v-model:tool="tool" v-model:color="color" v-model:stroke-width="width" variant="teaching" :can-undo="session.canUndo(key)" :can-redo="session.canRedo(key)" @undo="session.undo(key)" @redo="session.redo(key)" @clear="session.getPage(key) && session.clearPage(key)">
        <button type="button" class="board-button" :class="{ selected: boardOpen }" :aria-pressed="boardOpen" @click="toggleBoard"><BoardIcon name="board" /><span>黑板</span></button>
      </WhiteboardToolbar>
    </template>
    <template #actions><button type="button" class="action" @click="fullscreen"><BoardIcon :name="isFullscreen ? 'collapse' : 'expand'" />{{ isFullscreen ? '退出全屏' : '全屏' }}</button><a class="action" href="./index.html"><BoardIcon name="power" />下课</a></template>
    <template #overlays>
      <dialog ref="picker" class="picker-mask" aria-label="我的备课" @click.self="pickerOpen = false" @cancel.prevent="pickerOpen = false" @close="pickerOpen = false">
        <section class="resource-picker">
          <header><h2>我的备课</h2><button type="button" aria-label="关闭我的备课" @click="pickerOpen = false"><BoardIcon name="close" /></button></header>
          <p>选择课件，开始授课</p>
          <button v-for="type in (['pptx', 'docx'] as const)" :key="type" type="button" class="resource-choice" @click="select(type)"><span class="file-type" :class="type">{{ type === 'pptx' ? 'P' : 'W' }}</span><span>{{ type === 'pptx' ? '示例教学课件.pptx' : '示例教学文档.docx' }}<small>{{ type === 'pptx' ? '演示文稿' : '教学文档' }}</small></span><span class="open-resource">授课</span></button>
          <a class="example-home" href="./index.html">返回组件示例</a>
        </section>
      </dialog>
      <div v-if="notice" class="notice" role="status">{{ notice }} <button type="button" @click="notice = ''">关闭</button></div>
    </template>
  </TeachingLayout>
</template>
<style scoped>
.demo-room { position: fixed; inset: 0; }
button, a { font: inherit; -webkit-tap-highlight-color: transparent; }
button { cursor: pointer; }
.resource-tab { display: flex; align-items: center; max-width: 180px; height: 42px; border-radius: 5px; color: #d4dbe6; background: #273a57; }
.resource-tab.selected, .board-button.selected { color: #fff; background: #2672ff; }
.tab-name, .tab-close, .add-resource { display: flex; align-items: center; justify-content: center; height: 42px; border: 0; color: inherit; background: transparent; }
.tab-name { min-width: 0; padding: 0 0 0 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
.tab-close { flex: none; width: 30px; padding: 6px; }
.tab-close svg { width: 14px; height: 14px; }
.tab-close:hover { background: #ffffff24; }
.add-resource { width: 36px; color: #c8d0dc; border-radius: 5px; }
.add-resource:hover { background: #273a57; }
.action { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 0 14px; border: 0; border-radius: 5px; color: #e2e8f0; background: #273a57; text-decoration: none; white-space: nowrap; cursor: pointer; }
.action svg { width: 16px; height: 16px; }
.action:hover { background: #2672ff; }
.demo-board { position: absolute; inset: 0; }
.board-button { min-width: 64px; height: 64px; border: 0; background: transparent; color: #c8d0dc; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; cursor: pointer; }
.board-button span { font-size: 12px; }
.board-button:hover { background: #283d59; color: #fff; }
.board-button.selected:hover { background: #2672ff; }
.empty-stage { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #64748b; }
.empty-stage > svg { width: 48px; height: 48px; color: #94a3b8; }
.empty-stage button { padding: 10px 20px; border: 0; border-radius: 5px; color: #fff; background: #2672ff; }
.demo-room :deep(.office-board) { min-height: 0; box-sizing: border-box; border: 0; border-radius: 0; background: #191919; }
.picker-mask { position: absolute; inset: 0; box-sizing: border-box; width: 100%; height: 100%; max-width: none; max-height: none; margin: 0; padding: 20px; border: 0; background: transparent; }
.picker-mask[open] { display: grid; place-items: center; }
.picker-mask::backdrop { background: #0f172a66; }
.resource-picker { box-sizing: border-box; width: min(640px, 100%); max-height: 100%; overflow-y: auto; padding: 24px; border-radius: 10px; background: #fff; color: #252b3a; box-shadow: 0 12px 40px #0f172a33; }
.resource-picker header { display: flex; align-items: center; justify-content: space-between; }
.resource-picker h2 { margin: 0; font-size: 20px; font-weight: 600; }
.resource-picker header button { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 5px; color: #64748b; background: #f5f7fa; }
.resource-picker p { margin: 10px 0 24px; color: #64748b; }
.resource-choice { display: flex; align-items: center; gap: 14px; width: 100%; padding: 16px 0; border: 0; border-top: 1px solid #edf0f5; color: inherit; background: #fff; text-align: left; }
.file-type { display: grid; place-items: center; flex: none; width: 40px; height: 48px; border-radius: 5px; color: #fff; font-size: 24px; font-weight: 600; }
.file-type.pptx { background: #e8784d; }
.file-type.docx { background: #4387ec; }
.resource-choice small { display: block; margin-top: 6px; font-size: 12px; color: #94a3b8; }
.open-resource { margin-left: auto; padding: 8px 14px; border-radius: 5px; color: #2672ff; background: #edf4ff; white-space: nowrap; }
.resource-choice:hover .open-resource { color: #fff; background: #2672ff; }
.example-home { display: inline-block; margin-top: 20px; color: #64748b; text-decoration: none; font-size: 13px; }
.example-home:hover { color: #2672ff; }
.notice { position: absolute; z-index: 50; left: 50%; top: 24px; transform: translateX(-50%); max-width: 80%; padding: 18px; border-radius: 8px; background: #fff; color: #252b3a; box-shadow: 0 4px 20px #0003; }
.notice button { margin-left: 12px; }
@container teaching (max-width: 600px) { .action { min-height: 36px; padding-inline: 12px; } .resource-picker { padding: 18px; } }
</style>
