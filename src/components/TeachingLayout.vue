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
  <div ref="element" class="teaching-layout" :class="{ 'has-footer': hasFooter }">
    <!-- 默认插槽保留宿主既有定位结构，不改动业务节点的层级。 -->
    <slot />
    <main v-if="$slots.stage" class="teaching-layout-stage"><slot name="stage" /></main>
    <template v-for="side in ['left', 'right']" :key="side">
      <aside v-if="showResourceEntries" class="teaching-resource-entry" :class="side"><slot name="resource-entry" :side="side"><button type="button" @click="emit('resources')">{{ resourceLabel }}</button></slot></aside>
      <nav v-if="showNavigation" class="teaching-navigation" :class="side" :aria-label="`${side === 'left' ? '左' : '右'}侧文档控制`">
        <slot name="navigation" :side="side"><button type="button" aria-label="上一页" :disabled="!navigable" @click="emit('previous')"><BoardIcon name="previous" /></button><button type="button" aria-label="下一步" :disabled="!navigable" @click="emit('next')"><BoardIcon name="next" /></button><span><b>{{ page }}</b><template v-if="totalPages">/{{ totalPages }}</template></span><button type="button" aria-label="关闭文档" @click="emit('close')">关闭</button></slot>
      </nav>
    </template>
    <footer v-if="hasFooter" class="teaching-layout-footer"><div class="teaching-tabs"><slot name="tabs" /></div><div class="teaching-tools"><slot name="tools" /></div><div class="teaching-actions"><slot name="actions" /></div></footer>
    <slot name="overlays" />
  </div>
</template>
<style scoped>
.teaching-layout{--teaching-footer-height:64px;position:relative;width:100%;height:100%;min-height:320px;overflow:hidden;background:#191919;color:white;box-sizing:border-box;font:14px system-ui,sans-serif}.teaching-layout-stage{position:absolute;inset:0;overflow:hidden}.has-footer>.teaching-layout-stage{bottom:var(--teaching-footer-height)}
.teaching-resource-entry{position:absolute;z-index:12;top:46%}.teaching-resource-entry.left{left:0}.teaching-resource-entry.right{right:0}.teaching-resource-entry button{width:32px;min-height:112px;border:0;border-radius:0 12px 12px 0;background:white;color:#5f6670;writing-mode:vertical-rl;letter-spacing:3px;cursor:pointer}.teaching-resource-entry.right button{border-radius:12px 0 0 12px}
.teaching-navigation{position:absolute;z-index:12;bottom:calc(var(--teaching-footer-height) + 18px);display:flex;flex-direction:column;align-items:center;width:60px;padding:6px;border:1px solid #ffffff38;border-radius:10px;box-sizing:border-box;background:#8c939f;color:white}.teaching-navigation.left{left:4px}.teaching-navigation.right{right:4px}.teaching-navigation button{width:100%;min-height:40px;background:transparent;color:inherit;border:0;border-radius:6px;cursor:pointer}.teaching-navigation button:hover{background:#ffffff38}.teaching-navigation button:disabled{opacity:.4;cursor:default}.teaching-navigation span{padding:12px 0;font-size:13px}.teaching-navigation b{color:#ffe3ab}
.teaching-layout-footer{position:absolute;inset:auto 0 0;z-index:20;display:flex;align-items:stretch;height:var(--teaching-footer-height);background:#1c2c43}.teaching-tabs{flex:1;min-width:0;display:flex;align-items:center;gap:8px;padding:8px;overflow:auto}.teaching-tools,.teaching-actions{display:flex;align-items:stretch;flex:none}.teaching-actions{gap:8px;align-items:center;padding:8px}.teaching-tabs:empty,.teaching-actions:empty{display:none}
.teaching-navigation button{display:flex;align-items:center;justify-content:center}.teaching-navigation :deep(svg){width:18px;height:18px}
@media(max-width:1000px){.teaching-layout{--teaching-footer-height:128px}.teaching-layout-footer{flex-wrap:wrap}.teaching-tabs{flex-basis:calc(100% - 160px);height:48px;box-sizing:border-box}.teaching-tools{order:3;flex-basis:100%;justify-content:flex-end;height:64px}.teaching-actions{height:48px;box-sizing:border-box}}
</style>
