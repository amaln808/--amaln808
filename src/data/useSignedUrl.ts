import { useEffect, useState } from 'react'
import { type Bucket, signedUrl } from './files'

/** Temporary link to a private file (null while loading or when there is no file). */
export function useSignedUrl(bucket: Bucket, path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setUrl(null)
    if (path) signedUrl(bucket, path).then((u) => !cancelled && setUrl(u)).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [bucket, path])
  return url
}
