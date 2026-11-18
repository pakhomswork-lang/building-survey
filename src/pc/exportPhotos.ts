// Выгрузка описания фото для ИИ и Excel (17в, Р-43).
// Одна таблица CSV: строка на фото — где лежит файл, где снято (лист, точка, место на листе),
// тип, кто и когда снимал, комментарий точки. Выгружаются фото, отобранные на экране «Все фото».

import { db, getMyIds, getUserProfile, PHOTO_TYPES, type Photo } from '../db'
import { findInFolder } from '../pcFolder'

interface Person {
  name: string
  code: string
}

/** Имя и код автора: свой профиль или участник бригады из settings `person:<id>`. */
async function peopleMap(): Promise<(id: string) => Person | null> {
  const [myIds, me, rows] = await Promise.all([getMyIds(), getUserProfile(), db.settings.where('key').startsWith('person:').toArray()])
  const map = new Map<string, Person>()
  for (const r of rows) {
    try {
      map.set(r.key.slice('person:'.length), JSON.parse(r.value) as Person)
    } catch {
      // испорченная запись — пропускаем
    }
  }
  return id => (myIds.has(id) && me ? { name: me.name, code: me.code } : (map.get(id) ?? null))
}

/** Ячейка CSV: в кавычках, если внутри разделитель, кавычки или перенос строки. */
function cell(v: string | number): string {
  const s = String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const pad = (n: number) => String(n).padStart(2, '0')
function dateTime(t: number) {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Таблица CSV для Excel (разделитель «;», UTF-8 с меткой — тогда Excel не портит русские буквы). */
export async function buildPhotoCsv(projectId: string, photos: Photo[]): Promise<string> {
  const [project, sheets, points, who] = await Promise.all([
    db.projects.get(projectId),
    db.sheets.where('projectId').equals(projectId).sortBy('order'),
    db.points.where('projectId').equals(projectId).sortBy('createdAt'),
    peopleMap(),
  ])
  const liveSheets = sheets.filter(s => !s.deleted)
  const livePoints = points.filter(p => !p.deleted)
  const sheetName = new Map(liveSheets.map(s => [s.id, s.name]))
  // номер точки — как на листе: по порядку постановки
  const pointNo = new Map<string, number>()
  for (const s of liveSheets) livePoints.filter(p => p.sheetId === s.id).forEach((p, i) => pointNo.set(p.id, i + 1))
  const pointById = new Map(livePoints.map(p => [p.id, p]))

  const header = [
    '№',
    'Файл',
    'Где лежит в папке с фото',
    'Объект',
    'Лист',
    'Точка',
    'Место на листе, % слева',
    'Место на листе, % сверху',
    'Тип фото',
    'Снимал',
    'Код автора',
    'Дата и время съёмки',
    'Комментарий к точке',
  ]
  const rows = photos.map((p, i) => {
    const point = pointById.get(p.pointId)
    const author = who(p.authorId)
    return [
      i + 1,
      p.fileName,
      findInFolder(p.fileName)?.path ?? 'нет в папке',
      project?.name ?? '',
      sheetName.get(p.sheetId) ?? '',
      pointNo.get(p.pointId) ?? '',
      point ? point.x.toFixed(1) : '',
      point ? point.y.toFixed(1) : '',
      PHOTO_TYPES[p.type],
      author?.name ?? '',
      author?.code ?? p.fileName.split('_')[0],
      dateTime(p.takenAt),
      point?.comment ?? '',
    ]
  })
  return '﻿' + [header, ...rows].map(r => r.map(cell).join(';')).join('\r\n') + '\r\n'
}

/** Имя файла: «Описание фото — <объект> — 2026-11-19.csv». */
export function csvFileName(projectName: string) {
  const d = new Date()
  const safe = projectName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Объект'
  return `Описание фото — ${safe} — ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`
}

/** Отдать файл пользователю: Chrome сохранит его в «Загрузки» (или спросит куда). */
export function saveTextFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
