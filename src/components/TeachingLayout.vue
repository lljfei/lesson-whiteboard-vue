<script setup lang="ts">
import { computed, ref, useSlots } from 'vue'
import BoardIcon from './BoardIcon.vue'
withDefaults(defineProps<{ page?: number; totalPages?: number; navigable?: boolean; showNavigation?: boolean; showResourceEntries?: boolean; resourceLabel?: string }>(), { page: 1, totalPages: 0, navigable: true, showNavigation: false, showResourceEntries: false, resourceLabel: '资源' })
const emit = defineEmits<{ previous: []; next: []; close: []; resources: [] }>()
const slots = useSlots()
const element = ref<HTMLDivElement>()
const hasFooter = computed(() => Boolean(slots.tabs || slots.tools || slots.actions))
defineExpose({ element })
</script>
<template>
  <div ref="element" class="teaching-layout" :class="{ 'has-footer': hasFooter, 'has-tabs': !!$slots.tabs, 'has-tools': !!$slots.tools, 'has-actions': !!$slots.actions }">
    <!-- 默认插槽保留宿主既有定位结构，不改动业务节点的层级。 -->
    <slot />
    <main v-if="$slots.stage" class="teaching-layout-stage"><slot name="stage" /></main>
    <template v-for="side in ['left', 'right']" :key="side">
      <aside v-if="showResourceEntries" class="teaching-resource-entry" :class="side"><slot name="resource-entry" :side="side"><button type="button" @click="emit('resources')">{{ resourceLabel }}</button></slot></aside>
      <nav v-if="showNavigation" class="teaching-navigation" :class="side" :aria-label="`${side === 'left' ? '左' : '右'}侧文档控制`">
        <slot name="navigation" :side="side"><button type="button" aria-label="上一页" :disabled="!navigable" @click="emit('previous')"><BoardIcon name="previous" /></button><button type="button" aria-label="下一步" :disabled="!navigable" @click="emit('next')"><BoardIcon name="next" /></button><span><b>{{ page }}</b><template v-if="totalPages">/{{ totalPages }}</template></span><button type="button" aria-label="关闭文档" @click="emit('close')">关闭</button></slot>
      </nav>
    </template>
    <footer v-if="hasFooter" class="teaching-layout-footer">
      <div v-if="$slots.tabs" class="teaching-tabs" aria-label="已打开课件"><slot name="tabs" /></div>
      <div v-if="$slots.tools" class="teaching-tools"><slot name="tools" /></div>
      <div v-if="$slots.actions" class="teaching-actions"><slot name="actions" /></div>
    </footer>
    <slot name="overlays" />
  </div>
</template>
<style scoped>
.teaching-layout {
  --teaching-footer-height: 64px;
  position: relative;
  container: teaching / inline-size;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 320px;
  overflow: hidden;
  color: #fff;
  background: #f7f4ef;
  font: 14px "Microsoft YaHei", "Segoe UI", sans-serif;
}
.teaching-layout-stage { position: absolute; inset: 0; overflow: hidden; }
.has-footer > .teaching-layout-stage { bottom: var(--teaching-footer-height); }
.teaching-resource-entry { position: absolute; z-index: 12; top: 46%; }
.teaching-resource-entry.left { left: 0; }
.teaching-resource-entry.right { right: 0; }
.teaching-resource-entry button { width: 32px; min-height: 112px; padding: 8px 4px; border: 0; border-radius: 0 12px 12px 0; background: #fff; color: #5f6670; box-shadow: 0 2px 12px #0f172a1a; font: inherit; writing-mode: vertical-rl; letter-spacing: 3px; cursor: pointer; }
.teaching-resource-entry.right button { border-radius: 12px 0 0 12px; }
.teaching-resource-entry button:hover { color: #1d4ed8; }
.teaching-navigation { position: absolute; z-index: 12; bottom: 18px; display: flex; flex-direction: column; align-items: center; width: 60px; padding: 6px; border: 1px solid #ffffff38; border-radius: 10px; box-sizing: border-box; background: linear-gradient(180deg, #949aa5, #858c98); box-shadow: 0 6px 18px #0f172a33; color: #fff; }
.has-footer > .teaching-navigation { bottom: calc(var(--teaching-footer-height) + 18px); }
.teaching-navigation.left { left: 4px; }
.teaching-navigation.right { right: 4px; }
.teaching-navigation button { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 40px; padding: 5px 2px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.teaching-navigation button:hover:not(:disabled) { background: #ffffff4d; }
.teaching-navigation button:disabled { opacity: .4; cursor: default; }
.teaching-navigation span { display: flex; justify-content: center; align-items: center; width: 100%; min-height: 44px; border-block: 1px solid #ffffff2e; font-size: 12px; font-variant-numeric: tabular-nums; }
.teaching-navigation b { color: #ffd08a; font-weight: 600; }
.teaching-navigation :deep(svg) { width: 18px; height: 18px; }
.teaching-layout button:focus-visible { outline: 2px solid #8fc5ff; outline-offset: -2px; }
.teaching-layout-footer { position: absolute; inset: auto 0 0; z-index: 30; display: flex; align-items: center; gap: 0 8px; height: var(--teaching-footer-height); background: #1c2b42; }
.teaching-tabs { display: flex; flex: 1; align-items: center; gap: 4px; min-width: 0; height: 100%; padding-inline: 8px; overflow-x: auto; overflow-y: hidden; box-sizing: border-box; scrollbar-width: thin; scrollbar-color: #6d7f99 transparent; }
.teaching-tabs > :slotted(*) { flex: 0 0 auto; }
.teaching-tools { display: flex; flex: none; align-items: center; min-width: 0; max-width: 100%; }
.teaching-actions { display: flex; flex: none; gap: 8px; align-items: center; justify-content: flex-end; padding-right: 10px; }
.teaching-layout:not(.has-tabs) .teaching-tools { margin-left: auto; }
.teaching-layout:not(.has-tools) .teaching-actions { margin-left: auto; }
/* 与 lesson 授课页一致：先给课件标签独立一行，工具与下课操作始终占据自己的区域。
   按容器宽度换行，嵌入侧栏页面时也不依赖浏览器是否全屏。 */
@container teaching (max-width: 1280px) {
  .has-tabs.has-tools > .teaching-layout-footer { height: 120px; display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: 56px 64px; }
  .has-tabs.has-tools > .teaching-layout-stage { bottom: 120px; }
  .has-tabs.has-tools > .teaching-navigation { bottom: 138px; }
  .has-tabs.has-tools .teaching-tabs { grid-column: 1 / -1; }
  .has-tabs.has-tools .teaching-tools { justify-self: center; }
}
@container teaching (max-width: 900px) {
  .teaching-navigation.right, .teaching-resource-entry.right { display: none; }
}
@container teaching (max-width: 600px) {
  .teaching-layout.has-tools > .teaching-layout-footer { display: flex; flex-wrap: wrap; gap: 0; height: auto; }
  .has-tools .teaching-tabs { flex: 0 0 100%; height: 48px; }
  .teaching-tools { flex: 0 0 100%; justify-content: center; height: 64px; }
  .teaching-tools > :slotted(*) { width: 100%; }
  .has-tools .teaching-actions { width: 100%; height: 48px; padding-inline: 8px; box-sizing: border-box; border-top: 1px solid #ffffff14; }
  .has-tools > .teaching-layout-stage { bottom: 64px; }
  .has-tools.has-tabs > .teaching-layout-stage, .has-tools.has-actions > .teaching-layout-stage { bottom: 112px; }
  .has-tools.has-tabs.has-actions > .teaching-layout-stage { bottom: 160px; }
  .has-tools > .teaching-navigation { bottom: 82px; }
  .has-tools.has-tabs > .teaching-navigation, .has-tools.has-actions > .teaching-navigation { bottom: 130px; }
  .has-tools.has-tabs.has-actions > .teaching-navigation { bottom: 178px; }
}
</style>
