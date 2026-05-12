// Plain-text note sanitizer. The UI lets adopters jot a private reminder
// about a pet ("met him at the open day, very shy"). Phase 2.8 spec says
// "plain text" — we strip tags so a paste from a rich-text source can't
// inject markup that a future renderer might trust.
//
// Conservative on purpose: no HTML allowed, even harmless tags. The textarea
// preserves whitespace and newlines, which is what handwritten notes need.

export const NOTE_MAX_LENGTH = 500

export function sanitizeNote(input: string): string {
  // Strip any tag-like sequence and HTML entities — we want literal text.
  const stripped = input.replace(/<[^>]*>/g, '').replace(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/gi, '')
  return stripped.slice(0, NOTE_MAX_LENGTH)
}

export function isValidNoteLength(text: string): boolean {
  return text.length <= NOTE_MAX_LENGTH
}
