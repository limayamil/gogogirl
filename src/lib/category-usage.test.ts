import { describe, expect, it } from 'vitest'
import {
  CATEGORY_USAGE_COOKIE,
  COLLAPSED_CATEGORY_LIMIT,
  SIN_CATEGORIA_USAGE_KEY,
  formatCategoryUsageCookie,
  parseCategoryUsage,
  rankCategoryChips,
  readCategoryUsage,
  recordCategorySelection,
} from './category-usage'

const hoy = [null, 'a', 'b', 'c', 'd', 'e'] as const

describe('rankCategoryChips', () => {
  it('sin uso conserva el orden de hoy y muestra las primeras 4', () => {
    expect(rankCategoryChips(hoy, {}, null, false)).toEqual([null, 'a', 'b', 'c'])
    expect(COLLAPSED_CATEGORY_LIMIT).toBe(4)
  })

  it('pone más a la izquierda la categoría más elegida', () => {
    expect(rankCategoryChips(hoy, { b: 3, e: 8, [SIN_CATEGORIA_USAGE_KEY]: 1 }, null, false)).toEqual([
      'e',
      'b',
      null,
      'a',
    ])
  })

  it('en empate deja el orden de hoy', () => {
    expect(rankCategoryChips(hoy, { a: 2, c: 2, e: 2 }, null, true)).toEqual([
      'a',
      'c',
      'e',
      null,
      'b',
      'd',
    ])
  })

  it('si la seleccionada no está en el top 4, saca a la menos usada', () => {
    const usage = { a: 5, b: 4, c: 3, d: 2 }
    expect(rankCategoryChips(hoy, usage, 'e', false)).toEqual(['a', 'b', 'c', 'e'])
  })

  it('no mueve nada si la seleccionada ya está en el top', () => {
    expect(rankCategoryChips(hoy, { e: 9 }, 'e', false)).toEqual(['e', null, 'a', 'b'])
  })

  it('expandido lista todas, más usadas primero', () => {
    expect(rankCategoryChips(hoy, { d: 4, [SIN_CATEGORIA_USAGE_KEY]: 2 }, 'e', true)).toEqual([
      'd',
      null,
      'a',
      'b',
      'c',
      'e',
    ])
  })

  it('con 4 o menos no recorta', () => {
    expect(rankCategoryChips([null, 'a'], {}, 'a', false)).toEqual([null, 'a'])
  })

  it('ignora una seleccionada que ya no existe', () => {
    expect(rankCategoryChips(hoy, {}, 'fantasma', false)).toEqual([null, 'a', 'b', 'c'])
  })

  it('no muta las entradas', () => {
    const ids = [null, 'a', 'b', 'c', 'd']
    const usage = { d: 1 }
    rankCategoryChips(ids, usage, 'd', false)
    expect(ids).toEqual([null, 'a', 'b', 'c', 'd'])
    expect(usage).toEqual({ d: 1 })
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
