import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { getInviteToken, inviteLink } from './invite'

/** Окно «Пригласить коллегу»: ссылка на объект, поделиться, скопировать, заменить (Р-35). */
export function InviteDialog({ projectId, projectName, onClose }: { projectId: string; projectName: string; onClose: () => void }) {
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function load(renew: boolean) {
    setBusy(true)
    setError('')
    try {
      setLink(inviteLink(await getInviteToken(projectId, renew)))
      if (renew) setNote('Готова новая ссылка. Старая больше не работает.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (navigator.onLine) load(false)
    else setError('Нужен интернет, чтобы получить ссылку.')
    // загружаем один раз при открытии окна
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const text = `Приглашение в объект «${projectName}» в приложении для обследования`

  async function share() {
    if (!link) return
    try {
      await navigator.share({ title: 'Приглашение в объект', text, url: link })
    } catch {
      // пользователь закрыл окно «Поделиться» — ничего не делаем
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setNote('Ссылка скопирована. Отправьте её коллеге в любом мессенджере.')
    } catch {
      setNote('Не получилось скопировать. Выделите ссылку пальцем и скопируйте.')
    }
  }

  function renew() {
    if (confirm('Сделать новую ссылку?\n\nПо старой ссылке больше никто не сможет войти. Кто уже вошёл, останется в объекте.')) load(true)
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="bottom-sheet" role="dialog" aria-label="Пригласить коллегу">
        <div className="grip" />
        <b style={{ fontWeight: 500, fontSize: 18 }}>Пригласить коллегу</b>
        <p className="muted" style={{ fontSize: 14, margin: '8px 0 0', lineHeight: 1.45 }}>
          Отправьте ссылку коллеге. Он откроет её, войдёт в свой аккаунт и увидит объект «{projectName}» со всеми листами и
          точками. Его точки будут видны вам.
        </p>
        {link && (
          <p
            style={{ margin: '12px 0 0', padding: 12, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--line)', fontSize: 13, wordBreak: 'break-all', userSelect: 'all' }}
          >
            {link}
          </p>
        )}
        {busy && !link && <p className="muted" style={{ fontSize: 14 }}>Получаем ссылку…</p>}
        {error && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p>}
        {note && <p style={{ fontSize: 14, margin: '8px 0 0' }}>{note}</p>}
        {link && 'share' in navigator && (
          <button className="primary-btn" style={{ marginTop: 16 }} onClick={share}>
            Поделиться
          </button>
        )}
        {link && (
          <button className="secondary-btn" style={{ marginTop: 8 }} onClick={copy}>
            Скопировать ссылку
          </button>
        )}
        {link && (
          <button className="secondary-btn" style={{ marginTop: 8 }} disabled={busy} onClick={renew}>
            <Icon name="edit" />
            Новая ссылка
          </button>
        )}
        <button className="btn-link" style={{ marginTop: 12, width: '100%' }} onClick={onClose}>
          Закрыть
        </button>
      </div>
    </>
  )
}
