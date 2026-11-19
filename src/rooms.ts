// Помещения на листах (шаг 19б, Р-46, Р-48): запись, права, «в каком помещении точка».

import { db, getMyIds, newRecordFields, ROOM_NONE, type Point, type Project, type Room } from './db'

type Contour = Room['contour']

/** Можно ли рисовать и править помещения: в своём объекте — да, в общем — только создателю объекта. */
export function canEditRooms(project: Project | undefined, myIds: Set<string> | undefined): boolean {
  if (!project || !myIds) return false
  return !project.shared || myIds.has(project.authorId)
}

export async function canEditRoomsIn(projectId: string): Promise<boolean> {
  const [project, myIds] = await Promise.all([db.projects.get(projectId), getMyIds()])
  return canEditRooms(project, myIds)
}

/** Живые помещения листа. */
export async function roomsOfSheet(sheetId: string): Promise<Room[]> {
  const all = await db.rooms.where('sheetId').equals(sheetId).sortBy('createdAt')
  return all.filter(r => !r.deleted)
}

/** Следующий номер на листе: на 1 больше самого большого номера-числа (1, 2, 3…). */
export function nextRoomNumber(rooms: Room[]): string {
  let max = 0
  for (const r of rooms) if (/^\d+$/.test(r.number)) max = Math.max(max, Number(r.number))
  return String(max + 1)
}

export async function createRoom(projectId: string, sheetId: string, contour: Contour): Promise<Room> {
  const number = nextRoomNumber(await roomsOfSheet(sheetId))
  const room: Room = { ...(await newRecordFields()), projectId, sheetId, contour, number, name: '', comment: '' }
  await db.rooms.add(room)
  return room
}

export async function updateRoom(roomId: string, changes: Partial<Pick<Room, 'contour' | 'number' | 'name' | 'comment'>>) {
  await db.rooms.update(roomId, { ...changes, updatedAt: Date.now() })
}

export async function deleteRoom(roomId: string) {
  await db.rooms.update(roomId, { deleted: true, updatedAt: Date.now() })
}

// --- геометрия (всё в процентах листа) ---

/** Лежит ли точка внутри контура (луч вправо, считаем пересечения со сторонами). */
export function insideContour(x: number, y: number, c: Contour): boolean {
  let inside = false
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, yi] = c[i]
    const [xj, yj] = c[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Площадь контура (в квадратных процентах): из вложенных помещений берём меньшее. */
export function contourArea(c: Contour): number {
  let a = 0
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) a += (c[j][0] + c[i][0]) * (c[j][1] - c[i][1])
  return Math.abs(a / 2)
}

/** Центр масс контура — сюда ставим номер помещения. */
export function contourCenter(c: Contour): [number, number] {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const f = c[j][0] * c[i][1] - c[i][0] * c[j][1]
    a += f
    cx += (c[j][0] + c[i][0]) * f
    cy += (c[j][1] + c[i][1]) * f
  }
  if (Math.abs(a) < 1e-9) {
    // вырожденный контур: просто среднее углов
    const n = c.length || 1
    return [c.reduce((s, p) => s + p[0], 0) / n, c.reduce((s, p) => s + p[1], 0) / n]
  }
  return [cx / (3 * a), cy / (3 * a)]
}

/**
 * Помещение точки (Р-48): ручной выбор, если он есть и помещение не удалено;
 * «без помещения», если так выбрали вручную; иначе — помещение, в контур которого точка попала.
 * rooms — живые помещения листа точки.
 */
export function roomOfPoint(point: Point, rooms: Room[]): Room | null {
  if (point.roomId === ROOM_NONE) return null
  if (point.roomId) {
    const chosen = rooms.find(r => r.id === point.roomId)
    if (chosen) return chosen
  }
  let best: Room | null = null
  let bestArea = Infinity
  for (const r of rooms) {
    if (r.sheetId !== point.sheetId || !insideContour(point.x, point.y, r.contour)) continue
    const area = contourArea(r.contour)
    if (area < bestArea) {
      best = r
      bestArea = area
    }
  }
  return best
}

/** Цвета помещений (Р-49): по порядку на листе, чтобы соседние отличались. */
const ROOM_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#c2255c', '#7048e8', '#f08c00', '#0c8599', '#e03131', '#5c940d', '#ae3ec9']

export function roomColor(index: number): string {
  return ROOM_COLORS[index % ROOM_COLORS.length]
}

/** Помещение под нажатием: из вложенных — меньшее. */
export function roomAt(x: number, y: number, rooms: Room[]): Room | null {
  let best: Room | null = null
  let bestArea = Infinity
  for (const r of rooms) {
    if (!insideContour(x, y, r.contour)) continue
    const area = contourArea(r.contour)
    if (area < bestArea) {
      best = r
      bestArea = area
    }
  }
  return best
}

/** Подпись помещения: «1 Кухня», «А1», «Кухня» или «без номера». */
export function roomTitle(r: Room): string {
  return [r.number, r.name].filter(Boolean).join(' ') || 'Без номера'
}

/** Насколько близко (в пикселях экрана) к первому углу, чтобы замкнуть контур. */
export const CLOSE_PX = 16

/** Прямоугольник по двум противоположным углам, стороны параллельны краям листа. */
export function rectContour(a: [number, number], b: [number, number]): [number, number][] {
  const x0 = Math.min(a[0], b[0])
  const x1 = Math.max(a[0], b[0])
  const y0 = Math.min(a[1], b[1])
  const y1 = Math.max(a[1], b[1])
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]
}

export const midpoint = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
