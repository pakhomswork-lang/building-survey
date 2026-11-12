import { createClient } from '@supabase/supabase-js'

// Сервер данных бригады (Р-28). Ключ публичный: доступ ограничивают правила базы (RLS).
// Secret key сюда класть нельзя никогда.
const SUPABASE_URL = 'https://rfhkuqboctwgsjdwfgjp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_yBFR84AlEiIDwSWklrYGCg_jA0ye_Nr'

/** Сколько ждём ответа сервера. Картинки листов большие — им даём больше. */
const TIMEOUT_MS = 25_000
const FILE_TIMEOUT_MS = 120_000

/** Текст ошибки, когда сервер не ответил вовремя. По нему ошибку узнают в explain(). */
export const NO_ANSWER = 'Сервер не отвечает'

/**
 * Запрос к серверу с ограничением по времени. Без него, если связь «повисла»
 * (соединение не рвётся, но и не отвечает), приложение ждало бы вечно (Р-36).
 */
async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init?.signal) return fetch(input, init)
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const ms = url.includes('/storage/') ? FILE_TIMEOUT_MS : TIMEOUT_MS
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(ms) })
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new Error(NO_ANSWER)
    throw e
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // вход запоминается на телефоне и работает без интернета до следующего обновления
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  global: { fetch: fetchWithTimeout },
})

/** Понятный текст для ошибок связи с сервером; остальные возвращает как есть. */
export function explainNetwork(message: string): string {
  const m = message.toLowerCase()
  // из России сервер доступен только через VPN (Р-37)
  if (m.includes(NO_ANSWER.toLowerCase())) return `${NO_ANSWER}. Включите VPN и попробуйте снова.`
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed')) return 'Нет связи с сервером. Проверьте интернет и VPN.'
  return message
}
