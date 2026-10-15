import { describe, expect, it } from 'vitest'
import {
  CATEGORY_USAGE_COOKIE,
  COLLAPSED_CATEGORY_LINES,
  SIN_CATEGORIA_USAGE_KEY,
  fitCategoryChips,
  formatCategoryUsageCookie,
  parseCategoryUsage,
  rankCategoryIds,
  readCategoryUsage,
  recordCategorySelection,
} from './category-usage'

const hoy = [null, 'a', 'b', 'c', 'd', 'e'] as const

describe('rankCategoryIds', () => {
  it('sin uso conserva el orden de hoy', () => {
    expect(rankCategoryIds(hoy, {})).toEqual([null, 'a', 'b', 'c', 'd', 'e'])
    expect(COLLAPSED_CATEGORY_LINES).toBe(2)
  })

  it('pone más a la izquierda la categoría más elegida', () => {
    expect(rankCategoryIds(hoy, { b: 3, e: 8, [SIN_CATEGORIA_USAGE_KEY]: 1 })).toEqual([
      'e',
      'b',
      null,
      'a',
      'c',
      'd',
    ])
  })

  it('en empate deja el orden de hoy', () => {
    expect(rankCategoryIds(hoy, { a: 2, c: 2, e: 2 })).toEqual(['a', 'c', 'e', null, 'b', 'd'])
  })

  it('no muta las entradas', () => {
    const ids = [null, 'a', 'b', 'c', 'd']
    const usage = { d: 1 }
    rankCategoryIds(ids, usage)
    expect(ids).toEqual([null, 'a', 'b', 'c', 'd'])
    expect(usage).toEqual({ d: 1 })
  })
})

describe('fitCategoryChips', () => {
  it('llena dos líneas y deja afuera lo que no entra entero', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const widths = [80, 80, 80, 80, 80]
    expect(fitCategoryChips(ids, widths, 100, 8)).toEqual(['a', 'b'])
  })

  it('sigue con la segunda línea en vez de cortar el nombre', () => {
    const ids = ['a', 'b', 'c', 'd']
    const widths = [50, 50, 50, 50]
    expect(fitCategoryChips(ids, widths, 120, 10)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('no saltea una ancha para meter una más chica que viene después', () => {
    expect(fitCategoryChips(['a', 'ancha', 'chica'], [70, 90, 20], 100, 8)).toEqual(['a', 'ancha'])
  })

  it('muestra el nombre completo aunque sea más ancho que la fila', () => {
    expect(fitCategoryChips(['larga', 'otra'], [180, 40], 100, 8)).toEqual(['larga', 'otra'])
  })

  it('si la seleccionada no entra, suelta las menos usadas hasta que quepa', () => {
    const ids = ['a', 'b', 'c', 'elegida']
    const widths = [80, 80, 80, 80]
    expect(fitCategoryChips(ids, widths, 100, 8, 'elegida')).toEqual(['a', 'elegida'])
  })

  it('no toca el orden si la seleccionada ya entra', () => {
    expect(fitCategoryChips(['a', 'b', 'c', 'd'], [80, 80, 80, 80], 100, 8, 'b')).toEqual(['a', 'b'])
  })

  it('sin medida todavía no esconde chips', () => {
    expect(fitCategoryChips(['a', 'b'], [10, 10], 0, 8)).toEqual(['a', 'b'])
  })
})

describe('recordCategorySelection', () => {
  it('suma uno solo a la categoría elegida, incluida Sin categoría', () => {
    const once = recordCategorySelection({}, null)
    expect(once).toEqual({ [SIN_CATEGORIA_USAGE_KEY]: 1 })
    expect(recordCategorySelection(once, 'a')).toEqual({ [SIN_CATEGORIA_USAGE_KEY]: 1, a: 1 })
    expect(recordCategorySelection(once, null)).toEqual({ [SIN_CATEGORIA_USAGE_KEY]: 2 })
  })

  it('no reusa un conteo inválido', () => {
    expect(recordCategorySelection({ a: -3 }, 'a')).toEqual({ a: 1 })
  })
})

describe('cookie de uso', () => {
  it('escribe el nombre, Path=/ y SameSite=Lax, y se vuelve a leer', () => {
    const usage = { 'cat-1': 4, [SIN_CATEGORIA_USAGE_KEY]: 2 }
    const setCookie = formatCategoryUsageCookie(usage)
    expect(setCookie.startsWith(`${CATEGORY_USAGE_COOKIE}=`)).toBe(true)
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toContain('SameSite=Lax')

    const pair = setCookie.split(';')[0]
    expect(readCategoryUsage(`tema=claro; ${pair}; otra=1`)).toEqual(usage)
  })

  it('una cookie vacía o rota deja el orden de hoy', () => {
    expect(parseCategoryUsage(null)).toEqual({})
    expect(parseCategoryUsage('')).toEqual({})
    expect(parseCategoryUsage('%7B')).toEqual({})
    expect(parseCategoryUsage(encodeURIComponent('[]'))).toEqual({})
    expect(parseCategoryUsage(encodeURIComponent('{"a":1.5,"b":-1,"":3,"c":2}'))).toEqual({ c: 2 })
    expect(readCategoryUsage('')).toEqual({})
    expect(readCategoryUsage('gogogirl.categoryUsage=no-es-json')).toEqual({})
  })
})
