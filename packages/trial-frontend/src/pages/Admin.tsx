import { useState, useEffect } from 'react'
import useTelegramApp from '../hooks/useTelegramApp'
import { apiClient } from '../services/api'

export function Admin() {
  const { user } = useTelegramApp()
  const [tier, setTier] = useState<string | null>(null)
  const [tenantLoading, setTenantLoading] = useState(true)
  const [tenantError, setTenantError] = useState(false)

  useEffect(() => {
    setTenantLoading(true)
    setTenantError(false)
    apiClient.getAxios().get('/tenant')
      .then((res) => {
        const tenant = res.data?.tenant ?? res.data
        setTier(tenant?.tier ?? tenant?.subscription_tier ?? tenant?.plan ?? 'free_trial')
      })
      .catch(() => setTenantError(true))
      .finally(() => setTenantLoading(false))
  }, [])

  const firstName = user?.first_name ?? 'User'
  const username = user?.username ?? null
  const telegramId = user?.id ?? null

  function tierLabel(t: string | null) {
    if (!t) return '—'
    switch (t) {
      case 'free_trial': return 'Free Trial'
      case 'pro': return 'Pro'
      case 'enterprise': return 'Enterprise'
      default: return t.charAt(0).toUpperCase() + t.slice(1)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">⚙️ Admin</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Account & Settings</p>
      </div>

      <div className="px-4 py-5 space-y-4">
        {/* Account section */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Account</h2>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            <div className="px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Name</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{firstName}</span>
            </div>
            <div className="px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Telegram ID</span>
              <span className="text-sm font-mono text-gray-900 dark:text-white">
                {telegramId ?? '—'}
              </span>
            </div>
            <div className="px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Username</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {username ? `@${username}` : '—'}
              </span>
            </div>
          </div>
        </section>

        {/* Subscription section */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Subscription</h2>
          </div>
          <div className="px-4 py-3 flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">Current Plan</span>
            {tenantLoading ? (
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : tenantError ? (
              <span className="text-sm text-red-500">Error loading</span>
            ) : (
              <span className={`text-sm font-semibold px-2.5 py-1 rounded-full ${
                tier === 'pro'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : tier === 'enterprise'
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              }`}>
                {tierLabel(tier)}
              </span>
            )}
          </div>
        </section>

        {/* Support section */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Support</h2>
          </div>
          <div className="px-4 py-3 flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">Email</span>
            <a
              href="mailto:support@hfsp.cloud"
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              support@hfsp.cloud
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}

export default Admin
