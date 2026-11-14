import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** У версии для компьютера свой файл установки: ставится отдельной программой (Р-40). */
const pcManifest: Plugin = {
  name: 'pc-manifest',
  enforce: 'post',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      if (!ctx.path.includes('/pc/')) return html
      return html.replace(/<link rel="manifest" href="[^"]*">/, '<link rel="manifest" href="/building-survey/pc/manifest.webmanifest">')
    },
  },
}

// https://vite.dev/config/
export default defineConfig({
  // на GitHub Pages сайт лежит в подпапке /building-survey/, локально адрес такой же
  base: '/building-survey/',
  // две страницы: телефонная версия и версия для компьютера (Р-40)
  build: {
    rollupOptions: {
      input: { main: 'index.html', pc: 'pc/index.html' },
    },
  },
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
        theme_color: '#f4f5f7',
        background_color: '#f4f5f7',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // всё нужное для работы без интернета кладём в кэш заранее
        // woff2 — шрифт Onest
        // .mjs — фоновый поток pdf.js для чтения PDF (около 1,3 МБ), лимит подняли с запасом
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // тестовые страницы (spike/, spike-yandex/, check-sync/) открываются сами, а не подменяются приложением
        navigateFallbackDenylist: [/\/spike/, /\/check-/],
      },
    }),
    pcManifest,
  ],
})
