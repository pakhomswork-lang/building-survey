import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type CSSProperties } from 'react'
import { db, deletePoint, PHOTO_TYPES, setPointComment, type PhotoType, type Point } from './db'
import { CameraView } from './CameraView'
import { Icon } from './Icon'
import { countByType, TYPE_KEYS } from './format'
import { PhotoThumb } from './PhotoThumb'
import { PhotoView } from './PhotoView'
import { getFolder, hasFolderPermission } from './photoFolder'
import { savePhoto } from './photos'
import { typeColor } from './typeColor'

/** Выбранная точка: её фото сеткой и внизу панель съёмки (тип, встроенная камера, обычная камера). */
export function PointPanel({
  point,
  number,
  photoType,
  onPhotoTypeChange,
  onClose,
}: {
  point: Point
  number: number
  /** Тип выбирается на серию и сохраняется для следующих фото и точек (Р-11). */
  photoType: PhotoType
  onPhotoTypeChange: (type: PhotoType) => void
  onClose: () => void
}) {
  const photos = useLiveQuery(async () => {
    const all = await db.photos.where('pointId').equals(point.id).reverse().sortBy('takenAt')
    return all.filter(p => !p.deleted)
  }, [point.id])
  const camera = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setSaving(true)
    setError(null)
    try {
      for (const file of files) await savePhoto(point, file, photoType)
    } catch (e) {
      setError('Не удалось сохранить фото: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
      if (camera.current) camera.current.value = ''
    }
  }

  const [cameraOpen, setCameraOpen] = useState(false)
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [comment, setComment] = useState('')

  function openCamera() {
    setCameraOpen(true)
    // нажатие на кнопку — удобный момент попросить доступ к папке, чтобы фото сразу туда писались
    getFolder().then(folder => folder && hasFolderPermission(folder, true)).catch(() => {})
  }

  /** Снимок встроенной камеры: сохраняем в фоне, камера остаётся открытой. */
  function onCameraShot(blob: Blob, type: PhotoType) {
    const file = new File([blob], 'camera.jpg', { type: blob.type || 'image/jpeg', lastModified: Date.now() })
    savePhoto(point, file, type).catch(e =>
      setError('Не удалось сохранить фото: ' + (e instanceof Error ? e.message : String(e))),
    )
  }

  const counts = countByType(photos ?? [])

  async function removePoint() {
    const count = photos?.length ?? 0
    const ok = confirm(
      `Удалить точку ${number}` + (count ? ` и ${count} фото в ней?` : '?') +
        (count ? '\n\nФото, уже сохранённые в папку телефона, останутся там.' : ''),
    )
    if (!ok) return
    await deletePoint(point.id)
    onClose()
  }

  return (
    <>
      <section className="point-panel">
        <div className="point-head">
          <h2>Точка {number}</h2>
          <small>{photos?.length ?? 0} фото</small>
          <button
            className="icon-btn"
            aria-label="Комментарий и удаление точки"
            style={{ marginRight: -8 }}
            onClick={() => {
              setComment(point.comment)
              setMenuOpen(true)
            }}
          >
            <Icon name="more" />
          </button>
          <button className="icon-btn" aria-label="Закрыть точку" onClick={onClose} style={{ marginRight: -8 }}>
            <Icon name="close" />
          </button>
        </div>
        <div className="point-meta">поставлена {new Date(point.createdAt).toLocaleString('ru-RU')}</div>
        {point.comment && <p style={{ margin: '8px 0 0', fontSize: 15, color: 'var(--text-2)' }}>{point.comment}</p>}

        {error && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p>}

        {photos && photos.length > 0 ? (
          <div className="photo-grid">
            {photos.map((p, i) => (
              <button
                key={p.id}
                className={'photo-cell' + (i === 0 ? ' big' : '')}
                style={{ '--c': typeColor(p.type) } as CSSProperties}
                aria-label={PHOTO_TYPES[p.type]}
                onClick={() => setOpenPhotoId(p.id)}
              >
                <PhotoThumb fileName={p.fileName} size="100%" radius={0} />
              </button>
            ))}
          </div>
        ) : (
          photos && <div className="empty-photos">Фото пока нет. Выберите тип и нажмите «Снять»</div>
        )}
      </section>

      {typeMenuOpen && (
        <>
          <div className="menu-scrim" onClick={() => setTypeMenuOpen(false)} />
          <div className="type-menu">
            {(Object.entries(PHOTO_TYPES) as [PhotoType, string][]).map(([type, label]) => (
              <button
                key={type}
                className={type === photoType ? 'on' : ''}
                onClick={() => {
                  onPhotoTypeChange(type)
                  setTypeMenuOpen(false)
                }}
              >
                <i className="type-dot" style={{ background: typeColor(type), width: 10, height: 10 }} />
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={e => onFiles(e.target.files)}
      />
      <div className="dock">
        <button className="pick" aria-label="Тип фото" onClick={() => setTypeMenuOpen(o => !o)}>
          <i className="type-dot" style={{ background: typeColor(photoType) }} />
          {PHOTO_TYPES[photoType].split(',')[0]}
          <Icon name="down" size={14} />
        </button>
        <button className="go" onClick={openCamera}>
          <Icon name="camera" />
          <span>
            <b>Снять</b>
            <small>в точку {number}</small>
          </span>
        </button>
        <button className="alt" aria-label="Обычная камера, лучше качество" disabled={saving} onClick={() => camera.current?.click()}>
          <Icon name="cameraAlt" size={18} />
          {saving ? 'Сохраняем' : 'Обычная'}
        </button>
      </div>

      {cameraOpen && (
        <CameraView
          title={`Точка ${number}`}
          photoType={photoType}
          onPhotoTypeChange={onPhotoTypeChange}
          onShot={onCameraShot}
          onSystemCamera={() => {
            setCameraOpen(false)
            camera.current?.click()
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
      {openPhotoId && photos && (
        <PhotoView
          photos={photos}
          photoId={openPhotoId}
          onChange={setOpenPhotoId}
          onClose={() => setOpenPhotoId(null)}
          caption={() => `Точка ${number}`}
        />
      )}

      {menuOpen && (
        <>
          <div className="scrim" onClick={() => setMenuOpen(false)} />
          <div className="bottom-sheet" role="dialog" aria-label={`Точка ${number}`}>
            <div className="grip" />
            <b style={{ fontWeight: 500, fontSize: 18 }}>Точка {number}</b>
            <div className="point-meta">поставлена {new Date(point.createdAt).toLocaleString('ru-RU')}</div>
            <label htmlFor="point-comment">Комментарий</label>
            <textarea
              id="point-comment"
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Например, трещина над дверным проёмом"
            />
            {photos && photos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                {TYPE_KEYS.filter(t => counts[t] > 0).map(t => (
                  <span key={t} className="chip" style={{ cursor: 'default' }}>
                    <i className="type-dot" style={{ background: typeColor(t) }} />
                    {PHOTO_TYPES[t]}
                    <em>{counts[t]}</em>
                  </span>
                ))}
              </div>
            )}
            <div className="list" style={{ marginTop: 16 }}>
              <button
                className="item danger"
                onClick={() => {
                  setMenuOpen(false)
                  removePoint()
                }}
              >
                <Icon name="trash" />
                <div className="grow">
                  <b>{photos?.length ? `Удалить точку и ${photos.length} фото` : 'Удалить точку'}</b>
                  <small>Фото в папке телефона останутся</small>
                </div>
              </button>
            </div>
            <button
              className="primary-btn"
              style={{ marginTop: 16 }}
              onClick={async () => {
                if (comment.trim() !== point.comment) await setPointComment(point.id, comment.trim())
                setMenuOpen(false)
              }}
            >
              <Icon name="check" />
              Готово
            </button>
          </div>
        </>
      )}
    </>
  )
}
