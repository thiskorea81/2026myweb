import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import Login from '../views/Login.vue'
import Homeroom from '../views/Homeroom.vue'
import SeatArrangement from '../views/SeatArrangement.vue'
import WorkLog from '../views/WorkLog.vue'
import StudentBoard from '../views/StudentBoard.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'Login', component: Login },
    { path: '/', name: 'Home', component: HomeView, meta: { requiresAuth: true } },
    { path: '/homeroom', name: 'Homeroom', component: Homeroom, meta: { requiresAuth: true } },
    { path: '/club', name: 'Club', component: () => import('../views/Club.vue'), meta: { requiresAuth: true } },
    { path: '/seats', name: 'SeatArrangement', component: SeatArrangement, meta: { requiresAuth: true } },
    { path: '/worklog', name: 'WorkLog', component: WorkLog, meta: { requiresAuth: true } },
    { path: '/board', name: 'StudentBoard', component: StudentBoard },
    {
      path: '/guide',
      name: 'Guide',
      component: () => import('../views/Guide.vue')
    } 
  ]
})

/**
 * 💡 네비게이션 가이드 최신화 (Deprecated 경고 해결)
 */
router.beforeEach((to) => {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'
  
  // 인증이 필요한 페이지인데 로그인이 안 되어 있다면
  if (to.meta.requiresAuth && !isLoggedIn) {
    // next('/login') 대신 목적지 주소를 return 합니다.
    return '/login'
  }
  
  // 조건에 걸리지 않으면 아무것도 반환하지 않거나(undefined) true를 반환하여 통과시킵니다.
  return true
})

export default router