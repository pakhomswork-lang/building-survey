import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { db, type Photo } from '../db'
import { usePeople } from '../people'
import { markerSize, ringBackground } from '../markers'
import { useObjectUrl } from '../useObjectUrl'
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { usePdfPage } from './sheetPdf'

// Лист для мыши (Р-40): колесо — приближение к курсору, любая кнопка — тащить лист,
// щелчок по метке — выбрать точку, двойной щелчок — приблизить. Меню браузера не появляется.
// Картинка рисуется в настоящем размере на экране (а не растягивается), чтобы браузер
// сглаживал её как следует при любом приближении.

interface View {
  x: number
  y: number
  s: number
}

/** Сколько можно сдвинуть мышь, чтобы нажатие ещё считалось щелчком. */
const CLICK_MOVE = 4

export function PcSheet({
  sheetId,
  match,
  selectedId,
  onSelect,
}: {
  sheetId: string
  /** Отбор фото: на листе остаются точки, где есть подходящие фото. null — все точки. */
  match: ((photo: Photo) => boolean) | null
  selectedId: string | null
  onSelect: (pointId: string | null) => void
}) {
  const image = useLiveQuery(() => db.sheetImages.get(sheetId), [sheetId])
  const points = useLiveQuery(async () => (await db.points.where('sheetId').equals(sheetId).sortBy('createdAt')).filter(p => !p.deleted), [sheetId])
  const photos = useLiveQuery(async () => (await db.photos.where('sheetId').equals(sheetId).toArray()).filter(p => !p.deleted), [sheetId])
  const url = useObjectUrl(image?.blob)
  const people = usePeople()
  // исходный PDF листа, если указан на этом компьютере (Р-42)
  const pdf = usePdfPage(sheetId)

  const ref = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setVp({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // «лист целиком» с небольшим полем
  const fit = vp && image ? Math.min((vp.w - 32) / image.width, (vp.h - 32) / image.height) : null
  // приближать до 2 пикселей экрана на пиксель картинки, но не меньше чем в 4 раза
  // с PDF лист чёткий при любом приближении, поэтому можно приближать сильнее
  const maxScale = fit ? (pdf ? Math.max(16, 8 / fit) : Math.max(4, 2 / fit)) : 4

  const [view, setView] = useState<View>({ x: 0, y: 0, s: 1 })
  const viewRef = useRef(view)

  const clamp = useCallback(
    (v: View): View => {
      if (!vp || !fit || !image) return v
      const s = Math.min(maxScale, Math.max(1, v.s))
      const w = image.width * fit * s
      const h = image.height * fit * s
      const x = w <= vp.w ? (vp.w - w) / 2 : Math.min(40, Math.max(vp.w - w - 40, v.x))
      const y = h <= vp.h ? (vp.h - h) / 2 : Math.min(40, Math.max(vp.h - h - 40, v.y))
      return { x, y, s }
    },
    [vp, fit, image, maxScale],
  )
  const apply = useCallback(
    (v: View) => {
      viewRef.current = clamp(v)
      setView(viewRef.current)
    },
    [clamp],
  )

  // новый лист или новый размер окна — показываем лист целиком
  useEffect(() => {
    apply({ x: 0, y: 0, s: 1 })
  }, [apply, sheetId])

  const zoomAt = useCallback(
    (f: number, cx: number, cy: number) => {
      const cur = viewRef.current
      const s = Math.min(maxScale, Math.max(1, cur.s * f))
      const k = s / cur.s
      apply({ x: cx - (cx - cur.x) * k, y: cy - (cy - cur.y) * k, s })
    },
    [apply, maxScale],
  )

  // колесо: обработчик «не пассивный», иначе браузер не даст отменить прокрутку страницы
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      // тачпад присылает много мелких шагов, мышь — крупные; формула подходит для обоих
      zoomAt(Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const drag = useRef<{ id: number; x: number; y: number; startX: number; startY: number; moved: boolean; button: number; target: EventTarget } | null>(null)
  const [dragging, setDragging] = useState(false)

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false, button: e.button, target: e.target }
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > CLICK_MOVE) {
      d.moved = true
      setDragging(true)
    }
    if (d.moved) {
      const cur = viewRef.current
      apply({ ...cur, x: cur.x + e.clientX - d.x, y: cur.y + e.clientY - d.y })
    }
    d.x = e.clientX
    d.y = e.clientY
  }
  function onPointerUp() {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (!d || d.moved || d.button !== 0) return
    // щелчок левой кнопкой: по метке — выбрать точку, мимо — снять выбор.
    // Смотрим, куда нажали: после захвата мыши отпускание приходит самому листу
    const hit = (d.target as HTMLElement).closest?.('[data-point-id]')
    onSelect(hit?.getAttribute('data-point-id') ?? null)
  }
  function onPointerCancel() {
    drag.current = null
    setDragging(false)
  }
  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('[data-point-id]')) return
    const r = e.currentTarget.getBoundingClientRect()
    zoomAt(2, e.clientX - r.left, e.clientY - r.top)
  }

  const photosOf = (pointId: string): Photo[] => photos?.filter(p => p.pointId === pointId) ?? []
  const shown = (points ?? [])
    .map((p, i) => ({ p, n: i + 1 }))
    .filter(({ p }) => !match || p.id === selectedId || photosOf(p.id).some(match))
  const size = markerSize(view.s)
  const w = image && fit ? image.width * fit * view.s : 0
  const h = image && fit ? image.height * fit * view.s : 0

  return (
    <div
      ref={ref}
      className={'pc-sheet' + (dragging ? ' dragging' : '')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={onDoubleClick}
      onContextMenu={e => e.preventDefault()}
    >
      {image === null && <p className="pc-muted pc-center">Картинка листа ещё не пришла с сервера.</p>}
      {url && fit && (
        <div style={{ position: 'absolute', left: view.x, top: view.y, width: w, height: h, background: '#fff' }}>
          <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block' }} />
          {pdf && vp && <PdfLayer page={pdf} x={view.x} y={view.y} w={w} h={h} vpW={vp.w} vpH={vp.h} />}
          {shown.map(({ p, n }) => {
            const other = !!people && !people.isMine(p.authorId)
            return (
              <div
                key={p.id}
                data-point-id={p.id}
                title={p.comment || `Точка ${n}`}
                className={'marker' + (p.id === selectedId ? ' on' : '') + (other ? ' other' : '')}
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  width: size,
                  height: size,
                  marginLeft: -size / 2,
                  marginTop: -size / 2,
                  ...({ '--ring': ringBackground(photosOf(p.id)) } as CSSProperties),
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: Math.round(size * 0.5) }}>{n}</span>
                {other && (
                  <em className="marker-code" style={{ fontSize: Math.max(9, Math.round(size * 0.38)) }}>
                    {people.codeOf(p.authorId) || '?'}
                  </em>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="pc-zoom" onPointerDown={e => e.stopPropagation()}>
        <button aria-label="Приблизить" onClick={() => vp && zoomAt(1.5, vp.w / 2, vp.h / 2)}>
          +
        </button>
        <button aria-label="Отдалить" onClick={() => vp && zoomAt(1 / 1.5, vp.w / 2, vp.h / 2)}>
          −
        </button>
        <button aria-label="Лист целиком" title="Лист целиком" onClick={() => apply({ x: 0, y: 0, s: 1 })}>
          ⤢
        </button>
      </div>
    </div>
  )
}

/**
 * Видимая часть листа, нарисованная из PDF в разрешении экрана (Р-42).
 * Перерисовывается, когда лист перестал двигаться; пока рисуется, видна прежняя картинка,
 * растянутая вместе с листом. Под ней всегда лежит обычная картинка листа.
 */
function PdfLayer({ page, x, y, w, h, vpW, vpH }: { page: PDFPageProxy; x: number; y: number; w: number; h: number; vpW: number; vpH: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let task: RenderTask | null = null
    const timer = setTimeout(async () => {
      const canvas = ref.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      // видимый кусок листа в координатах листа на экране
      const x0 = Math.max(0, -x)
      const y0 = Math.max(0, -y)
      const x1 = Math.min(w, vpW - x)
      const y1 = Math.min(h, vpH - y)
      if (x1 <= x0 || y1 <= y0) return
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: (w * dpr) / base.width })
      const off = document.createElement('canvas')
      off.width = Math.ceil((x1 - x0) * dpr)
      off.height = Math.ceil((y1 - y0) * dpr)
      const ctx = off.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, off.width, off.height)
      task = page.render({ canvas: off, canvasContext: ctx, viewport, transform: [1, 0, 0, 1, -x0 * dpr, -y0 * dpr] })
      try {
        await task.promise
      } catch {
        return // отменили: лист снова сдвинули
      }
      // новый кусок и его место ставим разом, без лишней отрисовки React
      canvas.width = off.width
      canvas.height = off.height
      canvas.getContext('2d')!.drawImage(off, 0, 0)
      Object.assign(canvas.style, {
        display: 'block',
        left: `${(x0 / w) * 100}%`,
        top: `${(y0 / h) * 100}%`,
        width: `${((x1 - x0) / w) * 100}%`,
        height: `${((y1 - y0) / h) * 100}%`,
      })
    }, 150)
    return () => {
      clearTimeout(timer)
      task?.cancel()
    }
  }, [page, x, y, w, h, vpW, vpH])
  return <canvas ref={ref} style={{ position: 'absolute', display: 'none', pointerEvents: 'none' }} />
}
