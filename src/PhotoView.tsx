import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db, deletePhoto, PHOTO_TYPES, setPhotoType, type Photo, type PhotoType } from './db'
import { Icon } from './Icon'
import { typeColor } from './typeColor'
import { usePanZoom } from './usePanZoom'
import { useObjectUrl } from './useObjectUrl'

/** Фото на весь экран с приближением пальцами. При смене фото масштаб сбрасывается (новый key). */
function ZoomImage({ fileName }: { fileName: string }) {
  // null — файла нет в этом телефоне (фото снято на другом устройстве, Р-13)
  const blob = useLiveQuery(async () => (await db.photoFiles.get(fileName))?.blob ?? null, [fileName])
  const url = useObjectUrl(blob ?? undefined)
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
      {blob === null && (
        <p style={{ position: 'absolute', top: '45%', left: 24, right: 24, textAlign: 'center', color: '#fff', opacity: 0.8 }}>
          Фото снято на другом устройстве и хранится там.
          <br />
          {fileName}
        </p>
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
  /** Фото, между которыми листаем (уже отфильтрованные). */
  photos: Photo[]
  photoId: string
  onChange: (photoId: string) => void
  onClose: () => void
  /** Подпись «где снято», например «План 1 этажа, точка 3». */
  caption?: (photo: Photo) => string
}) {
  const index = photos.findIndex(p => p.id === photoId)
  const photo = index >= 0 ? photos[index] : null

  // фото пропало из списка (удалили или сменили тип при отборе по типу) — закрываем просмотр
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

  return (
    <div className="dark-screen">
      <ZoomImage key={photo.fileName} fileName={photo.fileName} />

      <div className="dark-top">
        <button className="icon-btn" aria-label="Закрыть" onClick={onClose}>
          <Icon name="back" />
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 14, opacity: 0.8 }}>
          {index + 1} из {photos.length}
        </span>
        <button className="icon-btn" aria-label="Удалить фото" onClick={remove}>
          <Icon name="trash" />
        </button>
      </div>

      {prev && (
        <button className="icon-btn nav-arrow" style={{ left: 8 }} aria-label="Предыдущее" onClick={() => onChange(prev.id)}>
          <Icon name="left" />
        </button>
      )}
      {next && (
        <button className="icon-btn nav-arrow" style={{ right: 8 }} aria-label="Следующее" onClick={() => onChange(next.id)}>
          <Icon name="right" />
        </button>
      )}

      <div className="dark-bottom">
        {caption && <b style={{ fontWeight: 500, fontSize: 16 }}>{caption(photo)}</b>}
        <div style={{ fontSize: 13, opacity: 0.65, marginTop: 2, wordBreak: 'break-all' }}>
          {new Date(photo.takenAt).toLocaleString('ru-RU')}. {photo.fileName}
        </div>
        {/* тип можно исправить прямо здесь */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
          {(Object.entries(PHOTO_TYPES) as [PhotoType, string][]).map(([type, label]) => (
            <button
              key={type}
              className={'chip on-dark' + (type === photo.type ? ' on' : '')}
              onClick={() => setPhotoType(photo.id, type)}
            >
              <i className="type-dot" style={{ background: typeColor(type) }} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
