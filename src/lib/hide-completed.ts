/**
 * Persiste el toggle de las listas. Hoy y Categorías leen esta misma clave:
 * prenderlo en una vista tiene que seguir prendido en la otra.
 * Cualquier otro valor lo deja apagado, que es el default de Hoy.
 */
export const HIDE_COMPLETED_ON_HOME_KEY = 'gogogirl.hideCompletedOnHome'

export function readHideCompletedOnHome(stored: string | null): boolean {
  return stored === 'true'
}

/** Lo que leen las dos vistas al montar. No abre otra clave. */
export function readHideCompletedPreference(getItem: (key: string) => string | null): boolean {
  return readHideCompletedOnHome(getItem(HIDE_COMPLETED_ON_HOME_KEY))
}

/** Lo que escriben las dos vistas. Una sola clave, el mismo formato. */
export function writeHideCompletedPreference(
  setItem: (key: string, value: string) => void,
  hideCompleted: boolean,
): void {
  setItem(HIDE_COMPLETED_ON_HOME_KEY, hideCompleted ? 'true' : 'false')
}

type WithStatus = { status: string }

/**
 * Una lista se esconde solo cuando todas sus tareas estan hechas.
 * Vacia no: no hay trabajo terminado, y la lista sigue siendo el lugar para cargar la primera.
 * Mixta se queda; adentro se filtran solo las hechas.
 * Hoy y Categorías usan esta misma regla.
 */
export function homeListStaysVisible(tasks: WithStatus[], hideCompleted: boolean): boolean {
  if (!hideCompleted) return true
  if (tasks.length === 0) return true
  return tasks.some((task) => task.status !== 'hecha')
}

/** Con el toggle apagado devuelve el mismo array: la lista no cambia. */
export function visibleHomeListTasks<T extends WithStatus>(tasks: T[], hideCompleted: boolean): T[] {
  if (!hideCompleted) return tasks
  return tasks.filter((task) => task.status !== 'hecha')
}
