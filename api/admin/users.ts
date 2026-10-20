import { listUsers, requireAdmin } from '../_lib/admin.ts'
import { route } from '../_lib/http.ts'

/** GET /api/admin/users — usuario, alta, ultima actividad y conteos. Nada mas. */
export default route({
  async GET(req, res) {
    await requireAdmin(req)
    res.status(200).json({ users: await listUsers() })
  },
})
