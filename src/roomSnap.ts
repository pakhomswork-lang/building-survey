// Выравнивания при рисовании помещений (шаг 20в, Р-46 п. 3, Р-48 п. 5).
//
// Прицел стоит в центре экрана, а угол ставится в «притянутую» точку рядом с ним:
// 1) к углу уже нарисованного помещения;
// 2) по горизонтали или вертикали к своим поставленным углам и к углам соседних помещений
//    (стена получается ровной, углы встают на одну линию с соседями);
// 3) к стене соседнего помещения (если есть выравнивание по оси — в точку пересечения).
// Притяжение считается в пикселях экрана: при сильном приближении оно слабее,
// поэтому косую стену можно поставить, приблизив лист.

import type { Room } from './db'

type Pt = [number, number]

/** На сколько пикселей экрана притягивает. */
export const SNAP_PX = 12

export interface Snap {
  /** Куда встанет угол (проценты листа). */
  p: Pt
  /** К чему притянуто: угол, стена, оси или ничего. */
  kind: 'vertex' | 'wall' | 'axis' | 'none'
  /** Направляющие линии: от угла, с которым выровняли, до точки. */
  guides: [Pt, Pt][]
}

export interface SnapOptions {
  /** Сколько пикселей экрана в одном проценте ширины и высоты листа. */
  kx: number
  ky: number
  /** Помещения листа, к которым притягиваем. */
  rooms: Room[]
  /** Свои поставленные углы (с ними выравниваем в первую очередь). */
  own: Pt[]
}

export function snapPoint(raw: Pt, { kx, ky, rooms, own }: SnapOptions): Snap {
  const dist = (a: Pt, b: Pt) => Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * ky)
  const vertices = rooms.flatMap(r => r.contour)

  // 1. угол соседнего помещения
  let best: Pt | null = null
  let bestD = SNAP_PX
  for (const v of vertices) {
    const d = dist(raw, v)
    if (d < bestD) {
      best = v
      bestD = d
    }
  }
  if (best) return { p: [best[0], best[1]], kind: 'vertex', guides: [] }

  // 2. выравнивание по осям: свои углы важнее чужих
  const lockFrom = (axis: 0 | 1): Pt | null => {
    const k = axis === 0 ? kx : ky
    for (const group of [own, vertices]) {
      let found: Pt | null = null
      let d = SNAP_PX
      for (const c of group) {
        const dd = Math.abs(raw[axis] - c[axis]) * k
        if (dd < d) {
          found = c
          d = dd
        }
      }
      if (found) return found
    }
    return null
  }
  const srcX = lockFrom(0)
  const srcY = lockFrom(1)
  const p: Pt = [srcX ? srcX[0] : raw[0], srcY ? srcY[1] : raw[1]]
  const guides: [Pt, Pt][] = []
  if (srcX) guides.push([srcX, p])
  if (srcY) guides.push([srcY, p])

  // 3. стена соседнего помещения (если обе оси заняты — точка уже определена)
  if (!(srcX && srcY)) {
    let wall: Pt | null = null
    let wallD = SNAP_PX
    for (const r of rooms) {
      const c = r.contour
      for (let i = 0; i < c.length; i++) {
        const a = c[i]
        const b = c[(i + 1) % c.length]
        const q = srcX ? onSegmentAt(a, b, 0, p[0]) : srcY ? onSegmentAt(a, b, 1, p[1]) : project(a, b, raw, kx, ky)
        if (!q) continue
        const d = dist(raw, q)
        if (d < wallD) {
          wall = q
          wallD = d
        }
      }
    }
    if (wall) {
      // направляющая по оси теперь ведёт в точку на стене
      const g = guides.map(([from]) => [from, wall] as [Pt, Pt])
      return { p: wall, kind: 'wall', guides: g }
    }
  }

  return { p, kind: guides.length ? 'axis' : 'none', guides }
}

/** Ближайшая к r точка отрезка ab (расстояние считаем в пикселях экрана). */
function project(a: Pt, b: Pt, r: Pt, kx: number, ky: number): Pt {
  const ax = a[0] * kx, ay = a[1] * ky
  const bx = b[0] * kx, by = b[1] * ky
  const rx = r[0] * kx, ry = r[1] * ky
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  const u = len2 ? Math.max(0, Math.min(1, ((rx - ax) * dx + (ry - ay) * dy) / len2)) : 0
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]
}

/** Точка отрезка ab, где координата axis равна value (пересечение с вертикалью или горизонталью). */
function onSegmentAt(a: Pt, b: Pt, axis: 0 | 1, value: number): Pt | null {
  const d = b[axis] - a[axis]
  if (Math.abs(d) < 1e-9) return null // стена параллельна этой линии
  const u = (value - a[axis]) / d
  if (u < 0 || u > 1) return null
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]
}
