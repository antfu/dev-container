import { describe, expect, it } from 'vitest'
import { planSync } from '../src/sync'

describe('sync', () => {
  it('deploys the first time, and whenever HEAD moved or it is forced', () => {
    expect(planSync({ head: 'a' })).toBe(true)
    expect(planSync({ deployed: 'a', head: 'b' })).toBe(true)
    expect(planSync({ deployed: 'a', head: 'a' })).toBe(false)
    expect(planSync({ deployed: 'a', head: 'a', force: true })).toBe(true)
  })
})
