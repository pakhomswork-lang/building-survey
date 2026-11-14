import { useEffect, useState } from 'react'
import { retryPendingProfile, signOut, syncProfileAfterLogin, useAccount } from '../account'
import { AccountForm } from '../AccountForm'
import { getUserId, setAccountId } from '../db'
import { startAutoPull } from '../pull'
import { supabase } from '../supabase'
import { startAutoPush } from '../sync'
import { APP_VERSION } from '../version'
import { PcProject } from './PcProject'
import { PcProjects } from './PcProjects'

// Экраны версии для компьютера: #/ — объекты, #/p/<id> — объект.
function parse(hash: string): string | null {
  const [, screen, id] = hash.replace(/^#/, '').split('/')
  return screen === 'p' && id ? id : null
}

function useProjectRoute(): string | null {
  const [id, setId] = useState(() => parse(location.hash))
  useEffect(() => {
    const onChange = () => setId(parse(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return id
}

export function PcApp() {
  const account = useAccount()
  const accountId = account?.userId
  const accountKnown = account !== undefined
  const projectId = useProjectRoute()
  const [loggingIn, setLoggingIn] = useState(false)
  // номер устройства создаётся при первом запуске; экраны читают его и не должны создавать сами
  const [ready, setReady] = useState(false)
  useEffect(() => {
    getUserId().then(() => setReady(true))
  }, [])

  // как в телефонной версии: пока вошли, общие объекты приходят с сервера (Р-33),
  // а свои правки (тип фото) уходят на сервер (Р-32)
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

  useEffect(() => {
    if (accountId) void retryPendingProfile(accountId)
  }, [accountId])

  async function afterLogin() {
    setLoggingIn(false)
    const { data } = await supabase.auth.getSession()
    // имя и код берём из аккаунта: по ним видно, где свои фото
    if (data.session) await syncProfileAfterLogin(data.session.user.id)
  }

  async function logout() {
    if (!confirm('Выйти из аккаунта на этом компьютере?')) return
    await signOut()
  }

  if (!ready) return null
  if (loggingIn) return <AccountForm onDone={afterLogin} onCancel={() => setLoggingIn(false)} />

  return (
    <div className="pc">
      <header className="pc-top">
        <a className="pc-brand" href="#/">
          Обследование <span>компьютер</span>
        </a>
        <span className="spacer" />
        {account === undefined ? null : account ? (
          <>
            <span className="pc-muted">{account.email}</span>
            <button className="pc-btn" onClick={logout}>
              Выйти
            </button>
          </>
        ) : (
          <button className="pc-btn primary" onClick={() => setLoggingIn(true)}>
            Войти в аккаунт
          </button>
        )}
      </header>
      {projectId ? (
        <PcProject key={projectId} projectId={projectId} />
      ) : (
        <PcProjects signedIn={!!account} version={APP_VERSION} />
      )}
    </div>
  )
}
