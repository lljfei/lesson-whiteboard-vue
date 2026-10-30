<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import AnnotationCanvas from './AnnotationCanvas.vue'
import WhiteboardToolbar from './WhiteboardToolbar.vue'
import { createWhiteboardSession } from '../session'
import { createOfficePlayer } from '../office-player.js'
import { readOfficeSource, renderLocalDocument, resolveOfficeFormat } from '../local-document'
import type { LocalDocument } from '../local-document'
import type { DrawingTool, SessionChange, WhiteboardSession } from '../types'
import type { OfficeFormat, OfficeSource, OfficeState, WpsOptions } from '../office-types'

const props = withDefaults(defineProps<{
  mode?: 'local' | 'wps'
  source?: OfficeSource
  format?: OfficeFormat
  /** 同一文档的稳定 ID；切换文档时必须变化，批注会话按此键隔离。 */
  documentId: string
  wps?: WpsOptions
  session?: WhiteboardSession
  request?: RequestInit
  showToolbar?: boolean
  showControls?: boolean
}>(), { mode: 'local', showToolbar: true, showControls: true })
const emit = defineEmits<{ ready: [state: OfficeState]; error: [error: Error]; 'page-change': [page: number]; change: [event: SessionChange] }>()
const tool = defineModel<DrawingTool>('tool', { default: 'browse' })
const color = defineModel<string>('color', { default: '#ef4444' })
const strokeWidth = defineModel<number>('strokeWidth', { default: 4 })
let owned: WhiteboardSession | undefined
const session = computed(() => props.session ?? (owned ??= createWhiteboardSession()))
const state = shallowRef<OfficeState>({ status: 'loading', page: 1, totalPages: 0, error: '' })
const mount = ref<HTMLElement>()
const viewport = ref<HTMLElement>()
const available = ref(false)
const contentSize = ref({ width: 960, height: 540 })
const viewportSize = ref({ width: 0, height: 0 })
const scale = computed(() => Math.min(viewportSize.value.width / contentSize.value.width, viewportSize.value.height / contentSize.value.height) || 1)
const localStyle = computed(() => props.mode === 'local' ? {
  width: `${contentSize.value.width}px`, height: `${contentSize.value.height}px`,
  left: `${(viewportSize.value.width - contentSize.value.width * scale.value) / 2}px`,
  top: `${(viewportSize.value.height - contentSize.value.height * scale.value) / 2}px`,
  transform: `scale(${scale.value})`, transformOrigin: '0 0'
} : { inset: '0' })
const pageKey = computed(() => `${props.documentId}:${state.value.page}`)
let generation = 0
let controller: AbortController | undefined
let local: LocalDocument | undefined
let player: ReturnType<typeof createOfficePlayer> | undefined
let observer: ResizeObserver | undefined
let mounted = false
const attachPage = (page: number) => {
  state.value = { ...state.value, page }
  session.value.ensurePage(pageKey.value, contentSize.value)
  session.value.setContentSize(pageKey.value, contentSize.value)
  available.value = true
  emit('page-change', page)
}
const goTo = async (page: number) => {
  if (!Number.isInteger(page) || page < 1 || state.value.status !== 'ready') return false
  if (state.value.totalPages && page > state.value.totalPages) return false
  const current = generation
  available.value = false
  await nextTick()
  if (current !== generation) return false
  if (props.mode === 'wps') return player?.goTo(page)
  try {
    contentSize.value = local!.showPage(page)
    attachPage(page)
    return true
  } catch (reason) { fail(reason); return false }
}
const fail = (reason: unknown) => {
  const error = reason instanceof Error ? reason : new Error(String(reason))
  available.value = false
  state.value = { ...state.value, status: 'error', error: error.message }
  emit('error', error)
}
const initialize = async () => {
  if (!mounted) return
  const current = ++generation
  available.value = false
  controller?.abort()
  local?.dispose(); local = undefined
  player?.dispose(); player = undefined
  controller = new AbortController()
  const signal = controller.signal
  state.value = { status: 'loading', page: 1, totalPages: 0, error: '' }
  await nextTick()
  if (current !== generation) return
  const host = document.createElement('div')
  host.style.cssText = 'width:100%;height:100%'
  mount.value!.replaceChildren(host)
  try {
    if (!props.documentId.trim()) throw new Error('documentId 不能为空')
    if (props.mode === 'local') {
      if (!props.source) throw new Error('请选择 PPTX 或 DOCX 文件，或传入文件 URL')
      const format = resolveOfficeFormat(props.source, props.format)
      const bytes = await readOfficeSource(props.source, signal, props.request)
      signal.throwIfAborted()
      const rendered = await renderLocalDocument(host, bytes, format, signal)
      if (current !== generation) { rendered.dispose(); return }
      local = rendered
      contentSize.value = local.showPage(1)
      state.value = { ...state.value, status: 'ready', totalPages: local.totalPages }
      attachPage(1)
      emit('ready', state.value)
    } else {
      const config = props.wps
      if (!config?.appId || !config.fileId || !config.loadSDK || !props.format) throw new Error('WPS 模式需要 format、appId、fileId 和 loadSDK')
      player = createOfficePlayer({
        resource: { fileId: config.fileId, code: props.format === 'pptx' ? '4' : '1' }, mount: host,
        appId: config.appId, token: config.token, loadSDK: config.loadSDK,
        beforePageChange: async () => { available.value = false; await nextTick() },
        onPage: page => { if (current === generation) attachPage(page) },
        onState: value => {
          if (current !== generation) return
          state.value = value
          if (value.slideSize) contentSize.value = value.slideSize
          if (value.status === 'ready') { attachPage(value.page); emit('ready', value) }
          if (value.status === 'error') fail(new Error(value.error))
        }
      })
      await player.start()
    }
  } catch (reason) { if (current === generation && !signal.aborted) fail(reason) }
}
const previous = async () => props.mode === 'local' ? goTo(state.value.page - 1) : player?.previous()
const next = async () => props.mode === 'local' ? goTo(state.value.page + 1) : player?.next()
watch(() => [props.mode, props.source, props.format, props.documentId, props.wps, props.request], initialize)
watch(session, (value, _old, onCleanup) => { onCleanup(value.subscribe(event => emit('change', event))); available.value = false; if (mounted) void initialize() }, { flush: 'sync', immediate: true })
onMounted(() => {
  mounted = true
  observer = new ResizeObserver(([entry]) => { viewportSize.value = entry.contentRect; player?.resize() })
  observer.observe(viewport.value!)
  void initialize()
})
onBeforeUnmount(() => { mounted = false; generation++; controller?.abort(); local?.dispose(); player?.dispose(); observer?.disconnect(); owned?.dispose() })
defineExpose({ previous, next, goTo, retry: initialize, exportJSON: () => session.value.exportJSON(), importJSON: (json: string) => session.value.importJSON(json) })
</script>

<template>
  <section class="office-board" aria-label="文档画板">
    <div ref="viewport" class="office-viewport">
      <div ref="mount" class="office-mount" :style="localStyle"></div>
      <AnnotationCanvas v-if="session.getPage(pageKey) && !(mode === 'wps' && format === 'docx')" :session="session" :page-id="pageKey" :tool="tool" :color="color" :stroke-width="strokeWidth" :active="available && state.status === 'ready'" />
      <div v-if="state.status !== 'ready'" class="office-status" :role="state.status === 'error' ? 'alert' : 'status'">
        {{ state.status === 'error' ? state.error : '正在加载文档…' }}
        <button v-if="state.status === 'error'" @click="initialize">重试</button>
      </div>
    </div>
    <nav v-if="showControls" aria-label="文档翻页" class="office-navigation">
      <button :disabled="state.status !== 'ready' || state.page <= 1" @click="previous">上一页</button>
      <span>{{ state.page }} / {{ state.totalPages || '—' }}</span>
      <button :disabled="state.status !== 'ready' || !!state.totalPages && state.page >= state.totalPages" @click="next">下一页</button>
      <span>{{ mode === 'local' ? '本地预览' : 'WPS 在线预览' }}</span>
    </nav>
    <WhiteboardToolbar v-if="showToolbar && state.status === 'ready' && !(mode === 'wps' && format === 'docx')" v-model:tool="tool" v-model:color="color" v-model:stroke-width="strokeWidth" :can-undo="session.canUndo(pageKey)" :can-redo="session.canRedo(pageKey)" @undo="session.undo(pageKey)" @redo="session.redo(pageKey)" @clear="session.clearPage(pageKey)" />
  </section>
</template>

<style scoped>
.office-board{height:100%;min-height:360px;display:grid;grid-template-rows:minmax(0,1fr) auto auto;border:1px solid #dbe1ea;border-radius:8px;overflow:hidden;background:#edf0f5}.office-viewport{position:relative;min-height:0;overflow:hidden}.office-mount{position:absolute}.office-status{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;gap:12px;background:#f5f7fa;color:#252b3a;padding:24px}.office-navigation{display:flex;align-items:center;justify-content:center;gap:14px;padding:8px;background:white;font:13px system-ui}.office-navigation button,.office-status button{border:1px solid #dbe1ea;border-radius:5px;padding:6px 12px;background:white;cursor:pointer}button:disabled{opacity:.4;cursor:default}
</style>

