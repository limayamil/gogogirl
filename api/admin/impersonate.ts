import { requireAdmin, userForImpersonation } from '../_lib/admin.ts'
import { openSession, sessionFor } from '../_lib/auth.ts'
import { body, notFound, route } from '../_lib/http.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/admin/impersonate
 * Abre la sesion real de esa cuenta, marcada para no mover last_seen_at.
 * Lo que se escriba despues queda en la cuenta: requireUser lee este user id.
 */
export default route({
  async POST(req, res) {
    await requireAdmin(req)
    const input = body(req)
    const userId = typeof input.userId === 'string' ? input.userId : ''
    if (!UUID.test(userId)) notFound()
    const user = await userForImpersonation(userId)
    if (!user) notFound()
    await openSession(req, res, user.id, { impersonated: true })
    res.status(200).json(await sessionFor(user, true))
  },
})
