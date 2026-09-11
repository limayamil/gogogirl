/**
 * Punto de entrada unico de la API en Netlify. Una sola funcion atiende toda la familia
 * /api/* y reparte con la tabla de rutas de abajo, que es el equivalente en Netlify del
 * ruteo por archivos: cada entrada refleja un archivo de api/.
 *
 * Los imports son estaticos a proposito: el bundler de Netlify no puede seguir un
 * `import()` con variable, asi que un import dinamico dejaria los handlers fuera del
 * paquete y la funcion fallaria recien en produccion.
 */
import { createApiHandler, type Route } from '../lib/router.ts'

import state from '../../api/state.ts'
import categories from '../../api/categories/index.ts'
import categoryById from '../../api/categories/[id].ts'
import tasks from '../../api/tasks/index.ts'
import taskById from '../../api/tasks/[id].ts'
import subtasks from '../../api/subtasks/index.ts'
import subtaskById from '../../api/subtasks/[id].ts'
import quickTasks from '../../api/quick-tasks/index.ts'
import quickTaskById from '../../api/quick-tasks/[id].ts'
import attachments from '../../api/attachments/index.ts'
import attachmentById from '../../api/attachments/[id].ts'
import uploadsSign from '../../api/uploads/sign.ts'

const routes: Route[] = [
  ['/api/state', state],
  ['/api/categories', categories],
  ['/api/categories/:id', categoryById],
  ['/api/tasks', tasks],
  ['/api/tasks/:id', taskById],
  ['/api/subtasks', subtasks],
  ['/api/subtasks/:id', subtaskById],
  ['/api/quick-tasks', quickTasks],
  ['/api/quick-tasks/:id', quickTaskById],
  ['/api/attachments', attachments],
  ['/api/attachments/:id', attachmentById],
  ['/api/uploads/sign', uploadsSign],
]

export default createApiHandler(routes)

/** Netlify enruta por este patron, antes que el fallback del SPA de netlify.toml. */
export const config = { path: '/api/*' }
