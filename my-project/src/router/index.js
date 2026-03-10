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
    },
    // 💡 새롭게 추가된 자율학습 신청 페이지 (학생용, 로그인 불필요)
    { 
      path: '/apply', 
      name: 'Apply', 
      component: () => import('../views/ApplyView.vue') 
    },
    // 💡 새롭게 추가된 자율학습 관리자 페이지 (교사용, 로그인 필수)
    { 
      path: '/admin', 
      name: 'Admin', 
      component: () => import('../views/AdminView.vue'), 
      
    },
    // 💡 새롭게 추가된 조종례 게시판 라우트
    {
      path: '/board-admin',
      name: 'BoardAdmin',
      component: () => import('../views/BoardAdmin.vue'),
      meta: { requiresAuth: true }
    },
  ]
})

/**
 * 💡 네비게이션 가이드 (Navigation Guard)
 */
router.beforeEach((to) => {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'
  
  // 인증이 필요한 페이지(requiresAuth: true)인데 로그인이 안 되어 있다면
  if (to.meta.requiresAuth && !isLoggedIn) {
    // 목적지 주소를 로그인 페이지로 강제 변경합니다.
    return '/login'
  }
  
  // 조건에 걸리지 않으면 통과시킵니다.
  return true
})

export default router