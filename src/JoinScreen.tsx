import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import type { Account } from './account'
import { db } from './db'
import { Icon } from './Icon'
import { getInviteInfo, joinProject, type InviteInfo } from './invite'

/** Экран по ссылке-приглашению: «Вас приглашают в объект …» → «Присоединиться» (Р-35). */
export function JoinScreen({ token, account, onLogin }: { token: string; account: Account | null; onLogin: () => void }) {
  // undefined — ещё узнаём, null — ссылка не работает
  const [info, setInfo] = useState<InviteInfo | null | undefined>(undefined)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [joinedId, setJoinedId] = useState<string | null>(null)
  const userId = account?.userId

  useEffect(() => {
    if (!userId || !navigator.onLine) return
    getInviteInfo(token).then(setInfo, e => setError((e as Error).message))
  }, [token, userId])

  // когда объект пришёл с сервера в телефон — открываем его; «Назад» не вернёт на приглашение
  const arrived = useLiveQuery(async () => (joinedId ? !!(await db.projects.get(joinedId)) : false), [joinedId])
  useEffect(() => {
    if (joinedId && arrived) location.replace(`#/project/${joinedId}`)
  }, [joinedId, arrived])

  async function join() {
    if (!userId) return
    setBusy(true)
    setError('')
    try {
      setJoinedId(await joinProject(token, userId))
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const goHome = () => location.replace('#/')

  let body
  if (!account) {
    body = (
      <>
        <p style={{ fontSize: 15, lineHeight: 1.45 }}>Вас пригласили в объект бригады. Чтобы присоединиться, войдите в аккаунт или создайте его.</p>
        <button className="primary-btn" style={{ marginTop: 16 }} onClick={onLogin}>
          Войти в аккаунт
        </button>
      </>
    )
  } else if (joinedId) {
    body = <p style={{ fontSize: 15 }}>Готово, загружаем объект с сервера…</p>
  } else if (info === null) {
    body = <p style={{ fontSize: 15, lineHeight: 1.45 }}>Ссылка не работает: её заменили на новую или объект удалён. Попросите у коллеги свежую ссылку.</p>
  } else if (info) {
    body = (
      <>
        <p style={{ fontSize: 15, lineHeight: 1.45 }}>
          Вас приглашают в объект <b>«{info.projectName}»</b>. Участников сейчас: {info.members}.
        </p>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.45 }}>
          Вы увидите листы и точки коллег, а они — ваши. Фото остаются у того, кто снимал.
        </p>
        {info.alreadyMember ? (
          <button className="primary-btn" style={{ marginTop: 16 }} onClick={() => location.replace(`#/project/${info.projectId}`)}>
            Вы уже участник — открыть объект
          </button>
        ) : (
          <button className="primary-btn" style={{ marginTop: 16 }} disabled={busy} onClick={join}>
            {busy ? 'Присоединяемся…' : 'Присоединиться'}
          </button>
        )}
      </>
    )
  } else if (!navigator.onLine) {
    body = <p style={{ fontSize: 15 }}>Нужен интернет, чтобы открыть приглашение. Откройте ссылку ещё раз, когда появится сеть.</p>
  } else if (!error) {
    body = <p className="muted">Проверяем приглашение…</p>
  }

  return (
    <main className="page" style={{ maxWidth: 480 }}>
      <div className="page-top">
        <button className="icon-btn" aria-label="На главный экран" onClick={goHome}>
          <Icon name="back" />
        </button>
      </div>
      <h1 className="page-title">Приглашение</h1>
      {body}
      {error && <p style={{ color: 'var(--danger)', fontSize: 14, lineHeight: 1.45 }}>{error}</p>}
      <button className="btn-link" style={{ marginTop: 16 }} onClick={goHome}>
        Не сейчас
      </button>
    </main>
  )
}
