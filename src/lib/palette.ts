/**
 * Paleta pastel curada (inspirada en design/refe3.jpeg y design/refe4.jpeg).
 *
 * Las categorias guardan la CLAVE, nunca el hex: asi un ajuste de paleta o el dark
 * mode se aplican solos a todo lo ya creado.
 */

export interface PastelColor {
  key: string
  label: string
  /** Fondo de la tarjeta de categoria. */
  bg: string
  /** Relleno suave para filas y chips sobre el fondo de la tarjeta. */
  soft: string
  /** Color fuerte: puntito en Hoy, borde izquierdo, acentos. */
  dot: string
  /** Texto legible sobre `bg` y sobre `soft`. */
  ink: string
}

export const PALETTE: PastelColor[] = [
  { key: 'coral',    label: 'Coral',    bg: '#FFE3DC', soft: '#FFF1ED', dot: '#F4836C', ink: '#8C3A2A' },
  { key: 'rosa',     label: 'Rosa',     bg: '#FFE0EC', soft: '#FFF0F5', dot: '#F07AA6', ink: '#8E2F56' },
  { key: 'lila',     label: 'Lila',     bg: '#EBE2FB', soft: '#F5F0FE', dot: '#A78BE6', ink: '#513A87' },
  { key: 'lavanda',  label: 'Lavanda',  bg: '#E1E5FA', soft: '#F0F2FD', dot: '#8496E3', ink: '#37457F' },
  { key: 'cielo',    label: 'Cielo',    bg: '#DCEEF9', soft: '#EFF7FC', dot: '#6FB4DC', ink: '#245675' },
  { key: 'menta',    label: 'Menta',    bg: '#D9F0E5', soft: '#EEF8F3', dot: '#63BF98', ink: '#1F6148' },
  { key: 'salvia',   label: 'Salvia',   bg: '#E4EEDC', soft: '#F2F7EE', dot: '#8DB473', ink: '#41602C' },
  { key: 'manteca',  label: 'Manteca',  bg: '#FCF0CE', soft: '#FEF8E7', dot: '#E4B84C', ink: '#7C5C10' },
  { key: 'durazno',  label: 'Durazno',  bg: '#FDE6D2', soft: '#FEF3E9', dot: '#EE9E5C', ink: '#8A4E17' },
  { key: 'arena',    label: 'Arena',    bg: '#EFE7DF', soft: '#F8F3EF', dot: '#B69B83', ink: '#5F4B38' },
]

const BY_KEY = new Map(PALETTE.map((color) => [color.key, color]))

/** Nunca falla: una categoria con un color desconocido cae en el primero de la paleta. */
export function colorOf(key: string | null | undefined): PastelColor {
  return (key ? BY_KEY.get(key) : undefined) ?? PALETTE[0]
}
