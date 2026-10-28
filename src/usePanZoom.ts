import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject, type WheelEvent } from 'react'

// Приближение и перемещение листа пальцами (и колесом мыши на компьютере).
// Лист рисуется в размере «вписан в экран», сверху применяется сдвиг x, y и масштаб s.
// Короткое касание без сдвига считается нажатием (tap).

export interface Transform {
  x: number
  y: number
  s: number
}

export interface Tap {
  /** Координаты касания внутри листа в процентах (0–100). */
  px: number
  py: number
  /** Элемент, на который нажали (например, точка). */
  target: EventTarget | null
}

/** Насколько можно сдвинуть палец, чтобы касание ещё считалось нажатием. */
const TAP_MOVE_LIMIT = 8
const TAP_TIME_LIMIT = 500

export function usePanZoom(
  viewportRef: RefObject<HTMLDivElement | null>,
  content: { w: number; h: number } | null,
  maxScale: number,
  onTap: (tap: Tap) => void,
) {
  const [t, setT] = useState<Transform>({ x: 0, y: 0, s: 1 })
  const tRef = useRef(t)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const tap = useRef<{ x: number; y: number; time: number; target: EventTarget | null; valid: boolean } | null>(null)

  // берём числа, а не сам объект: объект создаётся заново при каждой отрисовке,
  // и тогда лист сбрасывался бы в исходный масштаб
  const contentW = content?.w
  const contentH = content?.h

  /** Не даём увести лист за край экрана. Если лист меньше экрана — держим по центру. */
  const clamp = useCallback(
    (next: Transform): Transform => {
      const vp = viewportRef.current
      if (!vp || !contentW || !contentH) return next
      const vw = vp.clientWidth
      const vh = vp.clientHeight
      const s = Math.min(maxScale, Math.max(1, next.s))
      const cw = contentW * s
      const ch = contentH * s
      const x = cw <= vw ? (vw - cw) / 2 : Math.min(0, Math.max(vw - cw, next.x))
      const y = ch <= vh ? (vh - ch) / 2 : Math.min(0, Math.max(vh - ch, next.y))
      return { x, y, s }
    },
    [viewportRef, contentW, contentH, maxScale],
  )

  const apply = useCallback(
    (next: Transform) => {
      tRef.current = clamp(next)
      setT(tRef.current)
    },
    [clamp],
  )

  // при смене листа или размера экрана показываем лист целиком
  useEffect(() => {
    apply({ x: 0, y: 0, s: 1 })
  }, [apply])

  /** Масштаб в f раз вокруг точки (cx, cy) экрана. */
  const zoomAt = useCallback(
    (f: number, cx: number, cy: number, dx = 0, dy = 0) => {
      const cur = tRef.current
      const s = Math.min(maxScale, Math.max(1, cur.s * f))
      const k = s / cur.s
      apply({ x: cx - (cx - cur.x) * k + dx, y: cy - (cy - cur.y) * k + dy, s })
    },
    [apply, maxScale],
  )

  function local(e: { clientX: number; clientY: number }) {
    const r = viewportRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function onPointerDown(e: PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    tap.current =
      pointers.current.size === 1 ? { x: p.x, y: p.y, time: Date.now(), target: e.target, valid: true } : null
  }

  function onPointerMove(e: PointerEvent) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const p = local(e)
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId).map(([, v]) => v)
    pointers.current.set(e.pointerId, p)

    if (tap.current && Math.hypot(p.x - tap.current.x, p.y - tap.current.y) > TAP_MOVE_LIMIT) tap.current.valid = false

    if (others.length === 0) {
      const cur = tRef.current
      apply({ ...cur, x: cur.x + p.x - prev.x, y: cur.y + p.y - prev.y })
    } else {
      // два пальца: масштаб по изменению расстояния, сдвиг по движению середины
      const o = others[0]
      const oldDist = Math.hypot(prev.x - o.x, prev.y - o.y)
      const newDist = Math.hypot(p.x - o.x, p.y - o.y)
      const oldMid = { x: (prev.x + o.x) / 2, y: (prev.y + o.y) / 2 }
      const newMid = { x: (p.x + o.x) / 2, y: (p.y + o.y) / 2 }
      if (oldDist > 0) zoomAt(newDist / oldDist, oldMid.x, oldMid.y, newMid.x - oldMid.x, newMid.y - oldMid.y)
    }
  }

  function onPointerUp(e: PointerEvent) {
    pointers.current.delete(e.pointerId)
    const tp = tap.current
    tap.current = null
    if (!tp?.valid || Date.now() - tp.time > TAP_TIME_LIMIT || !content) return
    const cur = tRef.current
    onTap({
      px: (((tp.x - cur.x) / cur.s) / content.w) * 100,
      py: (((tp.y - cur.y) / cur.s) / content.h) * 100,
      target: tp.target,
    })
  }

  function onPointerCancel(e: PointerEvent) {
    pointers.current.delete(e.pointerId)
    tap.current = null
  }

  function onWheel(e: WheelEvent) {
    const p = local(e)
    zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y)
  }

  return { t, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onWheel } }
}
