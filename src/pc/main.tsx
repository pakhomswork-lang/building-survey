/// <reference types="vite-plugin-pwa/client" />
// Версия для компьютера (Р-40): тот же сайт и те же данные, свои экраны под монитор и мышь.
import { StrictMode } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { createRoot } from 'react-dom/client'
import '@fontsource/onest/400.css'
import '@fontsource/onest/500.css'
import '@fontsource/onest/600.css'
import '../index.css'
import './pc.css'
import { PcApp } from './PcApp'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PcApp />
  </StrictMode>,
)
