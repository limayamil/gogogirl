import { useModals } from '../app/modals'
import { StatusToggle } from '../components/StatusToggle'
import { IconPlus, IconSun } from '../components/Icons'
import { colorOf } from '../lib/palette'
import { formatShortDate } from '../lib/dates'
import { useAppState, useUpdateTask } from '../lib/store'
import type { Task, Urgency } from '../shared/types'
import styles from './CategoriesView.module.css'

const URGENCY_LABEL: Record<Urgency, string> = { baja: 'Baja', media: 'Media', alta: 'Alta' }

/**
 * Mosaico tipo Pinterest: cada tarjeta es una categoria con sus tareas.
 * El masonry sale de `columns` en CSS, sin librerias.
 */
export function CategoriesView() {
  const { data, isLoading, error } = useAppState()
  const { openTask, openCategory } = useModals()

  if (isLoading) return <p className={styles.state}>Cargando...</p>
  if (error) {
    return (
      <p className={styles.stateError}>
        No se pudo cargar: {error instanceof Error ? error.message : 'error desconocido'}
      </p>
    )
  }

  const categories = data?.categories ?? []
  const tasks = data?.tasks ?? []
  const uncategorized = tasks.filter((task) => task.categoryId === null)

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Categorias</h1>
          <p className={styles.subtitle}>Todo lo que tenes anotado, ordenado por color.</p>
        </div>
        <button type="button" className={styles.newCategory} onClick={() => openCategory(null)}>
          <IconPlus size={16} />
          Nueva categoria
        </button>
      </header>

      {categories.length === 0 && uncategorized.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Todavia no hay categorias</p>
          <p className={styles.emptyText}>
            Crea una (Casa, Trabajo, Estudio...) y elegile un color pastel.
          </p>
        </div>
      ) : null}

      <div className={styles.masonry}>
        {categories.map((category) => {
          const color = colorOf(category.colorKey)
          const own = tasks.filter((task) => task.categoryId === category.id)
          return (
            <section key={category.id} className={styles.card} style={{ background: color.bg }}>
              <header className={styles.cardHeader}>
                <button
                  type="button"
                  className={styles.cardTitle}
                  style={{ color: color.ink }}
                  onClick={() => openCategory(category.id)}
                >
                  {category.name}
                  <span className={styles.cardCount}>
                    {own.filter((task) => task.status !== 'hecha').length}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.cardAdd}
                  style={{ color: color.ink }}
                  aria-label={`Agregar tarea a ${category.name}`}
                  onClick={() => openTask({ taskId: null, defaults: { categoryId: category.id } })}
                >
                  <IconPlus size={16} />
                </button>
              </header>

              {own.length === 0 ? (
                <p className={styles.cardEmpty}>Sin tareas todavia</p>
              ) : (
                <ul className={styles.taskList}>
                  {own.map((task) => (
                    <TaskCard key={task.id} task={task} tint={color.soft} dot={color.dot} />
                  ))}
                </ul>
              )}
            </section>
          )
        })}

        {uncategorized.length > 0 ? (
          <section className={styles.card} style={{ background: 'var(--surface-2)' }}>
            <header className={styles.cardHeader}>
              <span className={styles.cardTitle}>
                Sin categoria
                <span className={styles.cardCount}>{uncategorized.length}</span>
              </span>
            </header>
            <ul className={styles.taskList}>
              {uncategorized.map((task) => (
                <TaskCard key={task.id} task={task} tint="var(--surface)" dot="var(--ink-faint)" />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}

/** Tarjeta con mas detalle que la fila de Hoy: urgencia, deadline y progreso de subtareas. */
function TaskCard({ task, tint, dot }: { task: Task; tint: string; dot: string }) {
  const { openTask } = useModals()
  const updateTask = useUpdateTask()
  const doneSubtasks = task.subtasks.filter((subtask) => subtask.done).length

  return (
    <li className={styles.task} style={{ background: tint }}>
      <div className={styles.taskMain}>
        <StatusToggle
          size="sm"
          status={task.status}
          onChange={(status) => updateTask.mutate({ id: task.id, patch: { status } })}
        />
        <button type="button" className={styles.taskTitle} onClick={() => openTask({ taskId: task.id })}>
          <span className={task.status === 'hecha' ? styles.done : undefined}>{task.title}</span>
        </button>
        {task.inToday ? (
          <span className={styles.inToday} style={{ background: dot }} title="En Hoy">
            <IconSun size={11} />
          </span>
        ) : null}
      </div>

      {task.description ? <p className={styles.taskDescription}>{task.description}</p> : null}

      <div className={styles.meta}>
        <span className={`${styles.badge} ${styles[`urgency_${task.urgency}`]}`}>
          {URGENCY_LABEL[task.urgency]}
        </span>
        {task.deadline ? (
          <span className={styles.badge}>{formatShortDate(task.deadline)}</span>
        ) : null}
        {task.subtasks.length > 0 ? (
          <span className={styles.badge}>
            {doneSubtasks}/{task.subtasks.length}
          </span>
        ) : null}
        {task.attachments.length > 0 ? (
          <span className={styles.badge}>{task.attachments.length} adj.</span>
        ) : null}
      </div>
    </li>
  )
}
