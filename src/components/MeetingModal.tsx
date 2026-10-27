import { meetingTime, personLabel, RESPONSE_LABELS } from '../lib/meetings'
import { useColorOf } from '../lib/palette'
import type { Meeting, MeetingsCalendarStatus } from '../shared/types'
import { IconPaperclip } from './Icons'
import { Modal } from './Modal'
import styles from './MeetsSidebar.module.css'

export function MeetingModal({
  meeting,
  calendar,
  onClose,
}: {
  meeting: Meeting
  calendar: MeetingsCalendarStatus | null
  onClose: () => void
}) {
  const colorOf = useColorOf()
  const showLocation = meeting.location && meeting.location !== meeting.meetUrl

  return (
    <Modal title={meeting.title} onClose={onClose}>
      <div className={styles.detail}>
        <p className={styles.detailWhen}>
          <span className={styles.dot} style={{ background: colorOf(calendar?.colorKey).dot }} />
          <span>{meetingTime(meeting)}</span>
          {calendar ? <span className={styles.detailCalendar}>· {calendar.name}</span> : null}
        </p>

        {meeting.meetUrl ? (
          <a className={styles.joinLarge} href={meeting.meetUrl} target="_blank" rel="noopener noreferrer">
            Unirme a la Meet
          </a>
        ) : null}

        {showLocation ? (
          <section className={styles.detailSection}>
            <h3 className={styles.detailLabel}>Lugar</h3>
            <p>{meeting.location}</p>
          </section>
        ) : null}

        {meeting.organizer ? (
          <section className={styles.detailSection}>
            <h3 className={styles.detailLabel}>Organiza</h3>
            <p>
              {personLabel(meeting.organizer)}
              {meeting.organizer.name && meeting.organizer.email ? (
                <span className={styles.email}> {meeting.organizer.email}</span>
              ) : null}
            </p>
          </section>
        ) : null}

        {meeting.attendees.length > 0 ? (
          <section className={styles.detailSection}>
            <h3 className={styles.detailLabel}>Invitados ({meeting.attendees.length})</h3>
            <ul className={styles.attendees}>
              {meeting.attendees.map((attendee, index) => (
                <li key={`${attendee.email ?? attendee.name ?? ''}-${index}`} className={styles.attendee}>
                  <span className={styles.attendeeName}>
                    {personLabel(attendee)}
                    {attendee.name && attendee.email ? (
                      <span className={styles.email}> {attendee.email}</span>
                    ) : null}
                  </span>
                  <span className={styles.response} data-response={attendee.response}>
                    {RESPONSE_LABELS[attendee.response]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {meeting.descriptionHtml ? (
          <section className={styles.detailSection}>
            <h3 className={styles.detailLabel}>Notas</h3>
            {/* El servidor ya lo paso por sanitize-html con una lista corta de tags. */}
            <div className={styles.notes} dangerouslySetInnerHTML={{ __html: meeting.descriptionHtml }} />
          </section>
        ) : null}

        {meeting.attachments.length > 0 ? (
          <section className={styles.detailSection}>
            <h3 className={styles.detailLabel}>Adjuntos</h3>
            <ul className={styles.attachments}>
              {meeting.attachments.map((attachment) => (
                <li key={attachment.url}>
                  <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                    <IconPaperclip size={15} />
                    {attachment.title ?? attachment.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Modal>
  )
}
