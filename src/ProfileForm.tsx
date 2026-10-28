import { useState, type FormEvent } from 'react'
import { saveUserProfile, USER_CODE_PATTERN, type UserProfile } from './db'

const TRANSLIT: Record<string, string> = {
  а: 'A', б: 'B', в: 'V', г: 'G', д: 'D', е: 'E', ё: 'E', ж: 'ZH', з: 'Z', и: 'I', й: 'Y',
  к: 'K', л: 'L', м: 'M', н: 'N', о: 'O', п: 'P', р: 'R', с: 'S', т: 'T', у: 'U', ф: 'F',
  х: 'H', ц: 'C', ч: 'CH', ш: 'SH', щ: 'SH', ы: 'Y', э: 'E', ю: 'YU', я: 'YA',
}

/** Подсказка кода по имени: «Пахомов И.» → PAH. */
function suggestCode(name: string): string {
  const latin = [...name.toLowerCase()].map(ch => TRANSLIT[ch] ?? ch.toUpperCase()).join('')
  return latin.replace(/[^A-Z0-9]/g, '').slice(0, 3)
}

const fieldStyle = { display: 'block', width: '100%', padding: 12, fontSize: 16, margin: '4px 0 12px', borderRadius: 8, border: '1px solid #ccc' }

export function ProfileForm({ onSaved }: { onSaved: (profile: UserProfile) => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  // пока пользователь сам не менял код, подставляем подсказку по имени
  const [codeTouched, setCodeTouched] = useState(false)
  const shownCode = codeTouched ? code : suggestCode(name)
  const codeValid = USER_CODE_PATTERN.test(shownCode)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !codeValid) return
    onSaved(await saveUserProfile(name.trim(), shownCode))
  }

  return (
    <main style={{ padding: 16, maxWidth: 480 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>Кто вы?</h1>
      <p style={{ margin: '0 0 16px', color: 'var(--text-muted)' }}>
        Это нужно один раз. Имя видят коллеги, код ставится в начало имени каждого вашего фото.
      </p>
      <form onSubmit={submit}>
        <label>
          Имя
          <input style={fieldStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Например, Пахомов И." autoFocus />
        </label>
        <label>
          Код для имён фото (2–5 латинских букв или цифр)
          <input
            style={{ ...fieldStyle, textTransform: 'uppercase' }}
            value={shownCode}
            onChange={e => {
              setCodeTouched(true)
              setCode(e.target.value.toUpperCase())
            }}
            maxLength={5}
            placeholder="PAH"
          />
        </label>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: codeValid || !shownCode ? 'var(--text-muted)' : '#d9534f' }}>
          {codeValid ? `Фото будут называться так: ${shownCode}_20261028_143012_ab12.jpg` : 'Код: 2–5 латинских букв или цифр'}
        </p>
        <button
          type="submit"
          disabled={!name.trim() || !codeValid}
          style={{ width: '100%', padding: 14, fontSize: 16, border: 0, borderRadius: 8, background: 'var(--accent)', color: '#fff', opacity: !name.trim() || !codeValid ? 0.5 : 1 }}
        >
          Продолжить
        </button>
      </form>
    </main>
  )
}
