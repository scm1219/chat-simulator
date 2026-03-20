import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/global.scss'

// 调试：检查 electronAPI 是否可用
console.log('[Main] window.electronAPI:', window.electronAPI)

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
