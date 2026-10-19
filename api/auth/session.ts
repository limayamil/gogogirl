import { currentUser, sessionFor } from '../_lib/auth.ts'
import { route } from '../_lib/http.ts'

/**
 * GET /api/auth/session
 * Quien esta adentro, y si la cuenta que ya tiene los datos sigue sin usuario.
 * Si hay mas de una cuenta sin credenciales, sessionFor no adivina y corta.
 */
export default route({
  async GET(req, res) {
    res.status(200).json(await sessionFor(await currentUser(req)))
  },
})
