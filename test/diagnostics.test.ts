import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { diagnostics, DOCS_BASE } from '../src/diagnostics'

const brokerSource = readFileSync(new URL('../services/broker/rules.py', import.meta.url), 'utf8')
const brokerCodes = [
  ...new Set(brokerSource.match(/DEV_CONTAINER_B\d{4}/g)),
]
const pages = readdirSync(new URL('../docs/errors', import.meta.url)).filter(f => f.startsWith('DEV_CONTAINER_')).map(f => f.replace(/\.md$/, ''))

describe('diagnostic catalog', () => {
  it('has one docs page per code, from both the CLI and the broker', () => {
    expect([
      ...Object.keys(diagnostics),
      ...brokerCodes,
    ].sort()).toEqual(pages.sort())
  })

  it('links the broker to the same docs directory', () => {
    expect(brokerSource).toContain(`DOCS_BASE = "${DOCS_BASE}"`)
  })
})
