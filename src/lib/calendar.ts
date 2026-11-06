import { APP_TIME_ZONE, dateKeyInAppZone, mondayOf } from '../shared/expiry'

/**
 * Tope de puntos por día en Mes. El modal lista todas; el calendario no.
 */
export const MONTH_DOT_CAP = 3

export interface NewTaskOnDay {
  taskId: null
  defaults: { deadline: string }
}

/**
 * El + de un día de Semana abre el alta que ya existe, con esa columna como
 * fecha límite. La clave es un día calendario (YYYY-MM-DD): no se arma con
 * `new Date(clave)`, porque la medianoche UTC cae el día anterior en Argentina.
 */
export function newTaskOnDay(dayKey: string): NewTaskOnDay {
  return { taskId: null, defaults: { deadline: dayKey } }
}

export interface YearMonth {
  year: number
  /** 1–12 */
  month: number
}

/** Mes calendario en la zona de la app, no el mes UTC del instante. */
export function monthOf(date: Date, timeZone = APP_TIME_ZONE): YearMonth {
  const [year, month] = dateKeyInAppZone(date, timeZone).split('-').map(Number)
  return { year, month }
}

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta
  const nextYear = Math.floor(index / 12)
  return { year: nextYear, month: index - nextYear * 12 + 1 }
}

/** Suma días sobre una clave YYYY-MM-DD, sin pasar por la zona horaria local. */
export function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export interface MonthCell {
  key: string
  inMonth: boolean
}

/** Sábado o domingo de esa clave de día. Misma aritmética UTC que `mondayOf`. */
export function isWeekendDay(dateKeyValue: string): boolean {
  const [year, month, day] = dateKeyValue.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay()
  return weekday === 0 || weekday === 6
}

/**
 * Grilla de lunes a domingo del mes, con los días de los meses vecinos que
 * hacen falta para completar la semana. El mes es el de Buenos Aires.
 */
export function monthCells({ year, month }: YearMonth): MonthCell[] {
  const first = dateKey(year, month, 1)
  const last = dateKey(year, month, daysInMonth(year, month))
  const start = mondayOf(first)
  const end = addCalendarDays(mondayOf(last), 6)
  const prefix = first.slice(0, 7)
  const cells: MonthCell[] = []
  let cursor = start
  while (cursor <= end) {
    cells.push({ key: cursor, inMonth: cursor.slice(0, 7) === prefix })
    cursor = addCalendarDays(cursor, 1)
  }
  return cells
}

/**
 * Junta las tareas por el día de su fecha límite. Las que no tienen deadline
 * no entran: no hay un día al que pertenezcan. La clave no se reinterpreta
 * como instante, así un `2026-11-01` no se corre al 31 de octubre en Argentina.
 */
export function groupTasksByDeadline<T extends { deadline: string | null }>(
  tasks: readonly T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const task of tasks) {
    if (!task.deadline) continue
    const bucket = map.get(task.deadline)
    if (bucket) bucket.push(task)
    else map.set(task.deadline, [task])
  }
  return map
}

export function dotCount(taskCount: number): number {
  if (taskCount <= 0) return 0
  return Math.min(taskCount, MONTH_DOT_CAP)
}

function formatInUtc(dateKeyValue: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month, day] = dateKeyValue.split('-').map(Number)
  // Mediodía UTC: el día calendario no se corre aunque el formateador ignore la zona.
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  const raw = date.toLocaleDateString('es-AR', { ...options, timeZone: 'UTC' })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

/** "Noviembre de 2026". */
export function formatMonthTitle({ year, month }: YearMonth): string {
  return formatInUtc(dateKey(year, month, 1), { month: 'long', year: 'numeric' })
}

/** "Viernes, 6 de noviembre". */
export function formatDayHeading(dayKey: string): string {
  return formatInUtc(dayKey, { weekday: 'long', day: 'numeric', month: 'long' })
}

/** "6 de noviembre", para el nombre accesible del +. */
export function formatMonthDay(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
}
