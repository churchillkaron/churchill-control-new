'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()

  useEffect(() => {
    router.push('/control-final')
  }, [])

  return (
    <div style={{ padding: 20 }}>
      <h1>Redirecting...</h1>
    </div>
  )
}