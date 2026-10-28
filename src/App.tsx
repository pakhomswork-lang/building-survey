import { useEffect, useState } from 'react'
import { getUserProfile, type UserProfile } from './db'
import { ProfileForm } from './ProfileForm'
import { ProjectList } from './ProjectList'
import { ProjectScreen } from './ProjectScreen'
import { SheetViewer } from './SheetViewer'
import { navigate, useHashRoute } from './useHashRoute'

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
  const route = useHashRoute()

  useEffect(() => {
    requestPersistentStorage().then(setStorage)
    getUserProfile().then(setProfile)
  }, [])

  if (profile === undefined) return null
  if (profile === null) return <ProfileForm onSaved={setProfile} />

  if (route.screen === 'sheet') return <SheetViewer sheetId={route.sheetId} onBack={() => history.back()} />

  return (
    <main className="screen">
      {route.screen === 'project' ? (
        <ProjectScreen projectId={route.projectId} onBack={() => history.back()} />
      ) : (
        <>
          <h1 style={{ fontSize: 22, margin: '0 0 16px' }}>Обследование</h1>
          <ProjectList onOpen={projectId => navigate({ screen: 'project', projectId })} />
          <p className="muted" style={{ marginTop: 24, fontSize: 13 }}>
            Вы: {profile.name} (код {profile.code}). {storageText[storage]}
          </p>
        </>
      )}
    </main>
  )
}

export default App
