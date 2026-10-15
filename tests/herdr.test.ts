import { describe, expect, test } from 'claude-code/testing'

import { clearArgs, herdrTarget, paneHasLabel, reportArgs } from '../hooks/herdr'

const TARGET = { bin: '/usr/local/bin/herdr', pane: 'w1:p2' }

// `herdr pane get` output, trimmed to the fields that matter here.
function paneGet(pane: Record<string, unknown>): string {
  return JSON.stringify({
    id: 'cli:pane:get',
    result: { pane: { pane_id: 'w1:p2', agent: 'claude', ...pane }, type: 'pane_info' },
  })
}

describe('herdrTarget', () => {
  test('inside herdr, targets the pane with the running herdr binary', () => {
    const env = { herdrEnv: '1', paneId: 'w1:p2', binPath: '/usr/local/bin/herdr', claudeCode: undefined }
    expect(herdrTarget(env)).toEqual(TARGET)
  })

  test('falls back to herdr on PATH when HERDR_BIN_PATH is unset or empty', () => {
    expect(herdrTarget({ herdrEnv: '1', paneId: 'w1:p2', binPath: undefined, claudeCode: undefined })?.bin).toBe('herdr')
    expect(herdrTarget({ herdrEnv: '1', paneId: 'w1:p2', binPath: '', claudeCode: undefined })?.bin).toBe('herdr')
  })

  test('outside herdr, or with no pane, does nothing', () => {
    expect(herdrTarget({ herdrEnv: undefined, paneId: 'w1:p2', binPath: undefined, claudeCode: undefined })).toBeUndefined()
    expect(herdrTarget({ herdrEnv: '0', paneId: 'w1:p2', binPath: undefined, claudeCode: undefined })).toBeUndefined()
    expect(herdrTarget({ herdrEnv: '1', paneId: undefined, binPath: undefined, claudeCode: undefined })).toBeUndefined()
    expect(herdrTarget({ herdrEnv: '1', paneId: '', binPath: undefined, claudeCode: undefined })).toBeUndefined()
  })

  test('a Claude Code started from inside another session leaves the pane to that session', () => {
    const nested = { herdrEnv: '1', paneId: 'w1:p2', binPath: undefined, claudeCode: '1' }
    expect(herdrTarget(nested)).toBeUndefined()
  })
})

describe('paneHasLabel', () => {
  test('a pane someone labelled has a label', () => {
    expect(paneHasLabel(paneGet({ label: 'API review' }))).toBe(true)
  })

  test('herdr omits label when none is set', () => {
    expect(paneHasLabel(paneGet({ title: 'Upload queue retries' }))).toBe(false)
  })

  test('an empty or blank label is no label', () => {
    expect(paneHasLabel(paneGet({ label: '' }))).toBe(false)
    expect(paneHasLabel(paneGet({ label: '   ' }))).toBe(false)
  })

  test('output it cannot read is unknown, not "no label"', () => {
    expect(paneHasLabel('not json')).toBeUndefined()
    expect(paneHasLabel('{"error":{"code":"pane_not_found"}}')).toBeUndefined()
    expect(paneHasLabel('null')).toBeUndefined()
    expect(paneHasLabel(paneGet({ label: 42 }))).toBeUndefined()
  })
})

describe('reportArgs', () => {
  const base = [
    '/usr/local/bin/herdr',
    'pane',
    'report-metadata',
    'w1:p2',
    '--source',
    'session-topic',
    '--agent',
    'claude',
    '--display-agent',
    'Upload queue retries',
  ]

  test('a pane with no label also gets the border title', () => {
    expect(reportArgs(TARGET, 'Upload queue retries', false)).toEqual([
      ...base,
      '--title',
      'Upload queue retries',
    ])
  })

  test('a label someone set keeps the border', () => {
    expect(reportArgs(TARGET, 'Upload queue retries', true)).toEqual(base)
  })

  test('an unknown label status leaves the border alone', () => {
    expect(reportArgs(TARGET, 'Upload queue retries', undefined)).toEqual(base)
  })
})

describe('clearArgs', () => {
  test('clears both fields this plugin reports', () => {
    expect(clearArgs(TARGET)).toEqual([
      '/usr/local/bin/herdr',
      'pane',
      'report-metadata',
      'w1:p2',
      '--source',
      'session-topic',
      '--clear-display-agent',
      '--clear-title',
    ])
  })
})
