<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { DocumentWhiteboard } from '../src'
import type { OfficeSource, OfficeFormat, WpsOptions } from '../src'
const mode = ref<'local' | 'wps'>('local')
const source = shallowRef<OfficeSource>('/fixtures/demo.pptx')
const format = ref<OfficeFormat>('pptx')
const documentId = ref('demo-pptx')
const url = ref('')
const appId = ref('')
const fileId = ref('')
const token = ref('')
const sdkUrl = ref('')
const wps = shallowRef<WpsOptions>()
const error = ref('')
const sample = (type: OfficeFormat) => { mode.value = 'local'; format.value = type; source.value = `/fixtures/demo.${type}`; documentId.value = `demo-${type}` }
const select = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) { mode.value = 'local'; source.value = file; documentId.value = `${file.name}:${file.lastModified}:${file.size}`; format.value = file.name.toLowerCase().endsWith('.pptx') ? 'pptx' : 'docx' }
}
const loadUrl = () => { mode.value = 'local'; source.value = url.value; documentId.value = url.value }
const openWps = () => {
  mode.value = 'wps'
  documentId.value = `wps:${fileId.value}`
  wps.value = { appId: appId.value, fileId: fileId.value, token: token.value, loadSDK: async () => {
    const script = document.createElement('script')
    script.src = sdkUrl.value
    await new Promise<void>((resolve, reject) => { script.onload = () => resolve(); script.onerror = () => reject(new Error('SDK 加载失败')); document.head.append(script) })
    return (window as unknown as { WebOfficeSDK: unknown }).WebOfficeSDK
  } }
}
</script>
<template>
  <main class="office-demo">
    <header><a href="/">← 返回白板示例</a><h1>PPTX / Word 文档画板</h1><p>本地文件在浏览器中解析；在线模式通过你自己的 WPS 服务打开。</p></header>
    <section class="inputs">
      <button @click="sample('pptx')">加载示例 PPTX</button><button @click="sample('docx')">加载示例 Word</button>
      <label>选择本地文件 <input type="file" accept=".pptx,.docx" @change="select" /></label>
      <input v-model="url" placeholder="文件 URL（需允许跨域）" aria-label="文件 URL" /><select v-model="format" aria-label="文件格式"><option value="pptx">PPTX</option><option value="docx">DOCX</option></select><button @click="loadUrl">打开 URL</button>
      <details><summary>WPS 在线模式配置</summary><p>需已开通 WebOffice 并配置后端文件回调。本示例不保存凭据。</p><input v-model="sdkUrl" placeholder="你的官方 SDK URL" aria-label="WPS SDK URL" /><input v-model="appId" placeholder="appId" aria-label="WPS appId" /><input v-model="fileId" placeholder="fileId" aria-label="WPS fileId" /><input v-model="token" type="password" placeholder="token（按服务配置）" aria-label="WPS token" /><button @click="openWps">打开 WPS 文档</button></details>
    </section>
    <div class="viewer"><DocumentWhiteboard :mode="mode" :source="source" :format="format" :document-id="documentId" :wps="wps" @ready="error = ''" @error="error = $event.message" /></div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p>本地 PPTX 为静态预览，不播放动画；DOCX 分页由浏览器渲染结果决定，可能与 Word 不同。WPS Word 当前提供浏览，批注请使用本地模式。</p>
  </main>
</template>
<style scoped>
.office-demo{max-width:1440px;margin:24px auto;padding:0 24px;font-family:system-ui;color:#233c32}.inputs{display:flex;gap:10px;flex-wrap:wrap;padding:16px;background:#f0f5f1;border-radius:8px;margin:20px 0}.inputs input,.inputs button,.inputs select{padding:8px;border:1px solid #bccfc1;border-radius:4px}details{width:100%}.viewer{height:650px}a{color:#286b4e}p{line-height:1.6}
</style>
