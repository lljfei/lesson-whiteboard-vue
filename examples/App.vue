<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import {
  AnnotationCanvas,
  Whiteboard,
  createWhiteboardSession,
  type DrawingTool,
  type SessionChange,
  type WhiteboardSession
} from '../src'

const scenes = [
  { id: 'complete', number: '01', title: '完整白板', subtitle: '开箱即用', description: '从第一笔开始。绘图、图形、多页和历史记录，都在同一块画板里。' },
  { id: 'custom', number: '02', title: '自由组合', subtitle: '独立绘图层 · 4:3', description: '将绘图层放进自己的容器，使用自己的按钮控制工具与历史。' },
  { id: 'instances', number: '03', title: '双实例', subtitle: '各自独立的工作区', description: '两块白板拥有独立的页面与撤销记录，可以同时放在一个页面中。' },
  { id: 'json', number: '04', title: '保存与恢复', subtitle: '多页 JSON', description: '把完整多页内容保存为 JSON，再恢复到画板。保存位置由你的应用决定。' }
] as const

type SceneId = typeof scenes[number]['id']
const scene = ref<SceneId>('complete')
const current = computed(() => scenes.find((item) => item.id === scene.value)!)
const fullSession = createWhiteboardSession()
const customSession = createWhiteboardSession({
  document: {
    version: 1,
    activePageId: 'custom-page',
    background: 'white',
    pages: [{ id: 'custom-page', contentSize: { width: 1200, height: 900 }, shapes: [] }]
  }
})
const leftSession = createWhiteboardSession()
leftSession.setBackground('white')
const rightSession = createWhiteboardSession()
const saveSession = createWhiteboardSession()
const sessions = [fullSession, customSession, leftSession, rightSession, saveSession]
const lastAction = ref('等待第一笔')
const customTool = ref<DrawingTool>('pen')
const customColor = ref('#2672ff')
const customWidth = ref(5)
const customHistory = ref({ canUndo: false, canRedo: false })
const customTools: Array<{ tool: DrawingTool; label: string; icon: string }> = [
  { tool: 'pen', label: '画笔', icon: '✎' },
  { tool: 'rect', label: '矩形', icon: '▭' },
  { tool: 'select', label: '选择', icon: '↖' },
  { tool: 'eraser', label: '橡皮', icon: '⌫' }
]
const unsubscribe = customSession.subscribe((event) => {
  customHistory.value = { canUndo: event.canUndo, canRedo: event.canRedo }
})
const jsonText = ref('')
const jsonMessage = ref('先在左侧画几笔，再点击“导出到编辑区”。')
const jsonError = ref(false)

const totalShapes = (session: WhiteboardSession) =>
  session.state.pages.reduce((sum, page) => sum + page.shapes.length, 0)

const actionLabels: Record<SessionChange['type'], string> = {
  draw: '图形已更新', undo: '已撤销', redo: '已重做', clear: '当前页已清空',
  reset: '当前页已重置', 'page-add': '已新增页面', 'page-remove': '已删除页面',
  'page-change': '已切换页面', 'page-size': '页面尺寸已更新', background: '背景已切换', import: '已导入文档'
}

function exportDocument() {
  jsonText.value = JSON.stringify(saveSession.getDocument(), null, 2)
  jsonError.value = false
  jsonMessage.value = `已导出 ${saveSession.state.pages.length} 页、${totalShapes(saveSession)} 个图形。`
}

function importDocument() {
  try {
    saveSession.importJSON(jsonText.value)
    jsonError.value = false
    jsonMessage.value = '恢复成功。画板内容已替换，撤销历史从这份文档重新开始。'
  } catch (error) {
    jsonError.value = true
    jsonMessage.value = error instanceof Error ? error.message : '导入失败，请检查 JSON 内容。'
  }
}

// 场景切换只卸载视图；示例持有会话，所以再次打开时笔迹仍在。
onUnmounted(() => {
  unsubscribe()
  sessions.forEach((session) => session.dispose())
})
</script>

<template>
  <div class="demo-shell">
    <aside class="demo-sidebar">
      <a class="demo-brand" href="#" @click.prevent="scene = 'complete'" aria-label="返回完整白板示例">
        <span class="demo-brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <span>教学白板<small>备授课 · 组件示例</small></span>
      </a>
      <div class="demo-nav-heading">探索示例 <span>06</span></div>
      <nav class="demo-nav" aria-label="示例场景">
        <button v-for="item in scenes" :key="item.id" type="button" :aria-pressed="scene === item.id"
          :class="{ active: scene === item.id }" @click="scene = item.id" :data-testid="`scene-${item.id}`">
          <span class="demo-nav-number">{{ item.number }}</span>
          <span>{{ item.title }}<small>{{ item.subtitle }}</small></span>
          <span class="demo-nav-arrow" aria-hidden="true">↗</span>
        </button>
        <a href="./office.html">
          <span class="demo-nav-number">05</span>
          <span>文档预览<small>PPTX / Word · 本地与 WPS</small></span>
          <span class="demo-nav-arrow" aria-hidden="true">↗</span>
        </a>
        <a href="./teaching.html">
          <span class="demo-nav-number">06</span>
          <span>授课界面<small>文档批注 · 黑板切换</small></span>
          <span class="demo-nav-arrow" aria-hidden="true">↗</span>
        </a>
      </nav>
      <div class="demo-sidebar-note">
        <span class="demo-status-dot"></span><strong>为你的 Vue 应用而生</strong>
        <p>保留教学白板的熟悉体验，也给自定义界面留出空间。</p>
        <code>lesson-whiteboard-vue</code>
      </div>
      <div class="demo-sidebar-footer"><span>Vue 3 · Konva</span><span>v0.3.3</span></div>
    </aside>

    <main class="demo-main">
      <header class="demo-topbar"><span>组件演示 <b>/</b> {{ current.title }}</span><span class="demo-local-badge"><i></i> 本地演示</span></header>
      <div class="demo-content">
        <section class="demo-intro">
          <div><p class="demo-eyebrow">PLAYGROUND / {{ current.number }}</p><h1>{{ current.title }}</h1><p>{{ current.description }}</p></div>
          <span class="demo-version">Vue 3 组件库</span>
        </section>

        <section v-if="scene === 'complete'" class="demo-panel" aria-label="完整白板示例">
          <div class="demo-panel-heading"><span><i class="demo-status-dot"></i> 创作空间</span><span>{{ fullSession.state.pages.length }} 页 · {{ totalShapes(fullSession) }} 个图形</span></div>
          <div class="demo-board-frame demo-board-frame-main" data-testid="complete-board">
            <Whiteboard :session="fullSession" variant="teaching" color="#ffffff" @change="lastAction = actionLabels[$event.type]" />
          </div>
          <div class="demo-panel-footer"><span>{{ lastAction }}</span><span>支持鼠标与触摸 · 关闭后内容保留</span></div>
        </section>

        <section v-else-if="scene === 'custom'" class="demo-custom-layout" aria-label="自定义工具栏示例">
          <div class="demo-panel demo-custom-panel">
            <div class="demo-panel-heading"><span>你的工具栏，你的布局</span><span>1200 × 900 · 4:3</span></div>
            <div class="demo-custom-toolbar" aria-label="自定义绘图工具栏">
              <div class="demo-button-group">
                <button v-for="item in customTools" :key="item.tool" type="button" :aria-pressed="customTool === item.tool"
                  :class="{ selected: customTool === item.tool }" @click="customTool = item.tool" :aria-label="`自定义${item.label}`">
                  <span aria-hidden="true">{{ item.icon }}</span>{{ item.label }}
                </button>
              </div>
              <div class="demo-style-controls">
                <label>颜色<input v-model="customColor" type="color" aria-label="自定义画笔颜色" /></label>
                <label>线宽<select v-model="customWidth" aria-label="自定义画笔线宽"><option :value="3">细</option><option :value="5">中</option><option :value="9">粗</option></select></label>
              </div>
              <div class="demo-button-group demo-custom-history">
                <button type="button" :disabled="!customHistory.canUndo" @click="customSession.undo()">撤销</button>
                <button type="button" :disabled="!customHistory.canRedo" @click="customSession.redo()">重做</button>
                <button type="button" @click="customSession.clearPage()">清空</button>
              </div>
            </div>
            <div class="demo-paper-surround"><div class="demo-custom-canvas" data-testid="custom-canvas">
              <AnnotationCanvas :session="customSession" :tool="customTool" :color="customColor" :stroke-width="customWidth" />
            </div></div>
          </div>
          <aside class="demo-explainer"><span class="demo-explainer-icon" aria-hidden="true">↗</span><h2>只取你需要的部分</h2><p>这里仅使用独立绘图层。上方的按钮、颜色和线宽都是示例自己实现的界面。</p><div class="demo-code-note"><code>AnnotationCanvas</code><span>负责绘制与交互</span><code>WhiteboardSession</code><span>负责页面、内容与历史</span></div><p class="demo-fine-print">相同的数据接口，也可以用于课件批注、笔记或自定义编辑面板。</p></aside>
        </section>

        <section v-else-if="scene === 'instances'" class="demo-dual-layout" aria-label="双实例隔离示例">
          <div class="demo-panel"><div class="demo-panel-heading"><span><i class="demo-instance-marker">A</i> 白板 A</span><span>{{ totalShapes(leftSession) }} 个图形</span></div><div class="demo-board-frame demo-board-frame-dual" data-testid="left-board"><Whiteboard :session="leftSession" /></div><div class="demo-panel-footer">独立会话 · 白色背景</div></div>
          <div class="demo-panel"><div class="demo-panel-heading"><span><i class="demo-instance-marker green">B</i> 白板 B</span><span>{{ totalShapes(rightSession) }} 个图形</span></div><div class="demo-board-frame demo-board-frame-dual" data-testid="right-board"><Whiteboard :session="rightSession" color="#ffffff" /></div><div class="demo-panel-footer">独立会话 · 绿色背景</div></div>
          <div class="demo-inline-note"><span aria-hidden="true">◎</span><p>试着分别画几笔，再清空其中一块白板。另一块的内容和历史记录会保持不变。</p></div>
        </section>

        <section v-else class="demo-json-layout" aria-label="JSON 保存恢复示例">
          <div class="demo-panel"><div class="demo-panel-heading"><span>画板内容</span><span>{{ saveSession.state.pages.length }} 页 · {{ totalShapes(saveSession) }} 个图形</span></div><div class="demo-board-frame demo-board-frame-json" data-testid="json-board"><Whiteboard :session="saveSession" color="#ffffff" /></div><div class="demo-panel-footer">JSON 包含全部页面、逻辑尺寸、背景和图形</div></div>
          <div class="demo-panel demo-json-panel"><div class="demo-panel-heading"><label for="document-json">文档 JSON</label><span>version 1</span></div><textarea id="document-json" v-model="jsonText" spellcheck="false" placeholder="导出的 JSON 会出现在这里，也可以粘贴已保存的文档。" aria-describedby="json-status"></textarea><div class="demo-json-actions"><button type="button" class="demo-button-primary" @click="exportDocument">导出到编辑区 <span aria-hidden="true">↗</span></button><button type="button" class="demo-button-secondary" @click="importDocument">从编辑区恢复</button></div><p id="json-status" class="demo-json-message" :class="{ error: jsonError }" role="status">{{ jsonMessage }}</p></div>
          <div class="demo-inline-note"><span aria-hidden="true">⌁</span><p>内容只保留在本次页面会话中。示例不会自动写入浏览器存储，也不会上传数据；刷新前请复制需要保留的 JSON。</p></div>
        </section>

        <footer class="demo-page-footer"><span>用熟悉的方式，自由表达。</span><span>lesson-whiteboard-vue / example</span></footer>
      </div>
    </main>
  </div>
</template>

