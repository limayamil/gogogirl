import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Outlet } from 'react-router-dom'
import { api } from '../lib/api'
import { sessionKey } from '../lib/queryClient'
import type { AuthSession } from '../shared/types'
import styles from './AuthScreen.module.css'

type FormMode = 'claim' | 'login' | 'register'

export function AuthGate() {
  const session = useQuery({
    queryKey: sessionKey,
    queryFn: api.getSession,
    retry: false,
  })

  if (session.isPending) return <Status title="GoGoGirl" text="Cargando…" />
  if (session.isError) {
    return <Status title="No se pudo abrir la cuenta" text={session.error.message} />
  }
  if (!session.data.user) return <AuthScreen mode={session.data.mode} />
  return <Outlet />
}

function Status({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <Brand />
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.lead}>{text}</p>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div className={styles.brand}>
      <img src="/brand/logo-mark.webp" alt="" width="42" height="42" />
      <span>GoGoGirl</span>
    </div>
  )
}

export function AuthScreen({ mode }: { mode: AuthSession['mode'] }) {
  const client = useQueryClient()
  const [form, setForm] = useState<FormMode>(mode === 'claim' ? 'claim' : 'login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const copy = COPY[form]

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const next =
        form === 'claim'
          ? await api.claim({ username, password })
          : form === 'register'
            ? await api.register({ username, password })
            : await api.login({ username, password })
      client.setQueryData(sessionKey, next)
      client.removeQueries({ queryKey: ['state'] })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo entrar')
      setPending(false)
    }
  }

  return (
    <div className={styles.screen}>
      <form className={styles.card} onSubmit={onSubmit}>
        <Brand />
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.lead}>{copy.lead}</p>

        <label className={styles.field}>
          <span>Usuario</span>
          <input
            className={styles.input}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            minLength={3}
            maxLength={32}
          />
        </label>

        <label className={styles.field}>
          <span>Contraseña</span>
          <input
            className={styles.input}
            name="password"
            type="password"
            autoComplete={form === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            maxLength={200}
          />
        </label>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <button className={styles.submit} type="submit" disabled={pending}>
          {pending ? 'Guardando…' : copy.submit}
        </button>

        <div className={styles.switch}>
          {form !== 'register' ? (
            <button
              type="button"
              onClick={() => {
                setForm('register')
                setError(null)
              }}
            >
              Crear una cuenta nueva
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setForm(mode === 'claim' ? 'claim' : 'login')
                setError(null)
              }}
            >
              {mode === 'claim'
                ? 'Volver a la cuenta que ya tiene los datos'
                : 'Ya tengo cuenta'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

const COPY: Record<FormMode, { title: string; lead: string; submit: string }> = {
  claim: {
    title: 'Esta cuenta ya tiene tus cosas',
    lead: 'Las tareas, categorías, notas y contraseñas que ya están guardadas siguen acá. Elegí un usuario y una contraseña para entrar. No se crea otra cuenta.',
    submit: 'Guardar y entrar',
  },
  login: {
    title: 'Entrar',
    lead: 'Entrá con tu usuario y contraseña.',
    submit: 'Entrar',
  },
  register: {
    title: 'Cuenta nueva',
    lead: 'Elegí un usuario y una contraseña.',
    submit: 'Crear cuenta',
  },
}
