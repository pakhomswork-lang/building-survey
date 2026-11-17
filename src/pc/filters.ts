// Отборы фото на компьютере (Р-41). Каждый отбор — группа значений (листы, типы, авторы…),
// в группе можно выбрать несколько значений. Фото подходит, если подходит под каждую группу,
// где что-то выбрано. Новые отборы (конструкции, помещения) добавляются ещё одной группой.

import type { Photo } from '../db'

export interface FilterOption {
  value: string
  label: string
  /** Цветная точка у значения (у типов фото). */
  color?: string
  /** Подсказка при наведении. */
  title?: string
}

export interface FilterDef {
  key: string
  label: string
  valueOf: (photo: Photo) => string
  options: FilterOption[]
}

/** Что выбрано в каждой группе. Пустая группа — «все». */
export type Selection = Record<string, string[]>

/** Подходит ли фото под все отборы, кроме группы skip (для счётчиков у значений). */
export function matches(photo: Photo, defs: FilterDef[], sel: Selection, skip?: string): boolean {
  return defs.every(d => d.key === skip || !sel[d.key]?.length || sel[d.key].includes(d.valueOf(photo)))
}

/** Сколько фото будет у каждого значения группы, если выбрать его вместе с остальными отборами. */
export function optionCounts(photos: Photo[], defs: FilterDef[], sel: Selection, def: FilterDef): Map<string, number> {
  const counts = new Map<string, number>()
  for (const p of photos) {
    if (!matches(p, defs, sel, def.key)) continue
    const v = def.valueOf(p)
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return counts
}

export function toggle(sel: Selection, key: string, value: string): Selection {
  const cur = sel[key] ?? []
  return { ...sel, [key]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value] }
}

export function isEmpty(sel: Selection, keys?: string[]): boolean {
  return Object.entries(sel).every(([k, v]) => (keys && !keys.includes(k)) || !v.length)
}
