import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Las dos tablas se escriben a mano (Netlify no sigue imports dinamicos), asi que nada
// impide que se desincronicen salvo este test: una ruta que falta en api.mts anda en
// dev y falla recien en produccion.
async function paths(file: string): Promise<string[]> {
  const source = await readFile(join(root, file), 'utf8')
  return [...source.matchAll(/\[\s*'(\/api\/[^']*)'\s*,/g)].map((match) => match[1]).sort()
}

describe('tablas de rutas', () => {
  it('dev y produccion exponen las mismas rutas', async () => {
    const dev = await paths('scripts/dev-server.ts')
    const prod = await paths('netlify/functions/api.mts')
    expect(dev.length).toBeGreaterThan(0)
    expect(prod).toEqual(dev)
  })

  it('incluyen las rutas de la tablet', async () => {
    for (const file of ['scripts/dev-server.ts', 'netlify/functions/api.mts']) {
      expect(await paths(file)).toEqual(
        expect.arrayContaining(['/api/tablet/tasks', '/api/tablet/tasks/done']),
      )
    }
  })
})
