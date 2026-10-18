import { createRouter, createWebHashHistory, type RouterHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import HeatmapView from '@/views/HeatmapView.vue'
import NotFoundView from '@/views/NotFoundView.vue'

export function createAppRouter(
  history: RouterHistory = createWebHashHistory(import.meta.env.BASE_URL),
) {
  return createRouter({
    history,
    routes: [
      { path: '/', name: 'home', component: HomeView },
      { path: '/heatmap', name: 'heatmap', component: HeatmapView },
      { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
    ],
    scrollBehavior: () => ({ top: 0 }),
  })
}
