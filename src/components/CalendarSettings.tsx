import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { calendarsKey, meetingsKey } from '../lib/meetings'
import { PALETTE, useColorOf } from '../lib/palette'
import { errorMessage, toastError } from '../lib/toast'
import type { CalendarFeed } from '../shared/types'
import { IconPlus, IconTrash } from './Icons'
import styles from './CalendarSettings.module.css'

/**
 * Calendarios de la cuenta dentro del engranaje. La direccion secreta se pega
 * una vez: despues solo se ve enmascarada, y para cambiarla se pega otra.
 */
export function CalendarSettings({ userId }: { userId: string }) {
  const client = useQueryClient()
  const list = useQuery({ queryKey: calendarsKey(userId), queryFn: api.listCalendars })
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const colorOf = useColorOf()
  const calendars = list.data?.calendars ?? []

  function refresh() {
    void client.invalidateQueries({ queryKey: calendarsKey(userId) })
    void client.invalidateQueries({ queryKey: meetingsKey(userId) })
  }

  async function remove(calendar: CalendarFeed) {
    if (!window.confirm(`¿Sacar el calendario “${calendar.name}”?`)) return
    try {
      await api.deleteCalendar(calendar.id)
      refresh()
    } catch (error) {
      toastError(error)
    }
  }

  const unusedColor =
    PALETTE.find((color) => !calendars.some((calendar) => calendar.colorKey === color.key))?.key ??
    PALETTE[0].key

  return (
    <section className={styles.section} aria-label="Calendarios">
      <p className={styles.title}>Calendarios</p>
      {list.isPending ? <p className={styles.hint}>Cargando…</p> : null}
      {list.isError ? <p className={styles.error}>{errorMessage(list.error)}</p> : null}
      {list.isSuccess && calendars.length === 0 && !adding ? (
        <p className={styles.hint}>
          Pegá la dirección secreta en formato iCal de cada calendario de Google que quieras ver.
        </p>
      ) : null}

      {calendars.length > 0 ? (
        <ul className={styles.list}>
          {calendars.map((calendar) =>
            editing === calendar.id ? (
              <li key={calendar.id}>
                <CalendarForm
                  calendar={calendar}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null)
                    refresh()
                  }}
                />
              </li>
            ) : (
              <li key={calendar.id} className={styles.item}>
                <span className={styles.dot} style={{ background: colorOf(calendar.colorKey).dot }} />
                <span className={styles.itemText}>
                  <span className={styles.name}>{calendar.name}</span>
                  <span className={styles.masked}>{calendar.maskedUrl}</span>
                </span>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => {
                    setAdding(false)
                    setEditing(calendar.id)
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Sacar ${calendar.name}`}
                  onClick={() => void remove(calendar)}
                >
                  <IconTrash size={16} />
                </button>
              </li>
            ),
          )}
        </ul>
      ) : null}

      {adding ? (
        <CalendarForm
          initialColor={unusedColor}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            refresh()
          }}
        />
      ) : (
        <button
          type="button"
          className={styles.add}
          onClick={() => {
            setEditing(null)
            setAdding(true)
          }}
        >
          <IconPlus size={16} />
          Agregar calendario
        </button>
      )}
    </section>
  )
}

function CalendarForm({
  calendar,
  initialColor = PALETTE[0].key,
  onCancel,
  onSaved,
}: {
  calendar?: CalendarFeed
  initialColor?: string
  onCancel: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(calendar?.name ?? '')
  const [colorKey, setColorKey] = useState(calendar?.colorKey ?? initialColor)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const colorOf = useColorOf()

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedUrl = url.trim()
    if (!trimmedName) return setError('Ponele un nombre.')
    if (!calendar && !trimmedUrl) return setError('Pegá la dirección secreta en formato iCal.')
    setSaving(true)
    setError(null)
    try {
      if (calendar) {
        await api.updateCalendar(calendar.id, {
          name: trimmedName,
          colorKey,
          ...(trimmedUrl ? { url: trimmedUrl } : {}),
        })
      } else {
        await api.createCalendar({ name: trimmedName, colorKey, url: trimmedUrl })
      }
      onSaved()
    } catch (caught) {
      setError(errorMessage(caught))
      setSaving(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}>
        <span className={styles.label}>Nombre</span>
        <input
          className={styles.input}
          value={name}
          maxLength={80}
          placeholder="Trabajo, Personal…"
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </label>

      <div className={styles.field}>
        <span className={styles.label}>Color</span>
        <div className={styles.swatches} role="radiogroup" aria-label="Color">
          {PALETTE.map((color) => (
            <button
              key={color.key}
              type="button"
              role="radio"
              aria-checked={colorKey === color.key}
              aria-label={color.label}
              title={color.label}
              className={`${styles.swatch} ${colorKey === color.key ? styles.swatchOn : ''}`}
              style={{ background: colorOf(color.key).dot }}
              onClick={() => setColorKey(color.key)}
            />
          ))}
        </div>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>
          {calendar ? 'Nueva dirección secreta (opcional)' : 'Dirección secreta en formato iCal'}
        </span>
        <input
          className={styles.input}
          value={url}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          onChange={(event) => setUrl(event.target.value)}
        />
        {calendar ? (
          <span className={styles.hint}>Guardada: {calendar.maskedUrl}. Dejala vacía para no cambiarla.</span>
        ) : null}
      </label>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        <button type="button" className={styles.ghost} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={styles.primary} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
