/** Persiste el toggle de las listas de Hoy. Cualquier otro valor lo deja apagado. */
export const HIDE_COMPLETED_ON_HOME_KEY = 'gogogirl.hideCompletedOnHome'

export function readHideCompletedOnHome(stored: string | null): boolean {
  return stored === 'true'
}

type WithStatus = { status: string }

/**
 * Una lista se esconde solo cuando todas sus tareas estan hechas.
 * Vacia no: no hay trabajo terminado, y el rail sigue siendo el lugar para cargar la primera.
 * Mixta se queda; adentro se filtran solo las hechas.
 */
export function homeListStaysVisible(tasks: WithStatus[], hideCompleted: boolean): boolean {
  if (!hideCompleted) return true
  if (tasks.length === 0) return true
  return tasks.some((task) => task.status !== 'hecha')
}

/** Con el toggle apagado devuelve el mismo array: Hoy no cambia. */
export function visibleHomeListTasks<T extends WithStatus>(tasks: T[], hideCompleted: boolean): T[] {
  if (!hideCompleted) return tasks
  return tasks.filter((task) => task.status !== 'hecha')
}
