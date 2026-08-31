import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

// 💡 새 버전을 배포한 직후, 이전 버전의 index.html이 남아있는 브라우저 탭이
//    옛날 해시가 붙은 청크(JS/CSS)를 요청하면 404가 나서 화면이 빈 채로 멈춤.
//    이런 경우 자동으로 새로고침해서 최신 파일을 다시 받아오게 함.
window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
