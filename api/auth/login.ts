import { loginUser, openSession, parseCredentials, sessionFor } from '../_lib/auth.ts'
import { body, route } from '../_lib/http.ts'

/** POST /api/auth/login */
export default route({
  async POST(req, res) {
    const { username, password } = parseCredentials(body(req))
    const user = await loginUser(username, password)
    await openSession(req, res, user.id)
    res.status(200).json(await sessionFor(user))
  },
})
