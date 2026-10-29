import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, PHOTO_TYPES, type PhotoType } from './db'
import { PhotoThumb } from './PhotoThumb'
import { PhotoView } from './PhotoView'

type Tab = 'all' | PhotoType

/** Все фото точки с вкладками по типам. */
export function PhotoGallery({ pointId, title, onClose }: { pointId: string; title: string; onClose: () => void }) {
  const photos = useLiveQuery(async () => {
    const all = await db.photos.where('pointId').equals(pointId).sortBy('takenAt')
    return all.filter(p => !p.deleted)
  }, [pointId])
  const [chosenTab, setTab] = useState<Tab>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  const tabs: { tab: Tab; label: string; count: number }[] = [
    { tab: 'all', label: 'Все', count: photos?.length ?? 0 },
    ...(Object.entries(PHOTO_TYPES) as [PhotoType, string][])
      .map(([type, label]) => ({ tab: type as Tab, label, count: photos?.filter(p => p.type === type).length ?? 0 }))
      .filter(t => t.count > 0),
  ]
  // если во вкладке не осталось фото (удалили или сменили тип) — показываем «Все»
  const tab = tabs.some(t => t.tab === chosenTab) ? chosenTab : 'all'
  const shown = (photos ?? []).filter(p => tab === 'all' || p.type === tab)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface)' }}>
        <button className="btn-link" onClick={onClose}>←</button>
        <span style={{ flex: 1 }}>{title}: фото</span>
      </header>

      <div style={{ display: 'flex', gap: 6, padding: '10px 12px', overflowX: 'auto', flex: 'none' }}>
        {tabs.map(t => (
          <button
            key={t.tab}
            onClick={() => setTab(t.tab)}
            style={{
              flex: 'none',
              padding: '6px 10px',
              fontSize: 14,
              borderRadius: 16,
              border: '1px solid var(--accent)',
              background: t.tab === tab ? 'var(--accent)' : '#fff',
              color: t.tab === tab ? '#fff' : 'var(--accent)',
            }}
          >
            {t.label} {t.count}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {photos && shown.length === 0 && <p className="muted">Фото нет.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6 }}>
          {shown.map(p => (
            <button key={p.id} onClick={() => setOpenId(p.id)} style={{ padding: 0, border: 0, background: 'none' }}>
              <PhotoThumb fileName={p.fileName} size="100%" />
            </button>
          ))}
        </div>
      </div>

      {openId && (
        <PhotoView
          photos={shown}
          photoId={openId}
          onChange={setOpenId}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}
