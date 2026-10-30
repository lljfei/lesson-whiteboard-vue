import type { DeepReadonly } from 'vue'

export type DrawingTool =
  | 'browse'
  | 'select'
  | 'pen'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'star'
  | 'arrow'
  | 'straight'
  | 'eraser'

export type BoardBackground = 'green' | 'white'

export interface ContentSize {
  width: number
  height: number
}

export interface ShapeStyle {
  id: string
  stroke: string
  strokeWidth: number
  x?: number
  y?: number
  scaleX?: number
  scaleY?: number
  rotation?: number
  fill?: string
  fillEnabled?: boolean
  strokeScaleEnabled?: false
  lineCap?: 'butt' | 'round' | 'square'
  lineJoin?: 'miter' | 'round' | 'bevel'
  composite?: 'source-over'
}

export type Shape = ShapeStyle & (
  | { kind: 'line' | 'straight'; points: number[] }
  | { kind: 'arrow'; points: number[]; pointerLength?: number; pointerWidth?: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'ellipse'; x: number; y: number; radiusX: number; radiusY: number }
  | { kind: 'triangle'; x: number; y: number; radius: number; sides?: 3 }
  | { kind: 'star'; x: number; y: number; innerRadius: number; outerRadius: number; numPoints: 5 }
)

export interface WhiteboardPage {
  id: string
  contentSize: ContentSize
  shapes: Shape[]
}

export interface WhiteboardDocument {
  version: 1
  activePageId: string
  background: BoardBackground
  pages: WhiteboardPage[]
}

export type SessionChangeType =
  | 'draw'
  | 'undo'
  | 'redo'
  | 'clear'
  | 'reset'
  | 'page-add'
  | 'page-remove'
  | 'page-change'
  | 'page-size'
  | 'background'
  | 'import'

export interface HistoryChange {
  pageId: string
  canUndo: boolean
  canRedo: boolean
}

export interface SessionChange {
  type: SessionChangeType
  /** 本次操作影响的页面；删除事件中该页可能已不存在。 */
  pageId: string
  activePageId: string
  document: WhiteboardDocument
  /** 两个历史标志始终属于 activePageId。 */
  canUndo: boolean
  canRedo: boolean
}

export interface SessionPage extends WhiteboardPage {
  /** 用于使绘图层尚未提交的手势失效，不写入导出文档。 */
  revision: number
}

export interface WhiteboardSessionState extends Omit<WhiteboardDocument, 'pages'> {
  pages: SessionPage[]
  revision: number
  disposed: boolean
}

export interface WhiteboardSession {
  readonly state: DeepReadonly<WhiteboardSessionState>
  getPage(id?: string): DeepReadonly<SessionPage> | undefined
  getDocument(): WhiteboardDocument
  ensurePage(id: string, contentSize?: ContentSize): string
  setContentSize(id: string, size: ContentSize): void
  setActivePage(id: string): void
  addPage(contentSize?: ContentSize): string
  removePage(id: string): boolean
  commitPage(id: string, shapes: DeepReadonly<Shape[]>): void
  canUndo(id?: string): boolean
  canRedo(id?: string): boolean
  undo(id?: string): void
  redo(id?: string): void
  clearPage(id?: string): void
  /** 清除页面内容与全部历史，并使尚未提交的手势失效。 */
  resetPage(id?: string): void
  setBackground(background: BoardBackground): void
  exportJSON(): string
  importJSON(json: string): void
  subscribe(listener: (event: SessionChange) => void): () => void
  /** 宿主须先卸载使用该会话的组件；销毁后允许读取，写入会抛错。 */
  dispose(): void
}

export interface WhiteboardSessionOptions {
  document?: WhiteboardDocument
  historyLimit?: number
}

export interface ToolOptions {
  tools?: DrawingTool[]
  colors?: string[]
  strokeWidths?: number[]
}

export interface WhiteboardMethods {
  undo(): void
  redo(): void
  clear(): void
  exportJSON(): string
  importJSON(json: string): void
}
