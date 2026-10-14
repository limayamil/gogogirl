/**
 * Ranking del picker de categoría. Cuenta elecciones, no un modelo de
 * probabilidad: la más usada va a la izquierda y el empate deja el orden de hoy.
 */

export const CATEGORY_USAGE_COOKIE = 'gogogirl.categoryUsage'

/** Cuántas chips entran en la fila colapsada. */
export const COLLAPSED_CATEGORY_LIMIT = 4

/**
 * "Sin categoría" no tiene uuid. La cookie es un mapa de id → veces, así que
 * necesita una clave estable para esa opción.
 */
export const SIN_CATEGORIA_USAGE_KEY = 'sin-categoria'

/**
 * Un año. Sin Max-Age el navegador tira la cookie al cerrar la sesión y el
 * orden vuelve a cero.
 */
const CATEGORY_USAGE_MAX_AGE = 60 * 60 * 24 * 365

export type CategoryUsage = Record<string, number>

export function categoryUsageKey(categoryId: string | null): string {
  return categoryId ?? SIN_CATEGORIA_USAGE_KEY
}

export function parseCategoryUsage(raw: string | null | undefined): CategoryUsage {
  if (!raw) return {}
  let decoded = raw
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    // Un `%` suelto no es un mapa: se intenta el texto crudo abajo.
  }
  return usageFromJson(decoded)
}

export function readCategoryUsage(cookieHeader: string): CategoryUsage {
  return parseCategoryUsage(readCookie(cookieHeader, CATEGORY_USAGE_COOKIE))
}

export function formatCategoryUsageCookie(usage: CategoryUsage): string {
  const value = encodeURIComponent(JSON.stringify(usage))
  return `${CATEGORY_USAGE_COOKIE}=${value}; Path=/; SameSite=Lax; Max-Age=${CATEGORY_USAGE_MAX_AGE}`
}

/** Suma uno. No muta el mapa anterior: el estado de React lo reemplaza entero. */
export function recordCategorySelection(usage: CategoryUsage, categoryId: string | null): CategoryUsage {
  const key = categoryUsageKey(categoryId)
  const current = usage[key]
  const count = typeof current === 'number' && Number.isInteger(current) && current > 0 ? current : 0
  return { ...usage, [key]: count + 1 }
}

/**
 * Orden completo, o las primeras `limit` si está colapsado.
 * Si la seleccionada no entra en ese recorte, ocupa el lugar de la menos usada
 * (la última: el orden ya las dejó así) para que el chip activo no desaparezca.
 */
export function rankCategoryChips(
  ids: readonly (string | null)[],
  usage: CategoryUsage,
  selectedId: string | null,
  expanded: boolean,
  limit = COLLAPSED_CATEGORY_LIMIT,
): (string | null)[] {
  const ranked = ids
    .map((id, index) => ({ id, index, count: countOf(usage, id) }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((item) => item.id)

  if (expanded || ranked.length <= limit) return ranked

  const top = ranked.slice(0, limit)
  if (top.includes(selectedId)) return top
  if (!ranked.includes(selectedId)) return top
  return [...top.slice(0, -1), selectedId]
}

function countOf(usage: CategoryUsage, categoryId: string | null): number {
  const value = usage[categoryUsageKey(categoryId)]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function usageFromJson(text: string): CategoryUsage {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const usage: CategoryUsage = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (key.length === 0) continue
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) continue
    usage[key] = value
  }
  return usage
}

function readCookie(header: string, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1)
  }
  return null
}
