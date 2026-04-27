import { createRouter, createWebHistory } from 'vue-router'
import ApplyView from '../views/ApplyView.vue'
import AbsenceReasonView from '../views/AbsenceReasonView.vue'
import AdminView from '../views/AdminView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/apply'
    },
    { 
      path: '/apply', 
      name: 'Apply', 
      component: ApplyView 
    },
    {
      path: '/absence',
      name: 'AbsenceReason',
      component: AbsenceReasonView
    },
    {
      path: '/admin',
      name: 'Admin',
      component: AdminView
    }
  ]
})

export default router
