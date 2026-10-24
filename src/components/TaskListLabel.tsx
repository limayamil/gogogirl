import { useDisplaySettings } from '../app/display-settings'
import { taskListName } from '../lib/display-settings'
import styles from './TaskListLabel.module.css'

/** Linea chica bajo el titulo. No se monta si el ajuste esta apagado o no hay lista. */
export function TaskListLabel({ name }: { name: string | null }) {
  const { showListOnTask } = useDisplaySettings()
  const label = taskListName(name, showListOnTask)
  if (!label) return null
  return <span className={styles.label}>{label}</span>
}
