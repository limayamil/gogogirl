import { describe, expect, it } from 'vitest'
import { adminView } from './admin-view'

describe('pantalla de /interno', () => {
  it('sin panel configurado es la pagina inexistente, sin datos de login', () => {
    expect(adminView({ status: 404, authenticated: false }, false, false)).toBe('not-found')
    expect(adminView(undefined, true, false)).toBe('loading')
    expect(adminView(undefined, false, true)).toBe('error')
  })

  it('con el panel prendido muestra el formulario o el listado', () => {
    expect(adminView({ status: 200, authenticated: false }, false, false)).toBe('login')
    expect(adminView({ status: 200, authenticated: true }, false, false)).toBe('panel')
  })
})
