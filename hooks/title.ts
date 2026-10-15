/**
 * Turns a model reply into a session name, or `undefined` when the reply is
 * not usable as one. The caller keeps the previous name on `undefined`.
 */

// The prompts ask for 3 to 6 words. A 2-word or 7-word answer is still a fine
// name, and refusing it would cost another model call.
const MIN_WORDS = 2
const MAX_WORDS = 8
const MAX_CHARS = 60
// Scripts written without spaces between words: counted in characters.
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u
const MIN_UNSPACED_CHARS = 2
const MAX_UNSPACED_CHARS = 30

// The title reaches a terminal title and herdr: control characters (ESC, BEL)
// and the invisible marks that reorder or hide text must not get through.
const CONTROL = /\p{Cc}/gu
const HIDDEN_MARKS = /[\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g
// Emoji and the invisible characters that glue them together.
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{FE0F}\u{200D}\u{20E3}]/gu
const DOUBLE_QUOTES = /["“”«»„‟]/g
const BOLD = /\*\*/g
const MARKDOWN_LEAD = /^(?:#+\s*|[-*•]\s+)/
const CODE_FENCE = /^(?:```|~~~)/
// "Title:", "Here's a title for this chat:", "Voici un titre :" before the answer.
const LEAD_IN =
  /^(?:(?:title|titre|título|titolo|titel|name|nom)\s*:|(?:here(?:'s|’s| is)|voici|sure|okay|ok)\b[^:]*:)\s*/i
// A line that talks about the task instead of answering it.
const CHATTER = /^(?:here(?:'s|’s| is)\b|voici\b|(?:i|je)\s|i'm\b|i’m\b|j'|j’|sorry\b|désolé)/i
const WRAPPERS: ReadonlyArray<readonly [string, string]> = [
  ['__', '__'],
  ['*', '*'],
  ['_', '_'],
  ['`', '`'],
  ["'", "'"],
  ['‘', '’'],
]
const TRAILING_PUNCTUATION = /[\s.!?…:;,。！？]+$/u

function unwrap(text: string): string {
  let current = text
  for (;;) {
    const pair = WRAPPERS.find(
      ([open, close]) =>
        current.length > open.length + close.length &&
        current.startsWith(open) &&
        current.endsWith(close),
    )
    if (pair === undefined) return current
    current = current
      .slice(pair[0].length, current.length - pair[1].length)
      .replace(TRAILING_PUNCTUATION, '')
      .trim()
  }
}

/** One reply line with its decoration removed, before any judgment. */
function strip(line: string): string {
  return line
    .replace(CONTROL, ' ')
    .replace(HIDDEN_MARKS, '')
    .replace(EMOJI, '')
    .replace(DOUBLE_QUOTES, '')
    .replace(BOLD, '')
    .trim()
    .replace(MARKDOWN_LEAD, '')
}

/**
 * The first line that answers. A model sometimes leads with "Here is a
 * title:" or a sentence about the task, or wraps the answer in a code fence.
 */
function answer(reply: string): string | undefined {
  for (const raw of reply.split('\n')) {
    const line = strip(raw)
    if (line === '' || CODE_FENCE.test(line)) continue
    const rest = line.replace(LEAD_IN, '')
    if (rest === '' || rest.endsWith(':') || CHATTER.test(rest)) continue
    return rest
  }
  return undefined
}

function isUsable(title: string): boolean {
  if (title === '' || title.length > MAX_CHARS) return false
  if (UNSPACED_SCRIPT.test(title) && !title.includes(' ')) {
    return title.length >= MIN_UNSPACED_CHARS && title.length <= MAX_UNSPACED_CHARS
  }
  const words = title.split(' ').length
  return words >= MIN_WORDS && words <= MAX_WORDS
}

export function cleanTitle(reply: string): string | undefined {
  const line = answer(reply)
  if (line === undefined) return undefined
  const title = unwrap(line.replace(TRAILING_PUNCTUATION, ''))
    .replace(TRAILING_PUNCTUATION, '')
    .replace(/\s+/g, ' ')
    .trim()
  return isUsable(title) ? title : undefined
}
