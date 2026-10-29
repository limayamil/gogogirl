// Texto rico de la web (HTML de Tiptap) a texto plano para la tablet. A diferencia de
// richTextPlain (src/lib), conserva los cortes de parrafo: en el lector e-ink una nota
// sin parrafos es un bloque ilegible.

const SCRIPT_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi
const BREAK_RE = /<br\s*[^>]*>/gi
const BLOCK_CLOSE_RE = /<\/(p|div|h[1-6]|li|blockquote|tr|pre)>/gi
const TAG_RE = /<[^>]+>/g

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

/** Lineas no vacias separadas por \n, recortado a `max` caracteres. */
export function plainTextWithBreaks(html: string | null, max: number): string {
  if (!html) return ''
  const text = decodeEntities(
    html.replace(SCRIPT_RE, ' ').replace(BREAK_RE, '\n').replace(BLOCK_CLOSE_RE, '\n').replace(TAG_RE, ''),
  )
  const lines = text
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter((line) => line.length > 0)
  return lines.join('\n').slice(0, max).trimEnd()
}
