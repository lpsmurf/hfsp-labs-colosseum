import { useCallback, useEffect, useMemo, useState } from 'react'
import { isMiniappMode, onWalletChange, requestCreateAccount } from '@aboutcircles/miniapp-sdk'

export function useCirclesAccount() {
  const inHost = useMemo(() => isMiniappMode(), [])
  const [address, setAddress]         = useState(null)
  const [isConnecting, setConnecting] = useState(false)
  const [error, setError]             = useState(null)

  useEffect(() => {
    if (!inHost) return
    return onWalletChange(setAddress)
  }, [inHost])

  const connect = useCallback(async () => {
    if (!inHost) { setError('Open this app inside the Circles host.'); return null }
    setConnecting(true)
    setError(null)
    try {
      const result = await requestCreateAccount()
      return result.address
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed.')
      return null
    } finally {
      setConnecting(false)
    }
  }, [inHost])

  return { address, inHost, isConnecting, error, connect }
}
