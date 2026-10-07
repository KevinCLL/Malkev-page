import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
  { path: '/blog', name: 'blog', component: () => import('./views/BlogView.vue') },
  { path: '/blog/:year/:month/:day/:slug', name: 'post', component: () => import('./views/PostView.vue') },
  { path: '/sala-de-juegos', name: 'games', component: () => import('./views/GamesView.vue') },
  { path: '/sala-de-proyeccion', name: 'films', component: () => import('./views/FilmsView.vue') },
  { path: '/biblioteca', name: 'library', component: () => import('./views/LibraryView.vue') },
  {
    path: '/consola',
    component: () => import('./views/admin/AdminLayout.vue'),
    children: [
      { path: '', name: 'admin-posts', component: () => import('./views/admin/AdminPosts.vue') },
      { path: 'entradas/nueva', name: 'admin-new-post', component: () => import('./views/admin/AdminPostEditor.vue') },
      { path: 'entradas/:id', name: 'admin-edit-post', component: () => import('./views/admin/AdminPostEditor.vue') },
      { path: 'comentarios', name: 'admin-comments', component: () => import('./views/admin/AdminComments.vue') },
      { path: 'coleccion/:kind?', name: 'admin-collection', component: () => import('./views/admin/AdminCollection.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue') },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    if (to.hash) return { el: to.hash, top: 90 }
    if (to.name === from.name && to.name !== 'post') return false
    return { top: 0 }
  },
})
