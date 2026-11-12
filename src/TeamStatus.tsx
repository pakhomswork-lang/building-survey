import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useAccount } from './account'
import { db, shareProject } from './db'
import { Icon } from './Icon'
import { InviteDialog } from './InviteDialog'
import { countPending, pushAll, useOnline, usePushState } from './sync'

/**
 * Строка «Работать с бригадой» на экране объекта (Р-32).
 * Пока объект только в телефоне — кнопка включения. Когда общий — что с отправкой на сервер.
 */
export function TeamStatus({ projectId }: { projectId: string }) {
  const account = useAccount()
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId])
  const pending = useLiveQuery(() => countPending(projectId), [projectId])
  const online = useOnline()
  const push = usePushState()
  const [asking, setAsking] = useState(false)
  const [inviting, setInviting] = useState(false)

  if (!project || account === undefined) return null

  if (!project.shared) {
    return (
      <>
        <button
          className="item"
          onClick={() => (account ? setAsking(true) : alert('Сначала войдите в аккаунт: главный экран → «Войти в аккаунт».'))}
        >
          <Icon name="user" />
          <div className="grow">
            <b>Работать с бригадой</b>
            <small>{account ? 'Объект только в телефоне. Нажмите, чтобы отправить на сервер' : 'Нужен вход в аккаунт'}</small>
          </div>
          <Icon name="right" />
        </button>
        {asking && account && (
          <>
            <div className="scrim" onClick={() => setAsking(false)} />
            <div className="bottom-sheet" role="dialog" aria-label="Работать с бригадой">
              <div className="grip" />
              <b style={{ fontWeight: 500, fontSize: 18 }}>Работать с бригадой?</b>
              <p style={{ fontSize: 15, margin: '12px 0 0', lineHeight: 1.45 }}>
                Объект, листы с картинками, точки и подписи к фото уйдут на сервер. Дальше все изменения будут
                уходить сами, без сети — когда она появится.
              </p>
              <p className="muted" style={{ fontSize: 14, margin: '8px 0 0', lineHeight: 1.45 }}>
                Сами фото остаются в телефоне. Объект увидят только участники: пока это вы (под аккаунтом {account.email}{' '}
                на любом устройстве). Пригласить коллег можно будет позже.
              </p>
              <button
                className="primary-btn"
                style={{ marginTop: 16 }}
                onClick={async () => {
                  setAsking(false)
                  await shareProject(projectId, account.userId)
                  pushAll()
                }}
              >
                Отправить на сервер
              </button>
              <button className="secondary-btn" style={{ marginTop: 8 }} onClick={() => setAsking(false)}>
                Отмена
              </button>
            </div>
          </>
        )}
      </>
    )
  }

  const n = pending ?? 0
  let text: string
  let warn = false
  if (!account) {
    text = n ? `Ждёт входа в аккаунт: ${n}` : 'Войдите в аккаунт, чтобы получать и отправлять изменения'
    warn = true
  } else if (n === 0) text = 'Всё на сервере'
  else if (!online) text = `Ждёт сети: ${n}`
  else if (push.busy) text = `Отправляем… осталось ${n}`
  else if (push.error) {
    text = `Не отправлено: ${n}. ${push.error}`
    warn = true
  } else text = `Ждёт отправки: ${n}`

  return (
    <>
      <button className="item" onClick={() => account && pushAll()} aria-label="Работа с бригадой: отправить сейчас">
        <Icon name={n === 0 && account ? 'check' : 'user'} />
        <div className="grow">
          <b>Работа с бригадой</b>
          <small style={warn ? { color: 'var(--danger)' } : undefined}>{text}</small>
        </div>
      </button>
      {account && (
        <button className="item" onClick={() => setInviting(true)}>
          <Icon name="plus" />
          <div className="grow">
            <b>Пригласить коллегу</b>
            <small>Ссылка на этот объект</small>
          </div>
          <Icon name="right" />
        </button>
      )}
      {inviting && <InviteDialog projectId={projectId} projectName={project.name} onClose={() => setInviting(false)} />}
    </>
  )
}
