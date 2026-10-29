// Время сборки подставляет Vite (см. vite.config.ts). По нему видно, обновилось ли приложение на телефоне.
declare const __BUILD_TIME__: string

export const APP_VERSION = new Date(__BUILD_TIME__).toLocaleString('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})
