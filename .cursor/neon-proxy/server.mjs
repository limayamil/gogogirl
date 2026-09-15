// Proxy HTTP que emula el endpoint `/sql` de Neon para desarrollo local.
//
// El driver @neondatabase/serverless no habla el protocolo de Postgres: hace un POST
// a `https://<host>/sql` con `{ query, params }` y espera JSON con `rows` (en crudo,
// como texto), `fields` (con su `dataTypeID`), `rowCount` y `command`. En produccion ese
// endpoint es el proxy de Neon; en local lo reemplazamos por este, que reenvia a un
// Postgres comun via `pg`. Asi el codigo de la app no cambia entre dev y prod.
//
// Claves del contrato: el cliente pide `Neon-Raw-Text-Output: true` y `Neon-Array-Mode:
// true`, o sea que las filas viajan como arrays de texto sin parsear y el propio driver
// aplica los type parsers segun el `dataTypeID` de cada columna. Por eso devolvemos los
// valores tal cual los da Postgres en modo texto (getTypeParser identidad) y las filas
// como arrays (rowMode 'array').

import { createServer } from 'node:http'
import pg from 'pg'

const { Pool } = pg

const PORT = Number(process.env.NEON_PROXY_PORT ?? 4444)
const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/main'

const pool = new Pool({ connectionString, max: 10 })

// Identidad: dejamos el texto crudo para que el parseo lo haga el driver del cliente.
const rawText = { getTypeParser: () => (value) => value }

function serializeResult(result) {
  return {
    command: result.command,
    rowCount: result.rowCount,
    rows: result.rows,
    fields: (result.fields ?? []).map((f) => ({
      name: f.name,
      dataTypeID: f.dataTypeID,
      tableID: f.tableID,
      columnID: f.columnID,
      dataTypeSize: f.dataTypeSize,
      dataTypeModifier: f.dataTypeModifier,
      format: f.format,
    })),
  }
}

async function runQuery(client, { query, params }) {
  const result = await client.query({
    text: query,
    values: params ?? [],
    rowMode: 'array',
    types: rawText,
  })
  return serializeResult(result)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { ok: true })
  }
  if (req.method !== 'POST') {
    return sendJson(res, 405, { message: 'Solo POST' })
  }

  let payload
  try {
    payload = JSON.parse((await readBody(req)) || '{}')
  } catch {
    return sendJson(res, 400, { message: 'JSON invalido' })
  }

  // Batch (sql.transaction): corre todo dentro de una transaccion.
  if (Array.isArray(payload.queries)) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const results = []
      for (const q of payload.queries) results.push(await runQuery(client, q))
      await client.query('COMMIT')
      return sendJson(res, 200, { results })
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // ignorar: la conexion se libera igual
      }
      return sendJson(res, 400, pgError(error))
    } finally {
      client.release()
    }
  }

  // Query simple.
  try {
    const result = await runQuery(pool, payload)
    return sendJson(res, 200, result)
  } catch (error) {
    return sendJson(res, 400, pgError(error))
  }
})

function pgError(error) {
  return {
    message: error.message,
    code: error.code,
    detail: error.detail,
    hint: error.hint,
    severity: error.severity,
    position: error.position,
    where: error.where,
    schema: error.schema,
    table: error.table,
    column: error.column,
    dataType: error.dataType,
    constraint: error.constraint,
  }
}

server.listen(PORT, () => {
  console.log(`[neon-proxy] escuchando en http://localhost:${PORT}/sql -> ${connectionString.replace(/:[^:@/]*@/, ':***@')}`)
})
