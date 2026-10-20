import { useEffect } from 'react'
import styles from './AuthScreen.module.css'

/** La misma pantalla para una ruta desconocida y para /interno apagado. */
export function NotFound() {
  useEffect(() => {
    document.title = 'GoGoGirl'
  }, [])

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.title}>Esta página no existe</h1>
        <p className={styles.lead}>El enlace no lleva a ningún lado.</p>
      </div>
    </div>
  )
}
