<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { DocumentWhiteboard, TeachingLayout, Whiteboard, WhiteboardToolbar, createWhiteboardSession } from '../src'
import type { DrawingTool, OfficeState } from '../src'
import BoardIcon from '../src/components/BoardIcon.vue'
const root = ref<InstanceType<typeof TeachingLayout>>()
const document = ref<InstanceType<typeof DocumentWhiteboard>>()
const format = ref<'pptx' | 'docx'>('pptx')
const boardOpen = ref(false)
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
const setState = (state: OfficeState) => { count.value = state.totalPages; ready.value = state.status === 'ready' }
const select = (next: 'pptx' | 'docx') => { format.value = next; page.value = 1; ready.value = false; boardOpen.value = false; tool.value = 'browse' }
const toggleBoard = () => { boardOpen.value = !boardOpen.value; if (boardOpen.value && tool.value === 'browse') tool.value = 'pen' }
const fullscreen = async () => {
  const element = root.value?.element
  if (!element) return
  try { if (window.document.fullscreenElement === element) await window.document.exitFullscreen(); else await element.requestFullscreen() }
  catch { notice.value = '浏览器未允许进入全屏' }
}
onBeforeUnmount(() => { docSession.dispose(); boardSession.dispose() })
</script>
<template>
  <TeachingLayout ref="root" class="demo-room" :page="page" :total-pages="count" :show-navigation="!boardOpen" show-resource-entries resource-label="演示资源" :navigable="ready" @previous="document?.previous()" @next="document?.next()" @close="toggleBoard" @resources="notice = '示例仅含两份人工生成文档；实际资源选择由宿主接入。'">
    <template #stage>
      <DocumentWhiteboard ref="document" v-model:tool="tool" v-model:color="color" v-model:stroke-width="width" :source="source" :format="format" :document-id="documentId" :session="docSession" :show-controls="false" :show-toolbar="false" @page-change="page = $event" @ready="setState" @error="notice = $event.message" />
      <Whiteboard v-if="boardOpen" v-model:tool="tool" v-model:color="color" v-model:stroke-width="width" :session="boardSession" :show-toolbar="false" @update:open="boardOpen = $event" class="demo-board" />
    </template>
    <template #tabs><button v-for="type in (['pptx', 'docx'] as const)" :key="type" class="tab" :class="{ selected: format === type }" @click="select(type)">{{ type === 'pptx' ? '示例教学课件.pptx' : '示例教学文档.docx' }}</button></template>
    <template #tools>
      <WhiteboardToolbar v-model:tool="tool" v-model:color="color" v-model:stroke-width="width" variant="teaching" :can-undo="session.canUndo(key)" :can-redo="session.canRedo(key)" @undo="session.undo(key)" @redo="session.redo(key)" @clear="session.getPage(key) && session.clearPage(key)">
        <button class="board-button" :class="{ selected: boardOpen }" @click="toggleBoard"><BoardIcon name="board" /><span>黑板</span></button>
      </WhiteboardToolbar>
    </template>
    <template #actions><button class="action" @click="fullscreen">⛶ 全屏</button><button class="action" @click="notice = '演示已结束。正式项目通过 actions 插槽接入下课流程。'">⏻ 结束演示</button></template>
    <template #overlays><div v-if="notice" class="notice" role="status">{{ notice }} <button @click="notice = ''">关闭</button></div></template>
  </TeachingLayout>
</template>
<style scoped>
.demo-room{position:fixed;inset:0}.tab,.action{min-height:42px;padding:0 10px;border:0;border-radius:5px;color:#d4dbe6;background:#273a57;white-space:nowrap;cursor:pointer}.selected{color:white!important;background:#2672ff!important}.demo-board{position:absolute;inset:0;border:0;border-radius:0}.board-button{min-width:64px;height:64px;border:0;background:transparent;color:#c8d0dc;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer}.board-button span{font-size:12px}.notice{position:absolute;z-index:40;left:50%;top:24px;transform:translateX(-50%);max-width:80%;padding:18px;border-radius:8px;background:white;color:#253b30;box-shadow:0 4px 20px #0003}.notice button{margin-left:12px}
.demo-room :deep(.office-board){border:0;border-radius:0;background:#191919}
</style>
