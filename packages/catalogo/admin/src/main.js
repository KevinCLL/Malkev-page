import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './styles/theme.css'
import './styles/admin.css'

const routes = [
  { path: '/', name: 'puente', component: () => import('./views/Bridge.vue'), meta: { title: 'Puente' } },
  { path: '/catalogo', name: 'items', component: () => import('./views/Items.vue'), meta: { title: 'Catálogo' } },
  { path: '/catalogo/nuevo', name: 'item-new', component: () => import('./views/ItemEdit.vue'), meta: { title: 'Nueva cosa' } },
  { path: '/catalogo/:id', name: 'item', component: () => import('./views/ItemEdit.vue'), props: true, meta: { title: 'Ficha' } },
  { path: '/colecciones', name: 'collections', component: () => import('./views/Collections.vue'), meta: { title: 'Colecciones' } },
  { path: '/colecciones/:id', name: 'collection', component: () => import('./views/CollectionEdit.vue'), props: true, meta: { title: 'Colección' } },
  { path: '/etiquetas', name: 'tags', component: () => import('./views/Tags.vue'), meta: { title: 'Etiquetas' } },
  { path: '/bitacora', name: 'posts', component: () => import('./views/Posts.vue'), meta: { title: 'Bitácora' } },
  { path: '/bitacora/nueva', name: 'post-new', component: () => import('./views/PostEdit.vue'), meta: { title: 'Nueva entrada' } },
  { path: '/bitacora/:id', name: 'post', component: () => import('./views/PostEdit.vue'), props: true, meta: { title: 'Entrada' } },
  { path: '/comentarios', name: 'comments', component: () => import('./views/Comments.vue'), meta: { title: 'Comentarios' } },
  { path: '/ajustes', name: 'settings', component: () => import('./views/Settings.vue'), meta: { title: 'Ajustes' } },
  { path: '/:rest(.*)*', redirect: '/' },
]

const router = createRouter({ history: createWebHistory('/admin/'), routes })
router.afterEach((to) => { document.title = `${to.meta.title || 'Consola'} · Consola del capitán` })

createApp(App).use(router).mount('#app')
