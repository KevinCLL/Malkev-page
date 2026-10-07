<script setup>
// Editor de texto enriquecido. TipTap pone solo el motor (sin interfaz);
// la barra de herramientas, los iconos y los estilos son nuestros.
import { onBeforeUnmount, ref, watch } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import { VideoEmbed, AudioEmbed } from './editorEmbeds.js'
import AppIcon from './AppIcon.vue'
import { api } from '../api.js'
import { toast } from '../toast.js'

const props = defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])

const fileInput = ref(null)
const linkOpen = ref(false)
const linkHref = ref('')
const linkInput = ref(null)
const uploading = ref(false)
const words = ref(0)

function countWords(ed) {
  words.value = ed.getText().trim().split(/\s+/).filter(Boolean).length
}

async function uploadAndInsert(files, pos = null) {
  const images = [...files].filter((f) => f.type.startsWith('image/'))
  if (!images.length) return false
  uploading.value = true
  try {
    for (const file of images) {
      const { url } = await api.upload(file)
      const chain = editor.value.chain().focus()
      if (pos !== null) chain.insertContentAt(pos, { type: 'image', attrs: { src: url, alt: '' } }).run()
      else chain.setImage({ src: url, alt: '' }).run()
    }
  } catch (e) {
    toast(e.message, 'error')
  } finally {
    uploading.value = false
  }
  return true
}

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: null } },
    }),
    Image.configure({ HTMLAttributes: { loading: 'lazy' } }),
    TableKit.configure({ table: { resizable: false } }),
    VideoEmbed,
    AudioEmbed,
  ],
  editorProps: {
    attributes: { class: 'prose editor-surface', 'aria-label': 'Contenido de la entrada' },
    handlePaste(view, event) {
      const files = event.clipboardData?.files
      if (files?.length && [...files].some((f) => f.type.startsWith('image/'))) {
        uploadAndInsert(files)
        return true
      }
      return false
    },
    handleDrop(view, event) {
      const files = event.dataTransfer?.files
      if (files?.length && [...files].some((f) => f.type.startsWith('image/'))) {
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null
        uploadAndInsert(files, pos)
        return true
      }
      return false
    },
  },
  onCreate: ({ editor: ed }) => countWords(ed),
  onUpdate: ({ editor: ed }) => {
    emit('update:modelValue', ed.getHTML())
    countWords(ed)
  },
})

// Cuando llega una entrada cargada desde la API, se mete en el editor.
watch(() => props.modelValue, (html) => {
  if (editor.value && html !== editor.value.getHTML()) {
    editor.value.commands.setContent(html || '', { emitUpdate: false })
    countWords(editor.value)
  }
})

onBeforeUnmount(() => editor.value?.destroy())

function openLink() {
  linkHref.value = editor.value.getAttributes('link').href || ''
  linkOpen.value = true
  setTimeout(() => linkInput.value?.focus(), 0)
}

function applyLink() {
  const href = linkHref.value.trim()
  const chain = editor.value.chain().focus().extendMarkRange('link')
  if (href) chain.setLink({ href }).run()
  else chain.unsetLink().run()
  linkOpen.value = false
}

const run = (fn) => () => fn(editor.value.chain().focus()).run()

const groups = [
  [
    { icon: 'undo', title: 'Deshacer', action: run((c) => c.undo()) },
    { icon: 'redo', title: 'Rehacer', action: run((c) => c.redo()) },
  ],
  [
    { label: 'T2', title: 'Título', active: () => editor.value.isActive('heading', { level: 2 }), action: run((c) => c.toggleHeading({ level: 2 })) },
    { label: 'T3', title: 'Subtítulo', active: () => editor.value.isActive('heading', { level: 3 }), action: run((c) => c.toggleHeading({ level: 3 })) },
  ],
  [
    { icon: 'bold', title: 'Negrita (Ctrl+B)', active: () => editor.value.isActive('bold'), action: run((c) => c.toggleBold()) },
    { icon: 'italic', title: 'Cursiva (Ctrl+I)', active: () => editor.value.isActive('italic'), action: run((c) => c.toggleItalic()) },
    { icon: 'underline', title: 'Subrayado (Ctrl+U)', active: () => editor.value.isActive('underline'), action: run((c) => c.toggleUnderline()) },
    { icon: 'strike', title: 'Tachado', active: () => editor.value.isActive('strike'), action: run((c) => c.toggleStrike()) },
  ],
  [
    { icon: 'list-ul', title: 'Lista', active: () => editor.value.isActive('bulletList'), action: run((c) => c.toggleBulletList()) },
    { icon: 'list-ol', title: 'Lista numerada', active: () => editor.value.isActive('orderedList'), action: run((c) => c.toggleOrderedList()) },
    { icon: 'quote', title: 'Cita', active: () => editor.value.isActive('blockquote'), action: run((c) => c.toggleBlockquote()) },
    { icon: 'code', title: 'Bloque de código', active: () => editor.value.isActive('codeBlock'), action: run((c) => c.toggleCodeBlock()) },
    { icon: 'hr', title: 'Separador', action: run((c) => c.setHorizontalRule()) },
  ],
  [
    { icon: 'link', title: 'Enlace', active: () => editor.value.isActive('link'), action: openLink },
    { icon: 'image', title: 'Imagen (también puedes pegarla o arrastrarla)', action: () => fileInput.value.click() },
  ],
]
</script>

<template>
  <div class="rich-editor">
    <div v-if="editor" class="toolbar" role="toolbar" aria-label="Formato">
      <div v-for="(group, gi) in groups" :key="gi" class="group">
        <button
          v-for="b in group"
          :key="b.title"
          type="button"
          class="tool"
          :class="{ active: b.active?.() }"
          :title="b.title"
          :aria-pressed="b.active ? b.active() : undefined"
          @mousedown.prevent
          @click="b.action"
        >
          <AppIcon v-if="b.icon" :name="b.icon" :size="17" />
          <span v-else class="tool-label">{{ b.label }}</span>
          <span class="sr-only">{{ b.title }}</span>
        </button>
      </div>
      <span class="status readout">
        <template v-if="uploading">Subiendo imagen…</template>
        <template v-else>{{ words }} palabras</template>
      </span>
    </div>

    <form v-if="linkOpen" class="link-bar" @submit.prevent="applyLink">
      <AppIcon name="link" :size="16" />
      <input ref="linkInput" v-model="linkHref" class="input" placeholder="https://… (vacío para quitar el enlace)" @keydown.esc="linkOpen = false" />
      <button class="btn btn-sm btn-primary">Aplicar</button>
      <button type="button" class="btn btn-sm btn-ghost" @click="linkOpen = false">Cancelar</button>
    </form>

    <EditorContent :editor="editor" class="content" />
    <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="(e) => { uploadAndInsert(e.target.files); e.target.value = '' }" />
  </div>
</template>

<style scoped>
.rich-editor {
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: rgba(6, 3, 16, 0.5);
}
.toolbar {
  position: sticky;
  top: var(--header-h);
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border-bottom: 1px solid var(--line);
  background: rgba(16, 10, 34, 0.96);
  border-radius: var(--radius) var(--radius) 0 0;
}
.group {
  display: flex;
  gap: 2px;
  padding-right: 6px;
  border-right: 1px solid var(--line);
}
.group:last-of-type {
  border-right: none;
}
.tool {
  display: grid;
  place-items: center;
  min-width: 34px;
  height: 34px;
  padding: 0 6px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--text-soft);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.tool:hover {
  background: rgba(161, 132, 255, 0.12);
  color: #fff;
}
.tool.active {
  background: rgba(161, 132, 255, 0.25);
  color: #fff;
  box-shadow: inset 0 0 0 1px var(--violet);
}
.tool-label {
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 700;
}
.status {
  margin-left: auto;
  padding-right: 8px;
  text-transform: none;
}
.link-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}
.link-bar .input {
  padding: 7px 12px;
}
.content :deep(.editor-surface) {
  min-height: 420px;
  padding: 28px clamp(18px, 4vw, 44px);
  outline: none;
}
.content :deep(.editor-surface > *) {
  max-width: none;
}
.content :deep(.ProseMirror-selectednode) {
  outline: 2px solid var(--violet);
}
.content :deep(p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--muted);
  float: left;
  height: 0;
  pointer-events: none;
}
</style>
