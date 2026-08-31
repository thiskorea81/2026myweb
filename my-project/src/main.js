import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

// 💡 새 버전을 배포한 직후, 이전 버전의 index.html이 남아있는 브라우저 탭이
//    옛날 해시가 붙은 청크(JS/CSS)를 요청하면 404가 나서 화면이 빈 채로 멈춤.
//    이런 경우 자동으로 새로고침해서 최신 파일을 다시 받아오게 함.
//    단, 새로고침해도 브라우저 캐시가 같은 옛날 index.html을 계속 돌려주는 경우
//    무한 새로고침에 빠질 수 있으므로 세션당 한 번만 시도하도록 제한한다.
const RELOAD_FLAG = 'vite-preload-reloaded'
window.addEventListener('vite:preloadError', () => {
  if (sessionStorage.getItem(RELOAD_FLAG)) return
  sessionStorage.setItem(RELOAD_FLAG, 'true')
  window.location.reload()
})

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

// 정상적으로 떴다면 다음 배포 때 다시 새로고침을 시도할 수 있도록 플래그 해제
sessionStorage.removeItem(RELOAD_FLAG)
