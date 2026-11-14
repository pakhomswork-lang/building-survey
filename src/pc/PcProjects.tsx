import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { formatWhen, plural } from '../format'
import { SheetPreview } from '../SheetPreview'

/** Список объектов на компьютере. Объекты бригады приходят с сервера сами (Р-33). */
export function PcProjects({ signedIn, version }: { signedIn: boolean; version: string }) {
  const data = useLiveQuery(async () => {
    const projects = (await db.projects.toArray()).filter(p => !p.deleted)
    const rows = await Promise.all(
      projects.map(async project => {
        const [sheets, photos] = await Promise.all([
          db.sheets.where('projectId').equals(project.id).sortBy('order'),
          db.photos.where('projectId').equals(project.id).toArray(),
        ])
        const own = photos.filter(p => !p.deleted)
        return {
          project,
          sheets: sheets.filter(s => !s.deleted),
          photos: own.length,
          lastTime: Math.max(project.updatedAt, ...own.map(p => p.takenAt)),
        }
      }),
    )
    return rows.sort((a, b) => b.lastTime - a.lastTime)
  })

  return (
    <main className="pc-page">
      <h1 className="pc-title">Объекты</h1>
      {data?.length === 0 && (
        <p className="pc-muted">
          {signedIn
            ? 'Объектов пока нет. Объекты бригады появятся сами, когда придут с сервера (нужен VPN).'
            : 'Войдите в тот же аккаунт, что на телефоне: объекты бригады придут с сервера сами.'}
        </p>
      )}
      <div className="pc-cards">
        {data?.map(({ project, sheets, photos, lastTime }) => (
          <a key={project.id} className="pc-card" href={`#/p/${project.id}`}>
            {sheets[0] ? <SheetPreview sheetId={sheets[0].id} height={140} /> : <div className="sheet-preview" style={{ height: 140 }} />}
            <b>{project.name}</b>
            <small>
              {plural(sheets.length, 'лист', 'листа', 'листов')}, {photos} фото · {formatWhen(lastTime)}
              {project.shared ? ' · бригада' : ''}
            </small>
          </a>
        ))}
      </div>
      <p className="pc-muted" style={{ marginTop: 40, fontSize: 12 }}>
        Версия от {version}. <a href="../">Телефонная версия</a>
      </p>
    </main>
  )
}
