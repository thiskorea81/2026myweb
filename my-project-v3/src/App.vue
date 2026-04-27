<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const navItems = [
  { path: '/apply', name: '자율학습 신청', icon: '📝' },
  { path: '/absence', name: '결석 사유', icon: '📋' }
]

const navigateTo = (path) => {
  router.push(path)
}
</script>

<template>
  <div class="app-container">
    <main class="main-content">
      <router-view v-slot="{ Component }">
        <transition name="slide-fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- Mobile Bottom Navigation -->
    <nav class="bottom-nav glass-panel">
      <button 
        v-for="item in navItems" 
        :key="item.path"
        @click="navigateTo(item.path)"
        :class="['nav-item', route.path === item.path ? 'active' : '']"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span class="nav-label">{{ item.name }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.main-content {
  flex: 1;
  padding-bottom: 80px; /* Space for bottom nav */
}

/* Bottom Navigation */
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 70px;
  border-radius: 20px 20px 0 0;
  border-bottom: none;
  z-index: 50;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  gap: 4px;
  width: 100%;
  height: 100%;
  transition: all 0.3s ease;
}

.nav-item.active {
  color: var(--primary);
  transform: translateY(-2px);
}

.nav-icon {
  font-size: 1.5rem;
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.nav-item.active .nav-icon {
  transform: scale(1.1);
}

.nav-label {
  font-size: 0.75rem;
  font-weight: 700;
}

/* Route Transitions */
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(1, 0.5, 0.8, 1);
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateX(10px);
  opacity: 0;
}
</style>
