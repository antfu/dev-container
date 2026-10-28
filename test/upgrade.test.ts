import { describe, expect, it } from 'vitest'
import { planUpgrade } from '../src/upgrade'

describe('upgrade', () => {
  it('deploys the first time, and whenever HEAD moved or it is forced', () => {
    expect(planUpgrade({ head: 'a' })).toBe(true)
    expect(planUpgrade({ deployed: 'a', head: 'b' })).toBe(true)
    expect(planUpgrade({ deployed: 'a', head: 'a' })).toBe(false)
    expect(planUpgrade({ deployed: 'a', head: 'a', force: true })).toBe(true)
  })
})
