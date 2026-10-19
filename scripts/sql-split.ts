/**
 * Parte un archivo de migracion en sentencias.
 *
 * El driver HTTP de Neon manda una sentencia por request. Un `split(';')` rompe
 * los bloques `do $$ ... $$` (ahi adentro hay punto y coma legitimos) y se
 * comeria la migracion de cuentas, que tiene que correr entera o no correr.
 */

/** Texto SQL sin comentarios de linea ni de bloque, para saber si queda codigo. */
function withoutComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .trim()
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let i = 0
  let dollar: string | null = null

  while (i < sql.length) {
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        current += dollar
        i += dollar.length
        dollar = null
        continue
      }
      current += sql[i]
      i += 1
      continue
    }

    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i)
      const next = end === -1 ? sql.length : end + 1
      current += sql.slice(i, next)
      i = next
      continue
    }

    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2)
      const next = end === -1 ? sql.length : end + 2
      current += sql.slice(i, next)
      i = next
      continue
    }

    if (sql[i] === "'") {
      current += "'"
      i += 1
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          current += "''"
          i += 2
          continue
        }
        current += sql[i]
        const closed = sql[i] === "'"
        i += 1
        if (closed) break
      }
      continue
    }

    if (sql[i] === '$') {
      const match = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i))
      if (match) {
        dollar = match[0]
        current += dollar
        i += dollar.length
        continue
      }
    }

    if (sql[i] === ';') {
      const statement = current.trim()
      if (withoutComments(statement)) statements.push(statement)
      current = ''
      i += 1
      continue
    }

    current += sql[i]
    i += 1
  }

  const tail = current.trim()
  if (withoutComments(tail)) statements.push(tail)
  return statements
}
