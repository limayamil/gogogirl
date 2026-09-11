import { useState } from 'react'
import { Modal } from './Modal'
import { IconTrash } from './Icons'
import { PALETTE, useColorOf } from '../lib/palette'
import { useAppState, useCreateCategory, useDeleteCategory, useUpdateCategory } from '../lib/store'
import styles from './CategoryModal.module.css'

export function CategoryModal({
  categoryId,
  onClose,
}: {
  categoryId: string | null
  onClose: () => void
}) {
  const { data } = useAppState()
  const category = categoryId ? data?.categories.find((c) => c.id === categoryId) : undefined

  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const deleteCategory = useDeleteCategory()

  const [name, setName] = useState(category?.name ?? '')
  const [colorKey, setColorKey] = useState(category?.colorKey ?? PALETTE[0].key)
  const [error, setError] = useState<string | null>(null)
  const colorOf = useColorOf()

  const taskCount = data?.tasks.filter((t) => t.categoryId === categoryId).length ?? 0

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('La categoria necesita un nombre')
      return
    }
    try {
      if (category) await updateCategory.mutateAsync({ id: category.id, patch: { name: trimmed, colorKey } })
      else await createCategory.mutateAsync({ name: trimmed, colorKey })
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar')
    }
  }

  return (
    <Modal
      title={category ? 'Editar categoria' : 'Nueva categoria'}
      onClose={onClose}
      footer={
        <>
          {category ? (
            <button
              type="button"
              className={styles.danger}
              onClick={() => {
                deleteCategory.mutate(category.id)
                onClose()
              }}
            >
              <IconTrash size={16} />
              Eliminar
            </button>
          ) : null}
          <span className={styles.spacer} />
          <button type="button" className={styles.ghost} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={styles.primary} onClick={save}>
            {category ? 'Guardar' : 'Crear'}
          </button>
        </>
      }
    >
      {error ? <p className={styles.error}>{error}</p> : null}

      <label className={styles.field}>
        <span className={styles.label}>Nombre</span>
        <input
          className={styles.input}
          value={name}
          autoFocus
          placeholder="Casa, Trabajo, Estudio..."
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
          }}
        />
      </label>

      <div className={styles.field}>
        <span className={styles.label}>Color</span>
        <div className={styles.swatches}>
          {PALETTE.map((swatch) => {
            const color = colorOf(swatch.key)
            return (
              <button
                key={swatch.key}
                type="button"
                className={`${styles.swatch} ${colorKey === swatch.key ? styles.swatchOn : ''}`}
                style={{ background: color.bg, borderColor: color.dot }}
                onClick={() => setColorKey(swatch.key)}
                aria-label={swatch.label}
                title={swatch.label}
              >
                <span className={styles.swatchDot} style={{ background: color.dot }} />
              </button>
            )
          })}
        </div>
        <p className={styles.hint}>
          Este color pinta la tarjeta de la categoria y acompania a sus tareas en Hoy y en Semana.
        </p>
      </div>

      {category && taskCount > 0 ? (
        <p className={styles.hint}>
          Si eliminas la categoria, sus {taskCount} tarea(s) no se borran: quedan sin categoria.
        </p>
      ) : null}
    </Modal>
  )
}
