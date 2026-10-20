export type AdminView = 'loading' | 'not-found' | 'error' | 'login' | 'panel'

/**
 * Sin las variables el API responde 404 y esta pantalla es la de una ruta
 * desconocida: no hay formulario. El login solo aparece cuando el panel existe.
 */
export function adminView(
  gate: { status: number; authenticated: boolean } | undefined,
  pending: boolean,
  failed: boolean,
): AdminView {
  if (pending) return 'loading'
  if (failed || !gate) return 'error'
  if (gate.status === 404) return 'not-found'
  if (gate.status !== 200) return 'error'
  return gate.authenticated ? 'panel' : 'login'
}
