import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Иконки приложения из public/icon.svg. Запуск: npx pwa-assets-generator
// Фон maskable и Apple — цвет иконки: скруглённые углы сливаются с ним, и иконка получается во весь значок.
const BRICK = '#9b4a34'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // для Android: рамка должна целиком войти в «безопасный круг», который система не обрезает
    maskable: { sizes: [512], padding: 0.18, resizeOptions: { background: BRICK } },
    apple: { sizes: [180], padding: 0, resizeOptions: { background: BRICK } },
  },
  images: ['public/icon.svg'],
})
