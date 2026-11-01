import { useState, type FormEvent } from 'react'
import { saveUserProfile, USER_CODE_PATTERN, type UserProfile } from './db'

const TRANSLIT: Record<string, string> = {
  а: 'A', б: 'B', в: 'V', г: 'G', д: 'D', е: 'E', ё: 'E', ж: 'ZH', з: 'Z', и: 'I', й: 'Y',
  к: 'K', л: 'L', м: 'M', н: 'N', о: 'O', п: 'P', р: 'R', с: 'S', т: 'T', у: 'U', ф: 'F',
  х: 'H', ц: 'C', ч: 'CH', ш: 'SH', щ: 'SH', ы: 'Y', э: 'E', ю: 'YU', я: 'YA',
}

/** Подсказка кода по имени: «Иванов И.» → IVA. */
function suggestCode(name: string): string {
  const latin = [...name.toLowerCase()].map(ch => TRANSLIT[ch] ?? ch.toUpperCase()).join('')
  return latin.replace(/[^A-Z0-9]/g, '').slice(0, 3)
}

const fieldStyle = { margin: '6px 0 16px' }

export function ProfileForm({
  onSaved,
  current,
  onCancel,
}: {
  onSaved: (profile: UserProfile) => void
  /** Уже заполненный профиль — тогда форма открывается для правки. */
  current?: UserProfile
  onCancel?: () => void
}) {
  const [name, setName] = useState(current?.name ?? '')
  const [code, setCode] = useState(current?.code ?? '')
  // пока пользователь сам не менял код, подставляем подсказку по имени; при правке код уже свой
  const [codeTouched, setCodeTouched] = useState(!!current)
  const shownCode = codeTouched ? code : suggestCode(name)
  const codeValid = USER_CODE_PATTERN.test(shownCode)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !codeValid) return
    onSaved(await saveUserProfile(name.trim(), shownCode))
  }

  return (
    <main className="page" style={{ maxWidth: 480 }}>
      <div className="page-top" />
      <h1 className="page-title">{current ? 'Профиль' : 'Кто вы?'}</h1>
      <p style={{ margin: '4px 0 24px', fontSize: 15, color: 'var(--text-2)' }}>
        {current
          ? 'Если поменять код, новые фото будут называться с новым кодом. Уже снятые фото останутся со старым.'
          : 'Это нужно один раз. Имя видят коллеги, код ставится в начало имени каждого вашего фото.'}
      </p>
      <form onSubmit={submit}>
        <label>
          Имя
          <input className="field" style={fieldStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Например, Иванов И." autoFocus />
        </label>
        <label>
          Код для имён фото (2–5 латинских букв или цифр)
          <input
            className="field"
            style={{ ...fieldStyle, textTransform: 'uppercase' }}
            value={shownCode}
            onChange={e => {
              setCodeTouched(true)
              setCode(e.target.value.toUpperCase())
            }}
            maxLength={5}
            placeholder="IVA"
          />
        </label>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: codeValid || !shownCode ? 'var(--text-muted)' : 'var(--danger)' }}>
          {codeValid ? `Фото будут называться так: ${shownCode}_20261028_143012_ab12.jpg` : 'Код: 2–5 латинских букв или цифр'}
        </p>
        <button
          type="submit"
          disabled={!name.trim() || !codeValid}
          className="primary-btn"
        >
          {current ? 'Сохранить' : 'Продолжить'}
        </button>
        {onCancel && (
          <button type="button" className="secondary-btn" style={{ marginTop: 8 }} onClick={onCancel}>
            Отмена
          </button>
        )}
      </form>
    </main>
  )
}
