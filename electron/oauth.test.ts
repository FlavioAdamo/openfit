import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const google = require('./google-health-service.cjs')
const legacy = require('./fitbit-legacy-service.cjs')
const whoop = require('./whoop-service.cjs')

const config = {
  clientId: 'client-id',
  clientSecret: 'never-put-this-in-the-url',
  redirectUri: 'http://127.0.0.1:42813/oauth/callback',
}

describe.each([
  ['Google Health', google],
  ['Fitbit legacy', legacy],
])('%s OAuth', (_name, provider) => {
  it('uses PKCE and state without leaking the client secret', () => {
    const pkce = provider.createPkce()
    const url = new URL(provider.createAuthorizationUrl(config, 'csrf-state', pkce))

    expect(pkce.verifier.length).toBeGreaterThanOrEqual(43)
    expect(pkce.challenge).not.toContain('=')
    expect(url.searchParams.get('state')).toBe('csrf-state')
    expect(url.searchParams.get('code_challenge')).toBe(pkce.challenge)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.toString()).not.toContain(config.clientSecret)
  })
})

describe('WHOOP OAuth', () => {
  it('requests read-only health scopes and never places the client secret in the authorization URL', () => {
    const url = new URL(whoop.createAuthorizationUrl({
      ...config,
      redirectUri: 'http://127.0.0.1:42813/oauth/callback',
    }, 'csrf-state', whoop.createPkce()))

    expect(url.origin).toBe('https://api.prod.whoop.com')
    expect(url.pathname).toBe('/oauth/oauth2/auth')
    expect(url.searchParams.get('state')).toBe('csrf-state')
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:42813/oauth/callback')
    expect(url.toString()).not.toContain(config.clientSecret)
    expect(url.searchParams.get('scope')?.split(' ').sort()).toEqual([
      'offline',
      'read:body_measurement',
      'read:cycles',
      'read:profile',
      'read:recovery',
      'read:sleep',
      'read:workout',
    ].sort())
  })
})
