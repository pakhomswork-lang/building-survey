import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { db, type Photo } from '../db'
import { usePeople } from '../people'
import { markerSize, ringBackground } from '../markers'
import { CLOSE_PX, contourCenter, createRoom, midpoint, rectContour, roomAt, roomColor, roomsOfSheet, roomTitle, updateRoom } from '../rooms'
import { snapPoint, type Snap } from '../roomSnap'
import { useObjectUrl } from '../useObjectUrl'
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { usePdfPage } from './sheetPdf'

// Лист для мыши (Р-40): колесо — приближение к курсору, любая кнопка — тащить лист,
// щелчок по метке — выбрать точку, двойной щелчок — приблизить. Меню браузера не появляется.
// Картинка рисуется в настоящем размере на экране (а не растягивается), чтобы браузер
// сглаживал её как следует при любом приближении.
//
// Помещения (шаг 21, Р-52): в режиме «Помещения» видны все помещения; щелчок — выбрать.
// Рисование — щелчками мыши по углам (прямоугольник или по углам), с привязками (Р-51);
// правка контура — перетаскиванием углов и «+» на серединах стен, правый щелчок по углу — удалить.

interface View {
  x: number
  y: number
  s: number
}

type Pt = [number, number]

/** Сколько можно сдвинуть мышь, чтобы нажатие ещё считалось щелчком. */
const CLICK_MOVE = 4
/** Насколько близко к углу или «+» надо нажать при правке контура. */
const HANDLE_PX = 9

export function PcSheet({
  sheetId,
  match,
  selectedId,
  onSelect,
  roomMode = false,
  roomId = null,
  onRoomSelect = () => {},
  canEditRooms = false,
  editId = null,
  onEditDone = () => {},
}: {
  sheetId: string
  /** Отбор фото: на листе остаются точки, где есть подходящие фото. null — все точки. */
  match: ((photo: Photo) => boolean) | null
  selectedId: string | null
  onSelect: (pointId: string | null) => void
  /** Режим «Помещения»: видны помещения, точки бледные. */
  roomMode?: boolean
  roomId?: string | null
  onRoomSelect?: (roomId: string | null) => void
  /** Может ли этот пользователь рисовать и править помещения (Р-48). */
  canEditRooms?: boolean
  /** Помещение, контур которого сейчас правят. */
  editId?: string | null
  /** Правка контура закончена (сохранили или отменили). */
  onEditDone?: () => void
}) {
  const image = useLiveQuery(() => db.sheetImages.get(sheetId), [sheetId])
  const sheet = useLiveQuery(() => db.sheets.get(sheetId), [sheetId])
  const points = useLiveQuery(async () => (await db.points.where('sheetId').equals(sheetId).sortBy('createdAt')).filter(p => !p.deleted), [sheetId])
  const photos = useLiveQuery(async () => (await db.photos.where('sheetId').equals(sheetId).toArray()).filter(p => !p.deleted), [sheetId])
  const rooms = useLiveQuery(() => roomsOfSheet(sheetId), [sheetId])
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

  const w = image && fit ? image.width * fit * view.s : 0
  const h = image && fit ? image.height * fit * view.s : 0

  // --- помещения: рисование и правка контура ---
  const [drawKind, setDrawKind] = useState<'rect' | 'poly' | null>(null)
  const [draft, setDraft] = useState<Pt[]>([])
  // где курсор на листе (проценты) и держат ли Alt (Alt — без привязок)
  const [cursor, setCursor] = useState<{ p: Pt; alt: boolean } | null>(null)
  const [snapOn, setSnapOn] = useState(() => {
    try {
      return localStorage.getItem('roomSnap') !== 'off'
    } catch {
      return true
    }
  })
  function toggleSnap(on: boolean) {
    setSnapOn(on)
    try {
      localStorage.setItem('roomSnap', on ? 'on' : 'off')
    } catch {
      // не сохранилось — не страшно
    }
  }
  const [editContour, setEditContour] = useState<Pt[]>([])
  // угол, который тащат мышью
  const [dragCorner, setDragCorner] = useState<number | null>(null)
  const drawing = drawKind !== null
  const editing = !!editId

  // начали правку контура — берём углы помещения
  const editRoom = rooms?.find(r => r.id === editId)
  const [editLoadedFor, setEditLoadedFor] = useState<string | null>(null)
  if (editing && editRoom && editLoadedFor !== editId) {
    setEditLoadedFor(editId)
    setEditContour(editRoom.contour)
  }
  if (!editing && editLoadedFor !== null) setEditLoadedFor(null)

  // вышли из режима помещений или сменили лист — рисование сбрасываем
  const [drawFor, setDrawFor] = useState({ sheetId, roomMode })
  if (drawFor.sheetId !== sheetId || drawFor.roomMode !== roomMode) {
    setDrawFor({ sheetId, roomMode })
    setDrawKind(null)
    setDraft([])
  }

  const dist = (a: Pt, b: Pt) => Math.hypot(((a[0] - b[0]) * w) / 100, ((a[1] - b[1]) * h) / 100)
  const aimingNow = drawing || dragCorner !== null
  /** Куда встанет угол, если мышь в точке raw (с привязками, если они включены и не держат Alt). */
  function snapFor(raw: Pt, alt: boolean, corner: number | null = dragCorner): Snap | null {
    if (!snapOn || alt || !rooms || !w) return null
    return snapPoint(raw, {
      kx: w / 100,
      ky: h / 100,
      rooms: editing ? rooms.filter(r => r.id !== editId) : rooms,
      own:
        drawKind === 'poly'
          ? draft
          : corner !== null
            ? [editContour[(corner - 1 + editContour.length) % editContour.length], editContour[(corner + 1) % editContour.length]]
            : [],
    })
  }
  const snap: Snap | null = aimingNow && cursor ? snapFor(cursor.p, cursor.alt) : null
  const target: Pt | null = snap?.p ?? cursor?.p ?? null
  const closeTo = (raw: Pt) => drawKind === 'poly' && draft.length >= 3 && dist(raw, draft[0]) < CLOSE_PX
  const canClose = !!cursor && closeTo(cursor.p)
  const draftRect = drawKind === 'rect' && draft.length === 1 && target ? rectContour(draft[0], target) : null
  const liveContour = dragCorner !== null && target ? editContour.map((p, i) => (i === dragCorner ? target : p)) : editContour
  const editMids = editing && dragCorner === null ? editContour.map((p, i) => midpoint(p, editContour[(i + 1) % editContour.length])) : []

  async function finishRoom(contour: Pt[]) {
    if (!sheet) return
    const room = await createRoom(sheet.projectId, sheet.id, contour)
    setDrawKind(null)
    setDraft([])
    onRoomSelect(room.id)
  }

  /** Щелчок при рисовании: угол встаёт туда, куда щёлкнули (с привязками). */
  async function placeCorner(raw: Pt, alt: boolean) {
    const target = snapFor(raw, alt)?.p ?? raw
    if (drawKind === 'poly') {
      if (closeTo(raw)) return finishRoom(draft)
      if (draft.length && dist(target, draft[draft.length - 1]) < 3) return
      setDraft([...draft, target])
      return
    }
    if (draft.length === 0) {
      setDraft([target])
      return
    }
    if (dist(target, draft[0]) < 6) return
    await finishRoom(rectContour(draft[0], target))
  }

  function startDrawing(kind: 'rect' | 'poly') {
    onRoomSelect(null)
    setDraft([])
    setDrawKind(kind)
  }
  function stopDrawing() {
    setDrawKind(null)
    setDraft([])
  }
  async function saveEdit() {
    if (editId) await updateRoom(editId, { contour: editContour })
    onEditDone()
  }

  // клавиши: Esc — отмена, Backspace — убрать последний угол, Enter — замкнуть контур
  useEffect(() => {
    if (!drawing && !editing) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input, textarea')) return
      if (e.key === 'Escape') {
        if (drawing) stopDrawing()
        else if (dragCorner !== null) setDragCorner(null)
        else onEditDone()
      } else if (e.key === 'Backspace' && drawKind === 'poly') {
        e.preventDefault()
        setDraft(d => d.slice(0, -1))
      } else if (e.key === 'Enter' && drawKind === 'poly' && draft.length >= 3) {
        finishRoom(draft)
      } else if (e.key === 'Enter' && editing && dragCorner === null) {
        saveEdit()
      } else if (e.key === 'Alt') {
        // иначе Windows уводит фокус в меню окна
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /** Положение мыши на листе в процентах. */
  function sheetPos(e: { clientX: number; clientY: number }): Pt | null {
    const el = ref.current
    if (!el || !w) return null
    const r = el.getBoundingClientRect()
    return [((e.clientX - r.left - view.x) / w) * 100, ((e.clientY - r.top - view.y) / h) * 100]
  }
  const clampPt = (p: Pt): Pt => [Math.min(100, Math.max(0, p[0])), Math.min(100, Math.max(0, p[1]))]

  /** Угол или «+» под мышью при правке контура. */
  function handleAt(p: Pt): { corner: number } | { mid: number } | null {
    let best: { corner: number } | { mid: number } | null = null
    let bestD = HANDLE_PX
    editContour.forEach((c, i) => {
      const d = dist(p, c)
      if (d < bestD) {
        best = { corner: i }
        bestD = d
      }
    })
    editMids.forEach((m, i) => {
      const d = dist(p, m)
      if (d < bestD) {
        best = { mid: i }
        bestD = d
      }
    })
    return best
  }

  const drag = useRef<{ id: number; x: number; y: number; startX: number; startY: number; moved: boolean; button: number; target: EventTarget } | null>(null)
  const [dragging, setDragging] = useState(false)

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    // правка контура: нажали на угол или «+» — тащим угол, правой кнопкой по углу — удаляем
    if (editing) {
      const p = sheetPos(e)
      const hit = p && handleAt(p)
      if (hit && 'corner' in hit) {
        if (e.button === 2) {
          if (editContour.length > 3) setEditContour(editContour.filter((_, i) => i !== hit.corner))
          return
        }
        if (e.button === 0) {
          setCursor({ p: clampPt(p), alt: e.altKey })
          setDragCorner(hit.corner)
          return
        }
      }
      if (hit && 'mid' in hit && e.button === 0) {
        const m = editMids[hit.mid]
        setEditContour([...editContour.slice(0, hit.mid + 1), m, ...editContour.slice(hit.mid + 1)])
        setCursor({ p: clampPt(p), alt: e.altKey })
        setDragCorner(hit.mid + 1)
        return
      }
    }
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false, button: e.button, target: e.target }
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (roomMode && (drawing || editing)) {
      const p = sheetPos(e)
      if (p) setCursor({ p: clampPt(p), alt: e.altKey })
    }
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
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    // отпустили угол — он встаёт в притянутую точку
    if (dragCorner !== null) {
      const raw = sheetPos(e)
      if (raw) {
        const p = clampPt(raw)
        const end = snapFor(p, e.altKey)?.p ?? p
        setEditContour(editContour.map((c, i) => (i === dragCorner ? end : c)))
      }
      setDragCorner(null)
      return
    }
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (!d || d.moved || d.button !== 0) return
    if (roomMode) {
      if (drawing) {
        const raw = sheetPos(e)
        if (raw) placeCorner(clampPt(raw), e.altKey)
        return
      }
      if (editing) return
      const p = sheetPos(e)
      onRoomSelect(p && rooms ? (roomAt(p[0], p[1], rooms)?.id ?? null) : null)
      return
    }
    // щелчок левой кнопкой: по метке — выбрать точку, мимо — снять выбор.
    // Смотрим, куда нажали: после захвата мыши отпускание приходит самому листу
    const hit = (d.target as HTMLElement).closest?.('[data-point-id]')
    onSelect(hit?.getAttribute('data-point-id') ?? null)
  }
  function onPointerCancel() {
    drag.current = null
    setDragging(false)
    setDragCorner(null)
  }
  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (drawing || editing) return
    if ((e.target as HTMLElement).closest('[data-point-id]')) return
    const r = e.currentTarget.getBoundingClientRect()
    zoomAt(2, e.clientX - r.left, e.clientY - r.top)
  }

  const photosOf = (pointId: string): Photo[] => photos?.filter(p => p.pointId === pointId) ?? []
  const shown = (points ?? [])
    .map((p, i) => ({ p, n: i + 1 }))
    .filter(({ p }) => !match || p.id === selectedId || photosOf(p.id).some(match))
  const size = markerSize(view.s)
  const pts = (c: Pt[]) => c.map(([x, y]) => `${x},${y}`).join(' ')

  const hint = editing
    ? 'Тащите угол мышью · «+» — добавить угол · правый щелчок по углу — удалить · Enter — сохранить · Esc — отмена'
    : drawKind === 'rect'
      ? draft.length === 0
        ? 'Щёлкните в первый угол'
        : 'Щёлкните в противоположный угол · Esc — отмена'
      : drawKind === 'poly'
        ? draft.length < 3
          ? `Углов: ${draft.length}. Щёлкайте по углам · Backspace — убрать угол · Esc — отмена`
          : `Углов: ${draft.length}. Щёлкните по первому углу или Enter — замкнуть · Backspace — убрать угол`
        : null

  return (
    <div
      ref={ref}
      className={'pc-sheet' + (dragging ? ' dragging' : '') + (drawing ? ' drawing' : '')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => dragCorner === null && setCursor(null)}
      onDoubleClick={onDoubleClick}
      onContextMenu={e => e.preventDefault()}
    >
      {image === null && <p className="pc-muted pc-center">Картинка листа ещё не пришла с сервера.</p>}
      {url && fit && (
        <div style={{ position: 'absolute', left: view.x, top: view.y, width: w, height: h, background: '#fff' }}>
          <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block' }} />
          {pdf && vp && <PdfLayer page={pdf} x={view.x} y={view.y} w={w} h={h} vpW={vp.w} vpH={vp.h} />}
          {roomMode && (
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
            >
              {rooms?.map((r, i) => (
                <polygon
                  key={r.id}
                  points={pts(r.id === editId ? liveContour : r.contour)}
                  fill={roomColor(i)}
                  fillOpacity={r.id === roomId || r.id === editId ? 0.3 : 0.12}
                  stroke={roomColor(i)}
                  strokeWidth={r.id === roomId || r.id === editId ? 1 : 0.6}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
              ))}
              {drawKind === 'poly' && draft.length > 0 && target && (
                <>
                  {draft.length >= 2 && <polygon points={pts([...draft, target])} fill="#14171c" fillOpacity={0.06} stroke="none" />}
                  <polyline
                    points={pts([...draft, canClose ? draft[0] : target])}
                    fill="none"
                    stroke="#14171c"
                    strokeWidth={0.6}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                  />
                </>
              )}
              {draftRect && (
                <polygon points={pts(draftRect)} fill="#14171c" fillOpacity={0.08} stroke="#14171c" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
              )}
              {!canClose &&
                snap?.guides.map(([a, b], i) => (
                  <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#2f9e44" strokeWidth={0.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                ))}
            </svg>
          )}
          {roomMode && aimingNow && !canClose && snap && snap.kind !== 'none' && (
            <div className={'room-snap ' + snap.kind} style={{ left: `${snap.p[0]}%`, top: `${snap.p[1]}%`, transform: 'translate(-50%, -50%)' }} />
          )}
          {drawKind === 'poly' &&
            draft.map(([x, y], i) => (
              <div
                key={i}
                className={'room-corner' + (i === 0 && canClose ? ' close' : '')}
                style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
              />
            ))}
          {editing &&
            editContour.map(([x, y], i) =>
              i === dragCorner ? null : (
                <div key={'c' + i} className="room-corner edit" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }} />
              ),
            )}
          {editMids.map(([x, y], i) => (
            <div key={'m' + i} className="room-mid" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}>
              +
            </div>
          ))}
          {roomMode &&
            rooms?.map((r, i) => {
              const [cx, cy] = contourCenter(r.id === editId ? liveContour : r.contour)
              return (
                <div
                  key={r.id}
                  className="room-label"
                  style={{
                    position: 'absolute',
                    left: `${cx}%`,
                    top: `${cy}%`,
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                    color: roomColor(i),
                    fontWeight: 700,
                    fontSize: 15,
                    whiteSpace: 'nowrap',
                    textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff',
                  }}
                >
                  {roomTitle(r)}
                </div>
              )
            })}
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
                  // в режиме «Помещения» точки бледные и не нажимаются
                  ...(roomMode ? { opacity: 0.35, pointerEvents: 'none' as const } : null),
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

      {/* панель помещений над листом */}
      {roomMode && canEditRooms && (
        <div className="pc-room-bar" onPointerDown={e => e.stopPropagation()}>
          {!drawing && !editing && (
            <>
              <button className="pc-btn" onClick={() => startDrawing('rect')}>
                Прямоугольник
              </button>
              <button className="pc-btn" onClick={() => startDrawing('poly')}>
                По углам
              </button>
            </>
          )}
          {(drawing || editing) && (
            <>
              <span className="pc-room-hint">{hint}</span>
              <label className="pc-snap" title="Притягивать к углам и стенам соседних помещений и выравнивать по горизонтали и вертикали. Пока держите Alt — без привязок.">
                <input type="checkbox" checked={snapOn} onChange={e => toggleSnap(e.target.checked)} />
                Привязки
              </label>
              {drawKind === 'poly' && draft.length >= 3 && (
                <button className="pc-btn" onClick={() => finishRoom(draft)}>
                  Готово
                </button>
              )}
              {editing && (
                <button className="pc-btn primary" onClick={saveEdit}>
                  Сохранить контур
                </button>
              )}
              <button className="pc-btn" onClick={drawing ? stopDrawing : onEditDone}>
                Отмена
              </button>
            </>
          )}
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
