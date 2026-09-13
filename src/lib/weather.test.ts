import { describe, expect, it } from 'vitest'
import {
  CORDOBA_COORDS,
  WEATHER_TTL_MS,
  fetchIsRaining,
  isRainyWeatherCode,
  openMeteoUrl,
  parseIsRaining,
  readWeatherCache,
  writeWeatherCache,
} from './weather'

describe('isRainyWeatherCode', () => {
  it('marca llovizna, lluvia, chaparrones y tormenta', () => {
    for (const code of [51, 61, 63, 65, 80, 81, 82, 95, 96, 99]) {
      expect(isRainyWeatherCode(code)).toBe(true)
    }
  })

  it('deja afuera cielo despejado, nubes y nieve', () => {
    for (const code of [0, 1, 2, 3, 45, 71, 73, 75, 85]) {
      expect(isRainyWeatherCode(code)).toBe(false)
    }
  })
})

describe('parseIsRaining', () => {
  it('usa el weather_code actual de Open-Meteo', () => {
    expect(parseIsRaining({ current: { weather_code: 61, precipitation: 0 } })).toBe(true)
    expect(parseIsRaining({ current: { weather_code: 1, precipitation: 0 } })).toBe(false)
  })

  it('tambien cuenta precipitacion > 0 aunque el codigo no sea de lluvia', () => {
    expect(parseIsRaining({ current: { weather_code: 3, precipitation: 0.4 } })).toBe(true)
  })

  it('si el payload no sirve, asume que no llueve', () => {
    expect(parseIsRaining(null)).toBe(false)
    expect(parseIsRaining({})).toBe(false)
  })
})

describe('coords fijas', () => {
  it('apunta a Cordoba capital, sin geolocalizacion', () => {
    expect(CORDOBA_COORDS.lat).toBeCloseTo(-31.42, 1)
    expect(CORDOBA_COORDS.lon).toBeCloseTo(-64.19, 1)
  })
})

describe('cache de clima', () => {
  it('vence despues del TTL', () => {
    const storage = new Map<string, string>()
    const fake = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    }
    const now = 1_000_000

    expect(readWeatherCache(fake, now)).toBeNull()
    writeWeatherCache(fake, true, now)
    expect(readWeatherCache(fake, now + 60_000)).toBe(true)
    expect(readWeatherCache(fake, now + WEATHER_TTL_MS + 1)).toBeNull()
  })
})

describe('fetchIsRaining', () => {
  it('arma la URL de Open-Meteo para Cordoba y parsea la respuesta', async () => {
    const url = openMeteoUrl(CORDOBA_COORDS)
    expect(url).toContain(`latitude=${CORDOBA_COORDS.lat}`)
    expect(url).toContain(`longitude=${CORDOBA_COORDS.lon}`)
    expect(url).toContain('current=weather_code,precipitation')

    const raining = await fetchIsRaining(
      CORDOBA_COORDS,
      async () =>
        new Response(JSON.stringify({ current: { weather_code: 81, precipitation: 1.2 } })),
    )
    expect(raining).toBe(true)
  })

  it('si la red falla, asume que no llueve', async () => {
    const raining = await fetchIsRaining(CORDOBA_COORDS, async () => {
      throw new Error('offline')
    })
    expect(raining).toBe(false)
  })
})
