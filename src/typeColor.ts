import type { PhotoType } from './db'

/** Цвет типа фото: одинаковый на метках, фильтрах и полосках под фото (Р-23). */
export function typeColor(type: PhotoType): string {
  return `var(--type-${type})`
}
