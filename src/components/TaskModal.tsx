import { useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { IconPaperclip, IconPlus, IconTrash } from './Icons'
import { api } from '../lib/api'
import { colorOf } from '../lib/palette'
import {
  useAppState,
  useCreateSubtask,
  useCreateTask,
  useDeleteSubtask,
  useDeleteTask,
  useRefreshState,
  useUpdateSubtask,
  useUpdateTask,
} from '../lib/store'
import { URGENCIES, type Status, type Urgency } from '../shared/types'
import styles from './TaskModal.module.css'

export interface TaskModalRequest {
  /** null = crear una tarea nueva. */
  taskId: string | null
  defaults?: { categoryId?: string | null; inToday?: boolean; deadline?: string | null }
}

const URGENCY_LABEL: Record<Urgency, string> = { baja: 'Baja', media: 'Media', alta: 'Alta' }

export function TaskModal({ request, onClose }: { request: TaskModalRequest; onClose: () => void }) {
  const { data } = useAppState()
  const categories = data?.categories ?? []
  const task = request.taskId ? data?.tasks.find((t) => t.id === request.taskId) : undefined
  const isEdit = Boolean(task)

  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const createSubtask = useCreateSubtask()
  const updateSubtask = useUpdateSubtask()
  const deleteSubtask = useDeleteSubtask()
  const refreshState = useRefreshState()

  const [form, setForm] = useState(() => ({
    title: task?.title ?? '',
    categoryId: task?.categoryId ?? request.defaults?.categoryId ?? null,
    urgency: task?.urgency ?? ('media' as Urgency),
    deadline: task?.deadline ?? request.defaults?.deadline ?? '',
    description: task?.description ?? '',
    notes: task?.notes ?? '',
    status: task?.status ?? ('pendiente' as Status),
  }))

  /** Subtareas locales: solo se usan al crear, porque la tarea todavia no tiene id. */
  const [draftSubtasks, setDraftSubtasks] = useState<string[]>([])
  const [subtaskDraft, setSubtaskDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const subtasks = useMemo(() => task?.subtasks ?? [], [task])

  function addSubtask() {
    const title = subtaskDraft.trim()
    if (!title) return
    if (task) createSubtask.mutate({ taskId: task.id, title })
    else setDraftSubtasks((prev) => [...prev, title])
    setSubtaskDraft('')
  }

  async function handleSave() {
    const title = form.title.trim()
    if (!title) {
      setError('La tarea necesita un titulo')
      return
    }

    const payload = {
      title,
      categoryId: form.categoryId,
      urgency: form.urgency,
      deadline: form.deadline || null,
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
    }

    try {
      if (task) {
        await updateTask.mutateAsync({ id: task.id, patch: payload })
      } else {
        await createTask.mutateAsync({
          ...payload,
          inToday: request.defaults?.inToday ?? false,
          subtasks: draftSubtasks,
        })
      }
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar')
    }
  }

  /** Sube directo al bucket con una URL prefirmada y despues registra el adjunto. */
  async function handleUpload(file: File) {
    if (!task) return
    setUploading(true)
    setError(null)
    try {
      const { objectKey, uploadUrl } = await api.signUpload({
        taskId: task.id,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
      })
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type || 'application/octet-stream' },
      })
      if (!put.ok) throw new Error(`El bucket rechazo la subida (${put.status})`)
      await api.createAttachment({
        taskId: task.id,
        objectKey,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      })
      await refreshState()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo subir el archivo')
    } finally {
      setUploading(false)
    }
  }

  async function openAttachment(id: string) {
    try {
      const { url } = await api.getAttachmentUrl(id)
      window.open(url, '_blank', 'noopener')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo abrir el adjunto')
    }
  }

  return (
    <Modal
      title={isEdit ? 'Detalle de tarea' : 'Nueva tarea'}
      onClose={onClose}
      footer={
        <>
          {task ? (
            <button
              type="button"
              className={styles.danger}
              onClick={() => {
                deleteTask.mutate(task.id)
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
          <button type="button" className={styles.primary} onClick={handleSave}>
            {isEdit ? 'Guardar' : 'Crear tarea'}
          </button>
        </>
      }
    >
      {error ? <p className={styles.error}>{error}</p> : null}

      <label className={styles.field}>
        <span className={styles.label}>Nombre</span>
        <input
          className={styles.input}
          value={form.title}
          autoFocus
          placeholder="Que hay que hacer?"
          onChange={(e) => set('title', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave()
          }}
        />
      </label>

      <div className={styles.field}>
        <span className={styles.label}>Categoria</span>
        <div className={styles.chips}>
          <button
            type="button"
            className={`${styles.chip} ${form.categoryId === null ? styles.chipOn : ''}`}
            onClick={() => set('categoryId', null)}
          >
            Sin categoria
          </button>
          {categories.map((category) => {
            const color = colorOf(category.colorKey)
            const active = form.categoryId === category.id
            return (
              <button
                key={category.id}
                type="button"
                className={`${styles.chip} ${active ? styles.chipOn : ''}`}
                style={
                  active
                    ? { background: color.bg, color: color.ink, borderColor: color.dot }
                    : undefined
                }
                onClick={() => set('categoryId', category.id)}
              >
                <span className={styles.dot} style={{ background: color.dot }} />
                {category.name}
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <span className={styles.label}>Urgencia</span>
          <div className={styles.segment}>
            {URGENCIES.map((level) => (
              <button
                key={level}
                type="button"
                className={`${styles.segmentItem} ${form.urgency === level ? styles.segmentOn : ''}`}
                style={
                  form.urgency === level
                    ? { background: `var(--urgency-${level})`, color: '#fff' }
                    : undefined
                }
                onClick={() => set('urgency', level)}
              >
                {URGENCY_LABEL[level]}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>Deadline (opcional)</span>
          <input
            type="date"
            className={styles.input}
            value={form.deadline ?? ''}
            onChange={(e) => set('deadline', e.target.value)}
          />
        </label>
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Descripcion (opcional)</span>
        <textarea
          className={styles.textarea}
          rows={3}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Notas extras (opcional)</span>
        <textarea
          className={styles.textarea}
          rows={2}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </label>

      <div className={styles.field}>
        <span className={styles.label}>Subtareas</span>
        <ul className={styles.subtasks}>
          {subtasks.map((subtask) => (
            <li key={subtask.id} className={styles.subtask}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={subtask.done}
                onChange={(e) =>
                  updateSubtask.mutate({ id: subtask.id, patch: { done: e.target.checked } })
                }
              />
              <span className={subtask.done ? styles.subtaskDone : undefined}>{subtask.title}</span>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => deleteSubtask.mutate(subtask.id)}
                aria-label={`Eliminar subtarea ${subtask.title}`}
              >
                <IconTrash size={15} />
              </button>
            </li>
          ))}

          {draftSubtasks.map((title, index) => (
            <li key={`draft-${index}`} className={styles.subtask}>
              <input type="checkbox" className={styles.checkbox} disabled />
              <span>{title}</span>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setDraftSubtasks((prev) => prev.filter((_, i) => i !== index))}
                aria-label={`Quitar subtarea ${title}`}
              >
                <IconTrash size={15} />
              </button>
            </li>
          ))}
        </ul>

        <div className={styles.addRow}>
          <input
            className={styles.input}
            placeholder="Agregar subtarea"
            value={subtaskDraft}
            onChange={(e) => setSubtaskDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addSubtask()
              }
            }}
          />
          <button type="button" className={styles.addButton} onClick={addSubtask}>
            <IconPlus size={16} />
          </button>
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Adjuntos</span>
        {task ? (
          <>
            <ul className={styles.attachments}>
              {task.attachments.map((attachment) => (
                <li key={attachment.id} className={styles.attachment}>
                  <button
                    type="button"
                    className={styles.attachmentName}
                    onClick={() => void openAttachment(attachment.id)}
                  >
                    <IconPaperclip size={15} />
                    {attachment.fileName}
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={async () => {
                      await api.deleteAttachment(attachment.id)
                      await refreshState()
                    }}
                    aria-label={`Eliminar ${attachment.fileName}`}
                  >
                    <IconTrash size={15} />
                  </button>
                </li>
              ))}
            </ul>
            <input
              ref={fileInput}
              type="file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleUpload(file)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              className={styles.ghost}
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? 'Subiendo...' : 'Subir archivo'}
            </button>
          </>
        ) : (
          <p className={styles.hint}>Crea la tarea primero y despues vas a poder adjuntar archivos.</p>
        )}
      </div>
    </Modal>
  )
}
