/**
 * Servidor de desarrollo. Monta los mismos handlers de api/ que Vercel ejecuta en
 * produccion, asi no hace falta `vercel dev` (ni login) para trabajar en local.
 * Vite proxea /api aca (ver vite.config.ts).
 */
import 'dotenv/config'
import express from 'express'
import type { Handler } from '../api/_lib/http.ts'

const PORT = Number(process.env.API_PORT ?? 3001)

const app = express()
app.use(express.json({ limit: '1mb' }))

/** Cada entrada refleja un archivo de api/; el `:id` de Express se copia a req.query.id. */
const routes: Array<[path: string, module: string]> = [
  ['/api/state', '../api/state.ts'],
  ['/api/categories', '../api/categories/index.ts'],
  ['/api/categories/:id', '../api/categories/[id].ts'],
  ['/api/tasks', '../api/tasks/index.ts'],
  ['/api/tasks/:id', '../api/tasks/[id].ts'],
  ['/api/subtasks', '../api/subtasks/index.ts'],
  ['/api/subtasks/:id', '../api/subtasks/[id].ts'],
  ['/api/quick-tasks', '../api/quick-tasks/index.ts'],
  ['/api/quick-tasks/:id', '../api/quick-tasks/[id].ts'],
  ['/api/attachments', '../api/attachments/index.ts'],
  ['/api/attachments/:id', '../api/attachments/[id].ts'],
  ['/api/uploads/sign', '../api/uploads/sign.ts'],
]

for (const [path, modulePath] of routes) {
  app.all(path, async (req, res, next) => {
    try {
      const mod = (await import(modulePath)) as { default: Handler }
      await mod.default(
        {
          method: req.method,
          url: req.originalUrl,
          query: { ...req.query, ...req.params } as Record<string, string>,
          body: req.body,
          headers: req.headers as Record<string, string>,
        },
        res as never,
      )
    } catch (error) {
      next(error)
    }
  })
}

app.use((req, res) => {
  res.status(404).json({ error: `Sin ruta para ${req.method} ${req.path}` })
})

app.listen(PORT, () => {
  console.log(`[api] escuchando en http://localhost:${PORT}`)
})
