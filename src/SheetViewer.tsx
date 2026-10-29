import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { createPoint, db, deleteSheet, type PhotoType } from './db'
import { PointPanel } from './PointPanel'
import { usePanZoom, type Tap } from './usePanZoom'
import { useObjectUrl } from './useObjectUrl'

const MARKER = 28

export function SheetViewer({ sheetId, onBack }: { sheetId: string; onBack: () => void }) {
  const sheet = useLiveQuery(async () => (await db.sheets.get(sheetId)) ?? null, [sheetId])
  const image = useLiveQuery(() => db.sheetImages.get(sheetId), [sheetId])
  const points = useLiveQuery(async () => {
    const all = await db.points.where('sheetId').equals(sheetId).sortBy('createdAt')
    return all.filter(p => !p.deleted)
  }, [sheetId])
  const url = useObjectUrl(image?.blob)

  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [photoType, setPhotoType] = useState<PhotoType>('general')

  // размер области под лист: от него зависит, каким лист будет «вписан в экран»
  const viewportRef = useRef<HTMLDivElement>(null)
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => setVp({ w: el.clientWidth, h: el.clientHeight })
    // меряем сразу и потом при каждом изменении (поворот телефона, размер окна)
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
    const hit = (tap.target as HTMLElement | null)?.closest?.('[data-point-id]')
    setSelectedId(hit?.getAttribute('data-point-id') ?? null)
  }

  const { t, handlers } = usePanZoom(viewportRef, content, maxScale, handleTap)

  const selectedIndex = points?.findIndex(p => p.id === selectedId) ?? -1
  const selected = selectedIndex >= 0 ? points![selectedIndex] : null

  if (sheet === null) {
    return (
      <main className="screen">
        <button className="btn-link" onClick={onBack}>← Назад</button>
        <p className="muted">Лист не найден.</p>
      </main>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#e9e9e9' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface)' }}>
        <button className="btn-link" onClick={onBack}>←</button>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sheet?.name}</span>
        <button
          className="btn-link danger"
          aria-label="Удалить лист"
          onClick={async () => {
            if (!sheet) return
            const ok = confirm(
              `Удалить лист «${sheet.name}» со всеми точками и фото?\n\n` +
                'Фото, уже сохранённые в папку телефона, останутся там.',
            )
            if (!ok) return
            await deleteSheet(sheet.id)
            onBack()
          }}
        >
          🗑
        </button>
        <button className="btn" style={{ padding: '8px 12px' }} onClick={() => setAdding(a => !a)}>
          {adding ? 'Отмена' : '+ Точка'}
        </button>
      </header>

      {/* подсказка и панель точки лежат поверх листа, чтобы не менять его размер и не сбрасывать приближение */}
      <div style={{ flex: 1, position: 'relative' }}>
        {adding && (
          <div style={{ position: 'absolute', zIndex: 1, left: 0, right: 0, top: 0, padding: '8px 12px', background: '#fff3cd', fontSize: 14 }}>
            Нажмите на лист в том месте, где поставить точку.
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
              {points?.map((p, i) => (
                <div
                  key={p.id}
                  data-point-id={p.id}
                  style={{
                    position: 'absolute',
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    width: MARKER,
                    height: MARKER,
                    marginLeft: -MARKER / 2,
                    marginTop: -MARKER / 2,
                    // метка не растёт при приближении листа
                    transform: `scale(${1 / t.s})`,
                    borderRadius: '50%',
                    background: p.id === selectedId ? '#1f6feb' : '#e5484d',
                    border: '2px solid #fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,.4)',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {i + 1}
                </div>
              ))}
            </div>
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
    </div>
  )
}
