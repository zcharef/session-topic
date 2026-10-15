import type {
  EngineInterface,
  ModelCompleteResult,
  ModelForkResult,
  ModelUsage,
  ProcessRunResult,
  Register,
} from 'claude-code'

import { isMainThread, isPersonPrompt } from './events'
import { clearArgs, herdrTarget, paneGetArgs, paneHasLabel, reportArgs } from './herdr'
import type { HerdrTarget } from './herdr'
import {
  afterFork,
  hasViewer,
  judgeFork,
  planSessionStart,
  shouldForkAtStop,
} from './lifecycle'
import type { HerdrAction } from './lifecycle'
import { FORK_PROMPT, SUMMARY_SYSTEM, summaryPrompt } from './prompts'
import { cleanTitle } from './title'

const PENDING = { plugin: 'session-topic', key: 'pending' } as const
const NEEDS_TITLE = { plugin: 'session-topic', key: 'needsTitle' } as const
const FORK_FAILURES = { plugin: 'session-topic', key: 'forkFailures' } as const

const HERDR_TIMEOUT_MS = 5_000
const SUMMARY_TIMEOUT_MS = 30_000
const MAX_LOGGED_CHARS = 200

type Fields = Record<string, string | number | boolean>

// A model call the engine refused to send: the one way `$.model` rejects.
type Rejected = { isAnswered: false; reason: 'rejected'; message: string }

// Structured lines in the debug log only (`claude --debug`): nothing on screen.
function log($: EngineInterface, event: string, fields: Fields = {}): void {
  $.ui.log(JSON.stringify({ event, ...fields }), { to: 'debug' })
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return text.slice(0, MAX_LOGGED_CHARS)
}

function rejected(error: unknown): Rejected {
  return { isAnswered: false, reason: 'rejected', message: errorText(error) }
}

// Not named `*Tokens`: the debug log redacts keys that look like credentials.
function usageFields(usage: ModelUsage): Fields {
  return {
    in: usage.input_tokens,
    out: usage.output_tokens,
    cacheRead: usage.cache_read_input_tokens,
    cacheWrite: usage.cache_creation_input_tokens,
  }
}

function replyFields(reply: ModelForkResult | ModelCompleteResult | Rejected): Fields {
  const usage = 'usage' in reply ? usageFields(reply.usage) : {}
  if (reply.isAnswered) return usage
  if (reply.reason === 'api-error') return { ...usage, status: reply.status ?? 'none', error: reply.error }
  if (reply.reason === 'rejected') return { message: reply.message }
  return usage
}

/**
 * Starts work the hook does not await, so naming never delays the turn.
 * Every failure ends in the debug log; the previous name stays.
 */
function detach($: EngineInterface, job: string, work: () => Promise<void>): void {
  void work().catch((error: unknown) => {
    log($, 'job_failed', { job, message: errorText(error) })
  })
}

/** Runs one herdr command; a failure is logged and never thrown. */
async function runHerdr(
  $: EngineInterface,
  step: string,
  argv: string[],
): Promise<ProcessRunResult | undefined> {
  try {
    const ran = await $.process.run(argv, { timeoutMs: HERDR_TIMEOUT_MS })
    if (ran.exitCode !== 0) {
      log($, 'herdr_failed', { step, exitCode: ran.exitCode, stderr: ran.stderr.slice(0, MAX_LOGGED_CHARS) })
    }
    return ran
  } catch (error) {
    log($, 'herdr_failed', { step, message: errorText(error) })
    return undefined
  }
}

async function labelStatus($: EngineInterface, target: HerdrTarget): Promise<boolean | undefined> {
  const pane = await runHerdr($, 'pane_get', paneGetArgs(target))
  if (pane === undefined || pane.exitCode !== 0) return undefined
  const hasLabel = paneHasLabel(pane.stdout)
  if (hasLabel === undefined) log($, 'herdr_label_unknown', { stdoutChars: pane.stdout.length })
  return hasLabel
}

async function syncHerdr($: EngineInterface, action: HerdrAction): Promise<void> {
  if (action === 'keep') return
  const target = herdrTarget({
    herdrEnv: await $.env.get('HERDR_ENV'),
    paneId: await $.env.get('HERDR_PANE_ID'),
    binPath: await $.env.get('HERDR_BIN_PATH'),
    claudeCode: await $.env.get('CLAUDECODE'),
  })
  if (target === undefined) return
  if (action === 'clear') {
    await runHerdr($, 'clear', clearArgs(target))
    return
  }
  const hasLabel = await labelStatus($, target)
  await runHerdr($, 'report', reportArgs(target, action.show, hasLabel))
}

async function publish($: EngineInterface, title: string): Promise<void> {
  await $.state.set(PENDING, title)
  await syncHerdr($, { show: title })
}

/**
 * `claimed` is the version of `needsTitle` the Stop hook wrote. A later write
 * (a /clear, a compaction's name) moves it on, and this fork's result is
 * then stale: it is dropped instead of renaming the newer conversation.
 */
async function nameFromFork($: EngineInterface, claimed: number, failures: number): Promise<void> {
  const startedAt = await $.clock.now()
  const reply = await $.model.fork({ prompt: FORK_PROMPT }).catch(rejected)
  const ms = (await $.clock.now()) - startedAt
  const verdict = judgeFork(reply, cleanTitle)
  const next = afterFork(verdict, failures)

  const written = await $.state.set(NEEDS_TITLE, next.needsTitle, { ifVersion: claimed })
  if (!written.isSet) {
    log($, 'stale_result', { job: 'fork', ms })
    return
  }
  if (next.forkFailures !== failures) await $.state.set(FORK_FAILURES, next.forkFailures)

  if (verdict.kind === 'titled') {
    log($, 'named', { by: 'fork', ms, chars: verdict.title.length, ...replyFields(reply) })
    await publish($, verdict.title)
    return
  }
  log($, 'fork_unusable', {
    reason: verdict.reason,
    ms,
    forkFailures: next.forkFailures,
    ...replyFields(reply),
  })
}

/** `seen` is the version of `needsTitle` when the compaction ended. */
async function nameFromSummary($: EngineInterface, seen: number, summary: string): Promise<void> {
  const startedAt = await $.clock.now()
  const reply = await $.model
    .complete({
      model: 'haiku',
      system: SUMMARY_SYSTEM,
      prompt: summaryPrompt(summary),
      effort: 'low',
      maxTokens: 256,
      timeoutMs: SUMMARY_TIMEOUT_MS,
    })
    .catch(rejected)
  const ms = (await $.clock.now()) - startedAt
  const title = reply.isAnswered ? cleanTitle(reply.text) : undefined
  if (title === undefined) {
    const reason = reply.isAnswered ? 'unusable-reply' : reply.reason
    log($, 'summary_unusable', { reason, ms, ...replyFields(reply) })
    return
  }

  const written = await $.state.set(NEEDS_TITLE, false, { ifVersion: seen })
  if (!written.isSet) {
    log($, 'stale_result', { job: 'summary', ms })
    return
  }
  log($, 'named', { by: 'summary', ms, chars: title.length, ...replyFields(reply) })
  await publish($, title)
}

export const register: Register = on => {
  // Not gated on a viewer: at a resume the terminal may not be attached yet,
  // and the state must be set either way so a titled session is not forked.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    if (!isMainThread(e)) return result
    const plan = planSessionStart(e.source, e.session_title)
    if (plan === undefined) return result

    await $.state.set(PENDING, null)
    await $.state.set(NEEDS_TITLE, plan.needsTitle)
    await $.state.set(FORK_FAILURES, 0)
    detach($, 'herdr_sync', () => syncHerdr($, plan.herdr))
    return result
  })

  // A name is ready only after the Stop or PostCompact hook has returned; the
  // next event that can hand it to Claude Code as `sessionTitle` is the next
  // prompt (SessionStart takes one too, but ignores it after /clear and
  // compaction).
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const result = await next(e)
    if (!isPersonPrompt(e)) {
      log($, 'prompt_skipped', { source: e.source ?? 'unset' })
      return result
    }
    if (result.block !== undefined) return result
    const { value: pending } = await $.state.get(PENDING)
    if (pending === undefined || pending === null) return result
    await $.state.set(PENDING, null)
    return { ...result, sessionTitle: pending }
  })

  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    if (!isMainThread(e) || !hasViewer(await $.session.surfaces())) return result
    const { value: needsTitle } = await $.state.get(NEEDS_TITLE)
    const { value: failures = 0 } = await $.state.get(FORK_FAILURES)
    if (!shouldForkAtStop(needsTitle, failures)) return result

    // Claimed before the fork starts, so the next Stop does not fork twice.
    const claim = await $.state.set(NEEDS_TITLE, false)
    detach($, 'fork', () => nameFromFork($, claim.version, failures))
    return result
  })

  on('classic.PostCompact', async ($, e, next) => {
    const result = await next(e)
    if (!isMainThread(e) || !hasViewer(await $.session.surfaces())) return result
    const { version } = await $.state.get(NEEDS_TITLE)
    detach($, 'summary', () => nameFromSummary($, version, e.compact_summary))
    return result
  })
}
