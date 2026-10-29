import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db, deletePhoto, PHOTO_TYPES, setPhotoType, type Photo, type PhotoType } from './db'
import { usePanZoom } from './usePanZoom'
import { useObjectUrl } from './useObjectUrl'

/** Фото на весь экран с приближением пальцами. При смене фото масштаб сбрасывается (новый key). */
function ZoomImage({ fileName }: { fileName: string }) {
  const blob = useLiveQuery(async () => (await db.photoFiles.get(fileName))?.blob, [fileName])
  const url = useObjectUrl(blob)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => setVp({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fit = vp && natural ? Math.min(vp.w / natural.w, vp.h / natural.h) : null
  const content = fit && natural ? { w: natural.w * fit, h: natural.h * fit } : null
  // приближать до 2 пикселей экрана на пиксель фото
  const maxScale = fit ? Math.max(3, 2 / fit) : 3
  const { t, handlers } = usePanZoom(viewportRef, content, maxScale, () => {})

  return (
    <div ref={viewportRef} {...handlers} style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none' }}>
      {url && (
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: content?.w,
            height: content?.h,
            visibility: content ? 'visible' : 'hidden',
            transformOrigin: '0 0',
            transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      )}
    </div>
  )
}

export function PhotoView({
  photos,
  photoId,
  onChange,
  onClose,
  caption,
}: {
  /** Фото, между которыми листаем (уже отфильтрованные по вкладке). */
  photos: Photo[]
  photoId: string
  onChange: (photoId: string) => void
  onClose: () => void
  /** Подпись «где снято», например «План 1 этажа · точка 3». */
  caption?: (photo: Photo) => string
}) {
  const index = photos.findIndex(p => p.id === photoId)
  const photo = index >= 0 ? photos[index] : null

  // фото пропало из списка (сменили тип на другую вкладку) — закрываем просмотр
  useEffect(() => {
    if (!photo) onClose()
  }, [photo, onClose])
  if (!photo) return null

  const prev = index > 0 ? photos[index - 1] : null
  const next = index < photos.length - 1 ? photos[index + 1] : null

  async function remove() {
    if (!photo || !confirm('Удалить это фото из приложения?\n\nЕсли оно уже сохранено в папку телефона, там оно останется.')) return
    const neighbour = next ?? prev
    await deletePhoto(photo.id)
    if (neighbour) onChange(neighbour.id)
    else onClose()
  }

  const navBtn = {
    position: 'absolute' as const,
    top: '50%',
    marginTop: -28,
    width: 44,
    height: 56,
    border: 0,
    borderRadius: 8,
    background: 'rgba(0,0,0,.4)',
    color: '#fff',
    fontSize: 28,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 6, background: '#000', color: '#fff' }}>
      <ZoomImage key={photo.fileName} fileName={photo.fileName} />

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(0,0,0,.5)' }}>
        <button className="btn-link" style={{ color: '#fff' }} onClick={onClose}>←</button>
        <span style={{ flex: 1, fontSize: 14 }}>
          {index + 1} из {photos.length}
          {caption && ` · ${caption(photo)}`}
        </span>
        <button className="btn-link danger" onClick={remove}>Удалить</button>
      </div>

      {prev && <button aria-label="Предыдущее" style={{ ...navBtn, left: 8 }} onClick={() => onChange(prev.id)}>‹</button>}
      {next && <button aria-label="Следующее" style={{ ...navBtn, right: 8 }} onClick={() => onChange(next.id)}>›</button>}

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 12px 16px', background: 'rgba(0,0,0,.5)', fontSize: 13 }}>
        <label>
          Тип:{' '}
          <select
            value={photo.type}
            onChange={e => setPhotoType(photo.id, e.target.value as PhotoType)}
            style={{ fontSize: 15, padding: 4 }}
          >
            {(Object.entries(PHOTO_TYPES) as [PhotoType, string][]).map(([type, label]) => (
              <option key={type} value={type}>{label}</option>
            ))}
          </select>
        </label>
        <div style={{ marginTop: 6, opacity: 0.8 }}>
          {photo.fileName} · {new Date(photo.takenAt).toLocaleString('ru-RU')}
        </div>
      </div>
    </div>
  )
}
