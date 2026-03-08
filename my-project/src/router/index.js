import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import Login from '../views/Login.vue'
import Homeroom from '../views/Homeroom.vue'
import SeatArrangement from '../views/SeatArrangement.vue' // 자리 배치 컴포넌트 추가
import WorkLog from '../views/WorkLog.vue'
import StudentBoard from '../views/StudentBoard.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'Login', component: Login },
    { path: '/', name: 'Home', component: HomeView, meta: { requiresAuth: true } },
    { path: '/homeroom', name: 'Homeroom', component: Homeroom, meta: { requiresAuth: true } },
    { path: '/club', name: 'Club', component: () => import('../views/Club.vue'), meta: { requiresAuth: true } },
    { path: '/seats', name: 'SeatArrangement', component: SeatArrangement, meta: { requiresAuth: true } }, // 경로 추가
    { path: '/worklog', name: 'WorkLog', component: WorkLog, meta: { requiresAuth: true } },
    { path: '/board', name: 'StudentBoard', component: StudentBoard },
    {
      path: '/guide',
      name: 'Guide',
      component: () => import('../views/Guide.vue')
    } 
  ]
})

router.beforeEach((to, from, next) => {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'
  if (to.meta.requiresAuth && !isLoggedIn) {
    next('/login')
  } else {
    next()
  }
})

export default router