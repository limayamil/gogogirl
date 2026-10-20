import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { adminView } from '../lib/admin-view'
import { sessionKey } from '../lib/queryClient'
import type { AdminUserSummary } from '../shared/types'
import { NotFound } from './NotFound'
import authStyles from './AuthScreen.module.css'
import styles from './AdminScreen.module.css'

const gateKey = ['admin-gate'] as const

export function AdminScreen() {
  const gate = useQuery({
    queryKey: gateKey,
    queryFn: api.getAdminGate,
    retry: false,
  })
  const view = adminView(gate.data, gate.isPending, gate.isError)

  if (view === 'loading') return <Status title="GoGoGirl" text="Cargando…" />
  if (view === 'not-found') return <NotFound />
  if (view === 'error') {
    return <Status title="No se pudo abrir" text={gate.error?.message ?? 'Error desconocido'} />
  }
  if (view === 'login') return <AdminLogin />
  return <AdminPanel />
}

function Status({ title, text }: { title: string; text: string }) {
  return (
    <div className={authStyles.screen}>
      <div className={authStyles.card}>
        <h1 className={authStyles.title}>{title}</h1>
        <p className={authStyles.lead}>{text}</p>
      </div>
    </div>
  )
}

function AdminLogin() {
  const client = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await api.adminLogin({ username, password })
      client.setQueryData(gateKey, { status: 200, authenticated: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo entrar')
      setPending(false)
    }
  }

  return (
    <div className={authStyles.screen}>
      <form className={authStyles.card} onSubmit={onSubmit}>
        <div className={authStyles.brand}>
          <img src="/brand/logo-mark.webp" alt="" width="42" height="42" />
          <span>GoGoGirl</span>
        </div>
        <h1 className={authStyles.title}>Entrar</h1>
        <p className={authStyles.lead}>Entrá con tu usuario y contraseña.</p>

        <label className={authStyles.field}>
          <span>Usuario</span>
          <input
            className={authStyles.input}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>

        <label className={authStyles.field}>
          <span>Contraseña</span>
          <input
            className={authStyles.input}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error ? (
          <p className={authStyles.error} role="alert">
            {error}
          </p>
        ) : null}

        <button className={authStyles.submit} type="submit" disabled={pending}>
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'Nunca'
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function AdminPanel() {
  const client = useQueryClient()
  const navigate = useNavigate()
  const [opening, setOpening] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: api.adminUsers,
    retry: false,
  })

  async function onLeave() {
    if (leaving) return
    setLeaving(true)
    try {
      await api.adminLogout()
      client.setQueryData(gateKey, { status: 200, authenticated: false })
      client.removeQueries({ queryKey: ['admin-users'] })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo salir')
      setLeaving(false)
    }
  }

  async function onSee(user: AdminUserSummary) {
    if (opening || !user.username) return
    setOpening(user.id)
    setError(null)
    try {
      const next = await api.impersonate(user.id)
      client.setQueryData(sessionKey, next)
      client.removeQueries({ queryKey: ['state'] })
      navigate('/')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo abrir la cuenta')
      setOpening(null)
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.wrap}>
        <div className={styles.top}>
          <div>
            <h1 className={authStyles.title}>Cuentas</h1>
            <p className={styles.lead}>
              Ver como abre el panel de esa persona. Lo que cambies queda guardado en la cuenta de ella.
            </p>
          </div>
          <button type="button" className={styles.leave} onClick={onLeave} disabled={leaving}>
            Salir
          </button>
        </div>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        {users.isPending ? <p className={styles.lead}>Cargando…</p> : null}
        {users.isError ? (
          <p className={styles.error} role="alert">
            {users.error.message}
          </p>
        ) : null}

        {users.data?.users.map((user) => (
          <article key={user.id} className={styles.user}>
            <h2 className={styles.name}>{user.username ?? 'Sin usuario'}</h2>
            <p className={styles.meta}>Creada: {formatWhen(user.createdAt)}</p>
            <p className={styles.meta}>Última actividad: {formatWhen(user.lastSeenAt)}</p>
            <p className={styles.meta}>
              {countLabel(user.taskCount, 'tarea', 'tareas')} · {countLabel(user.noteCount, 'nota', 'notas')}
            </p>
            {user.username ? (
              <button
                type="button"
                className={styles.see}
                onClick={() => onSee(user)}
                disabled={opening !== null}
              >
                {opening === user.id ? 'Abriendo…' : 'Ver como'}
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  )
}
