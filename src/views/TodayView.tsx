import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDisplaySettings } from '../app/display-settings'
import { useModals } from '../app/modals'
import { ErrorState, LoadingState } from '../components/Feedback'
import { StatusToggle } from '../components/StatusToggle'
import { TaskListLabel } from '../components/TaskListLabel'
import {
  IconChevronDown,
  IconEye,
  IconEyeOff,
  IconFolder,
  IconGrip,
  IconPlus,
  IconSun,
} from '../components/Icons'
import { celebrateFromPointer, shouldCelebrateChecked } from '../lib/confetti'
import { formatTodayHeading, todayKey } from '../lib/dates'
import { dueTodaySuggestions, takeForTodayPatch } from '../lib/display-settings'
import { homeListStaysVisible, visibleHomeListTasks } from '../lib/hide-completed'
import { useHideCompletedLists } from '../lib/use-hide-completed'
import { useColorOf } from '../lib/palette'
import { isExpiredCompleted } from '../shared/expiry'
import { useAppState, useReorderToday, useUpdateSubtask, useUpdateTask } from '../lib/store'
import { reorderVisibleToday, sortTodayTasks } from '../lib/today-order'
import type { Category, Task } from '../shared/types'
import styles from './TodayView.module.css'

const TODAY_ZONE = 'zona-hoy'
const RAIL_ZONE = 'zona-listas'

export function TodayView() {
  const { data, isPending, error } = useAppState()
  const { openTask, openCategory } = useModals()
  const updateTask = useUpdateTask()
  const reorderToday = useReorderToday()

  const colorOf = useColorOf()
  const { completedLastOnHome } = useDisplaySettings()
  const [showHidden, setShowHidden] = useState(false)
  const [dragging, setDragging] = useState<Task | null>(null)

  // La manija arranca el drag recién después de ~8px: un toque quieto no reordena.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const tasks = data?.tasks ?? []
  const categories = data?.categories ?? []

  const listed = useMemo(() => tasks.filter((task) => !isExpiredCompleted(task)), [tasks])

  const todayTasks = useMemo(
    () =>
      sortTodayTasks(
        listed.filter((task) => task.inToday && (showHidden || !task.hiddenInToday)),
        completedLastOnHome,
      ),
    [listed, showHidden, completedLastOnHome],
  )

  const hiddenCount = listed.filter((t) => t.inToday && t.hiddenInToday).length
  const uncategorized = listed.filter((t) => t.categoryId === null)

  function handleDragStart(event: DragStartEvent) {
    setDragging(tasks.find((task) => task.id === event.active.id) ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(null)
    const overId = event.over?.id
    const task = tasks.find((t) => t.id === event.active.id)
    if (!task || overId == null) return
    const over = String(overId)

    // Reordenar es vertical: soltar hacia las listas no saca la tarea de Hoy.
    if (over === RAIL_ZONE) return

    if (!task.inToday) {
      if (over === TODAY_ZONE || todayTasks.some((item) => item.id === over)) {
        updateTask.mutate({ id: task.id, patch: takeForTodayPatch() })
      }
      return
    }

    if (over === TODAY_ZONE) return

    const storedIds = listed
      .filter((item) => item.inToday)
      .sort((a, b) => (a.todayPosition ?? 0) - (b.todayPosition ?? 0))
      .map((item) => item.id)
    const positions = reorderVisibleToday(
      storedIds,
      todayTasks.map((item) => item.id),
      task.id,
      over,
    )
    if (positions) reorderToday.mutate(positions)
  }

  const todayIds = useMemo(() => new Set(todayTasks.map((task) => task.id)), [todayTasks])
  const modifiers = useMemo(() => [verticalAxisWhenReordering(todayIds)], [todayIds])
  const collisionDetection = useMemo(() => makeTodayCollision(todayIds), [todayIds])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      modifiers={modifiers}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={`${styles.layout} pageEnter`}>
        <TodayPanel
          tasks={todayTasks}
          candidates={listed}
          categories={categories}
          hiddenCount={hiddenCount}
          showHidden={showHidden}
          onToggleHidden={() => setShowHidden((value) => !value)}
          isPending={isPending}
          error={error}
        />

        <Rail
          ready={!isPending && !error}
          categories={categories}
          tasks={listed}
          uncategorized={uncategorized}
          onAddCategory={() => openCategory(null)}
          onAddTask={(categoryId) => openTask({ taskId: null, defaults: { categoryId } })}
        />
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className={styles.ghost}>
            <span
              className={styles.dot}
              style={{ background: colorOf(categoryColorKey(categories, dragging)).dot }}
            />
            {dragging.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function categoryColorKey(categories: Category[], task: Task): string | null {
  return categories.find((c) => c.id === task.categoryId)?.colorKey ?? null
}

function listName(categories: Category[], task: Task): string | null {
  if (!task.categoryId) return null
  return categories.find((category) => category.id === task.categoryId)?.name ?? null
}

/** Tira compacta arriba del panel. No va en el rail de listas. */
function DueTodayStrip({ tasks, categories }: { tasks: Task[]; categories: Category[] }) {
  const { suggestDueToday } = useDisplaySettings()
  const updateTask = useUpdateTask()
  const suggestions = dueTodaySuggestions(tasks, todayKey(), suggestDueToday)
  if (suggestions.length === 0) return null

  return (
    <ul className={styles.suggest} aria-label="Sugerencias para hoy">
      {suggestions.map((task) => (
        <li key={task.id} className={styles.suggestRow}>
          <span className={styles.suggestCopy}>
            <span className={styles.suggestTitle}>{task.title}</span>
            <TaskListLabel name={listName(categories, task)} />
          </span>
          <button
            type="button"
            className={styles.suggestTake}
            onClick={() => updateTask.mutate({ id: task.id, patch: takeForTodayPatch() })}
          >
            Tomar para hoy
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Reordenar Hoy solo choca con filas de Hoy. El modificador ya traba el eje X;
 * acá se descarta la zona de listas para que ese gesto no las use de destino.
 * Traer desde las listas sigue cayendo en el panel: si ganara una fila, parecería
 * que insertamos ahí, pero la tarea siempre entra al final.
 */
function makeTodayCollision(todayIds: Set<string>): CollisionDetection {
  return (args) => {
    const draggingToday = todayIds.has(String(args.active.id))

    if (draggingToday) {
      const rows = args.droppableContainers.filter((container) => todayIds.has(String(container.id)))
      const overRow = pointerWithin({ ...args, droppableContainers: rows })
      if (overRow.length > 0) return overRow

      const pointerHits = pointerWithin(args)
      const overRail = pointerHits.some((hit) => hit.id === RAIL_ZONE)
      const overToday = pointerHits.some((hit) => hit.id === TODAY_ZONE)
      if (overRail || !overToday) return []
      return closestCenter({ ...args, droppableContainers: rows })
    }

    const pointerHits = pointerWithin(args)
    const zone = pointerHits.find((hit) => hit.id === TODAY_ZONE || hit.id === RAIL_ZONE)
    if (zone) return [zone]
    return pointerHits.length > 0 ? pointerHits : closestCenter(args)
  }
}

/** El overlay de una fila de Hoy no se corre de costado: Listas queda fuera del gesto. */
function verticalAxisWhenReordering(todayIds: ReadonlySet<string>): Modifier {
  return ({ transform, active }) => {
    if (!active || !todayIds.has(String(active.id))) return transform
    return { ...transform, x: 0 }
  }
}

function keepClick(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}

// --- Panel de Hoy ---------------------------------------------------------

function TodayPanel({
  tasks,
  candidates,
  categories,
  hiddenCount,
  showHidden,
  onToggleHidden,
  isPending,
  error,
}: {
  tasks: Task[]
  /** El mismo conjunto que arma el panel, para no sugerir lo que Hoy ya no muestra. */
  candidates: Task[]
  categories: Category[]
  hiddenCount: number
  showHidden: boolean
  onToggleHidden: () => void
  isPending: boolean
  error: unknown
}) {
  const { setNodeRef, isOver } = useDroppable({ id: TODAY_ZONE })
  const today = formatTodayHeading(new Date())
  const comma = today.indexOf(',')
  const weekday = comma === -1 ? today : today.slice(0, comma)
  const rest = comma === -1 ? '' : today.slice(comma + 1).trim()

  return (
    <section
      ref={setNodeRef}
      className={`${styles.today} ${isOver ? styles.todayOver : ''}`}
      aria-label="Tareas de hoy"
    >
      <header className={styles.todayHeader}>
        {/* El nav ya dice Hoy: el heading es la fecha, con el dia en coral
           como el saludo amable de las referencias, sin copiar su copy. */}
        <h1 className={styles.todayTitle}>
          <span className={styles.todayFriendly}>{weekday}</span>
          {rest ? <span className={styles.todayRest}>{rest}</span> : null}
        </h1>

        {hiddenCount > 0 ? (
          <button
            type="button"
            className={styles.hiddenToggle}
            onClick={onToggleHidden}
            title={showHidden ? 'Ocultar tareas escondidas' : `Ver ${hiddenCount} oculta(s)`}
            aria-label={showHidden ? 'Ocultar tareas escondidas' : `Ver ${hiddenCount} oculta(s)`}
          >
            {showHidden ? <IconEyeOff size={18} /> : <IconEye size={18} />}
            <span>{showHidden ? 'Ocultar' : hiddenCount}</span>
          </button>
        ) : null}
      </header>

      {/* El heading no depende de los datos: se queda montado para que la
          pantalla no salte de un spinner centrado al panel completo. */}
      {isPending ? <LoadingState /> : null}
      {error ? <ErrorState error={error} /> : null}

      {isPending || error ? null : (
        <DueTodayStrip tasks={candidates} categories={categories} />
      )}

      {isPending || error ? null : tasks.length === 0 ? (
        <div className={styles.dropHint}>
          <img
            className={styles.emptyIllustration}
            src="/images/empty-today.webp"
            alt=""
            width="560"
            height="373"
          />
          <p className={styles.dropHintTitle}>Todavía no hay nada para hoy</p>
          <p className={styles.dropHintText}>
            <span className={styles.hintDesktop}>
              Arrastrá una tarea desde las listas de al costado, o creá una con el botón +.
            </span>
            <span className={styles.hintMobile}>
              Arrastrá una tarea desde las listas de abajo, o creá una con el botón +.
            </span>
          </p>
        </div>
      ) : (
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <ul className={`${styles.todayList} stagger`}>
            {tasks.map((task) => (
              <TodayRow key={task.id} task={task} categories={categories} />
            ))}
          </ul>
        </SortableContext>
      )}
    </section>
  )
}

/** Fila de Hoy: la manija reordena; titulo, estado y ojo siguen siendo clicks. */
export function TodayRow({ task, categories }: { task: Task; categories: Category[] }) {
  const { openTask } = useModals()
  const updateTask = useUpdateTask()
  const [open, setOpen] = useState(false)
  const hasSubtasks = task.subtasks.length > 0
  const color = useColorOf()(categoryColorKey(categories, task))
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: task.id,
  })

  return (
    <li
      ref={setNodeRef}
      className={`${styles.todayRow} ${isDragging ? styles.dragging : ''} ${
        task.hiddenInToday ? styles.rowHidden : ''
      }`}
      style={{
        backgroundColor: color.soft,
        borderColor: color.bg,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {isOver && !isDragging ? <span className={styles.insertLine} aria-hidden="true" /> : null}
      <div className={styles.todayRowBody}>
        <button
          type="button"
          className={styles.dragHandle}
          aria-label="Reordenar"
          title="Arrastrá para reordenar"
          {...attributes}
          {...listeners}
        >
          <IconGrip size={18} />
        </button>

        <div className={styles.todayRowMain}>
          <span className={styles.rowBar} style={{ background: color.dot }} />

          {hasSubtasks ? (
            <button
              type="button"
              className={styles.rowChevron}
              aria-expanded={open}
              title={open ? 'Ocultar subtareas' : 'Ver subtareas'}
              aria-label={open ? 'Ocultar subtareas' : 'Ver subtareas'}
              onPointerDown={keepClick}
              onClick={(event) => {
                event.stopPropagation()
                setOpen((value) => !value)
              }}
            >
              <IconChevronDown size={16} className={open ? undefined : styles.chevronClosed} />
            </button>
          ) : null}

          <StatusToggle
            status={task.status}
            onChange={(status) => updateTask.mutate({ id: task.id, patch: { status } })}
          />

          <button
            type="button"
            className={styles.rowTitle}
            onPointerDown={keepClick}
            onClick={() => openTask({ taskId: task.id })}
          >
            <span className={task.status === 'hecha' ? styles.rowDone : undefined}>{task.title}</span>
            <TaskListLabel name={listName(categories, task)} />
          </button>

          <button
            type="button"
            className={styles.rowEye}
            title={task.hiddenInToday ? 'Volver a mostrar en Hoy' : 'Ocultar de Hoy'}
            aria-label={task.hiddenInToday ? 'Volver a mostrar en Hoy' : 'Ocultar de Hoy'}
            onPointerDown={keepClick}
            onClick={(event) => {
              event.stopPropagation()
              updateTask.mutate({ id: task.id, patch: { hiddenInToday: !task.hiddenInToday } })
            }}
          >
            {task.hiddenInToday ? <IconEyeOff size={16} /> : <IconEye size={16} />}
          </button>
        </div>
      </div>

      {hasSubtasks && open ? <SubtaskList task={task} /> : null}
    </li>
  )
}

// --- Columna de listas ----------------------------------------------------

function Rail({
  ready,
  categories,
  tasks,
  uncategorized,
  onAddCategory,
  onAddTask,
}: {
  /** false mientras carga: sin esto el rail invita a crear una categoria que ya existe. */
  ready: boolean
  categories: Category[]
  tasks: Task[]
  uncategorized: Task[]
  onAddCategory: () => void
  onAddTask: (categoryId: string | null) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: RAIL_ZONE })
  // Misma preferencia que Categorías: no toca tareas guardadas.
  const [hideCompleted, setHideCompleted] = useHideCompletedLists()

  const shownUncategorized = visibleHomeListTasks(uncategorized, hideCompleted)

  return (
    <aside ref={setNodeRef} className={`${styles.rail} ${isOver ? styles.railOver : ''}`}>
      <header className={styles.railHeader}>
        <h2 className={styles.railTitle}>Listas</h2>
        <div className={styles.railActions}>
          <button
            type="button"
            className={`${styles.railAdd} ${hideCompleted ? styles.railAddOn : ''}`}
            aria-pressed={hideCompleted}
            onClick={() => setHideCompleted((value) => !value)}
          >
            {hideCompleted ? <IconEye size={15} /> : <IconEyeOff size={15} />}
            {hideCompleted ? 'Ver hechas' : 'Ocultar hechas'}
          </button>
          <button type="button" className={styles.railAdd} onClick={onAddCategory}>
            <IconPlus size={15} />
            Categoría
          </button>
        </div>
      </header>

      {ready && categories.length === 0 && uncategorized.length === 0 ? (
        <p className={styles.railEmpty}>
          <IconFolder size={18} />
          Creá tu primera categoría para empezar a juntar tareas.
        </p>
      ) : null}

      {categories.map((category) => {
        const own = tasks.filter((task) => task.categoryId === category.id)
        // Toda hecha: la lista desaparece. Mixta: sigue, sin las hechas.
        if (!homeListStaysVisible(own, hideCompleted)) return null
        return (
          <CategoryGroup
            key={category.id}
            name={category.name}
            listName={category.name}
            colorKey={category.colorKey}
            tasks={visibleHomeListTasks(own, hideCompleted)}
            onAddTask={() => onAddTask(category.id)}
          />
        )
      })}

      {shownUncategorized.length > 0 ? (
        <CategoryGroup
          name="Sin categoría"
          listName={null}
          colorKey={null}
          tasks={shownUncategorized}
          onAddTask={() => onAddTask(null)}
        />
      ) : null}
    </aside>
  )
}

function CategoryGroup({
  name,
  listName,
  colorKey,
  tasks,
  onAddTask,
}: {
  name: string
  /** Null en "Sin categoría": no hay lista que mostrar bajo el título. */
  listName: string | null
  colorKey: string | null
  tasks: Task[]
  onAddTask: () => void
}) {
  const [open, setOpen] = useState(true)
  const color = useColorOf()(colorKey)
  const pending = tasks.filter((task) => task.status !== 'hecha').length

  return (
    <section className={styles.group} style={{ backgroundColor: color.bg }}>
      <header className={styles.groupHeader}>
        <button
          type="button"
          className={styles.groupToggle}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          style={{ color: color.ink }}
        >
          <IconChevronDown size={16} className={open ? undefined : styles.chevronClosed} />
          {name}
          <span className={styles.groupCount}>{pending}</span>
        </button>

        <button
          type="button"
          className={styles.groupAdd}
          onClick={onAddTask}
          aria-label={`Agregar tarea a ${name}`}
          style={{ color: color.ink }}
        >
          <IconPlus size={15} />
        </button>
      </header>

      <div className={`${styles.groupBody} ${open ? styles.groupBodyOpen : ''}`}>
        <div>
          <ul className={styles.groupList}>
            {tasks.length === 0 ? <li className={styles.groupEmpty}>Sin tareas</li> : null}
            {tasks.map((task) => (
              <RailTask key={task.id} task={task} tint={color.soft} dot={color.dot} listName={listName} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function RailTask({
  task,
  tint,
  dot,
  listName,
}: {
  task: Task
  tint: string
  dot: string
  listName: string | null
}) {
  const { openTask } = useModals()
  const updateTask = useUpdateTask()
  // Si ya esta en Hoy, el sortable de alla es el unico dueno del id: registrar
  // otro draggable con el mismo id hace que el DragOverlay mida este nodo
  // (abajo a la derecha) y aparezca una pildora fantasma.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: task.inToday,
  })

  return (
    <li
      ref={setNodeRef}
      className={`${styles.railTask} ${isDragging ? styles.dragging : ''}`}
      style={{ backgroundColor: tint }}
      {...attributes}
      {...listeners}
    >
      <div className={styles.railTaskMain}>
        <StatusToggle
          size="sm"
          status={task.status}
          onChange={(status) => updateTask.mutate({ id: task.id, patch: { status } })}
        />
        <button
          type="button"
          className={styles.railTaskTitle}
          onClick={() => openTask({ taskId: task.id })}
        >
          <span className={task.status === 'hecha' ? styles.rowDone : undefined}>{task.title}</span>
          <TaskListLabel name={listName} />
        </button>
        {task.inToday ? (
          <span className={styles.inToday} style={{ background: dot }} title="Ya está en Hoy">
            <IconSun size={11} />
          </span>
        ) : null}
      </div>

      {task.subtasks.length > 0 ? <SubtaskList task={task} /> : null}
    </li>
  )
}

function SubtaskList({ task }: { task: Task }) {
  const updateSubtask = useUpdateSubtask()

  return (
    <ul className={styles.subtasks}>
      {task.subtasks.map((subtask) => (
        <li key={subtask.id} className={styles.subtask}>
          <label className={styles.subtaskLabel}>
            <input
              type="checkbox"
              className={styles.subtaskCheck}
              checked={subtask.done}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => {
                if (shouldCelebrateChecked(event.target.checked)) celebrateFromPointer()
                updateSubtask.mutate({ id: subtask.id, patch: { done: event.target.checked } })
              }}
            />
            <span className={subtask.done ? styles.rowDone : undefined}>{subtask.title}</span>
          </label>
        </li>
      ))}
    </ul>
  )
}
