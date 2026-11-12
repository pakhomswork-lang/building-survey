// Приглашение в общий объект по ссылке (шаг 15б, Р-35).
// Ссылку выдаёт и проверяет сервер (supabase/04_invites.sql), приложение только показывает.

import { pushProfile } from './account'
import { resetPullCursors } from './db'
import { pullAll } from './pull'
import { explainNetwork, supabase } from './supabase'

const explain = explainNetwork

/** Адрес, который отправляем коллеге. */
export function inviteLink(token: string): string {
  return `${location.origin}${location.pathname}#/join/${token}`
}

/** Ссылка объекта. renew — старая перестаёт работать, создаётся новая. */
export async function getInviteToken(projectId: string, renew = false): Promise<string> {
  const { data, error } = await supabase.rpc('invite_token', { p_project: projectId, p_new: renew })
  if (error) throw new Error(explain(error.message))
  return data as string
}

export interface InviteInfo {
  projectId: string
  projectName: string
  members: number
  alreadyMember: boolean
}

/** Что за объект по ссылке. null — ссылка не работает. */
export async function getInviteInfo(token: string): Promise<InviteInfo | null> {
  const { data, error } = await supabase.rpc('invite_info', { p_token: token })
  if (error) throw new Error(explain(error.message))
  const row = (data as { project_id: string; project_name: string; members: number; already_member: boolean }[])[0]
  return row ? { projectId: row.project_id, projectName: row.project_name, members: row.members, alreadyMember: row.already_member } : null
}

/** Вступить в объект. После вступления забираем с сервера всё заново, чтобы пришли и старые записи объекта. */
export async function joinProject(token: string, userId: string): Promise<string> {
  // сервер проверяет код автора по профилю, поэтому сначала убеждаемся, что профиль на сервере
  await pushProfile(userId)
  const { data, error } = await supabase.rpc('join_project', { p_token: token })
  if (error) throw new Error(explain(error.message))
  await resetPullCursors()
  pullAll()
  return data as string
}
