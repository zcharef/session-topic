import { describe, expect, test } from 'claude-code/testing'

import { cleanTitle } from '../hooks/title'

describe('cleanTitle keeps the title and drops the wrapping', () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ['a plain title', 'Différence entre mutex et sémaphore', 'Différence entre mutex et sémaphore'],
    ['double quotes and a period', '"Fonctionnement du prompt caching".', 'Fonctionnement du prompt caching'],
    ['guillemets', '« Mise en cache des prompts »', 'Mise en cache des prompts'],
    ['single quotes then a period', "'Fix upload retries'.", 'Fix upload retries'],
    ['italics then a period', '*Fix upload retries*.', 'Fix upload retries'],
    ['backticks', '`Rename the CLI flags`', 'Rename the CLI flags'],
    ['a bold label', '**Title:** Refactor auth middleware', 'Refactor auth middleware'],
    ['a bold label on its own line', '**Title:**\nRefactor auth middleware', 'Refactor auth middleware'],
    ['a lead-in on the same line', "Here's a title: **Fix upload retries**", 'Fix upload retries'],
    ['a lead-in line', 'Here is a title:\n\nFix flaky upload retries', 'Fix flaky upload retries'],
    ['a bold lead-in line', '**Here is a title:**\n\nFix flaky upload retries', 'Fix flaky upload retries'],
    ['a lead-in sentence', "Here's a title for this conversation\n\nFix upload retries", 'Fix upload retries'],
    ['a code fence', '```\nFix upload retries\n```', 'Fix upload retries'],
    ['a markdown heading', '# Fix flaky upload retries', 'Fix flaky upload retries'],
    ['emoji', '🚀 Staging deploy pipeline 🎉', 'Staging deploy pipeline'],
    ['trailing punctuation', 'Fix login redirect loop!', 'Fix login redirect loop'],
    ['inner whitespace', 'Parse   ISO 8601\tdates', 'Parse ISO 8601 dates'],
    ['a terminal escape', 'Fix upload\u001b[2J retries\u0007', 'Fix upload [2J retries'],
    ['a right-to-left override', '\u202EFix upload retries', 'Fix upload retries'],
    ['a second line of chatter', 'Upload queue retries\nThis names the main topic.', 'Upload queue retries'],
    ['apostrophes and hyphens', "Erreur d'authentification sur l'API", "Erreur d'authentification sur l'API"],
    ['a hyphenated name', 'Refonte du service user-sync en Rust', 'Refonte du service user-sync en Rust'],
    ['underscores inside a word', 'Fix __init__ module loading', 'Fix __init__ module loading'],
    ['eight words', 'Fix the flaky upload retries in job queue', 'Fix the flaky upload retries in job queue'],
    ['Japanese, written without spaces', 'アップロードキューの再試行修正', 'アップロードキューの再試行修正'],
    ['Chinese, written without spaces', '上传队列重试', '上传队列重试'],
  ]
  for (const [name, reply, title] of cases) {
    test(name, () => {
      expect(cleanTitle(reply)).toBe(title)
    })
  }
})

describe('cleanTitle refuses what is not a title', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['an empty reply', ''],
    ['blank lines', '\n  \n'],
    ['one word', 'Refactoring'],
    ['emoji only', '🎉 🎉'],
    ['a lead-in alone', 'Here is a title:'],
    ['a refusal', "I can't determine a title without more context."],
    ['nine words', 'Fix the flaky upload retries in the job queue'],
    ['over 60 characters', 'Supercalifragilisticexpialidocious internationalization configuration refactor'],
  ]
  for (const [name, reply] of cases) {
    test(name, () => {
      expect(cleanTitle(reply)).toBeUndefined()
    })
  }
})
