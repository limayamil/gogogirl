import type {
  AppState,
  Attachment,
  AdminUserSummary,
  AuthSession,
  CalendarFeed,
  CalendarFeedInput,
  Category,
  MeetingsOfDay,
  Note,
  NoteInput,
  QuickTask,
  Subtask,
  Task,
  TaskInput,
  TaskLink,
} from '../shared/types'
import { queryClient, sessionKey } from './queryClient'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    // Una sesion vencida no tiene que seguir mostrando los datos de esa cuenta.
    // El 401 del panel no es la sesion de una cuenta: no hay que cerrarla.
    if (response.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/admin/')) {
      queryClient.setQueryData<AuthSession>(sessionKey, (current) => ({
        user: null,
        mode: current?.mode ?? 'login',
        impersonating: null,
      }))
      queryClient.removeQueries({ queryKey: ['state'] })
      void queryClient.invalidateQueries({ queryKey: sessionKey })
    }
    throw new Error(detail?.error ?? `Error ${response.status} en ${path}`)
  }

  return (await response.json()) as T
}

const json = (payload: unknown) => JSON.stringify(payload)

/** Link que todavia no existe en la base: lo que junta el modal antes de crear la tarea. */
export interface LinkDraft {
  url: string
  title?: string | null
}

export const api = {
  getSession: () => request<AuthSession>('/auth/session'),
  claim: (input: { username: string; password: string }) =>
    request<AuthSession>('/auth/claim', { method: 'POST', body: json(input) }),
  login: (input: { username: string; password: string }) =>
    request<AuthSession>('/auth/login', { method: 'POST', body: json(input) }),
  register: (input: { username: string; password: string }) =>
    request<AuthSession>('/auth/register', { method: 'POST', body: json(input) }),
  logout: () => request<AuthSession>('/auth/logout', { method: 'POST' }),

  getAdminGate: async (): Promise<{ status: number; authenticated: boolean }> => {
    const response = await fetch('/api/admin/session', { credentials: 'same-origin' })
    if (response.status === 404) return { status: 404, authenticated: false }
    const detail = (await response.json().catch(() => null)) as { error?: string; authenticated?: boolean } | null
    if (!response.ok) throw new Error(detail?.error ?? `Error ${response.status}`)
    return { status: response.status, authenticated: Boolean(detail?.authenticated) }
  },
  adminLogin: (input: { username: string; password: string }) =>
    request<{ authenticated: boolean }>('/admin/login', { method: 'POST', body: json(input) }),
  adminLogout: () => request<{ authenticated: boolean }>('/admin/logout', { method: 'POST' }),
  adminUsers: () => request<{ users: AdminUserSummary[] }>('/admin/users'),
  impersonate: (userId: string) =>
    request<AuthSession>('/admin/impersonate', { method: 'POST', body: json({ userId }) }),

  getState: () => request<AppState>('/state'),
  getVersion: () => request<{ version: string }>('/version'),

  createCategory: (input: { name: string; colorKey: string }) =>
    request<Category>('/categories', { method: 'POST', body: json(input) }),
  updateCategory: (id: string, patch: { name?: string; colorKey?: string; position?: number }) =>
    request<Category>(`/categories/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteCategory: (id: string) => request<unknown>(`/categories/${id}`, { method: 'DELETE' }),

  createTask: (input: TaskInput & { subtasks?: string[]; links?: LinkDraft[] }) =>
    request<Task>('/tasks', { method: 'POST', body: json(input) }),
  updateTask: (id: string, patch: Partial<TaskInput>) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteTask: (id: string) => request<unknown>(`/tasks/${id}`, { method: 'DELETE' }),

  createSubtask: (input: { taskId: string; title: string }) =>
    request<Subtask>('/subtasks', { method: 'POST', body: json(input) }),
  updateSubtask: (id: string, patch: { title?: string; done?: boolean }) =>
    request<Subtask>(`/subtasks/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteSubtask: (id: string) => request<unknown>(`/subtasks/${id}`, { method: 'DELETE' }),

  createQuickTask: (title: string) =>
    request<QuickTask>('/quick-tasks', { method: 'POST', body: json({ title }) }),
  updateQuickTask: (id: string, patch: { title?: string; done?: boolean }) =>
    request<QuickTask>(`/quick-tasks/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteQuickTask: (id: string) => request<unknown>(`/quick-tasks/${id}`, { method: 'DELETE' }),

  createNote: (input: NoteInput) =>
    request<Note>('/notes', { method: 'POST', body: json(input) }),
  updateNote: (id: string, patch: Partial<NoteInput>) =>
    request<Note>(`/notes/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteNote: (id: string) => request<unknown>(`/notes/${id}`, { method: 'DELETE' }),

  createLink: (input: { taskId: string; url: string; title?: string | null }) =>
    request<TaskLink>('/links', { method: 'POST', body: json(input) }),
  updateLink: (id: string, patch: { url?: string; title?: string | null }) =>
    request<TaskLink>(`/links/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteLink: (id: string) => request<unknown>(`/links/${id}`, { method: 'DELETE' }),

  signUpload: (input: {
    taskId?: string
    noteId?: string
    fileName: string
    contentType: string
  }) =>
    request<{ objectKey: string; uploadUrl: string }>('/uploads/sign', {
      method: 'POST',
      body: json(input),
    }),
  createAttachment: (input: {
    taskId?: string
    noteId?: string
    objectKey: string
    fileName: string
    contentType: string
    sizeBytes: number
  }) => request<Attachment>('/attachments', { method: 'POST', body: json(input) }),
  getAttachmentUrl: (id: string) => request<{ url: string }>(`/attachments/${id}`),
  deleteAttachment: (id: string) => request<unknown>(`/attachments/${id}`, { method: 'DELETE' }),

  listCalendars: () => request<{ calendars: CalendarFeed[] }>('/calendars'),
  createCalendar: (input: CalendarFeedInput & { url: string }) =>
    request<CalendarFeed>('/calendars', { method: 'POST', body: json(input) }),
  updateCalendar: (id: string, patch: Partial<CalendarFeedInput>) =>
    request<CalendarFeed>(`/calendars/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteCalendar: (id: string) => request<unknown>(`/calendars/${id}`, { method: 'DELETE' }),
  getMeetings: () => request<MeetingsOfDay>('/meetings'),
}
