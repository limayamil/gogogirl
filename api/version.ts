import { requireUser } from './_lib/auth.ts'
import { route } from './_lib/http.ts'
import { stateVersion } from './_lib/version.ts'

/**
 * GET /api/version
 *
 * La firma del estado de esta cuenta, sola. El front la consulta cada tanto
 * para saber si hay novedades sin re-descargar /api/state entero.
 */
export default route({
  async GET(req, res) {
    const { id: userId } = await requireUser(req)
    res.status(200).json({ version: await stateVersion(userId) })
  },
})
