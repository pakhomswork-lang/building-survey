import { useEffect, useMemo } from 'react'

/** Ссылка для <img> на картинку из базы. Освобождается, когда картинка больше не нужна. */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const url = useMemo(() => blob && URL.createObjectURL(blob), [blob])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])
  return url
}
