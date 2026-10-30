import type { ContentSize } from './types'
import type { OfficeFormat, OfficeSource } from './office-types'

export function resolveOfficeFormat(source: OfficeSource, format?: OfficeFormat): OfficeFormat {
  if (format) return format
  const name = typeof source === 'string' ? source.split(/[?#]/)[0] : source instanceof File ? source.name : ''
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension === 'pptx' || extension === 'docx') return extension
  throw new Error('请指定 format 为 pptx 或 docx；不支持旧版 .ppt/.doc 文件')
}
export async function readOfficeSource(source: OfficeSource, signal: AbortSignal, request?: RequestInit): Promise<ArrayBuffer> {
  if (typeof source === 'string') {
    const response = await fetch(source, { ...request, signal })
    if (!response.ok) throw new Error(`文件下载失败（${response.status}）`)
    return response.arrayBuffer()
  }
  if (source instanceof ArrayBuffer) return source.slice(0)
  return source.arrayBuffer()
}

export interface LocalDocument {
  totalPages: number
  showPage(page: number): ContentSize
  dispose(): void
}
/** 使用独立文档隔离导入文件样式，并禁止其中脚本、表单和弹窗执行。 */
export async function renderLocalDocument(host: HTMLElement, bytes: ArrayBuffer, format: OfficeFormat, signal: AbortSignal): Promise<LocalDocument> {
  const frame = document.createElement('iframe')
  frame.title = format === 'pptx' ? 'PPTX 文档预览' : 'Word 文档预览'
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.setAttribute('scrolling', 'no')
  frame.style.cssText = 'border:0;width:100%;height:100%;display:block;background:white'
  host.append(frame)
  const disposeFrame = () => frame.remove()
  signal.addEventListener('abort', disposeFrame, { once: true })
  const doc = frame.contentDocument!
  doc.open()
  doc.write('<!doctype html><html><head><style>html,body{margin:0;padding:0;overflow:hidden}*{box-sizing:border-box}section.docx{margin:0!important;box-shadow:none!important}</style></head><body></body></html>')
  doc.close()
  let destroy = () => {}
  let count: number
  let show: (page: number) => HTMLElement
  try {
    if (format === 'docx') {
      const { renderAsync } = await import('docx-preview')
      signal.throwIfAborted()
      await renderAsync(bytes, doc.body, doc.head, { inWrapper: false, breakPages: true, ignoreLastRenderedPageBreak: false, useBase64URL: true, renderAltChunks: false })
      signal.throwIfAborted()
      const pages = Array.from(doc.body.querySelectorAll<HTMLElement>('section.docx'))
      count = pages.length
      show = page => {
        pages.forEach((element, index) => { element.style.display = index === page - 1 ? '' : 'none' })
        return pages[page - 1]!
      }
    } else {
      const { parseZip, buildPresentation, renderSlide, RECOMMENDED_ZIP_LIMITS } = await import('@aiden0z/pptx-renderer')
      signal.throwIfAborted()
      const presentation = buildPresentation(await parseZip(bytes, RECOMMENDED_ZIP_LIMITS))
      signal.throwIfAborted()
      let handle: ReturnType<typeof renderSlide> | undefined
      destroy = () => handle?.dispose()
      count = presentation.slides.length
      show = page => {
        handle?.dispose()
        handle = renderSlide(presentation, presentation.slides[page - 1]!, { externalMedia: 'block', pdfjs: false })
        doc.body.replaceChildren(handle.element)
        return handle.element
      }
    }
    if (!count) throw new Error('文档中没有可预览的页面')
    return {
      totalPages: count,
      showPage(page) {
        const element = show(page)
        const bounds = element.getBoundingClientRect()
        const width = bounds.width || element.offsetWidth
        const height = Math.max(bounds.height, element.scrollHeight)
        if (!(width > 0 && height > 0)) throw new Error('无法读取文档页面尺寸')
        return { width, height }
      },
      dispose() { signal.removeEventListener('abort', disposeFrame); destroy(); frame.remove() }
    }
  } catch (error) {
    signal.removeEventListener('abort', disposeFrame)
    destroy()
    frame.remove()
    throw error
  }
}
