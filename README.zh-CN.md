# lesson-whiteboard-vue

[English](./README.md) | **简体中文**

[![npm](https://img.shields.io/npm/v/lesson-whiteboard-vue.svg)](https://www.npmjs.com/package/lesson-whiteboard-vue)
[![许可证：MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Vue 3](https://img.shields.io/badge/Vue-%3E%3D3.5%20%3C4-42b883.svg)](https://vuejs.org/)

面向 Vue 3 的教学白板，提供绘图工具、逐页撤销重做、多页 JSON 保存恢复，以及可选的 PPTX / DOCX 预览。可以直接使用完整白板，也可以组合小组件，接入自己的文档批注和授课界面。

![授课界面预览](https://raw.githubusercontent.com/lljfei/lesson-whiteboard-vue/main/docs/images/teaching-preview.png)

[源码](https://github.com/lljfei/lesson-whiteboard-vue) · [npm](https://www.npmjs.com/package/lesson-whiteboard-vue) · [发行版本](https://github.com/lljfei/lesson-whiteboard-vue/releases)

## 目录

- [功能与支持范围](#功能与支持范围)
- [快速开始](#快速开始)
- [自定义绘图层与工具栏](#自定义绘图层与工具栏)
- [Office 文档](#office-文档)
- [授课布局](#授课布局)
- [API 参考](#api-参考)
- [会话与 JSON](#会话与-json)
- [功能限制](#功能限制)
- [本地开发](#本地开发)
- [许可证](#许可证)

## 功能与支持范围

- 画笔、矩形、椭圆、三角形、五角星、箭头和直线。
- 选择、拖动、缩放、旋转，以及整条图形擦除。
- 鼠标和触摸输入；使用逻辑坐标，内容不随容器尺寸改变。
- 多页白板、缩略图、绿白背景和独立的逐页撤销重做。
- 实例隔离的会话、可替换工具栏，以及 JSON 导入导出。
- 容器内的授课布局，提供课件标签、侧边控制和动作插槽。

| 模式 | 输入 | 预览 | 叠加批注 |
| --- | --- | --- | --- |
| 白板 | 空会话或白板 JSON | 可编辑白板 | 支持 |
| 本地 PPTX | `File`、`Blob`、`ArrayBuffer` 或 URL | 静态幻灯片 | 支持，按渲染页保存 |
| 本地 DOCX | `File`、`Blob`、`ArrayBuffer` 或 URL | 浏览器排版的文档页 | 支持，按渲染页保存 |
| WPS Presentation | WPS 应用和文件配置 | SDK 放映 | 支持 |
| WPS Writer | WPS 应用和文件配置 | SDK 文档浏览与定位 | 当前关闭 |

Office 预览引擎按需加载。WPS 模式需要接入方配置自己的 WebOffice 服务，不能直接把任意下载 URL 当作 WPS 文件打开。

## 快速开始

在现有 Vue **>=3.5、<4** 项目中安装：

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
    <Whiteboard color="#ffffff" />
  </div>
</template>

<style scoped>
.board-container {
  width: 100%;
  height: 600px;
}
</style>
```

全局引入一次样式，并为父容器设置实际高度。默认背景为绿板，示例显式使用白色画笔。Vue 是 peer dependency；不需要全局注册 Konva，也不需要 Ant Design、Less 或自动导入插件。

Konva、vue-konva 和 Office 渲染器是运行依赖，由 npm 自动安装。Vitest、Vue Test Utils 和 Happy DOM 仅供开发本仓库时使用；使用已发布包的应用无需安装这些测试工具。

`expanded` 表示铺满组件容器；浏览器全屏由接入应用控制。

## 自定义绘图层与工具栏

需要自行控制布局时，可单独使用 `AnnotationCanvas`。绘图层采用绝对定位，父容器应设置 `position: relative` 和明确尺寸。

```vue
<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import {
  AnnotationCanvas,
  WhiteboardToolbar,
  createWhiteboardSession,
  type DrawingTool
} from 'lesson-whiteboard-vue'
import 'lesson-whiteboard-vue/style.css'

const session = createWhiteboardSession()
const tool = ref<DrawingTool>('pen')
const color = ref('#245c4b')
const strokeWidth = ref(4)
const canUndo = computed(() => session.canUndo())
const canRedo = computed(() => session.canRedo())

onUnmounted(() => session.dispose())
</script>

<template>
  <div style="position: relative; height: 480px; background: white">
    <AnnotationCanvas
      :session="session" :tool="tool" :color="color"
      :stroke-width="strokeWidth"
    />
  </div>
  <WhiteboardToolbar
    v-model:tool="tool" v-model:color="color" v-model:stroke-width="strokeWidth"
    :can-undo="canUndo" :can-redo="canRedo"
    @undo="session.undo()" @redo="session.redo()" @clear="session.clearPage()"
  />
</template>
```

绘图层不负责背景、分页和工具栏。`browse` 会让指针事件穿透到下方内容。橡皮擦删除命中的整条笔迹或整个图形，不是像素擦除。

## Office 文档

### 本地 PPTX / DOCX

```vue
<script setup lang="ts">
import { DocumentWhiteboard } from 'lesson-whiteboard-vue'
import 'lesson-whiteboard-vue/style.css'
</script>

<template>
  <div style="height: 700px">
    <DocumentWhiteboard
      mode="local" source="/files/sample.pptx"
      format="pptx" document-id="slides-42-v1"
    />
  </div>
</template>
```

- `source` 接受 `File`、`Blob`、`ArrayBuffer` 或 URL 字符串。本地选择文件后，直接传入取得的 `File`。
- 可以根据 `File` 名称或 URL 扩展名推断格式；`Blob`、`ArrayBuffer` 和无扩展名的 URL 应显式传入 `format`。
- 本地仅支持 `.pptx`、`.docx`，不支持旧版 `.ppt`、`.doc`。
- URL 必须可下载，跨域时需允许 CORS。可选的 `request: RequestInit` 可传入请求头等 fetch 配置。
- 包在浏览器中解析本地输入，不会上传文件；URL 输入由浏览器下载。PPTX 的外部媒体关系被阻止。
- 为不同文档及内容版本指定稳定、互不相同的 `documentId`；批注页键例如 `slides-42-v1:1`。

PPTX 使用 [@aiden0z/pptx-renderer](https://github.com/aiden0z/pptx-renderer)，DOCX 使用 [docx-preview](https://github.com/VolodymyrBaydalka/docxjs)。渲染内容位于禁止文档脚本执行的隔离 iframe 中。

### WPS WebOffice

由接入应用提供 SDK 加载函数和配置：

```vue
<script setup lang="ts">
import { DocumentWhiteboard, type WpsOptions } from 'lesson-whiteboard-vue'
import 'lesson-whiteboard-vue/style.css'

const wps: WpsOptions = {
  appId: 'YOUR_APP_ID',
  fileId: 'YOUR_FILE_ID',
  // 如果集成需要 token，在此传入当前内存中的会话 token。
  loadSDK: async () => {
    // 接入应用应先加载官方 SDK，再返回 SDK 对象。
    const sdk = (window as unknown as { WebOfficeSDK?: unknown }).WebOfficeSDK
    if (!sdk) throw new Error('请先加载 WPS WebOffice SDK')
    return sdk
  }
}
</script>

<template>
  <div style="height: 700px">
    <DocumentWhiteboard
      mode="wps" format="pptx" document-id="wps-file-42-v1" :wps="wps"
    />
  </div>
</template>
```

接入方必须配置 WebOffice 应用及后端文件、权限回调。`fileId` 是这套集成使用的文件标识，不是下载地址。详见 [官方接入前提](https://open.wps.cn/documents/app-integration-dev/docs-center/online-preview-edit/client/summary)。

`format="pptx"` 使用 Presentation，`format="docx"` 使用 Writer。Presentation 的上一步/下一步会优先推进页内动画，再切换幻灯片。WPS Writer 当前支持浏览和定位，但未开放覆盖批注，因为其内部文档滚动尚未与外部画布同步。

SDK 加载、token 续期、鉴权及服务授权由接入应用负责。包不会读取应用 cookie 或环境变量，也不保存凭据。配置变化时替换 `wps` 对象以重新初始化；应用密钥应留在服务端。

## 授课布局

`TeachingLayout` 沿用 lesson 授课页的底栏分区、蓝色选中态和双侧控制。可通过插槽和事件连接应用自己的资源选择、页面导航、身份认证或教学流程。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { TeachingLayout, Whiteboard } from 'lesson-whiteboard-vue'
import 'lesson-whiteboard-vue/style.css'

const layout = ref<InstanceType<typeof TeachingLayout>>()

async function enterFullscreen() {
  await layout.value?.element?.requestFullscreen()
}
</script>

<template>
  <div style="height: 700px">
    <TeachingLayout ref="layout">
      <template #stage><Whiteboard color="#ffffff" /></template>
      <template #tabs><span>白板 1</span></template>
      <template #actions><button @click="enterFullscreen">全屏</button></template>
    </TeachingLayout>
  </div>
</template>
```

组合统一文档界面时，可将 `DocumentWhiteboard` 的 `showToolbar`、`showControls` 设为 `false`，放入 `stage`，再通过 `tools` 提供统一工具栏。`WhiteboardToolbar` 的 `variant="teaching"` 对应 64px 教学底栏。完整的文档 ref、页码和历史状态接线见 [授课示例](./examples/TeachingDemo.vue)。

## API 参考

以下组件、函数及相关 TypeScript 类型均从 `lesson-whiteboard-vue` 根入口具名导出。模型使用 Vue `v-model`，其他属性为单向输入。

### `Whiteboard`

| 属性 / 模型 | 默认值 | 行为 |
| --- | --- | --- |
| `session?: WhiteboardSession` | 自建会话 | 传入会话以共享或由外部保留数据 |
| `v-model:tool` | `pen` | 当前绘图工具 |
| `v-model:color` | `#111827` | 描边颜色 |
| `v-model:strokeWidth` | `4` | 逻辑坐标中的线宽 |
| `v-model:open` | `true` | 关闭只隐藏，保留会话 |
| `v-model:expanded` | `false` | 在容器内展开 |
| `showToolbar` | `true` | 显示默认工具栏 |
| `variant` | `'default'` | 设为 `'teaching'` 时使用透明无边框容器与授课页控件布局，收起画板后露出底层课件 |
| `tools`、`colors`、`strokeWidths` | 内置列表 | 自定义工具栏选项 |

- 事件：`change(SessionChange)`、`history-change(HistoryChange)` 和模型更新。初始化、更换会话时也报告历史状态。
- ref 方法：`undo()`、`redo()`、`clear()`、`exportJSON()`、`importJSON(json)`。`clear()` 只清空当前页，可以撤销。
- 插槽：`toolbar` 替换工具栏；`toolbar-actions`、`page-actions` 扩展默认界面。
- `toolbar` 插槽参数：`session`、`tool`、`color`、`strokeWidth`、`setTool`、`setColor`、`setStrokeWidth`、`canUndo`、`canRedo`、`undo`、`redo`、`clear`。

### `AnnotationCanvas` / `WhiteboardToolbar` / `PageThumbnail`

| 组件 | 契约 |
| --- | --- |
| `AnnotationCanvas` | 必填 `session`；可选 `pageId`（当前页）、`tool`（`select`）、`color`（`#111827`）、`strokeWidth`（`4`）、`active`（`true`）。停用时取消未完成手势。 |
| `WhiteboardToolbar` | 必填 `tool`、`color`、`strokeWidth`；发出模型更新及 `undo` / `redo` / `clear` 事件；可选 `canUndo`、`canRedo`、`tools`、`colors`、`strokeWidths`、`variant: 'default' \| 'teaching'`。默认插槽增加操作，不自行持有绘图数据。 |
| `PageThumbnail` | 必填只读 `page: WhiteboardPage`、`background: 'green' \| 'white'`，渲染 SVG 预览。 |

```ts
type DrawingTool =
  | 'browse' | 'select' | 'pen' | 'eraser'
  | 'rect' | 'ellipse' | 'triangle' | 'star' | 'arrow' | 'straight'
```

### `DocumentWhiteboard`

| 属性 / 模型 | 默认值 / 要求 |
| --- | --- |
| `documentId: string` | 必填，稳定的文档及版本标识 |
| `mode: 'local' \| 'wps'` | `local` |
| `source?: OfficeSource` | 本地模式必填 |
| `format?: 'pptx' \| 'docx'` | 本地尽量推断；WPS 模式必填 |
| `wps?: WpsOptions` | WPS 模式必填 |
| `session?: WhiteboardSession` | 不传时创建独立会话 |
| `request?: RequestInit` | URL 输入的 fetch 配置 |
| `showToolbar`、`showControls` | 均为 `true` |
| `v-model:tool/color/strokeWidth` | `browse` / `#ef4444` / `4` |

- 事件：`ready(OfficeState)`、`error(Error)`、`page-change(number)`、`change(SessionChange)`。
- ref 方法：`previous()`、`next()`、`goTo(page)`、`retry()`、`exportJSON()`、`importJSON(json)`，页码从 **1** 开始。
- 批注 JSON 不包含 Office 原文件；恢复时仍需提供相同文档和 `documentId`。
- 文档页键独立于会话的 `activePageId`。自定义控制时，应使用明确的文档页键查询历史和编辑该页。
- 会话存续期间，文档翻页会保留已提交批注。接入应用可调用 `session.clearPage(pageKey)` 清空指定页（可撤销），或调用 `session.resetPage(pageKey)` 同时清除内容和历史；组件不会在翻页时自动清空批注。

### `TeachingLayout`

- 属性：`page=1`、`totalPages=0`、`navigable=true`、`showNavigation=false`、`showResourceEntries=false`、`resourceLabel='资源'`。
- 事件：`previous`、`next`、`close`、`resources`。
- 插槽：`stage`、`tabs`、`tools`、`actions`、`navigation`、`resource-entry`、`overlays`，以及用于自定义内容的默认插槽。双侧插槽接收 `side: 'left' | 'right'`。
- ref：根 DOM 元素 `element`，供接入应用控制全屏。
- 使用 `stage` 和底栏插槽时，按容器宽度适配：大于 1280px 为 64px 单行底栏；标签与工具同时存在时，600–1280px 为 120px 双行底栏；600px 及以下将标签、工具、授课操作分别排列。900px 及以下隐藏重复的右侧入口与翻页控制。
- 默认插槽供 lesson 等宿主保留自有布局；上述底栏布局只作用于组件提供的具名插槽，不会重排宿主的默认插槽内容。

### `createWpsOfficePlayer(options)`

用于自定义文档界面的底层 WPS 适配器。参数 `WpsPlayerOptions` 包含 `resource`（`fileId`、`code`）、`mount`、`loadSDK`、`appId`，以及可选的 `token`、`initialPage`、`onState`、`onPage`、`beforePageChange`。类型码为 `1`（Writer）、`3`（PDF）、`4`（Presentation）。

返回 `start()`、`previous()`、`next()`、`goTo(page)`、`resize()`、`dispose()`。挂载容器、凭据、SDK 和适配器生命周期均由接入应用管理。

## 会话与 JSON

`createWhiteboardSession({ document?, historyLimit? })` 创建独立的内存会话。默认包含一个绿色背景、1920×1080 的页面，每页保留 **51 份历史快照**，含当前快照。

| 方法 | 作用 |
| --- | --- |
| `getDocument()`、`getPage(id?)` | 获取文档副本或只读页面；页面不存在时返回 `undefined` |
| `addPage(size?)`、`ensurePage(id, size?)` | 新增并切换页面，或确保指定页存在但不切换；`addPage` 未传尺寸时继承当前页 |
| `removePage(id)`、`setActivePage(id)`、`setContentSize(id, size)` | 管理页面；最后一页不可删除 |
| `commitPage(id, shapes)` | 提交符合类型契约的图形快照，供程序化编辑使用 |
| `canUndo(id?)`、`canRedo(id?)`、`undo(id?)`、`redo(id?)` | 查询或操作逐页历史，默认当前页 |
| `clearPage(id?)`、`resetPage(id?)` | 可撤销清空，或不可撤销地清空图形与全部历史 |
| `setBackground('green' \| 'white')` | 设置整个文档的背景 |
| `exportJSON()`、`importJSON(json)` | 保存与恢复全部页面 |
| `subscribe(listener)`、`dispose()` | 订阅变更并返回取消函数；释放会话 |

一次完成的绘制、变形或擦除手势记一步历史。撤销后进行新编辑会丢弃重做分支。页面管理、背景切换不进入绘图撤销历史。切页、切工具、导入、触摸取消和容器缩放时会取消未完成手势。

会话 `state` 和 `getPage()` 为只读状态，应通过方法修改。`getDocument()` 返回独立副本。`commitPage()` 要求传入有效的类型化图形；不可信的外部文档数据应通过 JSON 导入进行校验。

`SessionChange` 包含受影响的 `pageId`、`activePageId`、`document`、`canUndo`、`canRedo` 和操作 `type`。被删除的 `pageId` 可能已不存在；历史标志始终对应**当前活动页**，不一定对应受影响页。撤销/重做到边界、重复清空空页等无变化操作不发出内容变更。

### 保存与恢复

```ts
import { createWhiteboardSession } from 'lesson-whiteboard-vue'

const session = createWhiteboardSession()
const json = session.exportJSON()
// 通过应用自己的文件、服务端或浏览器存储流程保存 json。
session.importJSON(json)
session.dispose()
```

```ts
import type { Shape } from 'lesson-whiteboard-vue'

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

JSON 保存页面、逻辑尺寸、背景和图形，不保存撤销栈、选框、工具、界面状态、未完成手势、凭据或 Office 原文件。`Shape` 是 `line`、`straight`、`arrow`、`rect`、`ellipse`、`triangle`、`star` 的判别联合类型，详见 [类型定义](./src/types.ts)。

导入会先校验完整文档，再替换状态。JSON 格式错误或违反约束的字段/值会抛错，不会部分覆盖现有内容与历史。导入成功后建立新的历史基线，不能撤销回导入前的文档；额外未知字段会被丢弃。

### 所有权

`Whiteboard` 和 `DocumentWhiteboard` 未接收外部会话时，会自行创建并在卸载时销毁会话。接入应用负责管理传入的外部会话；调用 `dispose()` 前应先卸载全部使用者，适合在父组件的 `onUnmounted()` 中释放。销毁后仍可读取文档，写入会抛错。

不同会话隔离多个白板；共享会话是显式选择。会话变更提供已提交快照，不逐次通知指针移动。接入应用自行选择保存位置和自动保存频率；会话方法本身不发起网络请求。

## 功能限制

- 面向浏览器中的 Vue 3 / ESM；不提供 Vue 2、React 适配、SSR 绘图、多人协作、图片/PDF 导出或内置自动保存。
- 内置界面文字当前为中文。英文 README 不会改变界面语言；可通过工具栏和布局插槽实现自己的界面。
- 本地 PPTX 是静态预览，不播放动画和转场；字体、公式、复杂图形、媒体可能与 PowerPoint 不同。
- DOCX 排版、分页可能与 Word 不同，尤其是缺失字体、浮动对象和域。
- WPS Writer 的覆盖批注当前关闭；WPS 预览与放映依赖接入方配置的服务和 SDK。
- 预览示例使用人工文件；模拟 SDK 测试不能证明真实 WPS 行为，也不能替代实际课件的保真验收。

## 本地开发

使用 Node.js **22+** 和 npm：

```sh
git clone https://github.com/lljfei/lesson-whiteboard-vue.git
cd lesson-whiteboard-vue
npm ci
npm run dev
```

开发服务启动后会自动打开示例首页。点击导航中的“文档预览”或“授课界面”即可进入对应示例，两个页面均提供返回入口，无需手动输入页面地址。

| 地址 / 命令 | 用途 |
| --- | --- |
| `/` | 完整白板、自定义画布、独立实例和 JSON 示例 |
| `/office.html` | 本地文件/URL 预览及 WPS 配置表单 |
| `/teaching.html` | 课件标签、双侧控制、工具栏和黑板切换 |
| `npm run typecheck` | 检查源码、示例和测试类型 |
| `npm test` | Vitest 检查及 Node WPS 适配器契约测试 |
| `npm run build` | 构建 ESM、TypeScript 声明和 CSS |
| `npm run build:example` | 构建三个示例入口 |
| `npm pack` | 执行检查和构建，生成可安装压缩包 |

贡献说明见 [CONTRIBUTING.md](./CONTRIBUTING.md)。请勿提交真实课件、凭据或环境文件。

## 许可证

本项目源码采用 [MIT](./LICENSE)。依赖维持各自许可证，详见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。WPS SDK 和在线服务独立提供，不包含在本包的许可证授权中。
