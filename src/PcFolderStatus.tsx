import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { Icon } from './Icon'
import { chooseProjectFolder, folderIndex, reopenProjectFolder, useProjectFolder } from './pcFolder'
import { folderSupported } from './photoFolder'

/**
 * Строка «Папка с фото на компьютере» на экране объекта (Р-39):
 * какая папка выбрана, сколько фото объекта в ней нашлось и у кого сколько не найдено.
 */
export function PcFolderStatus({ projectId }: { projectId: string }) {
  const state = useProjectFolder(projectId)
  const photos = useLiveQuery(async () => {
    const all = (await db.photos.where('projectId').equals(projectId).toArray()).filter(p => !p.deleted)
    // фото, снятые на этом устройстве, искать не нужно
    const here = await db.photoFiles.bulkGet(all.map(p => p.fileName))
    return all.filter((_, i) => !here[i]).map(p => p.fileName)
  }, [projectId])

  if (!folderSupported) {
    return (
      <div className="item warn">
        <Icon name="folder" />
        <div className="grow">
          <b>Папка с фото на компьютере</b>
          <small>Этот браузер не умеет открывать папки. Откройте приложение в Chrome</small>
        </div>
      </div>
    )
  }
  if (photos === undefined) return null

  if (state.status === 'none' || state.status === 'need-permission') {
    const none = state.status === 'none'
    return (
      <button
        className="item warn"
        onClick={() => (none ? chooseProjectFolder(projectId) : reopenProjectFolder(projectId))}
      >
        <Icon name="folder" />
        <div className="grow">
          <b>Папка с фото на компьютере</b>
          <small>
            {none
              ? 'Не выбрана. Нажмите и выберите папку, куда бригада переносит фото объекта'
              : `«${state.name}». Нажмите, чтобы открыть доступ к папке`}
          </small>
        </div>
        <Icon name="right" />
      </button>
    )
  }

  let text: string
  let warn = false
  if (state.status === 'scanning') {
    text = `«${state.name}»: ищем фото… просмотрено файлов: ${state.files}`
  } else if (state.status === 'error') {
    text = `«${state.name}»: не удалось прочитать папку (${state.message})`
    warn = true
  } else {
    const index = folderIndex(projectId)
    const missing = photos.filter(name => !index?.has(name))
    const found = photos.length - missing.length
    text = `«${state.name}»: найдено ${found} из ${photos.length} фото.`
    if (missing.length) {
      warn = true
      // код автора стоит в начале имени фото (Р-18)
      const byCode = new Map<string, number>()
      for (const name of missing) {
        const code = name.split('_')[0]
        byCode.set(code, (byCode.get(code) ?? 0) + 1)
      }
      const list = [...byCode].sort((a, b) => b[1] - a[1]).map(([code, n]) => `${code} — ${n}`)
      text += ` Нет в папке: ${list.join(', ')}`
    }
  }

  return (
    <div className={'item' + (warn ? ' warn' : '')}>
      <Icon name="folder" />
      <div className="grow">
        <b>Папка с фото на компьютере</b>
        <small>{text}</small>
      </div>
      {state.status !== 'scanning' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <button className="btn-link" onClick={() => reopenProjectFolder(projectId)}>
            Обновить
          </button>
          <button className="btn-link" onClick={() => chooseProjectFolder(projectId)}>
            Сменить
          </button>
        </div>
      )}
    </div>
  )
}
