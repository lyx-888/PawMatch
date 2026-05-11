import type { NextConfig } from 'next'
import path from 'node:path'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
}

export default withSentryConfig(nextConfig, {
  org: 'sg-6w',
  project: 'pawmatch-web',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
  // Source map upload requires SENTRY_AUTH_TOKEN; without it, builds succeed but errors won't deminify.
  // Add SENTRY_AUTH_TOKEN to Vercel env (generate at https://sentry.io/orgredirect/organizations/:orgslug/settings/auth-tokens/)
  // and uncomment the line below once configured:
  // authToken: process.env.SENTRY_AUTH_TOKEN,
})
