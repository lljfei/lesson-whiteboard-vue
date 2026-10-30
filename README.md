# lesson-whiteboard-vue

**English** | [简体中文](./README.zh-CN.md)

[![npm](https://img.shields.io/npm/v/lesson-whiteboard-vue.svg)](https://www.npmjs.com/package/lesson-whiteboard-vue)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Vue 3](https://img.shields.io/badge/Vue-%3E%3D3.5%20%3C4-42b883.svg)](https://vuejs.org/)

A Vue 3 teaching whiteboard with drawing tools, per-page undo/redo, multi-page JSON persistence, and optional PPTX / DOCX previews. Use the complete whiteboard or compose a document annotation workspace from smaller components.

![Teaching workspace preview](https://raw.githubusercontent.com/lljfei/lesson-whiteboard-vue/main/docs/images/teaching-preview.png)

[Source](https://github.com/lljfei/lesson-whiteboard-vue) · [npm](https://www.npmjs.com/package/lesson-whiteboard-vue) · [Releases](https://github.com/lljfei/lesson-whiteboard-vue/releases)

## Contents

- [Features and support](#features-and-support)
- [Quick start](#quick-start)
- [Custom canvas and toolbar](#custom-canvas-and-toolbar)
- [Office documents](#office-documents)
- [Teaching layout](#teaching-layout)
- [API reference](#api-reference)
- [Sessions and JSON](#sessions-and-json)
- [Limitations](#limitations)
- [Development](#development)
- [License](#license)

## Features and support

- Freehand pen, rectangle, ellipse, triangle, star, arrow, and straight line.
- Selection, dragging, scaling, rotation, and whole-shape erasing.
- Mouse and touch input, with logical coordinates independent of container size.
- Multi-page boards, thumbnails, green/white backgrounds, and per-page undo/redo.
- Isolated sessions, replaceable toolbars, and JSON import/export.
- Container-based teaching layout with resource tabs, side controls, and action slots.

| Mode | Input | Preview | Overlay annotations |
| --- | --- | --- | --- |
| Whiteboard | Empty session or board JSON | Editable board | Yes |
| Local PPTX | `File`, `Blob`, `ArrayBuffer`, or URL | Static slides | Yes, per rendered page |
| Local DOCX | `File`, `Blob`, `ArrayBuffer`, or URL | Browser-rendered document pages | Yes, per rendered page |
| WPS Presentation | WPS app/file configuration | SDK presentation playback | Yes |
| WPS Writer | WPS app/file configuration | SDK document browsing/navigation | Currently disabled |

Office preview engines load on demand. WPS mode requires your own WebOffice service integration; it does not open an arbitrary file URL directly.

## Quick start

Install in an existing Vue **>=3.5, <4** application:

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

Import the stylesheet once and give the parent a real height. The default board is green; this example chooses a white pen. Vue is a peer dependency. No global Konva registration, Ant Design, Less, or auto-import plugin is required.

Konva, vue-konva, and the Office renderers are runtime dependencies installed automatically by npm. Vitest, Vue Test Utils, and Happy DOM are only needed when developing this repository; applications using the published package do not need to install them.

`expanded` fills the component's container; your application controls browser fullscreen.

## Custom canvas and toolbar

Use `AnnotationCanvas` when your application owns the layout. The canvas is absolutely positioned, so its parent needs `position: relative` and explicit dimensions.

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

The canvas does not render a background, pagination, or a toolbar. `browse` passes pointer events through to underlying content. The eraser removes entire hit shapes or strokes; it is not a pixel eraser.

## Office documents

### Local PPTX / DOCX

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

- `source` accepts `File`, `Blob`, `ArrayBuffer`, or a URL string. For a file picker, pass the selected `File` directly.
- Format can be inferred from a `File` name or URL extension. Supply `format` for a `Blob`, `ArrayBuffer`, or extensionless URL.
- Only `.pptx` and `.docx` are supported locally; legacy `.ppt` and `.doc` are not.
- URL downloads need an accessible response and CORS when cross-origin. Optional `request: RequestInit` supplies fetch options such as headers.
- The package parses local input in the browser without uploading it. URL input is downloaded by the browser. PPTX external media relationships are blocked.
- Give each document and content revision a stable, distinct `documentId`; annotations use keys such as `slides-42-v1:1`.

PPTX uses [@aiden0z/pptx-renderer](https://github.com/aiden0z/pptx-renderer), and DOCX uses [docx-preview](https://github.com/VolodymyrBaydalka/docxjs). Rendered content is isolated in an iframe that disallows document scripts.

### WPS WebOffice

Provide the SDK loader and configuration from your application:

```vue
<script setup lang="ts">
import { DocumentWhiteboard, type WpsOptions } from 'lesson-whiteboard-vue'
import 'lesson-whiteboard-vue/style.css'

const wps: WpsOptions = {
  appId: 'YOUR_APP_ID',
  fileId: 'YOUR_FILE_ID',
  // Supply an in-memory session token here if your integration requires one.
  loadSDK: async () => {
    // Your application must load the official SDK before returning it.
    const sdk = (window as unknown as { WebOfficeSDK?: unknown }).WebOfficeSDK
    if (!sdk) throw new Error('Load the WPS WebOffice SDK first')
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

You must configure a WebOffice application and its backend file/permission callbacks. `fileId` is the identifier used by that integration, not a download URL. See the [official integration prerequisites](https://open.wps.cn/documents/app-integration-dev/docs-center/online-preview-edit/client/summary).

Use `format="pptx"` for Presentation and `format="docx"` for Writer. Presentation previous/next actions advance animation steps before moving between slides. WPS Writer currently offers browsing/navigation without an annotation overlay, because internal document scrolling is not synchronized with the external canvas.

Your application manages SDK loading, token renewal, authorization, and service entitlement. The package does not read application cookies or environment variables and does not store credentials. Replace the `wps` object to reinitialize a changed configuration. Keep app secrets on your server.

## Teaching layout

`TeachingLayout` provides a dark stage, optional side controls, and a footer with tabs/tools/actions. Use its slots and events to connect your application's resource selection, navigation, authentication, or teaching workflow.

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
      <template #tabs><span>Board 1</span></template>
      <template #actions><button @click="enterFullscreen">Fullscreen</button></template>
    </TeachingLayout>
  </div>
</template>
```

For a unified document workspace, set `DocumentWhiteboard`'s `showToolbar` and `showControls` to `false`, place it in `stage`, and provide a shared toolbar through `tools`. Use `variant="teaching"` on `WhiteboardToolbar` for the 64px teaching footer. See [the complete teaching example](./examples/TeachingDemo.vue) for document refs, page state, and history wiring.

## API reference

All entries below, plus their associated TypeScript types, are named exports from `lesson-whiteboard-vue`. Models use Vue `v-model`; other props are one-way inputs.

### `Whiteboard`

| Prop / model | Default | Behavior |
| --- | --- | --- |
| `session?: WhiteboardSession` | Own session | Pass a session to share or retain data externally |
| `v-model:tool` | `pen` | Active drawing tool |
| `v-model:color` | `#111827` | Stroke color |
| `v-model:strokeWidth` | `4` | Stroke width in logical coordinates |
| `v-model:open` | `true` | Closing hides the board and retains its session |
| `v-model:expanded` | `false` | Expand inside the container |
| `showToolbar` | `true` | Show the default toolbar |
| `tools`, `colors`, `strokeWidths` | Built-in lists | Customize toolbar choices |

- Events: `change(SessionChange)`, `history-change(HistoryChange)`, and model updates. History state is also reported on initialization and session replacement.
- Ref methods: `undo()`, `redo()`, `clear()`, `exportJSON()`, `importJSON(json)`. `clear()` affects the active page and is undoable.
- Slots: `toolbar` replaces the toolbar; `toolbar-actions` and `page-actions` extend the default UI.
- `toolbar` slot props: `session`, `tool`, `color`, `strokeWidth`, `setTool`, `setColor`, `setStrokeWidth`, `canUndo`, `canRedo`, `undo`, `redo`, `clear`.

### `AnnotationCanvas` / `WhiteboardToolbar` / `PageThumbnail`

| Component | Contract |
| --- | --- |
| `AnnotationCanvas` | Required `session`; optional `pageId` (active page), `tool` (`select`), `color` (`#111827`), `strokeWidth` (`4`), `active` (`true`). Deactivation cancels an unfinished gesture. |
| `WhiteboardToolbar` | Required `tool`, `color`, `strokeWidth`; model update events, `undo` / `redo` / `clear`; optional `canUndo`, `canRedo`, `tools`, `colors`, `strokeWidths`, `variant: 'default' \| 'teaching'`. The default slot adds actions. It does not own drawing data. |
| `PageThumbnail` | Required readonly `page: WhiteboardPage` and `background: 'green' \| 'white'`; renders an SVG preview. |

```ts
type DrawingTool =
  | 'browse' | 'select' | 'pen' | 'eraser'
  | 'rect' | 'ellipse' | 'triangle' | 'star' | 'arrow' | 'straight'
```

### `DocumentWhiteboard`

| Prop / model | Default / requirement |
| --- | --- |
| `documentId: string` | Required, stable document/version identifier |
| `mode: 'local' \| 'wps'` | `local` |
| `source?: OfficeSource` | Required for local mode |
| `format?: 'pptx' \| 'docx'` | Infer locally where possible; required for WPS |
| `wps?: WpsOptions` | Required for WPS mode |
| `session?: WhiteboardSession` | Own session if omitted |
| `request?: RequestInit` | Fetch options for URL input |
| `showToolbar`, `showControls` | Both `true` |
| `v-model:tool/color/strokeWidth` | `browse` / `#ef4444` / `4` |

- Events: `ready(OfficeState)`, `error(Error)`, `page-change(number)`, `change(SessionChange)`.
- Ref methods: `previous()`, `next()`, `goTo(page)`, `retry()`, `exportJSON()`, `importJSON(json)`. Page numbers start at **1**.
- Annotation JSON does not include the Office file. Restore it alongside the same document and `documentId`.
- Document page keys are independent of the session's `activePageId`. For custom controls, query history and edit the explicit page key.
- Page navigation retains committed annotations while the session is alive. Applications can clear an explicit page with `session.clearPage(pageKey)` (undoable) or `session.resetPage(pageKey)` (also clears history); the component does not automatically clear annotations on page changes.

### `TeachingLayout`

- Props: `page=1`, `totalPages=0`, `navigable=true`, `showNavigation=false`, `showResourceEntries=false`, `resourceLabel='资源'`.
- Events: `previous`, `next`, `close`, `resources`.
- Slots: `stage`, `tabs`, `tools`, `actions`, `navigation`, `resource-entry`, `overlays`, and a default slot for custom content. The two side slots receive `side: 'left' | 'right'`.
- Ref: `element`, the root DOM element, for application-controlled fullscreen.

### `createWpsOfficePlayer(options)`

Low-level WPS adapter for custom document interfaces. Accepts `WpsPlayerOptions`: `resource` (`fileId`, `code`), `mount`, `loadSDK`, `appId`, optional `token`, `initialPage`, `onState`, `onPage`, and `beforePageChange`. Codes are `1` (Writer), `3` (PDF), and `4` (Presentation).

Returns `start()`, `previous()`, `next()`, `goTo(page)`, `resize()`, and `dispose()`. Your application manages the mount, credentials, SDK, and adapter lifetime.

## Sessions and JSON

`createWhiteboardSession({ document?, historyLimit? })` creates an isolated in-memory session. Defaults: one green 1920×1080 page and **51 history snapshots per page**, including the current snapshot.

| Methods | Purpose |
| --- | --- |
| `getDocument()`, `getPage(id?)` | Read a cloned document or a readonly page; unknown page returns `undefined` |
| `addPage(size?)`, `ensurePage(id, size?)` | Create and activate a new page, or ensure a page exists without activating it; `addPage` inherits the active page size if omitted |
| `removePage(id)`, `setActivePage(id)`, `setContentSize(id, size)` | Manage pages; the last page cannot be removed |
| `commitPage(id, shapes)` | Commit a typed shape snapshot for programmatic edits |
| `canUndo(id?)`, `canRedo(id?)`, `undo(id?)`, `redo(id?)` | Query or navigate per-page history; default to the active page |
| `clearPage(id?)`, `resetPage(id?)` | Undoable clear, or clear content **and history** irreversibly |
| `setBackground('green' \| 'white')` | Set the document-wide background |
| `exportJSON()`, `importJSON(json)` | Save/restore all pages |
| `subscribe(listener)`, `dispose()` | Subscribe with an unsubscribe function; release the session |

Each completed drawing, transform, or erasing gesture creates one history step. Editing after undo discards the redo branch. Page management and background changes are not drawing undo steps. Unfinished gestures are canceled on page/tool changes, import, touch cancellation, and container resizing.

Session `state` and `getPage()` are readonly; mutate data through methods. `getDocument()` returns a detached copy. `commitPage()` expects valid typed shapes; use JSON import to validate untrusted external document data.

A `SessionChange` contains the affected `pageId`, `activePageId`, `document`, `canUndo`, `canRedo`, and operation `type`. A removed `pageId` may no longer exist; history flags refer to **the active page**, not necessarily the affected page. No-op undo/redo or clearing an already-empty page does not emit a content change.

### Save and restore

```ts
import { createWhiteboardSession } from 'lesson-whiteboard-vue'

const session = createWhiteboardSession()
const json = session.exportJSON()
// Store json using your application's own file, server, or browser storage flow.
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

JSON stores pages, logical sizes, background, and shapes. It excludes undo stacks, selection, tools, UI state, unfinished gestures, credentials, and original Office files. `Shape` is a discriminated union of `line`, `straight`, `arrow`, `rect`, `ellipse`, `triangle`, and `star`; see [the type definitions](./src/types.ts).

Import validates the complete document before replacing state. Invalid JSON or field values that violate the schema throw an error without partially replacing content or history. Successful import establishes a new history baseline; it cannot be undone back to the previous document. Unknown extra fields are discarded.

### Ownership

`Whiteboard` and `DocumentWhiteboard` create and dispose their own session when none is supplied. Your application manages the lifetime of an externally supplied session. Unmount all its consumers before calling `dispose()`; a parent's `onUnmounted()` is suitable. Reads remain available after disposal; writes throw.

Separate sessions isolate multiple boards. Sharing one is an explicit choice. Session changes provide committed snapshots, not pointer-move updates. Your application chooses the storage location and autosave schedule; session methods themselves do not make network requests.

## Limitations

- Browser-only Vue 3 / ESM. No Vue 2 or React adapter, SSR drawing, collaborative editing, image/PDF export, or built-in autosave.
- Built-in UI labels are currently Chinese. An English README does not change UI localization; customize toolbar/layout slots for your own interface.
- Local PPTX preview is static: no animation or transitions. Fonts, formulas, complex graphics, and media may differ from PowerPoint.
- DOCX pagination and layout may differ from Word, especially with missing fonts, floating objects, and fields.
- WPS Writer overlay annotations are disabled. WPS preview/playback requires an independently configured service and SDK.
- Preview examples use artificial files. Mocked SDK tests do not prove live WPS behavior or document fidelity on your files.

## Development

Use Node.js **22+** and npm:

```sh
git clone https://github.com/lljfei/lesson-whiteboard-vue.git
cd lesson-whiteboard-vue
npm ci
npm run dev
```

The development server opens the example homepage automatically. Click **Document preview** (文档预览) or **Teaching workspace** (授课界面) in its navigation to open the other examples. Both pages provide a return link; no manual URL entry is needed.

| URL / command | Purpose |
| --- | --- |
| `/` | Complete board, custom canvas, independent instances, JSON examples |
| `/office.html` | Local file/URL preview and a WPS configuration form |
| `/teaching.html` | Teaching workspace with tabs, side controls, tools, and board switching |
| `npm run typecheck` | Check source, examples, and tests |
| `npm test` | Vitest checks and Node WPS adapter contract tests |
| `npm run build` | Build ESM, TypeScript declarations, and CSS |
| `npm run build:example` | Build the three example entry points |
| `npm pack` | Run checks/build and generate the installable tarball |

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contributions. Do not commit real courseware, credentials, or environment files.

## License

[MIT](./LICENSE) for this project's source. Dependencies keep their own licenses; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). The WPS SDK and online service are separate and are not included in the license grant for this package.
