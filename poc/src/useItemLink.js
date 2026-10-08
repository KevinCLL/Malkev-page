// Abrir una ficha de la colección desde un enlace (?item=ID): lo usa el ordenador de a bordo y sirve
// para compartir el enlace de una caja, una peli o un libro concretos.
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useItemLink(items, selected) {
  const route = useRoute()
  const router = useRouter()
  watch([() => route.query.item, items], ([id, list]) => {
    if (!id || !list?.length) return
    const it = list.find((i) => i.id === Number(id))
    if (it) selected.value = it
  }, { immediate: true })
  watch(selected, (v) => {
    if (!v && route.query.item) router.replace({ query: { ...route.query, item: undefined } })
  })
}

export const ROOM_OF = {
  boardgame: '/sala-de-juegos',
  rpg: '/sala-de-juegos',
  film: '/sala-de-proyeccion',
  series: '/sala-de-proyeccion',
  book: '/biblioteca',
  manga: '/biblioteca',
  videogame: '/sala-recreativa',
}
export const itemLink = (it) => ({ path: ROOM_OF[it.kind] || '/', query: { item: it.id } })
