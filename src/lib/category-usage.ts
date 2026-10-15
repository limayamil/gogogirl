/**
 * Ranking del picker de categoría. Cuenta elecciones, no un modelo de
 * probabilidad: la más usada va a la izquierda y el empate deja el orden de hoy.
 */

export const CATEGORY_USAGE_COOKIE = 'gogogirl.categoryUsage'

/** Líneas del picker cerrado. Lo que no entra queda detrás del chevron. */
export const COLLAPSED_CATEGORY_LINES = 2

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

/** Más usadas primero. Empate: se queda el orden de `ids` (el de hoy). */
export function rankCategoryIds(
  ids: readonly (string | null)[],
  usage: CategoryUsage,
): (string | null)[] {
  return ids
    .map((id, index) => ({ id, index, count: countOf(usage, id) }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((item) => item.id)
}

/**
 * Prefijo del ranking que entra en `maxLines` sin achicar un chip.
 * `widths[i]` es el ancho del nombre completo. Si la seleccionada no entra,
 * se mete al final y se sueltan las menos usadas hasta que vuelva a caber.
 */
export function fitCategoryChips(
  ids: readonly (string | null)[],
  widths: readonly number[],
  containerWidth: number,
  gap: number,
  selectedId: string | null = null,
  maxLines = COLLAPSED_CATEGORY_LINES,
): (string | null)[] {
  if (containerWidth <= 0 || widths.length < ids.length) return [...ids]

  const fitted = packChips(ids, widths, containerWidth, gap, maxLines)
  const selectedAt = ids.indexOf(selectedId)
  if (selectedAt < 0 || fitted.includes(selectedId)) return fitted

  for (let keep = fitted.length; keep >= 0; keep--) {
    const attempt = [...fitted.slice(0, keep), selectedId]
    const attemptWidths = attempt.map((id) => widths[ids.indexOf(id)] ?? 0)
    if (packChips(attempt, attemptWidths, containerWidth, gap, maxLines).length === attempt.length) {
      return attempt
    }
  }
  return fitted
}

function packChips(
  ids: readonly (string | null)[],
  widths: readonly number[],
  containerWidth: number,
  gap: number,
  maxLines: number,
): (string | null)[] {
  const fitted: (string | null)[] = []
  let lines = 0
  let used = 0
  let open = false

  for (let i = 0; i < ids.length; i++) {
    const width = widths[i] ?? 0
    if (!open) {
      if (lines >= maxLines) break
      lines += 1
      open = true
      used = width
      fitted.push(ids[i])
      continue
    }
    if (used + gap + width <= containerWidth) {
      used += gap + width
      fitted.push(ids[i])
      continue
    }
    if (lines >= maxLines) break
    lines += 1
    used = width
    fitted.push(ids[i])
  }

  return fitted
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
