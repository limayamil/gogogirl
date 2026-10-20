import type { AuthSession } from '../shared/types'

/**
 * El aviso fijo solo cuando esta sesion se abrio con "Ver como".
 * Una cuenta que entro con su usuario no lo ve, aunque el campo venga en null.
 */
export function impersonationBanner(
  session: Pick<AuthSession, 'impersonating'> | null | undefined,
): { username: string } | null {
  const username = session?.impersonating?.username
  if (!username) return null
  return { username }
}
