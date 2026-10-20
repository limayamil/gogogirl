import {
  adminCredentialsMatch,
  assertAdminEnabled,
  openAdminSession,
  rejectAdminLogin,
} from '../_lib/admin.ts'
import { body, route } from '../_lib/http.ts'

/**
 * POST /api/admin/login
 * No inserta ni modifica users. Usuario o contrasena malos devuelven el mismo
 * error: no se dice cual de los dos fallo.
 */
export default route({
  async POST(req, res) {
    assertAdminEnabled()
    const input = body(req)
    const username = typeof input.username === 'string' ? input.username.trim() : ''
    const password = typeof input.password === 'string' ? input.password : ''
    if (!username || !password || !(await adminCredentialsMatch(username, password))) {
      rejectAdminLogin()
    }
    await openAdminSession(req, res)
    res.status(200).json({ authenticated: true })
  },
})
