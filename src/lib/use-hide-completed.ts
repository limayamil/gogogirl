import { useEffect, useState } from 'react'
import { readHideCompletedPreference, writeHideCompletedPreference } from './hide-completed'

/**
 * El interruptor de «Ocultar hechas» en este navegador.
 * Hoy y Categorías comparten el estado: no es un dato de la cuenta.
 */
export function useHideCompletedLists() {
  const [hideCompleted, setHideCompleted] = useState(() =>
    readHideCompletedPreference((key) => localStorage.getItem(key)),
  )

  useEffect(() => {
    writeHideCompletedPreference((key, value) => localStorage.setItem(key, value), hideCompleted)
  }, [hideCompleted])

  return [hideCompleted, setHideCompleted] as const
}
