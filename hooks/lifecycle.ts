/**
 * When to name the session, as pure decisions over the plugin's state.
 *
 * A conversation started at startup or by /clear, or resumed without a title,
 * is named by forking the session after its first reply, with one retry when
 * that gives no name. Each compaction names it again from the summary. A
 * resumed session that has a title keeps it.
 */

export type HerdrAction = { show: string } | 'clear' | 'keep'

export type StartPlan = {
  needsTitle: boolean
  herdr: HerdrAction
}

/** A first try plus one retry: past that, a broken fork would cost a call per turn. */
export const MAX_FORK_FAILURES = 2

function known(title: string | undefined): string | undefined {
  if (title === undefined) return undefined
  const trimmed = title.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * What a SessionStart changes, or `undefined` when it changes nothing
 * (`compact`: PostCompact names the session from the summary).
 */
export function planSessionStart(
  source: string,
  sessionTitle: string | undefined,
): StartPlan | undefined {
  if (source === 'compact') return undefined
  // After /clear the old title is inherited by the new conversation, so it is
  // stale: rename after the first reply, and leave herdr as is until then.
  if (source === 'clear') return { needsTitle: true, herdr: 'keep' }

  // startup, resume, fork: keep a title the session already has (a resume, a
  // name given on the command line); otherwise name it after the first reply.
  // Without a title, clear what a previous Claude Code left on the pane.
  const title = known(sessionTitle)
  return title === undefined
    ? { needsTitle: true, herdr: 'clear' }
    : { needsTitle: false, herdr: { show: title } }
}

/**
 * Whether a session is worth naming: one something draws (a terminal, the
 * desktop app). A `claude -p` run draws nothing, and naming it would cost a
 * fork per call. Read at Stop and PostCompact: at SessionStart the terminal
 * may not be attached yet.
 */
export function hasViewer(surfaces: readonly string[]): boolean {
  return surfaces.length > 0
}

/**
 * Whether this Stop forks the session to name it. `undefined` state means the
 * plugin was enabled mid-session, after SessionStart: name it.
 */
export function shouldForkAtStop(
  needsTitle: boolean | undefined,
  forkFailures: number | undefined,
): boolean {
  return needsTitle !== false && (forkFailures ?? 0) < MAX_FORK_FAILURES
}

/** The fields of a `$.model.fork` result this module reads. */
export type ForkReply =
  | { isAnswered: true; text: string }
  | { isAnswered: false; reason: string }

export type ForkVerdict =
  | { kind: 'titled'; title: string }
  // Nothing was sent (no response to fork yet): try again at the next Stop.
  | { kind: 'retry'; reason: string }
  // A call was made and gave no usable title: counts toward MAX_FORK_FAILURES.
  | { kind: 'failed'; reason: string }

export function judgeFork(
  reply: ForkReply,
  clean: (text: string) => string | undefined,
): ForkVerdict {
  if (!reply.isAnswered) {
    return reply.reason === 'nothing-to-fork'
      ? { kind: 'retry', reason: reply.reason }
      : { kind: 'failed', reason: reply.reason }
  }
  const title = clean(reply.text)
  return title === undefined
    ? { kind: 'failed', reason: 'unusable-reply' }
    : { kind: 'titled', title }
}

export type ForkState = { needsTitle: boolean; forkFailures: number }

/** The state a fork's verdict leaves for the next Stop to read. */
export function afterFork(verdict: ForkVerdict, forkFailures: number): ForkState {
  switch (verdict.kind) {
    case 'titled':
      return { needsTitle: false, forkFailures }
    case 'retry':
      return { needsTitle: true, forkFailures }
    case 'failed':
      return { needsTitle: true, forkFailures: forkFailures + 1 }
  }
}
