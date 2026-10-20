import { assertAdminEnabled, closeAdminSession } from '../_lib/admin.ts'
import { route } from '../_lib/http.ts'

/** POST /api/admin/logout — solo la cookie del panel, no la de una cuenta. */
export default route({
  async POST(req, res) {
    assertAdminEnabled()
    await closeAdminSession(req, res)
    res.status(200).json({ authenticated: false })
  },
})
