/**
 * El clima del header vive en el cliente: Open-Meteo no pide clave y las
 * coords son las de Cordoba capital — un solo usuario, sin geolocalizacion.
 */

export const CORDOBA_COORDS = { lat: -31.4201, lon: -64.1888 }
export const WEATHER_STORAGE_KEY = 'gogogirl-weather'
export const WEATHER_TTL_MS = 20 * 60 * 1000

export interface GeoCoords {
  lat: number
  lon: number
}

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const RAIN_CODES = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99,
])

export function isRainyWeatherCode(code: number): boolean {
  return RAIN_CODES.has(code)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function parseIsRaining(payload: unknown): boolean {
  const current = asRecord(asRecord(payload)?.current)
  if (!current) return false
  const code = current.weather_code
  if (typeof code === 'number' && isRainyWeatherCode(code)) return true
  const precipitation = current.precipitation
  return typeof precipitation === 'number' && precipitation > 0
}

export function readWeatherCache(storage: KeyValueStore, now: number): boolean | null {
  const raw = storage.getItem(WEATHER_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = asRecord(JSON.parse(raw) as unknown)
    if (!parsed || typeof parsed.raining !== 'boolean' || typeof parsed.fetchedAt !== 'number') {
      return null
    }
    if (now - parsed.fetchedAt > WEATHER_TTL_MS) return null
    return parsed.raining
  } catch {
    return null
  }
}

export function writeWeatherCache(storage: KeyValueStore, raining: boolean, now: number): void {
  storage.setItem(WEATHER_STORAGE_KEY, JSON.stringify({ raining, fetchedAt: now }))
}

export function openMeteoUrl({ lat, lon }: GeoCoords): string {
  // URLSearchParams encodea la coma y Open-Meteo acepta las dos formas;
  // dejamos el query legible porque lat/lon ya son numeros.
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,precipitation&timezone=auto`
}

export async function fetchIsRaining(
  coords: GeoCoords,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchFn(openMeteoUrl(coords))
    if (!response.ok) return false
    return parseIsRaining(await response.json())
  } catch {
    return false
  }
}
