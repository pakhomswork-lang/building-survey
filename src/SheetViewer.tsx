import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPoint, db, getMyIds, PHOTO_TYPES, type PhotoType } from './db'
import { plural, TYPE_KEYS } from './format'
import { Icon } from './Icon'
import { useProjectFolder } from './pcFolder'
import { usePeople } from './people'
import { PointPanel } from './PointPanel'
import { RoomPanel } from './RoomPanel'
import { canEditRooms, contourCenter, createRoom, roomAt, roomColor, roomsOfSheet, roomTitle } from './rooms'
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
  const [drawing, setDrawing] = useState(false)
  const [draft, setDraft] = useState<[number, number][]>([])
  const [roomId, setRoomId] = useState<string | null>(null)
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

  async function handleTap(tap: Tap) {
    if (roomMode) {
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

  const { t, zoomBy, handlers } = usePanZoom(viewportRef, content, maxScale, handleTap, drawing)

  // где на листе сейчас прицел (середина экрана), в процентах листа
  const aim: [number, number] | null =
    vp && content
      ? [
          Math.min(100, Math.max(0, ((vp.w / 2 - t.x) / t.s / content.w) * 100)),
          Math.min(100, Math.max(0, ((vp.h / 2 - t.y) / t.s / content.h) * 100)),
        ]
      : null
  // прямоугольник, который сейчас рисуется: от первого угла до прицела
  const draftRect = drawing && draft.length === 1 && aim ? rectContour(draft[0], aim) : null
  const tooSmall = !!draftRect && !!aim && (Math.abs(aim[0] - draft[0][0]) < 0.5 || Math.abs(aim[1] - draft[0][1]) < 0.5)

  async function placeCorner() {
    if (!aim || !sheet) return
    if (draft.length === 0) {
      setDraft([aim])
      return
    }
    if (tooSmall) return
    const room = await createRoom(sheet.projectId, sheet.id, rectContour(draft[0], aim))
    setDrawing(false)
    setDraft([])
    setRoomId(room.id)
  }

  function stopDrawing() {
    setDrawing(false)
    setDraft([])
  }

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
              {!drawing
                ? `Помещения: ${rooms?.length ?? 0}` + (rooms?.length ? '. Нажмите на помещение, чтобы открыть' : '')
                : draft.length === 0
                  ? 'Двигайте лист: наведите прицел на первый угол'
                  : 'Наведите прицел на противоположный угол'}
            </span>
            {drawing ? (
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
          style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none', cursor: adding ? 'crosshair' : 'grab', background: drawing ? '#e9ecef' : undefined }}
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
                      points={r.contour.map(([x, y]) => `${x},${y}`).join(' ')}
                      fill={roomColor(i)}
                      fillOpacity={r.id === roomId ? 0.3 : 0.12}
                      stroke={roomColor(i)}
                      strokeWidth={r.id === roomId ? 1.5 : 1}
                      vectorEffect="non-scaling-stroke"
                      strokeLinejoin="round"
                    />
                  ))}
                  {draftRect && (
                    <polygon
                      points={draftRect.map(([x, y]) => `${x},${y}`).join(' ')}
                      fill="#14171c"
                      fillOpacity={0.08}
                      stroke="#14171c"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>
              )}
              {roomMode &&
                rooms?.map((r, i) => {
                  const [cx, cy] = contourCenter(r.contour)
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
                        fontSize: 14,
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
        {drawing && (
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
            {roomMode && !drawing && mayEditRooms && (
              <button
                className="add-point"
                onClick={() => {
                  setRoomId(null)
                  setDrawing(true)
                }}
              >
                <Icon name="plus" />
                Нарисовать прямоугольник
              </button>
            )}
            {drawing && (
              <button className="add-point" onClick={placeCorner} disabled={tooSmall} style={tooSmall ? { opacity: 0.5 } : undefined}>
                <Icon name="check" />
                {draft.length === 0 ? 'Поставить первый угол' : tooSmall ? 'Слишком маленькое' : 'Поставить второй угол'}
              </button>
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
