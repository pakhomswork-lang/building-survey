import { useEffect, useState } from 'react'
import { pushProfile, retryPendingProfile, signOut, syncProfileAfterLogin, useAccount } from './account'
import { AccountForm } from './AccountForm'
import { getUserProfile, setAccountId, type UserProfile } from './db'
import { Icon } from './Icon'
import { JoinScreen } from './JoinScreen'
import { ProfileForm } from './ProfileForm'
import { isComputer } from './pcFolder'
import { ProjectList } from './ProjectList'
import { ProjectPhotos } from './ProjectPhotos'
import { ProjectScreen } from './ProjectScreen'
import { SheetViewer } from './SheetViewer'
import { supabase } from './supabase'
import { startAutoPull } from './pull'
import { startAutoPush } from './sync'
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

/** На компьютере удобнее отдельная версия под монитор и мышь (Р-40). */
function PcLink() {
  return (
    <div className="list" style={{ marginTop: 24 }}>
      <a className="item" href="pc/" style={{ textDecoration: 'none', color: 'inherit' }}>
        <Icon name="images" />
        <div className="grow">
          <b>Версия для компьютера</b>
          <small>Большой лист, управление мышью, фото из папки</small>
        </div>
        <Icon name="right" />
      </a>
    </div>
  )
}

function App() {
  const [storage, setStorage] = useState<StorageStatus>('checking')
  // undefined — ещё загружаем, null — профиль не заполнен
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined)
  const [editingProfile, setEditingProfile] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [notice, setNotice] = useState('')
  const account = useAccount()
  const accountId = account?.userId
  const accountKnown = account !== undefined
  const route = useHashRoute()

  useEffect(() => {
    requestPersistentStorage().then(setStorage)
    getUserProfile().then(setProfile)
  }, [])

  // запоминаем вход в базе телефона: новые записи подписываются аккаунтом;
  // пока вошли — общие объекты сами уходят на сервер (Р-32) и приходят с него (Р-33)
  useEffect(() => {
    if (!accountKnown) return
    let stops: (() => void)[] = []
    let cancelled = false
    setAccountId(accountId ?? null).then(() => {
      if (accountId && !cancelled) stops = [startAutoPush(), startAutoPull()]
    })
    return () => {
      cancelled = true
      stops.forEach(stop => stop())
    }
  }, [accountKnown, accountId])

  // имя и код, которые не ушли на сервер без сети, досылаем при запуске и когда сеть появилась
  useEffect(() => {
    if (!accountId) return
    const retry = () => retryPendingProfile(accountId)
    retry()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [accountId])

  async function afterLogin() {
    setLoggingIn(false)
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    const changed = await syncProfileAfterLogin(data.session.user.id)
    if (changed) {
      setProfile(changed)
      setNotice(`Имя и код взяты из аккаунта: ${changed.name}, ${changed.code}.`)
    }
  }

  async function logout() {
    if (!confirm('Выйти из аккаунта на этом телефоне?\n\nОбъекты и фото на телефоне останутся.')) return
    await signOut()
    setNotice('')
  }

  if (profile === undefined) return null
  if (profile === null) {
    return (
      <>
        <ProfileForm onSaved={setProfile} />
        {isComputer && (
          <div className="page">
            <PcLink />
          </div>
        )}
      </>
    )
  }
  if (editingProfile) {
    return (
      <ProfileForm
        current={profile}
        onSaved={p => {
          setProfile(p)
          setEditingProfile(false)
          if (accountId) pushProfile(accountId)
        }}
        onCancel={() => setEditingProfile(false)}
      />
    )
  }

  if (loggingIn) return <AccountForm onDone={afterLogin} onCancel={() => setLoggingIn(false)} />

  if (route.screen === 'join') {
    if (account === undefined) return null
    return <JoinScreen token={route.token} account={account} onLogin={() => setLoggingIn(true)} />
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
          {isComputer && <PcLink />}
          {account !== undefined && (
            <div className="list" style={{ marginTop: 24 }}>
              {account ? (
                <div className="item">
                  <Icon name="user" />
                  <div className="grow">
                    <b>Аккаунт: {account.email}</b>
                    <small>{notice || 'Вход выполнен'}</small>
                  </div>
                  <button className="btn-link" onClick={logout}>
                    Выйти
                  </button>
                </div>
              ) : (
                <button className="item" onClick={() => setLoggingIn(true)}>
                  <Icon name="user" />
                  <div className="grow">
                    <b>Войти в аккаунт</b>
                    <small>Чтобы работать вместе с бригадой</small>
                  </div>
                  <Icon name="right" />
                </button>
              )}
            </div>
          )}
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
