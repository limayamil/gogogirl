import { useMemo, useState } from 'react'
import { useModals } from '../app/modals'
import { ErrorState, LoadingState } from '../components/Feedback'
import { IconChevronLeft, IconChevronRight } from '../components/Icons'
import { Modal } from '../components/Modal'
import { DAY_NAMES } from '../lib/dates'
import {
  dotCount,
  formatDayHeading,
  formatMonthTitle,
  groupTasksByDeadline,
  monthCells,
  monthOf,
  shiftMonth,
  type YearMonth,
} from '../lib/calendar'
import { useColorOf } from '../lib/palette'
import { dateKeyInAppZone } from '../shared/expiry'
import { useAppState } from '../lib/store'
import type { Category, Task } from '../shared/types'
import styles from './MonthView.module.css'

/** Mes calendario en America/Argentina/Buenos_Aires. Solo cuentan las tareas con deadline. */
export function MonthView() {
  const { data, isPending, error } = useAppState()
  const { openTask } = useModals()
  const [cursor, setCursor] = useState<YearMonth>(() => monthOf(new Date()))
  const [openDay, setOpenDay] = useState<string | null>(null)

  const tasks = data?.tasks ?? []
  const categories = data?.categories ?? []
  const grouped = useMemo(() => groupTasksByDeadline(tasks), [tasks])
  const cells = useMemo(() => monthCells(cursor), [cursor])
  const today = dateKeyInAppZone(new Date())
  const withoutDeadline = tasks.filter((task) => !task.deadline && task.status !== 'hecha').length
  const dayTasks = openDay ? (grouped.get(openDay) ?? []) : []

  return (
    <div className={`${styles.page} pageEnter`}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{formatMonthTitle(cursor)}</h1>
          {withoutDeadline > 0 ? (
            <p className={styles.subtitle}>
              {withoutDeadline === 1
                ? '1 sin fecha límite no se ve acá'
                : `${withoutDeadline} sin fecha límite no se ven acá`}
            </p>
          ) : null}
        </div>

        <div className={styles.nav}>
          <button
            type="button"
            className={styles.navButton}
            onClick={() => setCursor((current) => shiftMonth(current, -1))}
            aria-label="Mes anterior"
          >
            <IconChevronLeft size={18} />
          </button>
          <button type="button" className={styles.navToday} onClick={() => setCursor(monthOf(new Date()))}>
            Este mes
          </button>
          <button
            type="button"
            className={styles.navButton}
            onClick={() => setCursor((current) => shiftMonth(current, 1))}
            aria-label="Mes siguiente"
          >
            <IconChevronRight size={18} />
          </button>
        </div>
      </header>

      {isPending ? <LoadingState /> : null}
      {error ? <ErrorState error={error} /> : null}

      <div className={styles.grid} aria-label={`Días de ${formatMonthTitle(cursor)}`}>
        {DAY_NAMES.map((name) => (
          <span key={name} className={styles.weekday} aria-hidden="true">
            {name}
          </span>
        ))}
        {cells.map((cell) => {
          const count = grouped.get(cell.key)?.length ?? 0
          return (
            <button
              key={cell.key}
              type="button"
              className={`${styles.cell} ${cell.inMonth ? '' : styles.cellOutside} ${
                cell.key === today ? styles.cellToday : ''
              }`}
              onClick={() => setOpenDay(cell.key)}
              aria-current={cell.key === today ? 'date' : undefined}
              aria-label={dayLabel(cell.key, count)}
            >
              <span className={styles.dayNumber}>{Number(cell.key.slice(8))}</span>
              <span className={styles.dots} aria-hidden="true">
                {Array.from({ length: dotCount(count) }, (_, index) => (
                  <span key={index} className={styles.dot} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      {openDay ? (
        <Modal title={formatDayHeading(openDay)} onClose={() => setOpenDay(null)}>
          {dayTasks.length === 0 ? (
            <p className={styles.emptyDay}>Este día no tiene tareas.</p>
          ) : (
            <ul className={styles.taskList}>
              {dayTasks.map((task) => (
                <li key={task.id}>
                  <DayTask
                    task={task}
                    categories={categories}
                    onOpen={() => {
                      setOpenDay(null)
                      openTask({ taskId: task.id })
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </Modal>
      ) : null}
    </div>
  )
}

function dayLabel(dayKey: string, count: number): string {
  const heading = formatDayHeading(dayKey)
  if (count === 0) return `${heading}, sin tareas`
  if (count === 1) return `${heading}, 1 tarea`
  return `${heading}, ${count} tareas`
}

function DayTask({
  task,
  categories,
  onOpen,
}: {
  task: Task
  categories: Category[]
  onOpen: () => void
}) {
  const category = categories.find((item) => item.id === task.categoryId)
  const color = useColorOf()(category?.colorKey)

  return (
    <button type="button" className={styles.task} onClick={onOpen}>
      <span className={styles.taskDot} style={{ background: color.dot }} />
      <span className={styles.taskCopy}>
        <span className={task.status === 'hecha' ? styles.done : undefined}>{task.title}</span>
        {category ? (
          <span className={styles.taskCategory} style={{ background: color.bg, color: color.ink }}>
            {category.name}
          </span>
        ) : null}
      </span>
    </button>
  )
}
