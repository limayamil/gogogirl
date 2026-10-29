// Marcas que manda la tablet (tareas o subtareas hechas sin conexion): la misma forma y
// las mismas reglas para los dos endpoints, asi una cola local sirve para ambos.

import { badRequest } from './http.ts'

export const MAX_MARKS = 200
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface Mark {
  id: string
  doneAt: string
}

/**
 * La hora la pone la tablet, que pudo tildar sin conexion horas antes de sincronizar.
 * Un reloj roto (o adelantado) no puede dejar una tarea hecha "en el futuro": en ese
 * caso vale la hora del servidor.
 */
function doneAtOrNow(value: unknown, now: Date): string {
  if (typeof value !== 'string') return now.toISOString()
  const at = Date.parse(value)
  if (!Number.isFinite(at) || at > now.getTime()) return now.toISOString()
  return new Date(at).toISOString()
}

export function parseMarks(input: Record<string, unknown>, now: Date): Mark[] {
  const raw = input.marks
  if (!Array.isArray(raw)) badRequest('Falta marks')
  if (raw.length > MAX_MARKS) badRequest(`Como mucho ${MAX_MARKS} marcas por envio`)
  const marks: Mark[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'object' || item == null || typeof (item as Mark).id !== 'string') {
      badRequest('Cada marca necesita un id')
    }
    const id = (item as Mark).id
    if (seen.has(id)) continue
    seen.add(id)
    marks.push({ id, doneAt: doneAtOrNow((item as Mark).doneAt, now) })
  }
  return marks
}
