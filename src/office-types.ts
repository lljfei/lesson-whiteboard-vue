import type { ContentSize } from './types'

export type OfficeFormat = 'pptx' | 'docx'
export type OfficeSource = File | Blob | ArrayBuffer | string
export interface OfficeState {
  status: 'loading' | 'starting' | 'ready' | 'error'
  page: number
  totalPages: number
  error: string
  slideSize?: ContentSize
}
/** SDK 由接入方加载，不隐式读取 cookie、环境变量或凭据。 */
export interface WpsOptions {
  appId: string
  fileId: string | number
  token?: string
  loadSDK: () => Promise<unknown>
}
export interface DocumentWhiteboardMethods {
  previous(): Promise<unknown>
  next(): Promise<unknown>
  goTo(page: number): Promise<unknown>
  retry(): void
  exportJSON(): string
  importJSON(json: string): void
}
