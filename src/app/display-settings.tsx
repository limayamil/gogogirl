import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  COMPLETED_LAST_ON_HOME_KEY,
  SHOW_LIST_ON_TASK_KEY,
  SUGGEST_DUE_TODAY_KEY,
  readCompletedLastOnHome,
  readShowListOnTask,
  readSuggestDueToday,
} from '../lib/display-settings'

interface DisplaySettings {
  showListOnTask: boolean
  suggestDueToday: boolean
  completedLastOnHome: boolean
  setShowListOnTask: (value: boolean) => void
  setSuggestDueToday: (value: boolean) => void
  setCompletedLastOnHome: (value: boolean) => void
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
  const [completedLastOnHome, setCompletedLastOnHome] = useState(() =>
    readCompletedLastOnHome(localStorage.getItem(COMPLETED_LAST_ON_HOME_KEY)),
  )

  useEffect(() => {
    localStorage.setItem(SHOW_LIST_ON_TASK_KEY, showListOnTask ? 'true' : 'false')
  }, [showListOnTask])

  useEffect(() => {
    localStorage.setItem(SUGGEST_DUE_TODAY_KEY, suggestDueToday ? 'true' : 'false')
  }, [suggestDueToday])

  useEffect(() => {
    localStorage.setItem(COMPLETED_LAST_ON_HOME_KEY, completedLastOnHome ? 'true' : 'false')
  }, [completedLastOnHome])

  const value = useMemo<DisplaySettings>(
    () => ({
      showListOnTask,
      suggestDueToday,
      completedLastOnHome,
      setShowListOnTask,
      setSuggestDueToday,
      setCompletedLastOnHome,
    }),
    [showListOnTask, suggestDueToday, completedLastOnHome],
  )

  return <Context.Provider value={value}>{children}</Context.Provider>
}
