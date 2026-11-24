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
  /**
   * Свободный сдвиг: под середину экрана можно подвести любую точку листа, даже угол.
   * Нужен для прицела в центре экрана при рисовании помещений (Р-49).
   */
  free = false,
  onPlace?: (px: number, py: number) => void,
) {
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null)
  const holding = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const [t, setT] = useState<Transform>({ x: 0, y: 0, s: 1 })
  const tRef = useRef(t)
  const freeRef = useRef(free)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const tap = useRef<{ x: number; y: number; time: number; target: EventTarget | null; valid: boolean } | null>(null)

  // «Лишний щелчок»: после касания телефон шлёт ещё и click в то же место, чуть позже.
  // Если нажатие открыло меню, этот click попадал в меню (закрывал его или выбирал строку).
  // Полсекунды после нажатия по листу гасим такие щелчки вне листа.
  const suppressClicksUntil = useRef(0)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (Date.now() < suppressClicksUntil.current && !viewportRef.current?.contains(e.target as Node)) {
        e.stopPropagation()
        e.preventDefault()
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [viewportRef])

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
      if (freeRef.current) {
        const x = Math.min(vw / 2, Math.max(vw / 2 - cw, next.x))
        const y = Math.min(vh / 2, Math.max(vh / 2 - ch, next.y))
        return { x, y, s }
      }
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

  // свободный сдвиг выключили — возвращаем лист в обычные границы, масштаб тот же
  useEffect(() => {
    if (freeRef.current === free) return
    freeRef.current = free
    apply(tRef.current)
  }, [free, apply])

  // область под лист изменилась (например, выбрали точку и план стал ниже):
  // оставляем масштаб, но заново ставим лист в границы области
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(() => apply(tRef.current))
    ro.observe(el)
    return () => ro.disconnect()
  }, [apply, viewportRef])

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
    clearTimeout(timer.current)
    holding.current = false
    setLens(null)
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = local(e)
    pointers.current.set(e.pointerId, p)
    tap.current =
      pointers.current.size === 1 ? { x: p.x, y: p.y, time: Date.now(), target: e.target, valid: true } : null
    if (tap.current && onPlace && content && e.button === 0) {
      const id = e.pointerId
      timer.current = setTimeout(() => {
        const pos = pointers.current.get(id)
        if (!pos || !tap.current?.valid) return
        holding.current = true
        setLens(pos)
      }, 350)
    }
  }

  function onPointerMove(e: PointerEvent) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const p = local(e)
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId).map(([, v]) => v)
    pointers.current.set(e.pointerId, p)

    if (holding.current) {
      setLens(p)
      return
    }
    if (tap.current && Math.hypot(p.x - tap.current.x, p.y - tap.current.y) > TAP_MOVE_LIMIT) tap.current.valid = false
    if (onPlace && tap.current?.valid) return

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
    clearTimeout(timer.current)
    pointers.current.delete(e.pointerId)
    const tp = tap.current
    tap.current = null
    if (holding.current) {
      holding.current = false
      setLens(null)
      const p = local(e)
      const cur = tRef.current
      const vp = viewportRef.current
      if (content && vp && p.x >= 0 && p.y >= 0 && p.x <= vp.clientWidth && p.y <= vp.clientHeight) {
        const px = (p.x - cur.x) / (cur.s * content.w) * 100
        const py = (p.y - cur.y) / (cur.s * content.h) * 100
        if (px >= 0 && py >= 0 && px <= 100 && py <= 100) onPlace?.(px, py)
      }
      return
    }
    if (!tp?.valid || Date.now() - tp.time > TAP_TIME_LIMIT || !content) return
    suppressClicksUntil.current = Date.now() + 500
    const cur = tRef.current
    onTap({
      px: (((tp.x - cur.x) / cur.s) / content.w) * 100,
      py: (((tp.y - cur.y) / cur.s) / content.h) * 100,
      target: tp.target,
    })
  }

  function onPointerCancel(e: PointerEvent) {
    clearTimeout(timer.current)
    holding.current = false
    setLens(null)
    pointers.current.delete(e.pointerId)
    tap.current = null
  }

  function onWheel(e: WheelEvent) {
    const p = local(e)
    zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y)
  }

  /** Кнопки «+» и «−»: масштаб вокруг середины экрана. */
  function zoomBy(f: number) {
    const vp = viewportRef.current
    if (vp) zoomAt(f, vp.clientWidth / 2, vp.clientHeight / 2)
  }

  /** Подвести точку листа (x, y в процентах) под середину экрана, масштаб тот же. */
  function centerOn(px: number, py: number) {
    const vp = viewportRef.current
    if (!vp || !contentW || !contentH) return
    const cur = tRef.current
    apply({ ...cur, x: vp.clientWidth / 2 - (px / 100) * contentW * cur.s, y: vp.clientHeight / 2 - (py / 100) * contentH * cur.s })
  }

  return { t, lens, zoomBy, centerOn, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onWheel } }
}
