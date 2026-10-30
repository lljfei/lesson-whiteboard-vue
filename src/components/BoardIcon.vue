<script setup lang="ts">
defineProps<{ name: string }>()

const paths: Record<string, string> = {
  browse: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  select: 'm5 3 14 9-7 1-3 7-4-17Z',
  pen: 'm4 16-1 5 5-1L20 8l-4-4L4 16Z M13 7l4 4',
  shape: 'M4 4h16v16H4Z',
  rect: 'M4 5h16v14H4Z',
  ellipse: 'M21 12a9 7 0 1 1-18 0 9 7 0 0 1 18 0',
  triangle: 'M12 3 22 21H2Z',
  star: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1Z',
  arrow: 'M3 20 21 3 M11 3h10v10',
  straight: 'M4 20 20 4',
  eraser: 'm4 14 9-10 8 7-9 10H7l-3-3v-4Z M8 10l8 7 M12 21h9',
  undo: 'M9 5 4 10l5 5 M4 10h9a7 7 0 0 1 7 7v2',
  redo: 'm15 5 5 5-5 5 M20 10h-9a7 7 0 0 0-7 7v2',
  clear: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6',
  plus: 'M12 4v16 M4 12h16',
  left: 'm15 4-8 8 8 8',
  right: 'm9 4 8 8-8 8',
  close: 'm5 5 14 14 M19 5 5 19',
  expand: 'M9 3H3v6 M15 3h6v6 M3 15v6h6 M21 15v6h-6',
  collapse: 'M3 9h6V3 M15 3v6h6 M9 21v-6H3 M15 21v-6h6',
  board: 'M3 4h18v14H3Z M8 22l4-4 4 4',
  previous: 'M6 4v16 M18 5 8 12l10 7Z',
  next: 'M18 4v16 M6 5l10 7-10 7Z',
  power: 'M12 2v10 M6 5a9 9 0 1 0 12 0',
}
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path :d="paths[name] || paths.shape" />
  </svg>
</template>

<style scoped>
svg { display: block; width: 22px; height: 22px; flex: none; }
</style>
