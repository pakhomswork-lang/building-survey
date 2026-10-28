import { useEffect, useState } from 'react'

// Какой экран открыт, храним в адресе после «#», например #/project/<id>.
// Так кнопка «Назад» на телефоне возвращает на предыдущий экран, а не закрывает приложение.

export type Route = { screen: 'projects' } | { screen: 'project'; projectId: string }

function parse(hash: string): Route {
  const [, screen, id] = hash.replace(/^#/, '').split('/')
  if (screen === 'project' && id) return { screen: 'project', projectId: id }
  return { screen: 'projects' }
}

export function navigate(route: Route) {
  location.hash = route.screen === 'project' ? `/project/${route.projectId}` : '/'
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
