import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { createPoint, db, PHOTO_TYPES, type Photo, type PhotoType } from './db'
import { plural, TYPE_KEYS } from './format'
import { Icon } from './Icon'
import { useProjectFolder } from './pcFolder'
import { usePeople } from './people'
import { PointPanel } from './PointPanel'
import { typeColor } from './typeColor'
import { usePanZoom, type Tap } from './usePanZoom'
import { useObjectUrl } from './useObjectUrl'

// Размер метки на экране (Р-24). Пока лист отдалён или приближен немного, метка маленькая
// и не закрывает план. При сильном приближении растёт, но не больше MARKER_MAX.
const MARKER_MIN = 22
const MARKER_MAX = 34
/** С какого приближения (во сколько раз больше «лист целиком») метка начинает расти. */
const MARKER_GROW_FROM = 2.5

function markerSize(scale: number): number {
  if (scale <= MARKER_GROW_FROM) return MARKER_MIN
  return Math.min(MARKER_MAX, MARKER_MIN * Math.sqrt(scale / MARKER_GROW_FROM))
}

/** Кольцо метки: доли цветов показывают, сколько фото какого типа в точке. */
function ringBackground(photos: Photo[]): string {
  if (!photos.length) return '#c4c9d1'
  let angle = 0
  const stops: string[] = []
  for (const type of TYPE_KEYS) {
    const n = photos.filter(p => p.type === type).length
    if (!n) continue
    const from = angle
    angle += (n / photos.length) * 360
    // маленький зазор между долями, если типов несколько
    const gap = n === photos.length ? 0 : 3
    stops.push(`${typeColor(type)} ${from}deg ${angle - gap}deg`, `transparent ${angle - gap}deg ${angle}deg`)
  }
  return `conic-gradient(${stops.join(',')})`
}

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
  const url = useObjectUrl(image?.blob)

  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [photoType, setPhotoType] = useState<PhotoType>('general')
  const [filter, setFilter] = useState<'all' | PhotoType>('all')
  const [sheetMenuOpen, setSheetMenuOpen] = useState(false)
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

  const { t, zoomBy, handlers } = usePanZoom(viewportRef, content, maxScale, handleTap)

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
        {!selected && (
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
        {adding && (
          <div className="hint-bar">
            <span style={{ flex: 1 }}>Нажмите на план там, где поставить точку</span>
            <button onClick={() => setAdding(false)}>Отмена</button>
          </div>
        )}

        <div
          ref={viewportRef}
          {...handlers}
          style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none', cursor: adding ? 'crosshair' : 'grab' }}
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
              {shownPoints.map(({ p, n }) => {
                // чужая точка: метка бледнее, под ней код автора (Р-38)
                const other = !!people && !people.isMine(p.authorId)
                return (
                <div
                  key={p.id}
                  data-point-id={p.id}
                  className={'marker' + (p.id === selectedId ? ' on' : '') + (other ? ' other' : '')}
                  style={{
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    width: size,
                    height: size,
                    marginLeft: -size / 2,
                    marginTop: -size / 2,
                    // метка не растёт вместе с листом, её размер считает markerSize
                    transform: `scale(${1 / t.s})`,
                    background: ringBackground(photosOf(p.id)),
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

        {!selected && !adding && (
          <>
            <div className="zoom-btns">
              <button className="icon-btn" aria-label="Приблизить" onClick={() => zoomBy(1.5)}>
                <Icon name="plus" />
              </button>
              <button className="icon-btn" aria-label="Отдалить" onClick={() => zoomBy(1 / 1.5)}>
                <Icon name="minus" />
              </button>
            </div>
            <button className="add-point" onClick={() => setAdding(true)}>
              <Icon name="pin" />
              Поставить точку
            </button>
          </>
        )}
      </div>

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
