/**
 * @jest-environment node
 *
 * Guards against dropping a table the code still uses.
 *
 * 20260728120000 dropped product_options and product_option_values as "dead" and
 * took the products page down. The audit that classified them missed
 * `.from("product_options")` because it grepped only for single quotes, and
 * lib/db/products.ts is excluded from coverage so nothing else caught it.
 *
 * This scans source for table references under both quote styles and inside
 * PostgREST nested selects, then asserts none of them name a dropped table.
 * Add to DROPPED_TABLES whenever a migration drops one.
 */
export {}

import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const DROPPED_TABLES = ['carts', 'cart_items', 'order_items', 'product_media'] as const

/** Tables that were dropped and then restored — must stay referenced-and-present. */
const RESTORED_TABLES = ['product_options', 'product_option_values'] as const

const SCAN_ROOTS = ['lib', 'app', 'components']
const SOURCE_EXT = /\.tsx?$/

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collectSourceFiles(full, acc)
    else if (SOURCE_EXT.test(entry)) acc.push(full)
  }
  return acc
}

const files = SCAN_ROOTS.flatMap(root => {
  try {
    return collectSourceFiles(join(process.cwd(), root))
  } catch {
    return []
  }
})

/** Matches .from('x') and .from("x") and .from(`x`). */
function fromReferences(source: string): string[] {
  return [...source.matchAll(/\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)/gi)].map(m => m[1])
}

/**
 * Matches PostgREST nested-select relation names — a bare identifier followed by
 * `(` inside a select string. Deliberately loose; false positives are harmless
 * because we only ever check membership against the dropped list.
 */
function nestedSelectReferences(source: string): string[] {
  return [...source.matchAll(/^\s*([a-z_][a-z0-9_]*)\s*\(/gim)].map(m => m[1])
}

describe('dropped tables are not referenced in source', () => {
  it('found source files to scan', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(DROPPED_TABLES)('no code references the dropped table %s', table => {
    const offenders = files.filter(file => {
      const source = readFileSync(file, 'utf8')
      return (
        fromReferences(source).includes(table) ||
        nestedSelectReferences(source).includes(table)
      )
    })

    expect(offenders).toEqual([])
  })

  it.each(RESTORED_TABLES)('%s is still referenced, so it must not be dropped again', table => {
    const referencing = files.filter(file => {
      const source = readFileSync(file, 'utf8')
      return (
        fromReferences(source).includes(table) ||
        nestedSelectReferences(source).includes(table)
      )
    })

    // If this ever goes empty the table became genuinely unused and may be
    // dropped — but only then.
    expect(referencing.length).toBeGreaterThan(0)
  })
})
