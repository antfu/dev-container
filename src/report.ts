import type { Colors } from 'nostics/formatters/ansi'
import process from 'node:process'
import { styleText } from 'node:util'
import { Diagnostic } from 'nostics'
import { ansiFormatter } from 'nostics/formatters/ansi'
import { isAgent } from 'std-env'

type Style = Parameters<typeof styleText>[0]
const color = (style: Style) => (s: string): string => styleText(style, s, { stream: process.stderr })
const colors: Colors = { red: color('red'), yellow: color('yellow'), cyan: color('cyan'), gray: color('gray'), bold: color('bold'), dim: color('dim') }
const format = ansiFormatter(colors)

/** Agents get one JSON object per diagnostic so they can act on `fix` without parsing prose. */
export function wantsJson(flag: boolean): boolean {
  return flag || process.env.DEV_CONTAINER_JSON === '1' || isAgent
}

/** Writes diagnostics to stderr, as ANSI for people or NDJSON for agents. */
function report(items: Diagnostic<unknown>[], level: 'error' | 'warning', json: boolean): void {
  for (const diagnostic of items) {
    process.stderr.write(json
      ? `${JSON.stringify({ level, ...diagnostic.toJSON(), stack: undefined, cause: undefined })}\n`
      : `${format(diagnostic)}\n`)
  }
}

/** Reports a thrown value; anything that is not a diagnostic is an unexpected bug and keeps its stack. */
export function reportError(error: unknown, json: boolean): void {
  const items = error instanceof AggregateError ? error.errors : [error]
  const known = items.filter((item): item is Diagnostic<unknown> => item instanceof Diagnostic)
  report(known, 'error', json)
  for (const item of items.filter(item => !(item instanceof Diagnostic)))
    process.stderr.write(`${item instanceof Error ? item.stack : String(item)}\n`)
}
