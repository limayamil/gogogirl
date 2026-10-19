import { closeSession, sessionFor } from '../_lib/auth.ts'
import { route } from '../_lib/http.ts'

/** POST /api/auth/logout — borra esta sesion, no los datos de la cuenta. */
export default route({
  async POST(req, res) {
    await closeSession(req, res)
    res.status(200).json(await sessionFor(null))
  },
})
