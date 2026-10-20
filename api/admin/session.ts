import { adminAuthenticated, assertAdminEnabled } from '../_lib/admin.ts'
import { route } from '../_lib/http.ts'

/**
 * GET /api/admin/session
 * 404 si faltan las variables: el front muestra el mismo estado que una ruta
 * desconocida, sin formulario. 200 con authenticated false si el panel existe
 * y todavia nadie entro.
 */
export default route({
  async GET(req, res) {
    assertAdminEnabled()
    res.status(200).json({ authenticated: await adminAuthenticated(req) })
  },
})
