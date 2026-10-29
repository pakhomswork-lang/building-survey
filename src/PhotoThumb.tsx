import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { useObjectUrl } from './useObjectUrl'

/** Превью фото из базы. */
export function PhotoThumb({ fileName, size }: { fileName: string; size: number | string }) {
  const thumb = useLiveQuery(async () => (await db.photoFiles.get(fileName))?.thumb, [fileName])
  const url = useObjectUrl(thumb)
  return (
    <div style={{ width: size, aspectRatio: '1', flex: 'none', borderRadius: 6, background: '#eee', overflow: 'hidden' }}>
      {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
    </div>
  )
}
