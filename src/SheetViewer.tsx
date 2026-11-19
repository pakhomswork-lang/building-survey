import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPoint, db, getMyIds, PHOTO_TYPES, type PhotoType, type Room } from './db'
import { plural, TYPE_KEYS } from './format'
import { Icon } from './Icon'
import { useProjectFolder } from './pcFolder'
import { usePeople } from './people'
import { PointPanel } from './PointPanel'
import { RoomPanel } from './RoomPanel'
import { canEditRooms, contourCenter, createRoom, roomAt, roomColor, roomsOfSheet, roomTitle, updateRoom } from './rooms'
import { snapPoint } from './roomSnap'
import { markerSize, ringBackground } from './markers'
import { typeColor } from './typeColor'
import { usePanZoom, type Tap } from './usePanZoom'
import { useObjectUrl } from './useObjectUrl'

export function SheetViewer({ sheetId, onBack }: { sheetId: string; onBack: () => void }) {
  const sheet = useLiveQuery(async () => (await db.sheets.get(sheetId)) ?? null, [sheetId])
  const project = useLiveQuery(async () => (sheet ? await db.projects.get(sheet.projectId) : undefined), [sheet?.projectId])
  // на компьютере фото точек берём из папки с фото объекта (Р-39)
  useProjectFolder(sheet?.projectId ?? '')
  const sheets = useLiveQuery(async () => {
    if (!sheet) return []
    const all = await db.sheets.where('projectId').equals(sheet.projectId).sortBy('order')
    return all.filter(s => !s.deleted)
  }, [sheet?.projectId])
  const image = useLiveQuery(() => db.sheetImages.get(sheetId), [sheetId])
  const points = useLiveQuery(async () => {
    const all = await db.points.where('sheetId').equals(sheetId).sortBy('createdAt')
    return all.filter(p => !p.deleted)
  }, [sheetId])
  const photos = useLiveQuery(async () => {
    const all = await db.photos.where('sheetId').equals(sheetId).toArray()
    return all.filter(p => !p.deleted)
  }, [sheetId])
  const rooms = useLiveQuery(() => roomsOfSheet(sheetId), [sheetId])
  const myIds = useLiveQuery(() => getMyIds(), [])
  const mayEditRooms = canEditRooms(project, myIds)
  const url = useObjectUrl(image?.blob)

  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [photoType, setPhotoType] = useState<PhotoType>('general')
  const [filter, setFilter] = useState<'all' | PhotoType>('all')
  const [sheetMenuOpen, setSheetMenuOpen] = useState(false)
  // режим «Помещения» (Р-46, Р-49): видны все помещения; рисование прицелом в центре экрана
  const [roomMode, setRoomMode] = useState(false)
  // что рисуем: прямоугольник по двум углам или помещение по углам (любая форма)
  const [drawKind, setDrawKind] = useState<'rect' | 'poly' | null>(null)
  const drawing = drawKind !== null
  const [draft, setDraft] = useState<[number, number][]>([])
  const [roomId, setRoomId] = useState<string | null>(null)
  // правка контура (20г): копия углов; выбранный угол едет за прицелом, пока его не поставят
  const [editId, setEditId] = useState<string | null>(null)
  const [editContour, setEditContour] = useState<[number, number][]>([])
  const [editSel, setEditSel] = useState<number | null>(null)
  const [editBefore, setEditBefore] = useState<[number, number][]>([])
  const editing = editId !== null
  const moving = editSel !== null
  // прицел в центре нужен при рисовании и когда двигаем угол
  const aiming = drawing || moving
  // привязки (выравнивания, Р-51) можно выключить галочкой; выбор помнится на этом устройстве
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
  const people = usePeople()

  // размер области под лист: от него зависит, каким лист будет «вписан в экран»
  const viewportRef = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => setVp({ w: el.clientWidth, h: el.clientHeight })
    // меряем сразу и потом при каждом изменении (поворот телефона, выбор точки)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fit = vp && image ? Math.min(vp.w / image.width, vp.h / image.height) : null
  const content = fit && image ? { w: image.width * fit, h: image.height * fit } : null
  // можно приблизить до двойного размера исходной картинки, но не меньше чем в 4 раза
  const maxScale = fit ? Math.max(4, 2 / fit) : 4

  // нажатие по листу обрабатывает handleTap ниже (ему нужны функции, которые появляются после usePanZoom)
  const tapRef = useRef<(tap: Tap) => void>(() => {})
  const { t, zoomBy, centerOn, handlers } = usePanZoom(viewportRef, content, maxScale, tap => tapRef.current(tap), drawing || editing)

  // где на листе сейчас прицел (середина экрана), в процентах листа
  const rawAim: [number, number] | null =
    vp && content
      ? [
          Math.min(100, Math.max(0, ((vp.w / 2 - t.x) / t.s / content.w) * 100)),
          Math.min(100, Math.max(0, ((vp.h / 2 - t.y) / t.s / content.h) * 100)),
        ]
      : null
  // выравнивания (шаг 20в): угол встанет в притянутую точку рядом с прицелом
  const snap =
    aiming && snapOn && rawAim && content && rooms
      ? snapPoint(rawAim, {
          kx: (content.w * t.s) / 100,
          ky: (content.h * t.s) / 100,
          // само правимое помещение к себе не притягиваем
          rooms: editing ? rooms.filter(r => r.id !== editId) : rooms,
          // свои углы: при рисовании — поставленные, при правке — соседние с двигаемым
          own:
            drawKind === 'poly'
              ? draft
              : editSel !== null
                ? [editContour[(editSel - 1 + editContour.length) % editContour.length], editContour[(editSel + 1) % editContour.length]]
                : [],
        })
      : null
  const aim = snap?.p ?? rawAim
  // прямоугольник, который сейчас рисуется: от первого угла до прицела
  const draftRect = drawKind === 'rect' && draft.length === 1 && aim ? rectContour(draft[0], aim) : null
  const tooSmall = !!draftRect && !!aim && (Math.abs(aim[0] - draft[0][0]) < 0.5 || Math.abs(aim[1] - draft[0][1]) < 0.5)

  // расстояние между точками листа в пикселях экрана (при текущем приближении)
  const screenDist = (a: [number, number], b: [number, number]) =>
    content ? Math.hypot(((a[0] - b[0]) / 100) * content.w * t.s, ((a[1] - b[1]) / 100) * content.h * t.s) : Infinity
  // по углам: прицел рядом с первым углом — следующее нажатие замкнёт контур
  const canClose = drawKind === 'poly' && draft.length >= 3 && !!rawAim && screenDist(rawAim, draft[0]) < CLOSE_PX
  // прицел на последнем угле — второй угол туда же не ставим
  const onLastCorner = drawKind === 'poly' && draft.length > 0 && !!aim && screenDist(aim, draft[draft.length - 1]) < 4

  // --- правка контура (20г) ---
  // контур с выбранным углом под прицелом
  const liveContour = moving && aim ? editContour.map((p, i) => (i === editSel ? aim : p)) : editContour
  const editMids = editing && !moving ? editContour.map((p, i) => midpoint(p, editContour[(i + 1) % editContour.length])) : []

  function startEdit(room: Room) {
    setRoomId(null)
    setEditId(room.id)
    setEditContour(room.contour)
    setEditSel(null)
  }

  /** Нажатие при правке: угол — выбрать его, «+» на середине стены — добавить там угол. */
  function pickEditHandle(px: number, py: number) {
    const near = (list: [number, number][]) => {
      let best = -1
      let bestD = HANDLE_PX
      list.forEach((p, i) => {
        const d = screenDist([px, py], p)
        if (d < bestD) {
          best = i
          bestD = d
        }
      })
      return best
    }
    const corner = near(editContour)
    if (corner >= 0) {
      setEditBefore(editContour)
      setEditSel(corner)
      centerOn(editContour[corner][0], editContour[corner][1])
      return
    }
    const mid = near(editMids)
    if (mid >= 0) {
      const m = editMids[mid]
      setEditBefore(editContour)
      setEditContour([...editContour.slice(0, mid + 1), m, ...editContour.slice(mid + 1)])
      setEditSel(mid + 1)
      centerOn(m[0], m[1])
    }
  }

  function placeEditCorner() {
    setEditContour(liveContour)
    setEditSel(null)
  }

  function removeEditCorner() {
    if (editSel === null || editContour.length <= 3) return
    setEditContour(editContour.filter((_, i) => i !== editSel))
    setEditSel(null)
  }

  function stopEdit() {
    setEditId(null)
    setEditSel(null)
    setEditContour([])
  }

  async function saveEdit() {
    const id = editId
    if (id) await updateRoom(id, { contour: editContour })
    stopEdit()
    setRoomId(id)
  }

  async function handleTap(tap: Tap) {
    if (roomMode) {
      // правка контура: нажатие выбирает угол или «+» на середине стены
      if (editing) {
        if (!moving) pickEditHandle(tap.px, tap.py)
        return
      }
      // при рисовании угол ставится кнопкой, нажатие по листу ничего не делает
      if (drawing || !rooms) return
      setRoomId(roomAt(tap.px, tap.py, rooms)?.id ?? null)
      return
    }
    if (adding) {
      if (!sheet || tap.px < 0 || tap.px > 100 || tap.py < 0 || tap.py > 100) return
      const point = await createPoint(sheet.projectId, sheet.id, tap.px, tap.py)
      setAdding(false)
      setSelectedId(point.id)
      return
    }
    // нажатие мимо меток закрывает точку и возвращает к обходу
    const hit = (tap.target as HTMLElement | null)?.closest?.('[data-point-id]')
    setSelectedId(hit?.getAttribute('data-point-id') ?? null)
  }
  useEffect(() => {
    tapRef.current = handleTap
  })

  async function finishRoom(contour: [number, number][]) {
    if (!sheet) return
    const room = await createRoom(sheet.projectId, sheet.id, contour)
    setDrawKind(null)
    setDraft([])
    setRoomId(room.id)
  }

  async function placeCorner() {
    if (!aim || !sheet) return
    if (drawKind === 'poly') {
      if (canClose) return finishRoom(draft)
      if (onLastCorner) return
      setDraft([...draft, aim])
      return
    }
    if (draft.length === 0) {
      setDraft([aim])
      return
    }
    if (tooSmall) return
    await finishRoom(rectContour(draft[0], aim))
  }

  function startDrawing(kind: 'rect' | 'poly') {
    setRoomId(null)
    setDraft([])
    setDrawKind(kind)
  }

  function stopDrawing() {
    setDrawKind(null)
    setDraft([])
  }

  // подсказка и надпись на большой кнопке
  const drawHint =
    drawKind === 'rect'
      ? draft.length === 0
        ? 'Двигайте лист: наведите прицел на первый угол'
        : 'Наведите прицел на противоположный угол'
      : draft.length === 0
        ? 'Двигайте лист: наведите прицел на первый угол'
        : draft.length < 3
          ? `Углов: ${draft.length}. Наведите на следующий`
          : `Углов: ${draft.length}. Замкнуть — навести на первый`
  const placeLabel =
    drawKind === 'rect'
      ? draft.length === 0
        ? 'Поставить первый угол'
        : tooSmall
          ? 'Слишком маленькое'
          : 'Поставить второй угол'
      : canClose
        ? 'Замкнуть контур'
        : `Поставить угол ${draft.length + 1}`

  const openRoomIndex = rooms?.findIndex(r => r.id === roomId) ?? -1
  const openRoom = openRoomIndex >= 0 ? rooms![openRoomIndex] : null

  const selectedIndex = points?.findIndex(p => p.id === selectedId) ?? -1
  const selected = selectedIndex >= 0 ? points![selectedIndex] : null

  const photosOf = (pointId: string) => photos?.filter(p => p.pointId === pointId) ?? []
  const typeCounts = TYPE_KEYS.map(type => ({ type, count: photos?.filter(p => p.type === type).length ?? 0 }))
  // фильтр по типу: на плане остаются только точки, где есть фото этого типа
  const shownPoints = (points ?? []).map((p, i) => ({ p, n: i + 1 })).filter(
    ({ p }) => filter === 'all' || p.id === selectedId || photosOf(p.id).some(ph => ph.type === filter),
  )
  const size = markerSize(t.s)

  if (sheet === null) {
    return (
      <main className="screen">
        <button className="btn-link" onClick={onBack}>← Назад</button>
        <p className="muted">Лист не найден.</p>
      </main>
    )
  }

  return (
    <div className={'sheet-screen' + (selected ? ' has-point' : '')}>
      <header className="sheet-head">
        <div className="row">
          <button className="icon-btn" aria-label="Назад" onClick={onBack}>
            <Icon name="back" />
          </button>
          <button
            className="title"
            aria-label="Выбрать другой лист"
            style={{ border: 0, background: 'none', textAlign: 'left', color: 'inherit', cursor: 'pointer' }}
            onClick={() => setSheetMenuOpen(o => !o)}
          >
            <b style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 'inherit', color: 'inherit', lineHeight: 'inherit' }}>{sheet?.name}</span>
              {(sheets?.length ?? 0) > 1 && <Icon name="down" size={16} />}
            </b>
            <span>
              {plural(points?.length ?? 0, 'точка', 'точки', 'точек')}, {photos?.length ?? 0} фото. {project?.name}
            </span>
          </button>
        </div>
        {!selected && !roomMode && (
          <div className="chips">
            <button className={'chip' + (filter === 'all' ? ' on' : '')} onClick={() => setFilter('all')}>
              Все <em>{photos?.length ?? 0}</em>
            </button>
            {typeCounts.map(({ type, count }) => (
              <button key={type} className={'chip' + (filter === type ? ' on' : '')} onClick={() => setFilter(type)}>
                <i className="type-dot" style={{ background: typeColor(type) }} />
                {PHOTO_TYPES[type]}
                <em>{count}</em>
              </button>
            ))}
          </div>
        )}
      </header>

      {sheetMenuOpen && (sheets?.length ?? 0) > 1 && (
        <>
          <div className="menu-scrim" onClick={() => setSheetMenuOpen(false)} />
          <div className="type-menu" style={{ top: 52, left: 48, right: 'auto', bottom: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
            {sheets!.map(s => (
              <button
                key={s.id}
                className={s.id === sheetId ? 'on' : ''}
                onClick={() => {
                  setSheetMenuOpen(false)
                  // заменяем адрес, чтобы «Назад» вёл к объекту, а не к прошлому листу
                  if (s.id !== sheetId) location.replace(`#/sheet/${s.id}`)
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </>
      )}

      {/* подсказка и кнопки лежат поверх листа, чтобы не менять его размер и не сбрасывать приближение */}
      <div className="plan-area">
        {roomMode && (
          <div className="hint-bar">
            <span style={{ flex: 1 }}>
              {editing
                ? moving
                  ? 'Двигайте лист: угол едет за прицелом'
                  : 'Нажмите на угол, чтобы передвинуть, или на «+», чтобы добавить угол'
                : !drawing
                  ? `Помещения: ${rooms?.length ?? 0}` + (rooms?.length ? '. Нажмите на помещение, чтобы открыть' : '')
                  : drawHint}
            </span>
            {drawKind === 'poly' && draft.length >= 3 && <button onClick={() => finishRoom(draft)}>Готово</button>}
            {editing ? (
              <button
                onClick={() => {
                  if (moving) {
                    // отменить перемещение этого угла
                    setEditContour(editBefore)
                    setEditSel(null)
                  } else stopEdit()
                }}
              >
                Отмена
              </button>
            ) : drawing ? (
              <button onClick={stopDrawing}>Отмена</button>
            ) : (
              <button onClick={() => setRoomMode(false)}>Выйти</button>
            )}
          </div>
        )}
        {adding && (
          <div className="hint-bar">
            <span style={{ flex: 1 }}>Нажмите на план там, где поставить точку</span>
            <button onClick={() => setAdding(false)}>Отмена</button>
          </div>
        )}

        <div
          ref={viewportRef}
          {...handlers}
          style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none', cursor: adding ? 'crosshair' : 'grab', background: drawing || editing ? '#e9ecef' : undefined }}
        >
          {content && url && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: content.w,
                height: content.h,
                transformOrigin: '0 0',
                transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`,
                background: '#fff',
              }}
            >
              <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none', userSelect: 'none' }} />
              {/* помещения видны только в режиме «Помещения», чтобы не мешать съёмке (Р-49) */}
              {roomMode && (
                <svg
                  className="room-layer"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
                >
                  {rooms?.map((r, i) => (
                    <polygon
                      key={r.id}
                      data-room-id={r.id}
                      points={(r.id === editId ? liveContour : r.contour).map(([x, y]) => `${x},${y}`).join(' ')}
                      fill={roomColor(i)}
                      fillOpacity={r.id === roomId || r.id === editId ? 0.3 : 0.12}
                      stroke={roomColor(i)}
                      strokeWidth={r.id === roomId || r.id === editId ? 1 : 0.6}
                      vectorEffect="non-scaling-stroke"
                      strokeLinejoin="round"
                    />
                  ))}
                  {drawKind === 'poly' && draft.length > 0 && aim && (
                    <>
                      {draft.length >= 2 && (
                        <polygon
                          points={[...draft, aim].map(([x, y]) => `${x},${y}`).join(' ')}
                          fill="#14171c"
                          fillOpacity={0.06}
                          stroke="none"
                        />
                      )}
                      <polyline
                        points={[...draft, canClose ? draft[0] : aim].map(([x, y]) => `${x},${y}`).join(' ')}
                        fill="none"
                        stroke="#14171c"
                        strokeWidth={0.6}
                        vectorEffect="non-scaling-stroke"
                        strokeLinejoin="round"
                      />
                    </>
                  )}
                  {draftRect && (
                    <polygon
                      points={draftRect.map(([x, y]) => `${x},${y}`).join(' ')}
                      fill="#14171c"
                      fillOpacity={0.08}
                      stroke="#14171c"
                      strokeWidth={0.6}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {/* направляющие выравнивания: от угла, с которым выровняли, до точки */}
                  {!canClose &&
                    snap?.guides.map(([a, b], i) => (
                      <line
                        key={i}
                        x1={a[0]}
                        y1={a[1]}
                        x2={b[0]}
                        y2={b[1]}
                        stroke="#2f9e44"
                        strokeWidth={0.5}
                        strokeDasharray="3 3"
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                </svg>
              )}
              {/* куда встанет угол, если он притянут к соседнему углу, стене или оси */}
              {aiming && !canClose && snap && snap.kind !== 'none' && (
                <div
                  className={'room-snap ' + snap.kind}
                  style={{ left: `${snap.p[0]}%`, top: `${snap.p[1]}%`, transform: `translate(-50%, -50%) scale(${1 / t.s})` }}
                />
              )}
              {drawKind === 'poly' &&
                draft.map(([x, y], i) => (
                  <div
                    key={i}
                    className={'room-corner' + (i === 0 && canClose ? ' close' : '')}
                    style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) scale(${1 / t.s})` }}
                  />
                ))}
              {/* правка контура: углы и «+» на серединах стен */}
              {editing &&
                editContour.map(([x, y], i) =>
                  i === editSel ? null : (
                    <div
                      key={'c' + i}
                      className="room-corner edit"
                      style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) scale(${1 / t.s})` }}
                    />
                  ),
                )}
              {editMids.map(([x, y], i) => (
                <div
                  key={'m' + i}
                  className="room-mid"
                  style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) scale(${1 / t.s})` }}
                >
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
                        transform: `translate(-50%, -50%) scale(${1 / t.s})`,
                        pointerEvents: 'none',
                        color: roomColor(i),
                        fontWeight: 700,
                        fontSize: 17,
                        whiteSpace: 'nowrap',
                        textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff',
                      }}
                    >
                      {roomTitle(r)}
                    </div>
                  )
                })}
              {shownPoints.map(({ p, n }) => {
                // чужая точка: метка бледнее, под ней код автора (Р-38)
                const other = !!people && !people.isMine(p.authorId)
                return (
                <div
                  key={p.id}
                  data-point-id={p.id}
                  className={'marker' + (p.id === selectedId ? ' on' : '') + (other ? ' other' : '')}
                  style={{
                    // в режиме «Помещения» точки бледные и не нажимаются
                    ...(roomMode ? { opacity: 0.35, pointerEvents: 'none' as const } : null),
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    width: size,
                    height: size,
                    marginLeft: -size / 2,
                    marginTop: -size / 2,
                    // метка не растёт вместе с листом, её размер считает markerSize
                    transform: `scale(${1 / t.s})`,
                    ...({ '--ring': ringBackground(photosOf(p.id)) } as CSSProperties),
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
        </div>

        {/* прицел в центре экрана (Р-49) */}
        {aiming && (
          <div className="room-aim" aria-hidden="true">
            <i />
            <i />
          </div>
        )}

        {!selected && !adding && (
          <>
            {!roomMode && (mayEditRooms || !!rooms?.length) && (
              <button className="chip room-mode-btn" onClick={() => setRoomMode(true)}>
                Помещения{rooms?.length ? <em>{rooms.length}</em> : null}
              </button>
            )}
            <div className="zoom-btns">
              <button className="icon-btn" aria-label="Приблизить" onClick={() => zoomBy(1.5)}>
                <Icon name="plus" />
              </button>
              <button className="icon-btn" aria-label="Отдалить" onClick={() => zoomBy(1 / 1.5)}>
                <Icon name="minus" />
              </button>
            </div>
            {!roomMode && (
              <button className="add-point" onClick={() => setAdding(true)}>
                <Icon name="pin" />
                Поставить точку
              </button>
            )}
            {roomMode && !drawing && !editing && mayEditRooms && (
              <div className="room-bar">
                <button className="add-point" onClick={() => startDrawing('rect')}>
                  Прямоугольник
                </button>
                <button className="add-point" onClick={() => startDrawing('poly')}>
                  По углам
                </button>
              </div>
            )}
            {aiming && (
              <label className="snap-toggle">
                <input type="checkbox" checked={snapOn} onChange={e => toggleSnap(e.target.checked)} />
                Привязки
              </label>
            )}
            {editing && !moving && (
              <div className="room-bar">
                <button className="add-point" onClick={saveEdit}>
                  <Icon name="check" />
                  Сохранить контур
                </button>
              </div>
            )}
            {moving && (
              <div className="room-bar">
                {editContour.length > 3 && (
                  <button className="add-point light" onClick={removeEditCorner}>
                    Удалить угол
                  </button>
                )}
                <button className="add-point" onClick={placeEditCorner}>
                  <Icon name="check" />
                  Поставить угол
                </button>
              </div>
            )}
            {drawing && (
              <div className="room-bar">
                {drawKind === 'poly' && draft.length > 0 && (
                  <button className="add-point light" onClick={() => setDraft(draft.slice(0, -1))}>
                    Отменить угол
                  </button>
                )}
                <button
                  className="add-point"
                  onClick={placeCorner}
                  disabled={tooSmall || onLastCorner}
                  style={tooSmall || onLastCorner ? { opacity: 0.5 } : undefined}
                >
                  <Icon name="check" />
                  {placeLabel}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {openRoom && (
        <RoomPanel
          key={openRoom.id}
          room={openRoom}
          color={roomColor(openRoomIndex)}
          canEdit={mayEditRooms}
          onClose={() => setRoomId(null)}
          onEditContour={() => startEdit(openRoom)}
        />
      )}

      {selected && (
        <PointPanel
          point={selected}
          number={selectedIndex + 1}
          photoType={photoType}
          onPhotoTypeChange={setPhotoType}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

/** Насколько близко (в пикселях экрана) прицел к первому углу, чтобы замкнуть контур. */
const CLOSE_PX = 16
/** Насколько близко надо нажать к углу или «+», чтобы выбрать его при правке контура. */
const HANDLE_PX = 24

const midpoint = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

/** Прямоугольник по двум противоположным углам, стороны параллельны краям листа. */
function rectContour(a: [number, number], b: [number, number]): [number, number][] {
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
