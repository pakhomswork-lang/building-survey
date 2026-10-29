/// <reference types="vite-plugin-pwa/client" />
import { StrictMode } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { createRoot } from 'react-dom/client'
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
