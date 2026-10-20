import { describe, expect, it } from 'vitest'
import { impersonationBanner } from './impersonation'

const own = { impersonating: null }

describe('aviso de ver como', () => {
  it('no aparece en una sesion propia', () => {
    expect(impersonationBanner(own)).toBeNull()
    expect(impersonationBanner(null)).toBeNull()
    expect(impersonationBanner(undefined)).toBeNull()
    expect(impersonationBanner({ impersonating: { username: '' } })).toBeNull()
  })

  it('aparece solo cuando la sesion esta impersonada', () => {
    expect(impersonationBanner({ impersonating: { username: 'ana' } })).toEqual({ username: 'ana' })
  })
})
