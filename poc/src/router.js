import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
  { path: '/blog', name: 'blog', component: () => import('./views/BlogView.vue') },
  { path: '/blog/:year/:month/:day/:slug', name: 'post', component: () => import('./views/PostView.vue') },
  { path: '/sala-de-juegos', name: 'games', component: () => import('./views/GamesView.vue') },
  { path: '/sala-de-proyeccion', name: 'films', component: () => import('./views/FilmsView.vue') },
  { path: '/biblioteca', name: 'library', component: () => import('./views/LibraryView.vue') },
  { path: '/sala-recreativa', name: 'arcade', component: () => import('./views/ArcadeView.vue') },
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
  // La demo publicada vive dentro de un marco, así que allí las rutas van tras la almohadilla.
  history: import.meta.env.MODE === 'demo' ? createWebHashHistory() : createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    if (to.name === from.name && to.name !== 'post') return false
    return { top: 0 }
  },
})
