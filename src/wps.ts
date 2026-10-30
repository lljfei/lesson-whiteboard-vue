import { createOfficePlayer } from './office-player.js'
import type { OfficeState } from './office-types'
export interface WpsPlayerOptions {
  resource: { code: '1' | '3' | '4'; fileId: string | number }
  mount: HTMLElement
  loadSDK: () => Promise<unknown>
  appId: string
  token?: string
  initialPage?: number
  onState?: (state: OfficeState) => void
  onPage?: (page: number) => void
  beforePageChange?: () => Promise<void>
}
export interface WpsPlayer {
  start(): Promise<void>
  next(): Promise<boolean>
  previous(): Promise<boolean>
  goTo(page: number): Promise<boolean>
  resize(): void
  dispose(): void
}
export const createWpsOfficePlayer: (options: WpsPlayerOptions) => WpsPlayer = createOfficePlayer
