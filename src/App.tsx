import { useEffect, useState } from 'react'
import { getUserProfile, type UserProfile } from './db'
import { ProfileForm } from './ProfileForm'

type StorageStatus = 'checking' | 'persistent' | 'not-persistent' | 'unsupported'

const storageText: Record<StorageStatus, string> = {
  checking: 'Проверяем хранилище…',
  persistent: 'Хранилище постоянное: браузер не удалит данные сам.',
  'not-persistent': 'Хранилище временное: браузер может удалить данные, если на телефоне кончится место.',
  unsupported: 'Браузер не сообщает, постоянное ли хранилище.',
}

// Просим браузер не удалять данные приложения. Chrome обычно соглашается,
// если приложение установлено на главный экран.
async function requestPersistentStorage(): Promise<StorageStatus> {
  if (!navigator.storage?.persist) return 'unsupported'
  if (await navigator.storage.persisted()) return 'persistent'
  return (await navigator.storage.persist()) ? 'persistent' : 'not-persistent'
}

function App() {
  const [storage, setStorage] = useState<StorageStatus>('checking')
  // undefined — ещё загружаем, null — профиль не заполнен
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined)

  useEffect(() => {
    requestPersistentStorage().then(setStorage)
    getUserProfile().then(setProfile)
  }, [])

  if (profile === undefined) return null
  if (profile === null) return <ProfileForm onSaved={setProfile} />

  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>Обследование</h1>
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>
        Фото и данные обследования, привязанные к точкам на листах.
      </p>
      <p style={{ marginTop: 16, fontSize: 14, color: 'var(--text-muted)' }}>
        Вы: {profile.name} (код {profile.code})
      </p>
      <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{storageText[storage]}</p>
    </main>
  )
}

export default App
