#!/bin/sh
# Installs the session-topic Claude Code plugin for the current user, or
# updates it when it is already there. herdr runs this once at
# `herdr plugin install`, and again from the plugin's action.
set -eu

PLUGIN_ID="session-topic@session-topic"

if ! command -v claude >/dev/null 2>&1; then
  echo "session-topic: the 'claude' command was not found on PATH." >&2
  echo "Install Claude Code first (https://code.claude.com/docs), then run this again." >&2
  exit 1
fi

# Fails loudly instead of reading a broken `plugin list` as "not installed".
if ! installed=$(claude plugin list --json); then
  echo "session-topic: 'claude plugin list' failed; nothing was changed." >&2
  exit 1
fi

case "$installed" in
  *"\"$PLUGIN_ID\""*)
    claude plugin marketplace update session-topic
    claude plugin update "$PLUGIN_ID"
    echo "session-topic: updated. Restart running Claude Code sessions to load it."
    ;;
  *)
    claude plugin install session-topic --marketplace zcharef/session-topic
    echo "session-topic: installed. New Claude Code sessions name themselves."
    ;;
esac
