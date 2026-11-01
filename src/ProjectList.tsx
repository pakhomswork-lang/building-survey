import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { createProject, db } from './db'
import { countByType, formatWhen, plural } from './format'
import { Icon } from './Icon'
import { MixBar, SheetPreview } from './SheetPreview'

/** Список объектов: превью первого листа, сколько листов и фото, полоска типов фото. */
export function ProjectList({ onOpen }: { onOpen: (projectId: string) => void }) {
  // список обновляется сам, когда в базе что-то меняется
  const data = useLiveQuery(async () => {
    const [projects, sheets, photos] = await Promise.all([
      db.projects.orderBy('updatedAt').reverse().toArray(),
      db.sheets.orderBy('updatedAt').toArray(),
      db.photos.toArray(),
    ])
    const liveSheets = sheets.filter(s => !s.deleted).sort((a, b) => a.order - b.order)
    const livePhotos = photos.filter(p => !p.deleted)
    return projects
      .filter(p => !p.deleted)
      .map(project => {
        const own = livePhotos.filter(ph => ph.projectId === project.id)
        const ownSheets = liveSheets.filter(s => s.projectId === project.id)
        // «когда работали»: последнее фото или правка объекта
        const lastTime = Math.max(project.updatedAt, ...own.map(ph => ph.takenAt))
        return { project, sheets: ownSheets, photos: own, lastTime }
      })
  })
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const project = await createProject(name.trim())
    setName('')
    setCreating(false)
    onOpen(project.id)
  }

  return (
    <section>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {data?.map(({ project, sheets, photos, lastTime }) => (
          <button key={project.id} className="object-card" onClick={() => onOpen(project.id)}>
            <div style={{ width: 88, flex: 'none' }}>
              {sheets[0] ? (
                <SheetPreview sheetId={sheets[0].id} height={64} />
              ) : (
                <div className="sheet-preview" style={{ height: 64 }} />
              )}
            </div>
            <div className="info">
              <b>{project.name}</b>
              <small>
                {plural(sheets.length, 'лист', 'листа', 'листов')}, {photos.length} фото. {formatWhen(lastTime)}
              </small>
              <MixBar counts={countByType(photos)} />
            </div>
          </button>
        ))}
      </div>
      {data?.length === 0 && !creating && <p className="muted">Объектов пока нет. Создайте первый.</p>}

      <div style={{ marginTop: 16 }}>
        {creating ? (
          <form onSubmit={submit}>
            <input
              className="field"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Название, например «ул. Ленина, 12»"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="primary-btn" type="submit" disabled={!name.trim()} style={{ flex: 1 }}>
                Создать
              </button>
              <button className="secondary-btn" type="button" style={{ width: 'auto', height: 52 }} onClick={() => setCreating(false)}>
                Отмена
              </button>
            </div>
          </form>
        ) : (
          <button className="secondary-btn" onClick={() => setCreating(true)}>
            <Icon name="plus" />
            Новый объект
          </button>
        )}
      </div>
    </section>
  )
}
