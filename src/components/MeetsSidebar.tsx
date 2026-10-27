import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { MEETINGS_REFRESH_MS, meetingsKey, meetingTime } from '../lib/meetings'
import { useColorOf } from '../lib/palette'
import { errorMessage } from '../lib/toast'
import type { Meeting, MeetingsCalendarStatus } from '../shared/types'
import { IconAlert, IconCalendar, IconChevronRight, IconRefresh } from './Icons'
import { MeetingModal } from './MeetingModal'
import styles from './MeetsSidebar.module.css'

const DAY_LABEL = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** 'YYYY-MM-DD' del servidor (ya en Buenos Aires) a "martes 27 de octubre". */
function dayLabel(date: string): string {
  return DAY_LABEL.format(new Date(`${date}T12:00:00Z`))
}

/**
 * Las reuniones de hoy a la derecha. Solo se monta con "Mostrar Meets del dia"
 * prendido: apagado no hay panel ni pedido a ningun calendario.
 */
export function MeetsSidebar({
  userId,
  open,
  onToggle,
}: {
  userId: string
  open: boolean
  onToggle: () => void
}) {
  const query = useQuery({
    queryKey: meetingsKey(userId),
    queryFn: api.getMeetings,
    refetchInterval: MEETINGS_REFRESH_MS,
  })
  const { refetch } = query
  const [selected, setSelected] = useState<Meeting | null>(null)
  const wasOpen = useRef(open)
  const colorOf = useColorOf()

  useEffect(() => {
    if (open && !wasOpen.current) void refetch()
    wasOpen.current = open
  }, [open, refetch])

  const data = query.data
  const calendarsById = new Map<string, MeetingsCalendarStatus>(
    (data?.calendars ?? []).map((calendar) => [calendar.id, calendar]),
  )
  const failed = (data?.calendars ?? []).filter((calendar) => !calendar.ok)
  const now = Date.now()

  if (!open) {
    return (
      <button
        type="button"
        className={styles.handle}
        onClick={onToggle}
        aria-label="Abrir Meets del día"
        aria-expanded={false}
      >
        <IconCalendar size={18} />
        <span className={styles.handleText}>Meets</span>
        {data && data.meetings.length > 0 ? (
          <span className={styles.badge}>{data.meetings.length}</span>
        ) : null}
      </button>
    )
  }

  return (
    <aside className={styles.panel} aria-label="Meets del día" data-meets-open="">
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 className={styles.title}>Meets del día</h2>
          {data ? <p className={styles.date}>{dayLabel(data.date)}</p> : null}
        </div>
        <button
          type="button"
          className={`${styles.iconButton} ${query.isFetching ? styles.spinning : ''}`}
          onClick={() => void refetch()}
          aria-label="Actualizar"
          title="Actualizar"
        >
          <IconRefresh size={16} />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onToggle}
          aria-label="Cerrar Meets del día"
          aria-expanded={true}
          title="Cerrar"
        >
          <IconChevronRight size={18} />
        </button>
      </header>

      <div className={styles.body}>
        {query.isPending ? <p className={styles.empty}>Cargando…</p> : null}
        {query.isError ? (
          <div className={styles.warn} role="alert">
            <IconAlert size={16} />
            <span>No pude traer las meets: {errorMessage(query.error)}</span>
          </div>
        ) : null}

        {failed.map((calendar) => (
          <div key={calendar.id} className={styles.warn} role="status">
            <IconAlert size={16} />
            <span>
              No pude leer <strong>{calendar.name}</strong>. {calendar.error}
            </span>
          </div>
        ))}

        {data && data.calendars.length === 0 ? (
          <p className={styles.empty}>
            Todavía no agregaste calendarios. Sumalos desde Ajustes, en el engranaje de arriba.
          </p>
        ) : null}
        {data && data.calendars.length > 0 && data.meetings.length === 0 ? (
          <p className={styles.empty}>No tenés meets hoy.</p>
        ) : null}

        {data && data.meetings.length > 0 ? (
          <ol className={styles.list}>
            {data.meetings.map((meeting) => {
              const calendar = calendarsById.get(meeting.calendarId)
              const past = !meeting.allDay && Date.parse(meeting.end) < now
              return (
                <li
                  key={meeting.id}
                  className={`${styles.item} ${past ? styles.past : ''}`}
                  style={{ borderLeftColor: colorOf(calendar?.colorKey).dot }}
                >
                  <button type="button" className={styles.itemMain} onClick={() => setSelected(meeting)}>
                    <span className={styles.time}>{meetingTime(meeting)}</span>
                    <span className={styles.meetingTitle}>{meeting.title}</span>
                    {calendar ? <span className={styles.calendarName}>{calendar.name}</span> : null}
                  </button>
                  {meeting.meetUrl ? (
                    <a
                      className={styles.join}
                      href={meeting.meetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Unirme
                    </a>
                  ) : null}
                </li>
              )
            })}
          </ol>
        ) : null}
      </div>

      {selected ? (
        <MeetingModal
          meeting={selected}
          calendar={calendarsById.get(selected.calendarId) ?? null}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </aside>
  )
}
