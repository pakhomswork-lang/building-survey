import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db, getUserProfile, saveUserProfile, type UserProfile } from './db'
import { supabase } from './supabase'

/** Вошедший пользователь. */
export interface Account {
  userId: string
  email: string
}

function toAccount(session: Session | null): Account | null {
  return session ? { userId: session.user.id, email: session.user.email ?? '' } : null
}

/**
 * Текущий аккаунт: undefined — ещё проверяем, null — не вошли.
 * Вход хранится в телефоне, поэтому проверка работает и без интернета.
 */
export function useAccount(): Account | null | undefined {
  const [account, setAccount] = useState<Account | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccount(toAccount(data.session)))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAccount(toAccount(session)))
    return () => data.subscription.unsubscribe()
  }, [])
  return account
}

/** Понятный текст вместо английских ошибок сервера. */
function explain(error: { message: string; code?: string }): string {
  const m = error.message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Неверная почта или пароль.'
  if (m.includes('already registered') || error.code === 'user_already_exists') return 'Эта почта уже зарегистрирована. Нажмите «Войти».'
  if (m.includes('password') && m.includes('6')) return 'Пароль должен быть не короче 6 знаков.'
  if (m.includes('email') && m.includes('invalid')) return 'Почта написана с ошибкой.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Нет связи с сервером. Проверьте интернет.'
  return 'Не получилось: ' + error.message
}

/** Вход или регистрация. Возвращает текст ошибки или null, если всё хорошо. */
export async function signIn(email: string, password: string, isNew: boolean): Promise<string | null> {
  if (!navigator.onLine) return 'Нет интернета. Войти можно, когда появится сеть.'
  try {
    const { data, error } = isNew
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    if (error) return explain(error)
    if (!data.session) return 'Аккаунт создан, но вход не выполнен. Попробуйте нажать «Войти».'
    return null
  } catch (e) {
    return explain(e as Error)
  }
}

export async function signOut(): Promise<void> {
  // scope local: выходим только на этом телефоне, без интернета тоже работает
  await supabase.auth.signOut({ scope: 'local' })
}

/**
 * После входа сверяем имя и код с аккаунтом.
 * Если в аккаунте профиль уже есть (вход на новом телефоне), берём его.
 * Если нет — отправляем профиль с телефона.
 * Возвращает профиль, если он поменялся на телефоне.
 */
export async function syncProfileAfterLogin(userId: string): Promise<UserProfile | null> {
  const { data: server, error } = await supabase.from('profiles').select('name, code').eq('id', userId).maybeSingle()
  if (error) {
    await markProfilePending()
    return null
  }
  const local = await getUserProfile()
  if (server && (!local || local.name !== server.name || local.code !== server.code)) {
    return saveUserProfile(server.name, server.code)
  }
  if (!server) await pushProfile(userId)
  return null
}

/** Отправляет имя и код с телефона в аккаунт. Без сети запоминает, что нужно отправить позже. */
export async function pushProfile(userId: string): Promise<void> {
  const local = await getUserProfile()
  if (!local) return
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, name: local.name, code: local.code, updated_at: new Date().toISOString() })
  if (error) await markProfilePending()
  else await db.settings.delete('profilePending')
}

async function markProfilePending() {
  await db.settings.put({ key: 'profilePending', value: '1' })
}

/** Досылает профиль, если раньше не получилось (не было сети). */
export async function retryPendingProfile(userId: string): Promise<void> {
  if (await db.settings.get('profilePending')) await pushProfile(userId)
}
