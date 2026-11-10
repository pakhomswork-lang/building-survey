import { createClient } from '@supabase/supabase-js'

// Сервер данных бригады (Р-28). Ключ публичный: доступ ограничивают правила базы (RLS).
// Secret key сюда класть нельзя никогда.
const SUPABASE_URL = 'https://rfhkuqboctwgsjdwfgjp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_yBFR84AlEiIDwSWklrYGCg_jA0ye_Nr'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // вход запоминается на телефоне и работает без интернета до следующего обновления
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
