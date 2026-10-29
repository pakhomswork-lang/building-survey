import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // на GitHub Pages сайт лежит в подпапке /building-survey/, локально адрес такой же
  base: '/building-survey/',
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Обследование',
        short_name: 'Обследование',
        description: 'Фото и данные обследования, привязанные к точкам на листах',
        lang: 'ru',
        display: 'standalone',
        theme_color: '#1f6feb',
        background_color: '#f5f5f5',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // всё нужное для работы без интернета кладём в кэш заранее
        // .mjs — фоновый поток pdf.js для чтения PDF (около 1,3 МБ), лимит подняли с запасом
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
})
