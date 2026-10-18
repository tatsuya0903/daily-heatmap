import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { createAppRouter } from './router'
import { createAppVuetify } from './plugins/vuetify'
import './styles/main.css'

createApp(App).use(createPinia()).use(createAppRouter()).use(createAppVuetify()).mount('#app')
