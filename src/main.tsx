/// <reference types="vite-plugin-pwa/client" />
import { StrictMode } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { createRoot } from 'react-dom/client'
// шрифт лежит внутри приложения, чтобы работал без интернета (Р-23)
import '@fontsource/onest/400.css'
import '@fontsource/onest/500.css'
import '@fontsource/onest/600.css'
import './index.css'
import App from './App.tsx'

// Офлайн-режим. Когда на сайте появляется новая версия, приложение скачивает её
// и сразу перезагружается, а не ждёт следующего запуска.
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
