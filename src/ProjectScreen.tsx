import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { SheetList } from './SheetList'

export function ProjectScreen({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  // null — объект не найден, undefined — ещё загружаем
  const project = useLiveQuery(async () => (await db.projects.get(projectId)) ?? null, [projectId])

  if (project === undefined) return null

  return (
    <section>
      <button className="btn-link" onClick={onBack}>
        ← Объекты
      </button>
      {project === null || project.deleted ? (
        <p className="muted">Объект не найден.</p>
      ) : (
        <>
          <h2 style={{ fontSize: 20, margin: '4px 0 12px' }}>{project.name}</h2>
          <SheetList projectId={projectId} />
        </>
      )}
    </section>
  )
}
