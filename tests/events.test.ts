import { describe, expect, test } from 'claude-code/testing'

import { isMainThread, isPersonPrompt } from '../hooks/events'

describe('isMainThread', () => {
  test('an event without agent_id is the main thread', () => {
    expect(isMainThread({})).toBe(true)
  })

  test('an event with agent_id comes from a subagent', () => {
    expect(isMainThread({ agent_id: 'a45beb37e3ce7921e' })).toBe(false)
  })
})

describe('isPersonPrompt', () => {
  test('a typed prompt with no source counts', () => {
    expect(isPersonPrompt({ prompt: 'Fix the login redirect' })).toBe(true)
  })

  test('source user and sdk count', () => {
    expect(isPersonPrompt({ prompt: 'Fix it', source: 'user' })).toBe(true)
    expect(isPersonPrompt({ prompt: 'Fix it', source: 'sdk' })).toBe(true)
  })

  test('a prompt inside a subagent does not count', () => {
    expect(isPersonPrompt({ prompt: 'List the files', agent_id: 'a1' })).toBe(false)
  })

  test('prompts the engine injects do not count', () => {
    for (const source of ['system', 'poll_event', 'loop_wakeup', 'schedule_wakeup']) {
      expect(isPersonPrompt({ prompt: 'Fix it', source }), source).toBe(false)
    }
  })

  test("a subagent's hand-back without source does not count", () => {
    const handback = '<agent-message from="aef84b9ddaeef2da7">\n[Subagent hand-back] Done.'
    expect(isPersonPrompt({ prompt: handback })).toBe(false)
  })

  test('a task notification, even indented, does not count', () => {
    const notification = '\n  <task-notification>\n<task-id>b1</task-id>'
    expect(isPersonPrompt({ prompt: notification })).toBe(false)
  })

  test('a person quoting the tag mid-prompt still counts', () => {
    expect(isPersonPrompt({ prompt: 'Why does <agent-message> show up here?' })).toBe(true)
  })
})
