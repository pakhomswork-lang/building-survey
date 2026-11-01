import { useEffect, useState } from 'react'
import { getUserProfile, type UserProfile } from './db'
import { Icon } from './Icon'
import { ProfileForm } from './ProfileForm'
import { ProjectList } from './ProjectList'
import { ProjectPhotos } from './ProjectPhotos'
import { ProjectScreen } from './ProjectScreen'
import { SheetViewer } from './SheetViewer'
import { navigate, useHashRoute } from './useHashRoute'
import { APP_VERSION } from './version'

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
  const [editingProfile, setEditingProfile] = useState(false)
  const route = useHashRoute()

  useEffect(() => {
    requestPersistentStorage().then(setStorage)
    getUserProfile().then(setProfile)
  }, [])

  if (profile === undefined) return null
  if (profile === null) return <ProfileForm onSaved={setProfile} />
  if (editingProfile) {
    return (
      <ProfileForm
        current={profile}
        onSaved={p => {
          setProfile(p)
          setEditingProfile(false)
        }}
        onCancel={() => setEditingProfile(false)}
      />
    )
  }

  if (route.screen === 'sheet') return <SheetViewer key={route.sheetId} sheetId={route.sheetId} onBack={() => history.back()} />

  return (
    <main className="page">
      {route.screen === 'project' ? (
        <ProjectScreen projectId={route.projectId} onBack={() => history.back()} />
      ) : route.screen === 'photos' ? (
        <ProjectPhotos projectId={route.projectId} onBack={() => history.back()} />
      ) : (
        <>
          <div className="page-top">
            <span className="spacer" />
            <button className="icon-btn" aria-label="Профиль" onClick={() => setEditingProfile(true)}>
              <Icon name="user" />
            </button>
          </div>
          <h1 className="page-title">Объекты</h1>
          <ProjectList onOpen={projectId => navigate({ screen: 'project', projectId })} />
          <p className="muted" style={{ marginTop: 32, fontSize: 12, lineHeight: '16px' }}>
            {profile.name}, код {profile.code}
            <br />
            {storageText[storage]} Версия от {APP_VERSION}.
          </p>
        </>
      )}
    </main>
  )
}

export default App
