import { openSession, parseCredentials, registerUser, sessionFor } from '../_lib/auth.ts'
import { body, route } from '../_lib/http.ts'

/**
 * POST /api/auth/register
 * Inserta una fila en users y nada mas. Las tareas y notas que ya existen
 * siguen en la cuenta duena; esta no las recibe.
 */
export default route({
  async POST(req, res) {
    const { username, password } = parseCredentials(body(req))
    const user = await registerUser(username, password)
    await openSession(req, res, user.id)
    res.status(201).json(await sessionFor(user))
  },
})
