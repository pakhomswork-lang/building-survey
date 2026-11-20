// Номер версии (Р-50): 0.<шаг>.<итерация>, например 0.20а.2.
// - первое число: 0 — до релиза, после релиза станет 1;
// - шаг — номер текущего шага из ROADMAP.md (20а, 20б…);
// - итерация — 0, когда шаг только сделан, +1 за каждую доработку по замечаниям владельца.
// Номер меняем вручную при каждой публикации.
export const APP_RELEASE = '0.25.0'

// Время сборки подставляет Vite (см. vite.config.ts). По нему видно, обновилось ли приложение на телефоне.
declare const __BUILD_TIME__: string

const BUILD_DATE = new Date(__BUILD_TIME__).toLocaleString('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/** Для показа: «0.20а.2 от 19.11, 17:40». */
export const APP_VERSION = `${APP_RELEASE} от ${BUILD_DATE}`
