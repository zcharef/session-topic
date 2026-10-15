// The values session-topic keeps in `$.state`: held by Claude Code for the
// session, so they survive a hot reload of the plugin's code.

declare module 'claude-code' {
  interface PluginState {
    'session-topic': {
      /** A name computed at Stop or PostCompact, handed to Claude Code at the next prompt. */
      pending: string | null
      /** True while the next Stop should fork the session to name the conversation. */
      needsTitle: boolean
      /** Forks that ran in this conversation and gave no usable name. */
      forkFailures: number
    }
  }
}
