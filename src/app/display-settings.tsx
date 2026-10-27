import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  SHOW_LIST_ON_TASK_KEY,
  SHOW_MEETS_KEY,
  SUGGEST_DUE_TODAY_KEY,
  readShowListOnTask,
  readShowMeets,
  readSuggestDueToday,
} from '../lib/display-settings'

interface DisplaySettings {
  showListOnTask: boolean
  suggestDueToday: boolean
  showMeets: boolean
  setShowListOnTask: (value: boolean) => void
  setSuggestDueToday: (value: boolean) => void
  setShowMeets: (value: boolean) => void
}

const Context = createContext<DisplaySettings | null>(null)

export function useDisplaySettings(): DisplaySettings {
  const value = useContext(Context)
  if (!value) throw new Error('useDisplaySettings tiene que usarse dentro de DisplaySettingsProvider')
  return value
}

/** Lee y escribe las claves de este navegador. El default vive en los readers. */
export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [showListOnTask, setShowListOnTask] = useState(() =>
    readShowListOnTask(localStorage.getItem(SHOW_LIST_ON_TASK_KEY)),
  )
  const [suggestDueToday, setSuggestDueToday] = useState(() =>
    readSuggestDueToday(localStorage.getItem(SUGGEST_DUE_TODAY_KEY)),
  )
  const [showMeets, setShowMeets] = useState(() =>
    readShowMeets(localStorage.getItem(SHOW_MEETS_KEY)),
  )

  useEffect(() => {
    localStorage.setItem(SHOW_LIST_ON_TASK_KEY, showListOnTask ? 'true' : 'false')
  }, [showListOnTask])

  useEffect(() => {
    localStorage.setItem(SUGGEST_DUE_TODAY_KEY, suggestDueToday ? 'true' : 'false')
  }, [suggestDueToday])

  useEffect(() => {
    localStorage.setItem(SHOW_MEETS_KEY, showMeets ? 'true' : 'false')
  }, [showMeets])

  const value = useMemo<DisplaySettings>(
    () => ({
      showListOnTask,
      suggestDueToday,
      showMeets,
      setShowListOnTask,
      setSuggestDueToday,
      setShowMeets,
    }),
    [showListOnTask, suggestDueToday, showMeets],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}
