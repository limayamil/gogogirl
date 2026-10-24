import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  SHOW_LIST_ON_TASK_KEY,
  SUGGEST_DUE_TODAY_KEY,
  readShowListOnTask,
  readSuggestDueToday,
} from '../lib/display-settings'

interface DisplaySettings {
  showListOnTask: boolean
  suggestDueToday: boolean
  setShowListOnTask: (value: boolean) => void
  setSuggestDueToday: (value: boolean) => void
}

const Context = createContext<DisplaySettings | null>(null)

export function useDisplaySettings(): DisplaySettings {
  const value = useContext(Context)
  if (!value) throw new Error('useDisplaySettings tiene que usarse dentro de DisplaySettingsProvider')
  return value
}

/** Lee y escribe las dos claves de este navegador. El default vive en los readers. */
export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [showListOnTask, setShowListOnTask] = useState(() =>
    readShowListOnTask(localStorage.getItem(SHOW_LIST_ON_TASK_KEY)),
  )
  const [suggestDueToday, setSuggestDueToday] = useState(() =>
    readSuggestDueToday(localStorage.getItem(SUGGEST_DUE_TODAY_KEY)),
  )

  useEffect(() => {
    localStorage.setItem(SHOW_LIST_ON_TASK_KEY, showListOnTask ? 'true' : 'false')
  }, [showListOnTask])

  useEffect(() => {
    localStorage.setItem(SUGGEST_DUE_TODAY_KEY, suggestDueToday ? 'true' : 'false')
  }, [suggestDueToday])

  const value = useMemo<DisplaySettings>(
    () => ({ showListOnTask, suggestDueToday, setShowListOnTask, setSuggestDueToday }),
    [showListOnTask, suggestDueToday],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}
