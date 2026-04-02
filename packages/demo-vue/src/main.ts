import { createApp } from 'vue'
import { createPinia } from 'pinia'

import '@affino/menu-vue/styles.css'
import './assets/main.css'
import { initializeOverlayKernel } from './utils/overlayKernel'

import App from './App.vue'
import router from './router'

initializeOverlayKernel()

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
