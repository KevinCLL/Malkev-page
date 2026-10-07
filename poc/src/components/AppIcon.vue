<script setup>
// Iconos propios en SVG de trazo, sin librerías externas.
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 18 },
})

const PATHS = {
  ship: 'M12 2c3 3 4.5 7 4.5 11v3l2.5 2.5V21l-4-1.5h-6L5 21v-2.5L7.5 16v-3C7.5 9 9 5 12 2Z M12 9.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z M10 19.5l2 2.5 2-2.5',
  log: 'M6 3h10l3 3v15H6z M16 3v3h3 M9 10h7 M9 13.5h7 M9 17h4',
  dice: 'M4 4h16v16H4z M8.5 8.5h.01 M15.5 8.5h.01 M12 12h.01 M8.5 15.5h.01 M15.5 15.5h.01',
  film: 'M3 5h18v14H3z M7 5v14 M17 5v14 M3 9h4 M3 15h4 M17 9h4 M17 15h4',
  book: 'M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5z',
  console: 'M3 4h18v12H3z M8 20h8 M12 16v4 M7 8l3 2-3 2 M12 12h4',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z M20 20l-4.8-4.8',
  plus: 'M12 5v14 M5 12h14',
  close: 'M6 6l12 12 M18 6L6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  'eye-off': 'M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4 M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  comment: 'M4 5h16v11H9l-5 4z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 7v5l3 2',
  tag: 'M3 12V3h9l9 9-9 9z M7.5 7.5h.01',
  'arrow-left': 'M19 12H5 M11 6l-6 6 6 6',
  'arrow-right': 'M5 12h14 M13 6l6 6-6 6',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  save: 'M5 3h11l3 3v15H5z M8 3v5h7V3 M8 14h8v7H8z',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 16v4h16v-4',
  image: 'M3 5h18v14H3z M8.5 9.5a1.5 1.5 0 1 0 0 .01 M21 16l-5-5-9 8',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  quote: 'M7 7h4v4c0 3-1.5 5-4 6 M14 7h4v4c0 3-1.5 5-4 6',
  'list-ul': 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  'list-ol': 'M10 6h10 M10 12h10 M10 18h10 M4 5l1.5-1V9 M3.5 13.5c0-1 2.5-1.3 2.5 0 0 1-2.5 2-2.5 3h2.5 M3.5 17h2.5l-1.3 1.3c1 0 1.6.5 1.3 1.3-.4.9-2 .8-2.5.1',
  code: 'M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16',
  hr: 'M3 12h18 M6 7h.01 M6 17h.01 M18 7h.01 M18 17h.01',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
  bold: 'M7 4h6a4 4 0 0 1 0 8H7z M7 12h7a4 4 0 0 1 0 8H7z',
  italic: 'M10 4h8 M6 20h8 M15 4L9 20',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4 M5 20h14',
  strike: 'M5 12h14 M16 6.5C15 5 13.6 4.5 12 4.5c-2.5 0-4 1.3-4 3.2 0 1.3.8 2.3 2.4 2.9 M8 17c1 1.7 2.6 2.5 4.3 2.5 2.6 0 4.2-1.3 4.2-3.3 0-.7-.2-1.4-.6-1.9',
  heading: 'M6 4v16 M18 4v16 M6 12h12',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  rows: 'M4 6h16 M4 12h16 M4 18h16',
  sound: 'M4 9h4l5-4v14l-5-4H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4z M17 9l5 6 M22 9l-5 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  rss: 'M5 4a15 15 0 0 1 15 15 M5 10a9 9 0 0 1 9 9 M5.5 18.5h.01',
}
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="PATHS[name] || PATHS.sparkle" />
  </svg>
</template>

<style scoped>
.icon {
  flex: none;
  display: inline-block;
  vertical-align: middle;
}
</style>
