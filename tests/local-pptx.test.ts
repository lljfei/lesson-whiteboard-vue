// @vitest-environment jsdom
import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {parseZip,buildPresentation,RECOMMENDED_ZIP_LIMITS} from '@aiden0z/pptx-renderer'
import {resolveOfficeFormat,readOfficeSource} from '../src/local-document'
it('loads the real two-page PPTX fixture and its 4:3 size',async()=>{const b=readFileSync('public/fixtures/demo.pptx');const p=buildPresentation(await parseZip(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),RECOMMENDED_ZIP_LIMITS));expect(p.slides).toHaveLength(2);expect(p.width/p.height).toBeCloseTo(4/3)})
it('infers only supported file extensions',()=>{expect(resolveOfficeFormat('https://example.com/demo.PPTX?token=test')).toBe('pptx');expect(resolveOfficeFormat(new File([],'test.docx'))).toBe('docx');expect(()=>resolveOfficeFormat('file.doc')).toThrow();expect(resolveOfficeFormat(new ArrayBuffer(1),'pptx')).toBe('pptx')})
it('copies the input bytes rather than transferring caller ownership',async()=>{const source=new Uint8Array([1,2,3]).buffer;const copy=await readOfficeSource(source,new AbortController().signal);expect(copy).not.toBe(source);expect(new Uint8Array(copy)).toEqual(new Uint8Array(source))})

