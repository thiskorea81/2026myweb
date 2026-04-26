import { createRouter, createWebHistory } from 'vue-router'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase'
import HomeView from '../views/HomeView.vue'
import Login from '../views/Login.vue'
import Homeroom from '../views/Homeroom.vue'
import SeatArrangement from '../views/SeatArrangement.vue'
import WorkLog from '../views/WorkLog.vue'
import StudentBoard from '../views/StudentBoard.vue'
import TeacherBoard from '../views/TeacherBoard.vue'

const getCurrentUser = () =>
  new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      resolve(user)
    })
  })

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
    { path: '/guide', name: 'Guide', component: () => import('../views/Guide.vue') },
    { path: '/apply', name: 'Apply', component: () => import('../views/ApplyView.vue') },
    { path: '/admin', name: 'Admin', component: () => import('../views/AdminView.vue') },
    { path: '/board-admin', name: 'BoardAdmin', component: () => import('../views/BoardAdmin.vue'), meta: { requiresAuth: true } },
    { path: '/all-students', name: 'AllStudents', component: () => import('../views/AllStudents.vue'), meta: { requiresAuth: true } },
    { path: '/subject', name: 'SubjectRecord', component: () => import('../views/SubjectRecord.vue'), meta: { requiresAuth: true } },
    { path: '/career', name: 'Career', component: () => import('../views/Career.vue'), meta: { requiresAuth: true } },
    { path: '/tts', name: 'TtsTool', component: () => import('../views/TtsView.vue'), meta: { requiresAuth: true } }
  ]
})

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true
  const user = await getCurrentUser()
  if (!user) return '/login'
  return true
})

export default router