import { requireUser } from './_lib/auth.ts'
import { FeedError, loadFeed } from './_lib/calendars.ts'
import { sql } from './_lib/db.ts'
import { route } from './_lib/http.ts'
import { buenosAiresDay, meetingsForDay, sortMeetings } from './_lib/ics.ts'
import {
  MEETINGS_TIME_ZONE,
  type Meeting,
  type MeetingsCalendarStatus,
  type MeetingsOfDay,
} from '../src/shared/types.ts'

type Row = Record<string, unknown>

/**
 * GET /api/meetings
 *
 * Las reuniones de hoy (Buenos Aires) de los calendarios de esta cuenta. Cada
 * feed se pide aparte: si uno falla, los otros igual llegan y el panel dice
 * cual no se pudo leer.
 */
export default route({
  async GET(req, res) {
    const { id: userId } = await requireUser(req)
    const rows = (await sql`
      select id, name, color_key, ical_url
      from calendars
      where user_id = ${userId}
      order by position, created_at
    `) as Row[]

    const day = buenosAiresDay(new Date())
    const results = await Promise.all(
      rows.map(async (row): Promise<[MeetingsCalendarStatus, Meeting[]]> => {
        const status = {
          id: row.id as string,
          name: row.name as string,
          colorKey: row.color_key as string,
        }
        try {
          const calendar = await loadFeed(status.id, row.ical_url as string)
          return [{ ...status, ok: true, error: null }, meetingsForDay(calendar, day, status.id)]
        } catch (error) {
          // El mensaje de un error cualquiera podria traer la direccion; solo
          // sale el de FeedError, que se arma sin ella.
          const message = error instanceof FeedError ? error.message : 'No pude leer este calendario.'
          if (!(error instanceof FeedError)) console.error('[meetings] feed', status.id, error)
          return [{ ...status, ok: false, error: message }, []]
        }
      }),
    )

    const payload: MeetingsOfDay = {
      date: day.date,
      timeZone: MEETINGS_TIME_ZONE,
      meetings: sortMeetings(results.flatMap(([, meetings]) => meetings)),
      calendars: results.map(([status]) => status),
    }
    res.status(200).json(payload)
  },
})
