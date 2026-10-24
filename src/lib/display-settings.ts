/**
 * Preferencias de esta pantalla, en este navegador.
 * No son datos de la cuenta: Gogogirl es multi-cuenta y estos switches
 * no tienen que viajar con la sesión ni mezclar dos personas en la API.
 */

export const SHOW_LIST_ON_TASK_KEY = 'gogogirl.showListOnTask'
export const SUGGEST_DUE_TODAY_KEY = 'gogogirl.suggestDueToday'

/** Cualquier valor que no sea "true" lo deja apagado: el default es no mostrar la lista. */
export function readShowListOnTask(stored: string | null): boolean {
  return stored === 'true'
}

/** Solo "false" lo apaga. Si no hay nada guardado, la tira se muestra. */
export function readSuggestDueToday(stored: string | null): boolean {
  return stored !== 'false'
}

/**
 * Nombre de la lista bajo el título, o null si no hay que dibujar esa línea.
 * Sin lista (o con el nombre vacío) no se inventa "Sin categoría".
 */
export function taskListName(name: string | null, enabled: boolean): string | null {
  if (!enabled || name == null || name.trim() === '') return null
  return name
}

type DueTodayCandidate = {
  deadline: string | null
  status: string
  /** Misma marca que usa el panel de Hoy para decidir si la fila ya está ahí. */
  inToday: boolean
}

/**
 * Tareas para la tira de Hoy.
 * Entra solo si vence en el mismo día que el chip "Hoy" (`today`, un YYYY-MM-DD
 * de `todayKey`), todavía no está en el panel (`inToday`) y no está hecha.
 * Con el ajuste apagado no hay tira: devuelve vacío.
 */
export function dueTodaySuggestions<T extends DueTodayCandidate>(
  tasks: readonly T[],
  today: string,
  enabled: boolean,
): T[] {
  if (!enabled) return []
  return tasks.filter(
    (task) => task.deadline === today && !task.inToday && task.status !== 'hecha',
  )
}

/**
 * El mismo parche con el que una tarjeta de las listas entra a Hoy
 * (arrastrar al panel). Prender `inToday` también la vuelve a mostrar
 * si estaba escondida con el ojito.
 */
export function takeForTodayPatch(): { inToday: true; hiddenInToday: false } {
  return { inToday: true, hiddenInToday: false }
}
