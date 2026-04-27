import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import Login from '../views/Login.vue'
import Homeroom from '../views/Homeroom.vue'
import SeatArrangement from '../views/SeatArrangement.vue'
import WorkLog from '../views/WorkLog.vue'
import StudentBoard from '../views/StudentBoard.vue'
import TeacherBoard from '../views/TeacherBoard.vue'

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
    { path: '/teacher-board', name: 'TeacherBoard', component: TeacherBoard },
    {
      path: '/guide',
      name: 'Guide',
      component: () => import('../views/Guide.vue')
    },
    { 
      path: '/apply', 
      name: 'Apply', 
      component: () => import('../views/ApplyView.vue') 
    },
    { 
      path: '/admin', 
      name: 'Admin', 
      component: () => import('../views/AdminView.vue'), 
    },
    {
      path: '/board-admin',
      name: 'BoardAdmin',
      component: () => import('../views/BoardAdmin.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/all-students',
      name: 'AllStudents',
      component: () => import('../views/AllStudents.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/subject',
      name: 'SubjectRecord',
      component: () => import('../views/SubjectRecord.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/career',
      name: 'Career',
      component: () => import('../views/Career.vue'),
      meta: { requiresAuth: true }
    },
    // 💡 새로 추가된 TTS 방송국 라우트
    {
      path: '/tts',
      name: 'TtsTool',
      component: () => import('../views/TtsView.vue'),
      meta: { requiresAuth: true }
    },
    // 자율학습 결석 사유 신청 (학생용, 인증 불필요)
    {
      path: '/absence-reason',
      name: 'AbsenceReason',
      component: () => import('../views/AbsenceReasonView.vue')
    }
  ]
})

router.beforeEach((to) => {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'
  if (to.meta.requiresAuth && !isLoggedIn) {
    return '/login'
  }
  return true
})

export default router