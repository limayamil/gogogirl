/**
 * Recalcula `todayPosition` al soltar una fila de Hoy sobre otra.
 * Opera sobre el orden que recibe (el visible, o el guardado) para no pisar huecos.
 */
export function nextTodayPositions(
  orderedIds: readonly string[],
  activeId: string,
  overId: string,
): { id: string; todayPosition: number }[] | null {
  const from = orderedIds.indexOf(activeId)
  const to = orderedIds.indexOf(overId)
  if (from < 0 || to < 0 || from === to) return null

  const next = orderedIds.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)

  return next.map((id, todayPosition) => ({ id, todayPosition }))
}

type TodayOrdered = { status: string; todayPosition: number | null }

/**
 * Orden del panel de Hoy.
 * Con el ajuste apagado es `todayPosition`. Prendido, las `hecha` bajan juntas
 * y el resto (pendiente y en progreso) se queda en el orden que ya tenía.
 * No esconde nada: "Ocultar hechas" sigue filtrando las listas por su cuenta.
 */
export function sortTodayTasks<T extends TodayOrdered>(tasks: readonly T[], completedLast: boolean): T[] {
  const byPosition = tasks.slice().sort((a, b) => (a.todayPosition ?? 0) - (b.todayPosition ?? 0))
  if (!completedLast) return byPosition
  const pending: T[] = []
  const done: T[] = []
  for (const task of byPosition) {
    if (task.status === 'hecha') done.push(task)
    else pending.push(task)
  }
  return pending.concat(done)
}

/**
 * Mueve dentro del orden que se está viendo.
 * Las que no están en esa lista (ocultas con el ojito) se quedan en su hueco,
 * así el índice nuevo no las pisa ni las manda al final.
 */
export function reorderVisibleToday(
  storedIds: readonly string[],
  visibleIds: readonly string[],
  activeId: string,
  overId: string,
): { id: string; todayPosition: number }[] | null {
  const moved = nextTodayPositions(visibleIds, activeId, overId)
  if (!moved) return null

  const nextVisible = moved.map((item) => item.id)
  const visibleSet = new Set(visibleIds)
  let cursor = 0
  const next: string[] = []
  for (const id of storedIds) {
    if (!visibleSet.has(id)) {
      next.push(id)
      continue
    }
    next.push(nextVisible[cursor] ?? id)
    cursor += 1
  }
  if (cursor < nextVisible.length) next.push(...nextVisible.slice(cursor))

  return next.map((id, todayPosition) => ({ id, todayPosition }))
}
