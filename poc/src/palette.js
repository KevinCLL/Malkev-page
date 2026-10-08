// El ordenador de a bordo (la búsqueda global) se abre desde cualquier sitio: el botón de la cabecera,
// Ctrl+K (o ⌘K) y la barra "/".
import { ref } from 'vue'

export const paletteOpen = ref(false)
export const openPalette = () => { paletteOpen.value = true }
export const closePalette = () => { paletteOpen.value = false }
