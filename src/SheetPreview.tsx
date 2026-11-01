import { useLiveQuery } from 'dexie-react-hooks'
import type { PhotoType } from './db'
import { db } from './db'
import { TYPE_KEYS } from './format'
import { typeColor } from './typeColor'
import { useObjectUrl } from './useObjectUrl'

/**
 * Маленькое превью листа с точками. Точки мелкие и тёмные, чтобы не закрывать чертёж;
 * цвета типов фото показывает полоска MixBar под превью (Р-23).
 */
export function SheetPreview({ sheetId, height }: { sheetId: string; height: number }) {
  const data = useLiveQuery(async () => {
    const [image, points] = await Promise.all([
      db.sheetImages.get(sheetId),
      db.points.where('sheetId').equals(sheetId).toArray(),
    ])
    return { image, points: points.filter(p => !p.deleted) }
  }, [sheetId])
  const url = useObjectUrl(data?.image?.thumb)
  const ratio = data?.image ? data.image.width / data.image.height : 1.5
  // чем меньше превью, тем мельче точки
  const dot = height < 80 ? 3 : 4

  return (
    <div className="sheet-preview" style={{ height }}>
      {url && (
        // рамка с пропорциями листа: точки ставятся в процентах прямо по ней
        <div style={{ position: 'relative', aspectRatio: ratio, ...(ratio > 1.5 ? { width: '100%' } : { height: '100%' }) }}>
          <img src={url} alt="" />
          {data!.points.map(p => (
            <i
              key={p.id}
              className="preview-dot"
              style={{ left: `${p.x}%`, top: `${p.y}%`, width: dot, height: dot, marginLeft: -dot / 2, marginTop: -dot / 2 }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Полоска долей типов фото: тот же смысл, что у кольца на метке. */
export function MixBar({ counts }: { counts: Record<PhotoType, number> }) {
  const types = TYPE_KEYS.filter(t => counts[t] > 0)
  return (
    <div className="mix">
      {types.length ? (
        types.map(t => <span key={t} style={{ flex: counts[t], background: typeColor(t) }} />)
      ) : (
        <span style={{ flex: 1, background: 'var(--raised)' }} />
      )}
    </div>
  )
}
