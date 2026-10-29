import { useEffect, useState } from 'react'

// Какой экран открыт, храним в адресе после «#», например #/project/<id>.
// Так кнопка «Назад» на телефоне возвращает на предыдущий экран, а не закрывает приложение.

export type Route =
  | { screen: 'projects' }
  | { screen: 'project'; projectId: string }
  | { screen: 'photos'; projectId: string }
  | { screen: 'sheet'; sheetId: string }

function parse(hash: string): Route {
  const [, screen, id] = hash.replace(/^#/, '').split('/')
  if (screen === 'project' && id) return { screen: 'project', projectId: id }
  if (screen === 'photos' && id) return { screen: 'photos', projectId: id }
  if (screen === 'sheet' && id) return { screen: 'sheet', sheetId: id }
  return { screen: 'projects' }
}

export function navigate(route: Route) {
  if (route.screen === 'project') location.hash = `/project/${route.projectId}`
  else if (route.screen === 'photos') location.hash = `/photos/${route.projectId}`
  else if (route.screen === 'sheet') location.hash = `/sheet/${route.sheetId}`
  else location.hash = '/'
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
