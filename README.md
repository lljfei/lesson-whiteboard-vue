# lesson-whiteboard-vue

面向 Vue 3 的教学白板组件库。提供完整白板，也可以单独使用绘图层和工具栏，组合自己的界面。

包含画笔、矩形、椭圆、三角形、五角星、箭头、直线、选择、拖动、缩放、旋转、整条图形擦除、分页、缩略图、绿白背景、撤销重做和多页 JSON 保存恢复。

当前版本为 `0.3.0`，项目源码采用 MIT 许可证。GitHub：https://github.com/lljfei/lesson-whiteboard-vue 。目标环境为现代浏览器中的 Vue `>=3.5 <4` 应用，使用 ESM；不提供 Vue 2、React、SSR 绘图、协作同步或图片/PDF 导出。

## 安装与快速使用

在 Vue 项目中安装构建得到的压缩包。下面的文件路径按你的实际位置修改：

```sh
npm install lesson-whiteboard-vue
```

```vue
<script setup lang="ts">
import { Whiteboard } from 'lesson-whiteboard-vue'
import 'lesson-whiteboard-vue/style.css'
</script>

<template>
  <div class="board-container">
    <Whiteboard />
  </div>
</template>

<style scoped>
.board-container {
  width: 100%;
  height: 600px;
}
</style>
```

必须为父容器提供实际高度，并引入 `style.css`。布局相对于父容器，展开只铺满该容器；需要浏览器全屏时，由宿主调用自身全屏逻辑。

Vue 由接入项目提供；Konva、vue-konva 由包的运行依赖提供。库内部局部导入 Konva 组件，接入项目不需要 `app.use(VueKonva)`，也不需要 Less、Ant Design、路径别名或自动导入插件。

## 本地开发

```sh
npm install
npm run dev           # 四种交互示例
npm run typecheck     # 源码和示例类型检查
npm test             # 单元测试
npm run build        # ESM、类型声明和 CSS
npm run build:example
npm pack             # 生成 lesson-whiteboard-vue-0.3.0.tgz
```

示例包含完整白板、独立绘图层与自定义工具栏、双实例和 JSON 保存恢复。页面切换保留会话数据，刷新页面会清空；JSON 示例提供手动复制和恢复，不自动写入 localStorage，不上传任何数据。

测试命令及示例用于复现验证，具体执行结果见交付时的验证记录。浏览器触摸模拟与真实触屏设备测试应分别记录。

## 组件接口

从包根入口具名导出 `Whiteboard`、`AnnotationCanvas`、`WhiteboardToolbar` 和 `createWhiteboardSession`，以及相应 TypeScript 类型。

### `Whiteboard`

| 属性或模型 | 类型 | 默认值 / 行为 |
| --- | --- | --- |
| `session` | `WhiteboardSession` | 可选；不传时组件创建独立会话 |
| `v-model:tool` | `DrawingTool` | `pen` |
| `v-model:color` | `string` | `#111827` |
| `v-model:strokeWidth` | `number` | `4`，逻辑坐标中的线宽 |
| `v-model:open` | `boolean` | `true`；关闭仅隐藏，保留会话 |
| `v-model:expanded` | `boolean` | `false`；切换容器内的展开状态 |
| `showToolbar` | `boolean` | `true` |
| `tools` | `DrawingTool[]` | 可配置显示的工具 |
| `colors` | `string[]` | 可配置工具栏颜色列表 |
| `strokeWidths` | `number[]` | 可配置工具栏线宽列表 |

默认颜色为 `#111827`。使用绿色背景时，可以显式设置白色画笔，例如 `<Whiteboard color="#ffffff" />`。

工具标识：

```ts
type DrawingTool =
  | 'browse' | 'select' | 'pen' | 'eraser'
  | 'rect' | 'ellipse' | 'triangle' | 'star' | 'arrow' | 'straight'
```

`browse` 让独立绘图层的指针事件穿透，便于宿主操作下方内容。`eraser` 删除命中的整条轨迹或整个图形，不是像素擦除。

组件事件：

| 事件 | 参数 | 触发规则 |
| --- | --- | --- |
| `change` | `SessionChange` | 内容或文档状态实际变化时，携带独立文档快照 |
| `history-change` | `{ pageId, canUndo, canRedo }` | 报告当前活动页的历史状态；初始化和更换会话时也报告 |
| `update:tool/color/strokeWidth/open/expanded` | 对应模型值 | 用于 Vue `v-model` 双向绑定 |

组件 ref 提供 `undo()`、`redo()`、`clear()`、`exportJSON(): string`、`importJSON(json: string): void`，其中 `clear()` 只清空当前页且可撤销。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Whiteboard, type WhiteboardMethods } from 'lesson-whiteboard-vue'
import 'lesson-whiteboard-vue/style.css'

const board = ref<WhiteboardMethods>()
const color = ref('#ffffff')

function copyDocument() {
  const json = board.value?.exportJSON()
  // 将 json 交给宿主的保存流程。
  console.log(json)
}
</script>

<template>
  <button @click="copyDocument">读取文档 JSON</button>
  <div style="height: 600px">
    <Whiteboard ref="board" v-model:color="color" />
  </div>
</template>
```

插槽：

| 插槽 | 用途 |
| --- | --- |
| `toolbar` | 替换整个默认工具栏 |
| `toolbar-actions` | 向默认工具栏增加操作 |
| `page-actions` | 在页面操作区增加操作 |

`toolbar` 插槽参数包含 `session`、`tool`、`color`、`strokeWidth`、`setTool()`、`setColor()`、`setStrokeWidth()`、`canUndo`、`canRedo`、`undo()`、`redo()` 和 `clear()`。自定义界面调用这些接口即可继续使用完整白板的分页和背景功能。

### `AnnotationCanvas` 与 `WhiteboardToolbar`

`AnnotationCanvas` 的属性为：必需的 `session`，可选的 `pageId`、`tool`、`color`、`strokeWidth`、`active`。省略 `pageId` 时显示会话当前活动页；`active` 默认为 `true`，停用时取消未提交手势。绘图层采用绝对定位，父容器需设置 `position: relative` 和明确尺寸。

`WhiteboardToolbar` 接收 `v-model:tool/color/strokeWidth`、`tools/colors/strokeWidths`、`canUndo`、`canRedo`，并发出 `undo`、`redo`、`clear` 事件。它只控制界面，不自行持有绘图数据。

下面使用绘图层和原生按钮实现一个 4:3 白板：

```vue
<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import {
  AnnotationCanvas,
  createWhiteboardSession,
  type DrawingTool
} from 'lesson-whiteboard-vue'
import 'lesson-whiteboard-vue/style.css'

const session = createWhiteboardSession({
  document: {
    version: 1,
    activePageId: 'page-1',
    background: 'white',
    pages: [{
      id: 'page-1',
      contentSize: { width: 1200, height: 900 },
      shapes: []
    }]
  }
})
const tool = ref<DrawingTool>('pen')
const history = ref({ canUndo: false, canRedo: false })
const unsubscribe = session.subscribe((event) => {
  history.value = { canUndo: event.canUndo, canRedo: event.canRedo }
})

onUnmounted(() => {
  unsubscribe()
  session.dispose()
})
</script>

<template>
  <div>
    <button @click="tool = 'pen'">画笔</button>
    <button @click="tool = 'rect'">矩形</button>
    <button @click="tool = 'select'">选择</button>
    <button :disabled="!history.canUndo" @click="session.undo()">撤销</button>
    <button :disabled="!history.canRedo" @click="session.redo()">重做</button>
  </div>
  <div style="position: relative; width: 100%; aspect-ratio: 4/3; background: white">
    <AnnotationCanvas :session="session" :tool="tool" color="#245c4b" :stroke-width="5" />
  </div>
</template>
```

绘图层不负责背景、分页或页面布局，独立组合时由宿主实现这些界面。图形数据始终使用页面逻辑坐标，调整容器尺寸只改变显示比例。

## 会话与历史

```ts
const session = createWhiteboardSession({
  document: existingDocument, // 可选；只作为初始化数据使用
  historyLimit: 51           // 每页最多保留的快照数，含当前快照
})
```

不传初始文档时创建一个默认 1920×1080 的空页面。每个 session 拥有独立的页面、历史和订阅；`getDocument()` 返回副本，`state` 和 `getPage()` 提供只读状态，业务修改应通过方法完成。

| 方法 | 作用 |
| --- | --- |
| `getDocument()` | 返回可独立修改的完整文档副本 |
| `getPage(id?)` | 读取指定页，默认当前页；不存在返回 `undefined` |
| `addPage(contentSize?)` | 新增并进入该页，返回 ID；省略尺寸时继承当前页 |
| `ensurePage(id, contentSize?)` | 获取或创建指定 ID 的页面 |
| `removePage(id)` | 删除页面，返回是否删除；最后一页不可删除 |
| `setActivePage(id)` | 切换当前页，保留各页内容和历史 |
| `setContentSize(id, size)` | 设置页面逻辑尺寸 |
| `commitPage(id, shapes)` | 提交完整图形快照，供绘图层或程序化编辑使用 |
| `canUndo(id?)` / `canRedo(id?)` | 查询指定页的历史状态，默认当前页 |
| `undo(id?)` / `redo(id?)` | 操作指定页的历史，默认当前页 |
| `clearPage(id?)` | 清空图形，保留撤销入口 |
| `resetPage(id?)` | 清空图形与全部历史，并取消旧手势；不可撤销 |
| `setBackground('green' \| 'white')` | 设置整个文档共享的背景 |
| `exportJSON()` / `importJSON(json)` | 导出与恢复完整文档 |
| `subscribe(listener)` | 订阅变更，返回取消订阅函数 |
| `dispose()` | 释放订阅等会话资源 |

每次完成的绘制、拖动、缩放、旋转或擦除手势记一次历史；一次擦除手势删除多个图形也只记一次。撤销后产生新编辑会丢弃旧重做分支。新增、删除、切页和背景切换不进入绘图撤销历史。

切页、切工具、导入、触摸取消或容器缩放时，未提交的操作会取消，已提交内容保留。撤销/重做到边界、重复清空空页等没有状态变化的操作不发 `change`。`resetPage()` 即使页面为空，也可能因清除历史而产生状态变化。

`SessionChange` 的 `pageId` 表示受影响页，删除后该页可能已不存在；`activePageId`、`canUndo` 和 `canRedo` 表示操作完成后的活动页及其历史。不要用删除事件的 `pageId` 推断当前活动页。

### 会话所有权

不传 `session` 时，`Whiteboard` 自行创建并在卸载时销毁会话。传入外部 session 时，组件卸载只停止自身订阅，不销毁该会话；这允许隐藏、卸载再显示白板后恢复内容。

宿主应先卸载所有使用者，再调用 `dispose()`，例如在父组件 `onUnmounted()` 中释放。销毁后仍可读取文档，但写入会抛错。跨组件共享会话是显式选择；需要互不影响的多个白板时，分别创建会话或省略各自的 `session`。

## JSON 保存与恢复

```ts
const json = session.exportJSON()
// 保存到文件、服务端或浏览器存储的流程由宿主实现。

try {
  session.importJSON(json)
} catch (error) {
  // 非法数据不会部分覆盖现有内容。
  console.error(error)
}
```

文档格式：

```ts
interface WhiteboardDocument {
  version: 1
  activePageId: string
  background: 'green' | 'white'
  pages: Array<{
    id: string
    contentSize: { width: number; height: number }
    shapes: Shape[]
  }>
}
```

`Shape` 是按 `kind` 区分的 TypeScript 联合类型，包含各图形需要的位置、尺寸、坐标数组、颜色、描边和变换字段。对应类型为 `line`（自由画笔）、`straight`、`arrow`、`rect`、`ellipse`、`triangle`、`star`。

JSON 包含所有页面、逻辑尺寸、背景和图形，不保存撤销历史、选框、当前工具、界面开关或未完成的手势。导入成功后以文档内容建立新的历史基线，不能撤销回导入前的文档。

导入在替换当前文档前验证版本、至少一页、唯一页面 ID、有效当前页、正的逻辑尺寸、页内唯一图形 ID、图形种类、必需字段、有限数值和轨迹坐标成对等约束。非法输入抛出可读错误，并保持原文档和历史完整。导出与导入均使用独立数据，避免外部对象修改污染内部历史。

`change` 在操作提交后提供完整快照，不在每次指针移动时发出。接入服务端保存时，可在宿主根据业务需要合并保存请求；库本身不执行网络请求或持久化。

## 与 lesson 的边界

本包提取通用白板能力。WPS/Office 播放、课件资源、用户登录、接口请求、路由、授课退出和课件翻页清除策略由原宿主负责。`resetPage()` 可供宿主明确执行需要清除历史的业务策略，库不会自动把它应用到白板翻页。

本项目没有修改 lesson 的接入方式，也不依赖 lesson 的全局状态、环境变量或构建插件。


## PPTX / Word：DocumentWhiteboard（0.3.0）

新增 `DocumentWhiteboard`。运行示例后访问 `/office.html`，包含可直接加载的双页 PPTX、DOCX 示例、本地文件选择、文件 URL 和 WPS 配置入口。

### 本地模式

```vue
<script setup lang="ts">
import { DocumentWhiteboard } from 'lesson-whiteboard-vue'
import 'lesson-whiteboard-vue/style.css'
</script>
<template>
  <div style="height: 700px">
    <DocumentWhiteboard mode="local" source="/files/lesson.pptx"
      format="pptx" document-id="lesson-v1" />
  </div>
</template>
```

`source` 接受 `File`、`Blob`、`ArrayBuffer` 或文件 URL。File 和有扩展名的 URL 可以推断格式；其余情况传 `format="pptx"` 或 `format="docx"`。仅支持 OOXML 的 `.pptx/.docx`，不支持旧版 `.ppt/.doc`。URL 必须允许浏览器下载，跨域需要 CORS；通过可选 `request: RequestInit` 传入请求头等配置，包不读取登录 cookie。

本地文件由浏览器解析，包不会上传。PPTX 使用按需加载的 `@aiden0z/pptx-renderer`，外部媒体关系被阻止；DOCX 使用 `docx-preview`。文档内容置于禁止脚本的隔离 iframe，避免文档样式污染宿主页。两种引擎均通过动态 import 按需加载，单独使用白板不执行文档解析。

PPTX 为静态预览，不播放动画和转场；字体、公式及复杂效果可能与 PowerPoint 不同。DOCX 分页依赖文档分页标记和浏览器排版，可能与 Word 页码不同；复杂浮动内容、域和部分字体不保证一致。本地分页可叠加批注，并按 `documentId:页码` 独立保存内容和历史。

### WPS 模式

```vue
<script setup lang="ts">
import { DocumentWhiteboard } from 'lesson-whiteboard-vue'
import type { WpsOptions } from 'lesson-whiteboard-vue'
import 'lesson-whiteboard-vue/style.css'
// 这些值由接入项目在内存中提供；不要把密钥写入源码。
const wps: WpsOptions = {
  appId: '你的应用ID', fileId: '你的文件ID', token: '本次会话token',
  loadSDK: async () => {
    // 接入方自行按官方说明加载 WebOfficeSDK，再返回 SDK 对象。
    return (window as unknown as { WebOfficeSDK: unknown }).WebOfficeSDK
  }
}
</script>
<template>
  <div style="height: 700px">
    <DocumentWhiteboard mode="wps" format="pptx" document-id="wps-file-v1" :wps="wps" />
  </div>
</template>
```

WPS 需要接入方已经开通 WebOffice、实现文件及权限回调服务，并提供有效配置；单独的 npm 包不能代替后端。这里 `fileId` 是 WPS 集成文件标识，不是任意下载 URL。`format="docx"` 使用 Writer，`format="pptx"` 使用 Presentation。SDK 加载地址、token 和授权续期由宿主管理，配置变化时替换 `wps` 对象重新建立会话。包不保存凭据，不自动调用收费转换接口。

PPTX 沿用 lesson 的放映流程，上一页/下一页优先推进页内动画，再切换幻灯片。WPS Word 当前提供浏览和定位；由于 SDK 内部滚动与外部画布没有可靠坐标同步，暂不开放 Word 在线模式的覆盖批注。本地 DOCX 模式支持按渲染页批注。

### 文档组件接口

- 必填 `documentId`：文档稳定且包含内容版本的标识。切文件或替换版本时改变此值，以免复用旧批注；凭据不应作为 ID。
- `mode`：`local`（默认）或 `wps`；本地模式传 `source`，在线模式传 `format` 与 `wps`。
- 可选 `session`：与白板相同的会话对象；组件只销毁自己创建的会话。
- 支持 `v-model:tool/color/strokeWidth`，默认浏览模式、红色、4 像素。
- 事件 `ready(OfficeState)`、`error(Error)`、`page-change(number)`、`change(SessionChange)`。
- ref：`previous()`、`next()`、`goTo(page)`、`retry()`、`exportJSON()`、`importJSON(json)`。页码从 1 开始。
- JSON 仅保存批注，不嵌入 Office 原文件。恢复时要由宿主提供同一份文档及相同 `documentId`。文档组件使用自己的页键，不跟随会话 activePageId；共用会话时按事件的 pageId 查询该页历史。

参考：[WPS 官方接入条件](https://open.wps.cn/documents/app-integration-dev/docs-center/online-preview-edit/client/summary)、[PPTX 渲染器支持边界](https://github.com/aiden0z/pptx-renderer)、[DOCX 渲染器](https://github.com/VolodymyrBaydalka/docxjs)。


## 授课界面与现有项目兼容（0.3.0）

参考 `teaching.html`：深色舞台、双侧翻页、侧边资源入口、底部课件标签、绘图工具与右侧动作区。示例只使用人工生成的文档，不包含真实备课资源或账户。

`TeachingLayout` 是容器内的通用布局，支持 `stage`、`tabs`、`tools`、`actions`、`navigation`、`resource-entry`、`overlays` 插槽；默认插槽允许宿主保留原有节点结构。`showNavigation` 开启双侧文档控制，配合 `page`、`totalPages`、`navigable`；`previous`、`next`、`close` 是操作事件。`showResourceEntries` 开启双侧入口，文字由 `resourceLabel` 配置，点击发出 `resources`。通过组件 ref 的 `element` 获取根元素，由宿主控制浏览器全屏。

工具栏使用 `variant="teaching"` 得到与原授课页一致的 64px 底栏。`DocumentWhiteboard` 的 `showToolbar`、`showControls` 默认均为 true；组合到授课布局时可以设为 false，将统一工具与翻页放到外部。

```vue
<TeachingLayout :page="page" :total-pages="total" show-navigation
  @previous="viewer.previous()" @next="viewer.next()">
  <template #stage><!-- 文档或自定义内容 --></template>
  <template #tabs><!-- 宿主的课件标签 --></template>
  <template #tools><WhiteboardToolbar variant="teaching" ... /></template>
  <template #actions><!-- 全屏、结束等宿主按钮 --></template>
</TeachingLayout>
```

lesson 的接入采用薄适配组件：原 `AnnotationStage` 保留 storageKey、undoToken 等契约，转发给 `AnnotationCanvas`；原 `TeachingToolbar` 保留黑板切换事件。授课页每次进入创建独立 session，并在退出时销毁。课件只有成功翻到不同页时清空旧页/目标页及历史；白板关闭或切页继续保留内容。WPS 的 fileId、token 和 loadSDK 仍由宿主提供。

正式源码位于 lesson 仓库的 `packages/whiteboard`；整个目录可独立复制为新仓库。在 lesson 内通过 Vite 将包入口映射到本目录源码，并统一 Vue/Konva 解析，首次运行不需要预先生成 dist。外部 Vue 项目通过公开包入口使用构建产物，并引入 `style.css`。宿主业务文件不进入独立包。

## 开源与发布

- 本库源码：MIT；详见 `LICENSE`。依赖维持各自许可证，详见 `THIRD_PARTY_NOTICES.md`。
- 独立目录开发：`npm ci` → `npm run dev`；检查贡献约定见 `CONTRIBUTING.md`。
- 本地打包：`npm pack`，自动运行类型检查、测试和构建。
- 不包含 WPS SDK、账号、密钥、环境文件或后端回调实现。WPS 在线服务需接入方自行配置。
- 源码仓库：https://github.com/lljfei/lesson-whiteboard-vue 。npm 包名：`lesson-whiteboard-vue`，官方 registry 为 `https://registry.npmjs.org/`。

