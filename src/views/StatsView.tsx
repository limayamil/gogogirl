import { useMemo } from 'react'
import { ErrorState, LoadingState } from '../components/Feedback'
import { IconChart } from '../components/Icons'
import { useColorOf } from '../lib/palette'
import { computeTaskStats, formatWeekSpan, plural } from '../lib/stats'
import { useAppState } from '../lib/store'
import styles from './StatsView.module.css'

export function StatsView() {
  const { data, isPending, error } = useAppState()
  const colorOf = useColorOf()
  const stats = useMemo(
    () => computeTaskStats(data?.tasks ?? [], data?.categories ?? []),
    [data?.tasks, data?.categories],
  )

  const maxCategory = stats.byCategory[0]?.count ?? 0
  const maxWeek = stats.weeks.reduce((max, week) => Math.max(max, week.count), 0)
  const pastWeeks = stats.weeks.filter((week) => !week.isCurrent)
  const currentWeek = stats.weeks.find((week) => week.isCurrent)
  const delta = stats.thisWeekCount - stats.lastWeekCount

  return (
    <div className={`${styles.page} pageEnter`}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <IconChart size={22} />
          Estadísticas
        </h1>
        <p className={styles.subtitle}>
          Tareas hechas a lo largo del tiempo, incluidas las que ya caducaron el lunes.
        </p>
      </header>

      {isPending ? <LoadingState /> : null}
      {error ? <ErrorState error={error} /> : null}

      {!isPending && !error && stats.total === 0 ? (
        <div className={styles.empty}>
          <img
            className={styles.emptyIllustration}
            src="/images/empty-week.webp"
            alt=""
            width="760"
            height="507"
          />
          <p className={styles.emptyTitle}>Todavía no hay tareas hechas</p>
          <p className={styles.emptyText}>
            Cuando completes alguna, acá vas a ver el total, de qué listas salieron y cómo
            venía cada semana.
          </p>
        </div>
      ) : null}

      {!isPending && !error && stats.total > 0 ? (
        <div className={styles.stack}>
          <section className={styles.card} aria-labelledby="stats-general">
            <h2 id="stats-general" className={styles.sectionTitle}>
              General
            </h2>
            <p className={styles.hero}>
              <span className={styles.heroNumber}>{stats.total}</span>
              <span className={styles.heroLabel}>
                {stats.total === 1 ? 'tarea hecha' : 'tareas hechas'}
              </span>
            </p>

            <h3 className={styles.subhead}>Por lista</h3>
            <ul className={styles.bars}>
              {stats.byCategory.map((row) => {
                // Sin categoria no tiene clave: el fallback de la paleta pintaria coral.
                const color = row.colorKey ? colorOf(row.colorKey) : { dot: 'var(--ink-faint)' }
                const width = maxCategory === 0 ? 0 : Math.round((row.count / maxCategory) * 100)
                return (
                  <li key={row.categoryId ?? 'sin-categoria'} className={styles.barRow}>
                    <div className={styles.barMeta}>
                      <span className={styles.barName}>
                        <span className={styles.dot} style={{ background: color.dot }} />
                        {row.name}
                      </span>
                      <span className={styles.barCount}>{plural(row.count, 'tarea', 'tareas')}</span>
                    </div>
                    <div className={styles.barTrack} aria-hidden="true">
                      <span
                        className={styles.barFill}
                        style={{ width: `${width}%`, background: color.dot }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>

          <div id="stats-weeks-block" className={styles.history}>
            <section className={styles.highlights} aria-label="Esta semana">
              <article className={styles.chipCard}>
                <p className={styles.chipLabel}>Esta semana</p>
                <p className={styles.chipValue}>{plural(stats.thisWeekCount, 'tarea', 'tareas')}</p>
                {currentWeek ? (
                  <p className={styles.chipHint}>{plural(currentWeek.listCount, 'lista', 'listas')}</p>
                ) : (
                  <p className={styles.chipHint}>Todavía ninguna hecha</p>
                )}
              </article>
              <article className={styles.chipCard}>
                <p className={styles.chipLabel}>Semana pasada</p>
                <p className={styles.chipValue}>{plural(stats.lastWeekCount, 'tarea', 'tareas')}</p>
                <p className={styles.chipHint}>
                  {delta === 0
                    ? 'Igual que ahora'
                    : delta > 0
                      ? `${delta} más esta semana`
                      : `${Math.abs(delta)} menos esta semana`}
                </p>
              </article>
              {stats.mostProductiveWeekdays.length > 0 ? (
                <article className={styles.chipCard}>
                  <p className={styles.chipLabel}>Día más productivo</p>
                  <p className={styles.chipValue}>
                    {joinWeekdays(stats.mostProductiveWeekdays.map((day) => day.label))}
                  </p>
                  <p className={styles.chipHint}>
                    {plural(stats.mostProductiveWeekdays[0].count, 'tarea hecha', 'tareas hechas')}
                  </p>
                </article>
              ) : null}
            </section>

            <section className={styles.card} aria-labelledby="stats-weeks">
              <h2 id="stats-weeks" className={styles.sectionTitle}>
                Semanas anteriores
              </h2>
              {pastWeeks.length === 0 ? (
                <p className={styles.weeksEmpty}>
                  {stats.thisWeekCount > 0
                    ? 'Esta es la primera semana con tareas hechas. Las próximas van a ir apareciendo acá.'
                    : 'Cuando cierre una semana con tareas hechas, va a quedar listada acá.'}
                </p>
              ) : (
                <ul className={styles.weeks}>
                  {pastWeeks.map((week) => {
                    const width = maxWeek === 0 ? 0 : Math.round((week.count / maxWeek) * 100)
                    return (
                      <li key={week.monday} className={styles.weekRow}>
                        <div className={styles.weekMeta}>
                          <span className={styles.weekRange}>
                            {formatWeekSpan(week.monday, week.sunday)}
                          </span>
                          <span className={styles.weekCounts}>
                            {plural(week.count, 'tarea', 'tareas')}
                            {' · '}
                            {plural(week.listCount, 'lista', 'listas')}
                          </span>
                        </div>
                        <div className={styles.barTrack} aria-hidden="true">
                          <span className={styles.weekFill} style={{ width: `${width}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function joinWeekdays(labels: string[]): string {
  const pretty = labels.map((label) => label.charAt(0).toUpperCase() + label.slice(1))
  if (pretty.length === 1) return pretty[0]
  if (pretty.length === 2) return `${pretty[0]} y ${pretty[1]}`
  return `${pretty.slice(0, -1).join(', ')} y ${pretty.at(-1)}`
}
