import { describe, expect, test } from 'claude-code/testing'

import {
  MAX_FORK_FAILURES,
  afterFork,
  hasViewer,
  judgeFork,
  planSessionStart,
  shouldForkAtStop,
} from '../hooks/lifecycle'
import { cleanTitle } from '../hooks/title'

describe('planSessionStart', () => {
  test('a compaction changes nothing here: PostCompact names it', () => {
    expect(planSessionStart('compact', 'Upload queue retries')).toBeUndefined()
  })

  test('/clear asks for a new name and leaves herdr as is', () => {
    expect(planSessionStart('clear', 'Inherited old title')).toEqual({
      needsTitle: true,
      herdr: 'keep',
    })
  })

  test('a new session asks for a name and clears a stale one from herdr', () => {
    expect(planSessionStart('startup', undefined)).toEqual({ needsTitle: true, herdr: 'clear' })
    expect(planSessionStart('startup', '   ')).toEqual({ needsTitle: true, herdr: 'clear' })
  })

  test('a session that has a title keeps it and shows it in herdr', () => {
    for (const source of ['resume', 'fork', 'startup']) {
      expect(planSessionStart(source, ' Upload queue retries '), source).toEqual({
        needsTitle: false,
        herdr: { show: 'Upload queue retries' },
      })
    }
  })

  test('a resumed session with no title gets one', () => {
    expect(planSessionStart('resume', undefined)).toEqual({ needsTitle: true, herdr: 'clear' })
  })
})

describe('hasViewer', () => {
  test('a claude -p run draws nothing and is left alone', () => {
    expect(hasViewer([])).toBe(false)
  })

  test('a terminal or the desktop app is named', () => {
    expect(hasViewer(['terminal'])).toBe(true)
    expect(hasViewer(['desktop'])).toBe(true)
  })
})

describe('shouldForkAtStop', () => {
  test('forks when a name is needed', () => {
    expect(shouldForkAtStop(true, 0)).toBe(true)
  })

  test('forks when the plugin was enabled mid-session (no state yet)', () => {
    expect(shouldForkAtStop(undefined, undefined)).toBe(true)
  })

  test('does not fork once the conversation is named', () => {
    expect(shouldForkAtStop(false, 0)).toBe(false)
  })

  test('retries once, then stops', () => {
    expect(shouldForkAtStop(true, MAX_FORK_FAILURES - 1)).toBe(true)
    expect(shouldForkAtStop(true, MAX_FORK_FAILURES)).toBe(false)
  })
})

describe('judgeFork', () => {
  test('a usable reply names the session', () => {
    const reply = { isAnswered: true as const, text: '"Upload queue retries".' }
    expect(judgeFork(reply, cleanTitle)).toEqual({ kind: 'titled', title: 'Upload queue retries' })
  })

  test('an unusable reply counts as a failure', () => {
    const reply = { isAnswered: true as const, text: 'Refactoring' }
    expect(judgeFork(reply, cleanTitle)).toEqual({ kind: 'failed', reason: 'unusable-reply' })
  })

  test('nothing to fork is a free retry', () => {
    const reply = { isAnswered: false as const, reason: 'nothing-to-fork' }
    expect(judgeFork(reply, cleanTitle)).toEqual({ kind: 'retry', reason: 'nothing-to-fork' })
  })

  test('an API error, an empty reply and an abort count as failures', () => {
    for (const reason of ['api-error', 'empty-reply', 'aborted']) {
      expect(judgeFork({ isAnswered: false, reason }, cleanTitle), reason).toEqual({
        kind: 'failed',
        reason,
      })
    }
  })
})

describe('afterFork', () => {
  test('a name ends the forking for this conversation', () => {
    expect(afterFork({ kind: 'titled', title: 'Upload queue retries' }, 1)).toEqual({
      needsTitle: false,
      forkFailures: 1,
    })
  })

  test('nothing to fork asks again without counting', () => {
    expect(afterFork({ kind: 'retry', reason: 'nothing-to-fork' }, 0)).toEqual({
      needsTitle: true,
      forkFailures: 0,
    })
  })

  test('two failed forks in a row stop the forking', () => {
    const first = afterFork({ kind: 'failed', reason: 'api-error' }, 0)
    expect(shouldForkAtStop(first.needsTitle, first.forkFailures)).toBe(true)
    const second = afterFork({ kind: 'failed', reason: 'unusable-reply' }, first.forkFailures)
    expect(shouldForkAtStop(second.needsTitle, second.forkFailures)).toBe(false)
  })
})
