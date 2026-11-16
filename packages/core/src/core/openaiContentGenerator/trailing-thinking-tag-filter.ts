/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

const CLOSING_TAG_LINE = /\r?\n[ \t]*<\/(think|thinking)[ \t]*>[ \t\r\n]*$/i;
const CLOSING_MARKUP = /<\//;
// Any opening markup other than an unresolved prefix of a thinking tag. Those
// prefixes are left to the converter, which quarantines them itself.
const LITERAL_OPENING_MARKUP =
  /<(?!(?:t|th|thi|thin|thinki|thinkin)\s*(?=<|$)|think(?=$)|thinking(?=$))[a-z!?]/i;
const MAX_PENDING_LENGTH = 128;
// Long enough to see a `</` or a fence that the provider split across deltas.
const TAIL_LENGTH = 12;

/**
 * Drops a lone `</think>` or `</thinking>` line left at the very end of an
 * ordinary answer. It withholds a possible closing-tag suffix while the stream
 * runs and decides at the end.
 *
 * It is not a Markdown parser: once the answer has shown code (a backtick, a
 * `~~~` fence, an indented block), other markup, or an earlier closing tag, a
 * trailing tag may be a literal example, and the whole answer is kept as is.
 */
export class TrailingThinkingTagFilter {
  private pending = '';
  private hasVisibleText = false;
  private literalContent = false;
  private markerTail = '';
  private emittedTail = '';
  private previousLineBlank = true;
  private currentLineBlank = true;
  private lineIndent = 0;
  /** Set when a call removed a tag; the caller reads and clears it. */
  sanitizedTagName?: 'think' | 'thinking';

  /**
   * @param final no more text follows; nothing stays withheld after this call.
   * @param completed the response ended normally, so a trailing tag is an
   *   artifact and not the edge of a cut answer.
   */
  parse(text: string, final: boolean, completed: boolean): string {
    this.pending += text;
    const markers = this.markerTail + text;
    this.literalContent ||=
      /`|~{3}/.test(markers) || LITERAL_OPENING_MARKUP.test(markers);
    this.markerTail = markers.replace(/\s+$/, ' ').slice(-TAIL_LENGTH);
    this.trackIndentedCode(text);

    const closing = CLOSING_TAG_LINE.exec(this.pending);
    let candidateStart = closing?.index ?? this.pending.lastIndexOf('\n');
    if (!closing && this.pending.endsWith('\r')) {
      // A lone `\r` may be the first half of the line break before the tag.
      candidateStart = Math.max(candidateStart, this.pending.length - 1);
    } else if (!closing && this.pending[candidateStart - 1] === '\r') {
      candidateStart--;
    }
    if (!closing && candidateStart >= 0) {
      const candidate = this.pending.slice(candidateStart).trimStart();
      const lowered = candidate.toLowerCase();
      if (
        !['</think>', '</thinking>'].some((tag) => tag.startsWith(lowered)) &&
        !/^<\/(?:think|thinking)[ \t]*>?[ \t\r\n]*$/i.test(candidate)
      ) {
        candidateStart = -1;
      }
    }

    const prefix =
      candidateStart >= 0
        ? this.pending.slice(0, candidateStart)
        : this.pending;
    // Only text already handed over counts: the withheld candidate holds a
    // closing tag by definition.
    this.literalContent ||= CLOSING_MARKUP.test(this.emittedTail + prefix);
    const eligible =
      !this.literalContent &&
      candidateStart >= 0 &&
      (this.hasVisibleText || /\S/.test(prefix)) &&
      this.pending.length - candidateStart <= MAX_PENDING_LENGTH;
    if (eligible && (!final || (completed && closing))) {
      if (final && closing) {
        this.sanitizedTagName = closing[1]!.toLowerCase() as
          | 'think'
          | 'thinking';
      }
      this.pending = final ? '' : this.pending.slice(candidateStart);
      this.hasVisibleText ||= /\S/.test(prefix);
      this.noteReleased(prefix);
      return prefix;
    }

    const result = this.pending;
    this.pending = '';
    // The released text may itself hold a complete closing tag; without this
    // the same bytes would keep or lose a later one depending on the framing.
    this.literalContent ||= CLOSING_MARKUP.test(this.emittedTail + result);
    this.hasVisibleText ||= /\S/.test(result);
    this.noteReleased(result);
    return result;
  }

  /**
   * Hands back a hold that is only whitespace, for a caller that is about to
   * stop using this filter. A held tag fragment stays held.
   */
  drainWhitespace(): string {
    if (!/^\s+$/.test(this.pending)) return '';
    const held = this.pending;
    this.pending = '';
    this.noteReleased(held);
    return held;
  }

  // A line indented by four columns after a blank line is a code block. After
  // a paragraph line it is not, so one newline and four spaces before the tag
  // must still let it be removed.
  private trackIndentedCode(text: string): void {
    for (const character of text) {
      if (character === '\n') {
        this.previousLineBlank = this.currentLineBlank;
        this.currentLineBlank = true;
        this.lineIndent = 0;
      } else if (this.currentLineBlank && /[ \t\r]/.test(character)) {
        if (character !== '\r') {
          this.lineIndent = Math.min(
            4,
            this.lineIndent +
              (character === '\t' ? 4 - (this.lineIndent % 4) : 1),
          );
        }
      } else {
        this.literalContent ||=
          this.currentLineBlank &&
          this.previousLineBlank &&
          this.lineIndent >= 4;
        this.currentLineBlank = false;
      }
    }
  }

  private noteReleased(text: string): void {
    this.emittedTail = (this.emittedTail + text).slice(-TAIL_LENGTH);
  }
}
