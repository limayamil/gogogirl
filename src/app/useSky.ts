import { useEffect, useState } from 'react'
import { dayPeriod, skyPalette, type DayPeriod, type SkyPalette } from '../lib/daytime'
import {
  CORDOBA_COORDS,
  fetchIsRaining,
  readWeatherCache,
  writeWeatherCache,
} from '../lib/weather'
import { useThemeMode } from './theme'

export interface SkyState {
  period: DayPeriod
  raining: boolean
  palette: SkyPalette
}

export function useSky(): SkyState {
  const { mode } = useThemeMode()
  const [now, setNow] = useState(() => new Date())
  const [raining, setRaining] = useState(false)

  useEffect(() => {
    const tick = () => setNow(new Date())
    const id = window.setInterval(tick, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      const storage = window.localStorage
      const cached = readWeatherCache(storage, Date.now())
      if (cached !== null) {
        setRaining(cached)
        return
      }

      const isRaining = await fetchIsRaining(CORDOBA_COORDS)
      if (cancelled) return
      writeWeatherCache(storage, isRaining, Date.now())
      setRaining(isRaining)
    }

    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const period = dayPeriod(now)
  return { period, raining, palette: skyPalette(period, mode) }
}
