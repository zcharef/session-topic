/**
 * The herdr side: which pane to update and the argv that updates it.
 * https://herdr.dev/docs/integrations/ ("Custom status labels")
 */

export type HerdrTarget = { bin: string; pane: string }

export type HerdrEnv = {
  herdrEnv: string | undefined
  paneId: string | undefined
  binPath: string | undefined
  /** CLAUDECODE, which Claude Code sets for the commands it runs. */
  claudeCode: string | undefined
}

// herdr 0.9.0 keeps one metadata entry per source; a report without
// `--clear-*` flags replaces all of this source's previous one.
const SOURCE = 'session-topic'

export function herdrTarget(env: HerdrEnv): HerdrTarget | undefined {
  if (env.herdrEnv !== '1') return undefined
  // Started by another session's Bash tool or hook (a `claude -p` in a
  // script): HERDR_PANE_ID is inherited, so the pane is that session's.
  if (env.claudeCode === '1') return undefined
  if (env.paneId === undefined || env.paneId === '') return undefined
  const bin = env.binPath === undefined || env.binPath === '' ? 'herdr' : env.binPath
  return { bin, pane: env.paneId }
}

/**
 * Whether `herdr pane get` shows a label: `true`, `false`, or `undefined` when
 * the output cannot be read. herdr omits `label` when none is set.
 */
export function paneHasLabel(paneGetStdout: string): boolean | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(paneGetStdout)
  } catch {
    return undefined
  }
  const pane = (parsed as { result?: { pane?: { label?: unknown } } } | null)?.result?.pane
  if (pane === undefined || pane === null || typeof pane !== 'object') return undefined
  const label = pane.label
  if (label === undefined || label === null) return false
  if (typeof label !== 'string') return undefined
  return label.trim() !== ''
}

/**
 * Shows `name` in place of "claude" in the sidebar. The pane border title is
 * set only on a pane with no label: herdr ranks a metadata title above a
 * label, and a label someone typed must win. When the label status cannot be
 * read, the border is left alone.
 *
 * `--agent claude` hides the name and the border title once Claude Code
 * leaves the pane.
 */
export function reportArgs(
  target: HerdrTarget,
  name: string,
  hasLabel: boolean | undefined,
): string[] {
  const args = [
    target.bin,
    'pane',
    'report-metadata',
    target.pane,
    '--source',
    SOURCE,
    '--agent',
    'claude',
    '--display-agent',
    name,
  ]
  return hasLabel === false ? [...args, '--title', name] : args
}

export function clearArgs(target: HerdrTarget): string[] {
  return [
    target.bin,
    'pane',
    'report-metadata',
    target.pane,
    '--source',
    SOURCE,
    '--clear-display-agent',
    '--clear-title',
  ]
}

export function paneGetArgs(target: HerdrTarget): string[] {
  return [target.bin, 'pane', 'get', target.pane]
}
