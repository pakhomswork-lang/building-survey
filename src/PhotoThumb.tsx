import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { db } from './db'
import { ensureFolderThumb, useFolderFile } from './pcFolder'
import { useObjectUrl } from './useObjectUrl'

/** Превью фото из базы или из папки с фото на компьютере (Р-39). */
export function PhotoThumb({ fileName, size, radius = 6 }: { fileName: string; size: number | string; radius?: number }) {
  // null — файла нет в этом телефоне: фото снял другой участник (Р-13, Р-38)
  const thumb = useLiveQuery(
    async () => (await db.photoFiles.get(fileName))?.thumb ?? (await db.folderThumbs.get(fileName))?.thumb ?? null,
    [fileName],
  )
  const inFolder = useFolderFile(fileName)
  const url = useObjectUrl(thumb ?? undefined)

  // фото нашлось в папке на компьютере, а миниатюры ещё нет — сделать
  useEffect(() => {
    if (thumb === null && inFolder) ensureFolderThumb(fileName)
  }, [thumb, inFolder, fileName])

  return (
    <div style={{ width: size, aspectRatio: '1', flex: 'none', borderRadius: radius, background: 'var(--raised)', overflow: 'hidden' }}>
      {thumb === null && (
        // код автора стоит в начале имени фото (Р-18)
        <div style={{ height: '100%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
          {inFolder ? '…' : fileName.split('_')[0]}
        </div>
      )}
      {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
    </div>
  )
}
