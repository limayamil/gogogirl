import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDisplaySettings } from '../app/display-settings'
import { IconSettings } from './Icons'
import styles from './SettingsMenu.module.css'

/**
 * Único acceso a los ajustes: el engranaje del header.
 * El panel es fijo contra el botón porque el header recorta con overflow.
 */
export function SettingsMenu() {
  const { showListOnTask, suggestDueToday, setShowListOnTask, setSuggestDueToday } =
    useDisplaySettings()
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<{ top: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      setBox({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    function onPointer(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-label="Ajustes"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <IconSettings size={20} />
      </button>
      {open && box
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label="Ajustes"
              className={styles.panel}
              style={{ top: box.top, right: box.right }}
            >
              <p className={styles.title}>Ajustes</p>
              <SettingSwitch
                checked={showListOnTask}
                onChange={setShowListOnTask}
                label="Mostrar la lista en cada tarea"
              />
              <SettingSwitch
                checked={suggestDueToday}
                onChange={setSuggestDueToday}
                label="Sugerir las que vencen hoy"
              />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function SettingSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      className={styles.row}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className={`${styles.switch} ${checked ? styles.switchOn : ''}`}>
        <span className={styles.knob} />
      </span>
    </button>
  )
}
