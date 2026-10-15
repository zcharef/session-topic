import { describe, expect, test } from 'claude-code/testing'

import { boundSummary } from '../hooks/prompts'

describe('boundSummary', () => {
  test('a summary of ordinary size goes through whole', () => {
    const summary = 'Primary request: fix the upload retries.\nCurrent work: queue backoff.'
    expect(boundSummary(summary)).toBe(summary)
  })

  test('an oversized summary keeps the request and the current work', () => {
    const summary = `REQUEST-START ${'x'.repeat(200_000)} CURRENT-WORK-END`
    const bounded = boundSummary(summary)
    expect(bounded.length < 61_000).toBe(true)
    expect(bounded.startsWith('REQUEST-START')).toBe(true)
    expect(bounded.endsWith('CURRENT-WORK-END')).toBe(true)
  })
})
