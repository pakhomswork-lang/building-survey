import { useState, type FormEvent } from 'react'
import { signIn } from './account'

const fieldStyle = { margin: '6px 0 16px' }

/** Вход в аккаунт бригады или создание нового (Р-29). */
export function AccountForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ready = email.includes('@') && password.length >= 6

  async function submit(isNew: boolean, e?: FormEvent) {
    e?.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError('')
    const problem = await signIn(email.trim(), password, isNew)
    setBusy(false)
    if (problem) setError(problem)
    else onDone()
  }

  return (
    <main className="page" style={{ maxWidth: 480 }}>
      <div className="page-top" />
      <h1 className="page-title">Аккаунт</h1>
      <p style={{ margin: '4px 0 24px', fontSize: 15, color: 'var(--text-2)' }}>
        Нужен, чтобы работать вместе с бригадой. Для входа нужен интернет, потом телефон помнит вход. Без аккаунта приложение работает как раньше.
      </p>
      <form onSubmit={e => submit(false, e)}>
        <label>
          Почта
          <input
            className="field"
            style={fieldStyle}
            type="email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="name@mail.ru"
            autoFocus
          />
        </label>
        <label>
          Пароль (не короче 6 знаков)
          <input
            className="field"
            style={fieldStyle}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </label>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: error ? 'var(--danger)' : 'var(--text-muted)' }}>
          {error || 'Запомните пароль: восстановить его через почту пока нельзя.'}
        </p>
        <button type="submit" className="primary-btn" disabled={!ready || busy}>
          {busy ? 'Подождите…' : 'Войти'}
        </button>
        <button type="button" className="secondary-btn" style={{ marginTop: 8 }} disabled={!ready || busy} onClick={() => submit(true)}>
          Создать аккаунт
        </button>
        <button type="button" className="secondary-btn" style={{ marginTop: 8 }} onClick={onCancel}>
          Отмена
        </button>
      </form>
    </main>
  )
}
