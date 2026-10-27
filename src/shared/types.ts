// Contrato compartido entre el front (src/) y la API (api/).
// Cambiar algo aca rompe la compilacion de los dos lados a la vez, que es justamente la idea.

export const URGENCIES = ['baja', 'media', 'alta'] as const
export type Urgency = (typeof URGENCIES)[number]

export const STATUSES = ['pendiente', 'en_progreso', 'hecha'] as const
export type Status = (typeof STATUSES)[number]

/** Tope de description (HTML). El markup es mas verboso que el texto plano de 5000. */
export const RICH_TEXT_MAX = 20_000

export interface Category {
  id: string
  name: string
  colorKey: string
  position: number
  createdAt: string
}

export interface Subtask {
  id: string
  taskId: string
  title: string
  done: boolean
  position: number
}

export interface TaskLink {
  id: string
  taskId: string
  url: string
  /** Titulo que escribio el usuario, o null: el front muestra el dominio en ese caso. */
  title: string | null
  position: number
}

export interface Attachment {
  id: string
  /** Duenio: exactamente uno de los dos, el otro queda en null. */
  taskId: string | null
  noteId: string | null
  objectKey: string
  fileName: string
  contentType: string
  sizeBytes: number
  createdAt: string
}

export interface NoteTag {
  id: string
  name: string
}

export const NOTE_KINDS = ['note', 'password'] as const
export type NoteKind = (typeof NOTE_KINDS)[number]

export interface Note {
  id: string
  kind: NoteKind
  title: string
  description: string | null
  username: string | null
  password: string | null
  createdAt: string
  updatedAt: string
  tags: NoteTag[]
  attachments: Attachment[]
}

export interface Task {
  id: string
  categoryId: string | null
  title: string
  description: string | null
  notes: string | null
  urgency: Urgency
  /** Fecha en formato YYYY-MM-DD, o null si la tarea no tiene deadline. */
  deadline: string | null
  status: Status
  inToday: boolean
  hiddenInToday: boolean
  /**
   * Hecha cuya semana (lunes–domingo) ya termino. Distinto de `hiddenInToday`:
   * no es el ojito, es para que las completadas no se acumulen en Hoy/Categorias.
   */
  expired: boolean
  todayPosition: number | null
  position: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
  subtasks: Subtask[]
  attachments: Attachment[]
  links: TaskLink[]
}

export interface QuickTask {
  id: string
  title: string
  done: boolean
  position: number
  createdAt: string
}

/** Respuesta de GET /api/state: todo el estado de la app en una sola llamada. */
export interface AppState {
  categories: Category[]
  tasks: Task[]
  notes: Note[]
  quickTasks: QuickTask[]
  /** false = faltan las S3_*; el modal esconde los adjuntos en vez de fallar al subir. */
  storageConfigured: boolean
  /** Firma de estos datos. El front la compara contra GET /api/version para avisar
   *  que hay novedades cargadas desde otro dispositivo. */
  version: string
}

export interface CategoryInput {
  name: string
  colorKey: string
  position?: number
}

export interface TaskInput {
  title: string
  categoryId?: string | null
  description?: string | null
  notes?: string | null
  urgency?: Urgency
  deadline?: string | null
  status?: Status
  inToday?: boolean
  hiddenInToday?: boolean
  todayPosition?: number | null
  position?: number
}

export interface SubtaskInput {
  taskId: string
  title: string
  done?: boolean
  position?: number
}

export interface QuickTaskInput {
  title: string
  done?: boolean
  position?: number
}

export interface AuthUser {
  id: string
  username: string
}

/**
 * `claim`: la cuenta que ya tiene los datos todavia no tiene usuario.
 * Asignarle uno no crea otra cuenta. `login`: esa cuenta ya fue reclamada.
 */
export interface AuthSession {
  user: AuthUser | null
  mode: 'claim' | 'login'
  /**
   * Cuenta abierta con "Ver como". Null en una sesion propia: el aviso no
   * tiene que aparecerle a quien entro con su usuario.
   */
  impersonating: { username: string } | null
}

/** Fila del panel interno. Sin hash, sin cuerpo de nota y sin notes.password. */
export interface AdminUserSummary {
  id: string
  username: string | null
  createdAt: string
  lastSeenAt: string | null
  taskCount: number
  noteCount: number
}

export interface NoteInput {
  title: string
  kind?: NoteKind
  description?: string | null
  username?: string | null
  password?: string | null
  /** Nombres, no ids: el servidor hace upsert de la etiqueta. */
  tags?: string[]
}

/**
 * Calendario de Google leido por su direccion secreta iCal. La direccion no
 * viaja al front despues de guardarla: solo `maskedUrl`, para reconocerla.
 */
export interface CalendarFeed {
  id: string
  name: string
  colorKey: string
  maskedUrl: string
  position: number
}

export interface CalendarFeedInput {
  name: string
  colorKey: string
  /** Solo al crear o al reemplazarla. Nunca vuelve en la respuesta. */
  url?: string
}

/** PARTSTAT de iCal, ya traducido. */
export type MeetingResponse = 'si' | 'no' | 'tal-vez' | 'sin-responder'

export interface MeetingPerson {
  name: string | null
  email: string | null
}

export interface MeetingAttendee extends MeetingPerson {
  response: MeetingResponse
}

export interface MeetingAttachment {
  url: string
  title: string | null
}

export interface Meeting {
  /** Unico dentro del dia: calendario + UID + ocurrencia. */
  id: string
  calendarId: string
  title: string
  /** ISO UTC. En un evento de todo el dia es la medianoche GMT-3 de ese dia. */
  start: string
  end: string
  allDay: boolean
  location: string | null
  meetUrl: string | null
  organizer: MeetingPerson | null
  attendees: MeetingAttendee[]
  /** HTML ya sanitizado por el servidor, con los links clickeables. */
  descriptionHtml: string | null
  attachments: MeetingAttachment[]
}

export interface MeetingsCalendarStatus {
  id: string
  name: string
  colorKey: string
  ok: boolean
  error: string | null
}

export interface MeetingsOfDay {
  /** 'YYYY-MM-DD' en America/Argentina/Buenos_Aires. */
  date: string
  timeZone: string
  meetings: Meeting[]
  calendars: MeetingsCalendarStatus[]
}
