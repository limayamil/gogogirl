import { readSession, sessionFor } from '../_lib/auth.ts'
import { route } from '../_lib/http.ts'

/**
 * GET /api/auth/session
 * Quien esta adentro, y si la cuenta que ya tiene los datos sigue sin usuario.
 * Si hay mas de una cuenta sin credenciales, sessionFor no adivina y corta.
 * `impersonating` solo viene cuando la fila de sesion se abrio con "Ver como".
 */
export default route({
  async GET(req, res) {
    const session = await readSession(req)
    res.status(200).json(await sessionFor(session?.user ?? null, session?.impersonated ?? false))
  },
})
