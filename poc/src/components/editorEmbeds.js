// Nodos propios para que el editor conserve los vídeos y audios de las entradas antiguas
// (TipTap descarta por defecto las etiquetas que no conoce).
import { Node } from '@tiptap/core'

export const VideoEmbed = Node.create({
  name: 'videoEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null } }
  },
  parseHTML() {
    return [
      { tag: 'div.video-embed', getAttrs: (el) => ({ src: el.querySelector('iframe')?.getAttribute('src') || null }) },
      { tag: 'iframe[src]', getAttrs: (el) => ({ src: el.getAttribute('src') }) },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { class: 'video-embed' }, ['iframe', {
      src: HTMLAttributes.src,
      width: '560',
      height: '315',
      frameborder: '0',
      allowfullscreen: 'true',
      loading: 'lazy',
    }]]
  },
})

export const AudioEmbed = Node.create({
  name: 'audioEmbed',
  group: 'block',
  atom: true,
  addAttributes() {
    return { src: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'audio[src]', getAttrs: (el) => ({ src: el.getAttribute('src') }) }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['audio', { controls: 'true', src: HTMLAttributes.src }]
  },
})
