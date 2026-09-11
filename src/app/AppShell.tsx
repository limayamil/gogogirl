import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Fabs } from '../components/Fabs'
import { IconCalendar, IconGrid, IconMoon, IconSun } from '../components/Icons'
import { ModalProvider } from './modals'
import styles from './AppShell.module.css'

const TABS = [
  { to: '/', label: 'Hoy', Icon: IconSun },
  { to: '/categorias', label: 'Categorias', Icon: IconGrid },
  { to: '/semana', label: 'Semana', Icon: IconCalendar },
]

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('gogogirl-theme') as 'light' | 'dark') ?? 'light',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('gogogirl-theme', theme)
  }, [theme])

  return { theme, toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) }
}

export function AppShell() {
  const { theme, toggle } = useTheme()

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            ✿
          </span>
          <span className={styles.brandName}>GoGoGirl</span>
        </div>

        <nav className={styles.tabs} aria-label="Vistas">
          {TABS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          className={styles.themeButton}
          onClick={toggle}
          aria-label={theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'}
        >
          {theme === 'light' ? <IconMoon size={18} /> : <IconSun size={18} />}
        </button>
      </header>

      <ModalProvider>
        <main className={styles.main}>
          <Outlet />
        </main>

        <Fabs />
      </ModalProvider>
    </div>
  )
}
