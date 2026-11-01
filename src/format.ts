import { PHOTO_TYPES, type PhotoType } from './db'

/** «1 лист», «3 листа», «5 листов». */
export function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10
  const dd = n % 100
  const word = d === 1 && dd !== 11 ? one : d >= 2 && d <= 4 && (dd < 10 || dd >= 20) ? few : many
  return `${n} ${word}`
}

/** «Сегодня, 14:32», «Вчера, 09:10» или «28 октября». */
export function formatWhen(time: number): string {
  const date = new Date(time)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const hm = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === today.toDateString()) return `Сегодня, ${hm}`
  if (date.toDateString() === yesterday.toDateString()) return `Вчера, ${hm}`
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}

export const TYPE_KEYS = Object.keys(PHOTO_TYPES) as PhotoType[]

/** Сколько фото каждого типа. */
export function countByType(photos: { type: PhotoType }[]): Record<PhotoType, number> {
  const counts = Object.fromEntries(TYPE_KEYS.map(t => [t, 0])) as Record<PhotoType, number>
  for (const p of photos) counts[p.type]++
  return counts
}
