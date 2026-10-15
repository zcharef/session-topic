/**
 * Which hook events belong to the person's own conversation. Subagents and the
 * messages they hand back must never rename the session.
 */

type ThreadEvent = { agent_id?: string }

type PromptEvent = ThreadEvent & { prompt: string; source?: string }

// Prompts the engine injects on its own. Claude Code 2.1.300 often omits
// `source`, hence the prefix check below as well.
const MACHINE_SOURCES: ReadonlySet<string> = new Set([
  'system',
  'poll_event',
  'loop_wakeup',
  'schedule_wakeup',
])

// A subagent's hand-back and a background task's notification arrive as a
// UserPromptSubmit of the main thread, without `agent_id`.
const INJECTED_PREFIXES: readonly string[] = ['<agent-message', '<task-notification']

export function isMainThread(e: ThreadEvent): boolean {
  return e.agent_id === undefined
}

export function isPersonPrompt(e: PromptEvent): boolean {
  if (!isMainThread(e)) return false
  if (e.source !== undefined && MACHINE_SOURCES.has(e.source)) return false
  const head = e.prompt.trimStart()
  return !INJECTED_PREFIXES.some(prefix => head.startsWith(prefix))
}
