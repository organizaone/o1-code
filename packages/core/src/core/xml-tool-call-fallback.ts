/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part } from '@google/genai';
import { Lexer, type Token } from 'marked';

// Groups: 1 invoke name, 2 invoke body, 3 wrapper lead, 4 function name,
// 5 function body, 6 function close with its wrapper.
const INVOKE_PATTERN =
  /<invoke\s+name=["']([^"']+)["']>([\s\S]*?)<\/invoke>|(<tool_call>\s*)<function=([^\s<>]+)>([\s\S]*?)(<\/function>\s*<\/tool_call>)/g;
const PARAMETER_PATTERN =
  /<parameter(?:\s+name=["']([^"']+)["']|=([^\s<>]+))>([\s\S]*?)<\/parameter>/g;

const INVOKE_CLOSE_PATTERN = /<\/invoke>/g;
const FUNCTION_CLOSE_PATTERN = /<\/function>\s*<\/tool_call>/g;

// The markdown inline lexer degrades badly on long unterminated emphasis or
// link runs, and a model turn has no length limit. Above this size the lexer
// is skipped and example tags are taken from the plain tag scan alone.
const MAX_LEXER_SCAN_LENGTH = 64 * 1024;

export interface ExtractedToolCall {
  name: string;
  args: Record<string, unknown>;
}

type Span = [number, number];

interface ToolCallBlock extends ExtractedToolCall {
  start: number;
  end: number;
  parameterSpans: Span[];
}

export class XmlToolCallTextBuffer {
  private text = '';
  private emittedLength = 0;
  private holding = false;

  accept(text: string): string {
    this.text += text;
    if (this.holding) return '';
    const prefixes = ['<tool_call>', '<invoke ', '<function_calls>'];
    let anatomy: TurnAnatomy | null = null;
    for (let i = this.emittedLength; i < this.text.length; i++) {
      if (this.text[i] !== '<') continue;
      const suffix = this.text.slice(i);
      if (prefixes.some((prefix) => suffix.startsWith(prefix))) {
        anatomy ??= deriveTurnAnatomy(this.text);
        if (!insideDocumentation(anatomy, i)) {
          this.holding = true;
          const output = this.text.slice(this.emittedLength, i);
          this.emittedLength = i;
          return output;
        }
      }
      if (prefixes.some((prefix) => prefix.startsWith(suffix))) {
        const output = this.text.slice(this.emittedLength, i);
        this.emittedLength = i;
        return output;
      }
    }
    const output = this.text.slice(this.emittedLength);
    this.emittedLength = this.text.length;
    return output;
  }

  get buffered(): boolean {
    return this.emittedLength < this.text.length;
  }

  get remainingText(): string {
    return this.text.slice(this.emittedLength);
  }

  remainingRecoveredText(): string {
    return tryRecoverXmlToolCalls(this.remainingText).remainingText;
  }
}

export function coerceXmlToolCallArguments(
  args: Record<string, unknown>,
  schema: unknown,
): void {
  if (
    typeof schema !== 'object' ||
    schema === null ||
    !('properties' in schema)
  )
    return;
  const properties = schema.properties;
  if (typeof properties !== 'object' || properties === null) return;
  for (const [name, value] of Object.entries(args)) {
    if (typeof value !== 'string' || !(name in properties)) continue;
    const property: unknown = (properties as Record<string, unknown>)[name];
    if (
      typeof property !== 'object' ||
      property === null ||
      !('type' in property)
    )
      continue;
    const types = Array.isArray(property.type)
      ? property.type
      : [property.type];
    if (types.includes('string')) continue;
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        (typeof parsed === 'number' &&
          Number.isFinite(parsed) &&
          (types.includes('number') ||
            (types.includes('integer') && Number.isInteger(parsed)))) ||
        (typeof parsed === 'boolean' && types.includes('boolean')) ||
        (parsed === null && types.includes('null'))
      )
        args[name] = parsed;
    } catch {
      // Keep invalid values for the tool's normal schema validation.
    }
  }
}

/**
 * Detects whether text contains XML-style tool call patterns.
 */
export function containsXmlToolCalls(text: string): boolean {
  INVOKE_PATTERN.lastIndex = 0;
  return INVOKE_PATTERN.test(text);
}

/**
 * Decodes the five predefined XML entities in a parameter value so
 * recovered args match the literal text the model intended. Models
 * emitting this dialect commonly escape `<`/`&` inside code payloads;
 * without decoding, an `edit` old_string never matches the file and a
 * `write_file` content writes literal `&lt;` into the user's source.
 * `&amp;` is decoded last so `&amp;lt;` correctly becomes `&lt;`.
 */
function decodeXmlEntities(value: string): string {
  if (!value.includes('&')) return value;
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Parses a raw parameter value. Only values that look like structured JSON
 * (objects or arrays) are parsed; scalar strings are preserved as-is to
 * avoid coercing e.g. a file named "null" or a string port "8080".
 */
function parseParameterValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Strips a single newline immediately after the open tag and immediately
 * before the close tag — the convention this XML dialect follows — while
 * preserving the remaining whitespace that tools treat as significant (e.g.
 * the indentation that makes an `edit` old_string unique). A blanket trim
 * corrupted such arguments.
 */
function stripDelimitingNewlines(value: string): string {
  let result = value;
  if (result.startsWith('\n')) {
    result = result.slice(1);
  }
  if (result.endsWith('\n')) {
    result = result.slice(0, -1);
  }
  return result;
}

/** Returns the spans sorted by start with overlaps merged. */
function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort(([startA], [startB]) => startA - startB);
  const merged: Span[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) {
      last[1] = Math.max(last[1], span[1]);
    } else {
      merged.push([span[0], span[1]]);
    }
  }
  return merged;
}

/** Binary search over sorted, disjoint spans. */
function spanContains(
  spans: ReadonlyArray<readonly [number, number]>,
  index: number,
): boolean {
  let low = 0;
  let high = spans.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [start, end] = spans[middle];
    if (index < start) {
      high = middle - 1;
    } else if (index >= end) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
}

/**
 * Returns `text` between `from` and `to` without the given ranges, which must
 * be sorted by start. Overlapping ranges are removed once.
 */
function textOutside(
  text: string,
  ranges: ReadonlyArray<readonly [number, number]>,
  from = 0,
  to = text.length,
): string {
  let result = '';
  let cursor = from;
  for (const [start, end] of ranges) {
    if (end <= cursor) continue;
    if (start > cursor) result += text.slice(cursor, start);
    cursor = Math.max(cursor, end);
  }
  return result + text.slice(cursor, to);
}

interface LineIndex {
  lines: string[];
  starts: number[];
  /** The line begins inside a closed parameter value. */
  isData: boolean[];
}

function buildLineIndex(text: string, dataSpans: Span[]): LineIndex {
  const lines = text.split('\n');
  const starts: number[] = new Array(lines.length);
  const isData: boolean[] = new Array(lines.length);
  let offset = 0;
  let spanIndex = 0;
  for (let index = 0; index < lines.length; index++) {
    starts[index] = offset;
    while (spanIndex < dataSpans.length && dataSpans[spanIndex][1] <= offset) {
      spanIndex++;
    }
    isData[index] =
      spanIndex < dataSpans.length && dataSpans[spanIndex][0] <= offset;
    offset += lines[index].length + 1;
  }
  return { lines, starts, isData };
}

const FENCE_LINE_PATTERN = /^ {0,3}((`{3,})|~{3,})/;

interface FenceMark {
  delim: '`' | '~';
  len: number;
}

interface FenceTable {
  /** True when `index` falls inside a fenced code block that is still open. */
  insideFence(index: number): boolean;
}

/**
 * Records, for every line, which fence is open when the line starts. A fence
 * is closed only by a run of the same delimiter at least as long as its
 * opener and followed by nothing but whitespace (CommonMark 4.5). Lines that
 * are parameter data never open or close a fence: a fence-like line inside a
 * value is the value's own text.
 */
function buildFenceTable({ lines, starts, isData }: LineIndex): FenceTable {
  const openBefore: Array<FenceMark | null> = new Array(lines.length);
  let open: FenceMark | null = null;
  for (let index = 0; index < lines.length; index++) {
    openBefore[index] = open;
    if (isData[index]) continue;
    const match = FENCE_LINE_PATTERN.exec(lines[index]);
    if (!match) continue;
    const delim = match[2] ? '`' : '~';
    const len = match[1].length;
    if (open === null) {
      open = { delim, len };
    } else if (
      open.delim === delim &&
      len >= open.len &&
      lines[index].slice(match[0].length).trim() === ''
    ) {
      open = null;
    }
  }
  return {
    insideFence(index: number): boolean {
      if (index <= 0) return false;
      let low = 0;
      let high = starts.length - 1;
      while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (starts[middle] <= index) low = middle;
        else high = middle - 1;
      }
      const before = openBefore[low] !== null;
      if (isData[low]) return before;
      const column = index - starts[low];
      if (column === 0) return before;
      // A position past the delimiter run of a fence line is already inside
      // the block that line opens, or outside the one it closes.
      const partial = lines[low].slice(0, column);
      const match = FENCE_LINE_PATTERN.exec(partial);
      if (!match) return before;
      const mark = openBefore[low];
      const delim = match[2] ? '`' : '~';
      const len = match[1].length;
      if (
        mark !== null &&
        mark.delim === delim &&
        len >= mark.len &&
        partial.slice(match[0].length).trim() === ''
      ) {
        return false;
      }
      return true;
    },
  };
}

/**
 * Finds HTML comments and CommonMark indented code blocks: like a fence, they
 * show a call to the reader instead of emitting one.
 *
 * A comment opens only at the start of a line, outside a fence and outside
 * parameter data, so a mention of the opener in prose stays prose. Indented
 * code cannot interrupt a paragraph, so it starts only after a blank line,
 * and inside a list item only past the item's content column.
 */
function computeDocumentationSpans(
  text: string,
  lines: LineIndex,
  dataSpans: Span[],
  openValueSpans: Span[],
  fences: FenceTable,
): Span[] {
  const spans: Span[] = [];
  // A terminator inside a value, closed or truncated, is data and cannot end
  // a comment.
  const terminators: number[] = [];
  for (let index = text.indexOf('-->'); index !== -1; ) {
    if (
      !spanContains(dataSpans, index) &&
      !spanContains(openValueSpans, index)
    ) {
      terminators.push(index);
    }
    index = text.indexOf('-->', index + 3);
  }
  let terminatorIndex = 0;
  let commentStart = -1;
  let inComment = false;
  let previousBlank = true;
  let inIndentedCode = false;
  let listContentIndent = -1;
  for (let lineIndex = 0; lineIndex < lines.lines.length; lineIndex++) {
    const line = lines.lines[lineIndex];
    const lineStart = lines.starts[lineIndex];
    const blank = line.trim() === '';
    const indent = line.length - line.trimStart().length;
    if (!inComment) {
      const listItem = /^( {0,3})(?:[-*+]|\d{1,9}[.)])(\s+)/.exec(line);
      if (listItem) {
        const markerEnd = listItem[0].length - listItem[2].length;
        listContentIndent =
          markerEnd + (listItem[2].length >= 5 ? 1 : listItem[2].length);
      } else if (!blank && indent < listContentIndent) {
        listContentIndent = -1;
      }
      const open = /^ {0,3}<!--/.exec(line);
      const openerStart = open ? lineStart + open[0].length - 4 : -1;
      if (
        open &&
        !spanContains(dataSpans, openerStart) &&
        !fences.insideFence(openerStart)
      ) {
        // Searching from the opener itself lets `<!-->` and `<!--->`, which
        // are complete empty comments, close on the spot.
        while (
          terminatorIndex < terminators.length &&
          terminators[terminatorIndex] < openerStart
        ) {
          terminatorIndex++;
        }
        const close =
          terminatorIndex < terminators.length
            ? terminators[terminatorIndex]
            : -1;
        if (close !== -1) {
          spans.push([openerStart, close + 3]);
        } else if (!spanContains(openValueSpans, openerStart)) {
          // An unterminated comment runs to the end of the turn, unless its
          // opener belongs to a value the stream cut short: masking the rest
          // there would hide every real call that follows the truncation.
          inComment = true;
          commentStart = openerStart;
        }
      } else if (
        /^(?: {4,}|\t)\S/.test(line) &&
        (inIndentedCode || previousBlank) &&
        !lines.isData[lineIndex] &&
        (listContentIndent < 0 ||
          /^\t/.test(line) ||
          indent >= listContentIndent + 4)
      ) {
        spans.push([lineStart, lineStart + line.length]);
        inIndentedCode = true;
      } else if (!blank) {
        inIndentedCode = false;
      }
    }
    previousBlank = blank;
  }
  if (inComment) spans.push([commentStart, text.length]);
  return spans;
}

/**
 * Returns the offset just past the first `>` outside a quoted run, or -1.
 * The flat patterns pair quote characters loosely, so a block is trusted
 * only when this boundary agrees with theirs.
 */
function openTagEnd(block: string): number {
  let quote: string | null = null;
  for (let index = 0; index < block.length; index++) {
    const char = block[index];
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index + 1;
    }
  }
  return -1;
}

// Stricter than PARAMETER_PATTERN: the name's quotes must match.
const PARAMETER_OPEN_TAG_PATTERN =
  /<parameter(?:\s+name=(["'])[^"']+\1|=[^\s<>"']+)>/y;

/**
 * Returns the value of a complete, strictly formed parameter element, or null
 * when the element's boundaries cannot be trusted.
 */
function parameterValue(element: string): string | null {
  PARAMETER_OPEN_TAG_PATTERN.lastIndex = 0;
  if (
    !PARAMETER_OPEN_TAG_PATTERN.test(element) ||
    !element.endsWith('</parameter>')
  ) {
    return null;
  }
  return element.slice(openTagEnd(element), -'</parameter>'.length);
}

// A call open or close tag; group 1 is the dialect of a close tag.
const CALL_TAG_PATTERN =
  /<invoke\s+name=["'][^"']+["']>|<function=[^\s<>]+>|<\/(invoke|function)>/g;

// Quoted runs are consumed whole so a `>` inside an attribute does not end
// the tag.
const PARAMETER_TAG_PATTERN =
  /<\/?parameter(?=[\s=>])(?:[^>"']|"[^"]*"|'[^']*')*>/g;

const EXAMPLE_TAG_PATTERN =
  /<\/?example(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/g;
const EXAMPLE_OPEN_TAG_PATTERN =
  /<example(?=[\s>])(?:[^>"']|"[^"]*"|'[^']*')*(?<!\/)>/g;
const EXAMPLE_CLOSE_TAG_PATTERN = /<\/example(?=[\s/>])/g;

/** True when the value holds at least one call and every call tag pairs up. */
function hasBalancedQuotedCalls(value: string): boolean {
  const stack: string[] = [];
  let hasCall = false;
  let tag: RegExpExecArray | null;
  CALL_TAG_PATTERN.lastIndex = 0;
  while ((tag = CALL_TAG_PATTERN.exec(value)) !== null) {
    if (tag[1]) {
      if (stack.pop() !== tag[1]) return false;
      hasCall = true;
    } else {
      stack.push(tag[0].startsWith('<invoke') ? 'invoke' : 'function');
    }
  }
  return hasCall && stack.length === 0;
}

type ElementTag =
  | { kind: 'call-open'; index: number; end: number; dialect: string }
  | { kind: 'call-close'; index: number; end: number; dialect: string }
  | { kind: 'param-open'; index: number; end: number }
  | { kind: 'param-close'; index: number; end: number };

function collectElementTags(text: string): ElementTag[] {
  const tags: ElementTag[] = [];
  let match: RegExpExecArray | null;
  CALL_TAG_PATTERN.lastIndex = 0;
  while ((match = CALL_TAG_PATTERN.exec(text)) !== null) {
    const end = match.index + match[0].length;
    if (match[1]) {
      tags.push({
        kind: 'call-close',
        index: match.index,
        end,
        dialect: match[1],
      });
    } else {
      tags.push({
        kind: 'call-open',
        index: match.index,
        end,
        dialect: match[0].startsWith('<invoke') ? 'invoke' : 'function',
      });
    }
  }
  PARAMETER_TAG_PATTERN.lastIndex = 0;
  while ((match = PARAMETER_TAG_PATTERN.exec(text)) !== null) {
    tags.push({
      kind: match[0].startsWith('</') ? 'param-close' : 'param-open',
      index: match.index,
      end: match.index + match[0].length,
    });
  }
  return tags.sort((a, b) => a.index - b.index);
}

interface CallFrame {
  dialect: string;
  /** No prose has appeared directly in this call's body so far. */
  clean: boolean;
  /** Number of parameter elements open when this call opened. */
  paramDepth: number;
  /** Offset just past this call's closer, when the stream wrote one. */
  close: number | null;
}

interface ElementPairing {
  /** Parameter elements the stream closed, nested ones included. */
  closed: Span[];
  /** Parameter elements never closed, with the call that owns each. */
  unclosed: Array<{ start: number; owner: CallFrame | null; owned: boolean }>;
  /** Offsets of the call closers, in text order. */
  callClosers: number[];
}

/**
 * Pairs call and parameter tags by depth in one ordered walk.
 *
 * The lazy PARAMETER_PATTERN ends a value at the first close tag, so a value
 * that quotes a parameter element loses its tail, and a mention of the open
 * tag in prose pairs with a close tag anywhere later in the turn. Pairing by
 * depth gives each element the extent it really has and leaves the prose
 * mention unclosed.
 *
 * An unclosed parameter counts as a truncated value only when it is a direct
 * child of a call with no prose before it; otherwise it is a mention.
 */
function pairElements(text: string): ElementPairing {
  const closed: Span[] = [];
  const callClosers: number[] = [];
  const calls: CallFrame[] = [];
  const parameters: Array<{
    start: number;
    owner: CallFrame | null;
    ownerClean: boolean;
  }> = [];
  let lastTagEnd = 0;
  for (const tag of collectElementTags(text)) {
    const top = calls[calls.length - 1];
    if (top && parameters.length === top.paramDepth) {
      if (text.slice(lastTagEnd, tag.index).trim() !== '') top.clean = false;
    }
    lastTagEnd = tag.end;
    if (tag.kind === 'call-open') {
      calls.push({
        dialect: tag.dialect,
        clean: true,
        paramDepth: parameters.length,
        close: null,
      });
    } else if (tag.kind === 'call-close') {
      callClosers.push(tag.index);
      const frame = calls[calls.length - 1];
      if (frame && frame.dialect === tag.dialect) {
        frame.close = tag.end;
        calls.pop();
      }
    } else if (tag.kind === 'param-open') {
      const owner = calls[calls.length - 1] ?? null;
      parameters.push({
        start: tag.index,
        owner,
        ownerClean: owner?.clean ?? false,
      });
    } else {
      const open = parameters.pop();
      if (open) closed.push([open.start, tag.end]);
    }
  }
  return {
    closed,
    unclosed: parameters.map(({ start, owner, ownerClean }) => ({
      start,
      owner,
      owned: owner !== null && ownerClean,
    })),
    callClosers,
  };
}

/**
 * Returns the positions of the `<example>` tags the markdown lexer reads as
 * HTML rather than as inline text (a tag inside a code span is text), or null
 * when the lexer cannot be consulted and every tag must be taken at face value.
 */
function exampleTagPositions(
  text: string,
  dataSpans: Span[],
): Set<number> | null {
  if (!text.includes('<example') && !text.includes('</example')) {
    return new Set();
  }
  if (text.length > MAX_LEXER_SCAN_LENGTH) return null;
  const tagPositions = new Set<number>();
  function collectTags(tokens: Token[], raw: string, baseOffset: number) {
    let cursor = 0;
    for (const token of tokens) {
      const offset = raw.indexOf(token.raw, cursor);
      cursor = offset + token.raw.length;
      if (token.type === 'html' && /^<\/?example(?=[\s/>])/.test(token.raw)) {
        tagPositions.add(baseOffset + offset);
      }
      if ('tokens' in token && token.tokens) {
        collectTags(token.tokens, token.raw, baseOffset + offset);
      }
    }
  }
  // Parameter data is blanked with spaces so offsets and line breaks survive.
  const proseParts: string[] = [];
  let cursor = 0;
  for (const [start, end] of dataSpans) {
    proseParts.push(
      text.slice(cursor, start),
      text.slice(start, end).replace(/[^\r\n]/g, ' '),
    );
    cursor = end;
  }
  proseParts.push(text.slice(cursor));
  const prose = proseParts.join('');
  try {
    collectTags(Lexer.lexInline(prose), prose, 0);
  } catch {
    return null;
  }
  return tagPositions;
}

/**
 * Finds the `<example>` regions. Example tags inside parameter data, a fence,
 * a comment or indented code are not structure.
 *
 * A value inside an example that quotes a complete call may carry example
 * tags of its own, and whether the region's closer is among them cannot be
 * told from the tag. Each opener such a value leaves unclosed keeps the
 * region open through one more closer, and no further, so a stray closer
 * later in the turn does not swallow the calls after the documentation.
 */
function computeExampleSpans(
  text: string,
  tagPositions: Set<number> | null,
  dataSpans: Span[],
  documentationSpans: Span[],
  quotedValueSpans: Span[],
  fences: FenceTable,
): Span[] {
  const spans: Span[] = [];
  let open: { start: number; count: number; lastCloserEnd: number } | null =
    null;
  let valueIndex = 0;
  let match: RegExpExecArray | null;
  EXAMPLE_TAG_PATTERN.lastIndex = 0;
  while ((match = EXAMPLE_TAG_PATTERN.exec(text)) !== null) {
    const position = match.index;
    while (
      valueIndex < quotedValueSpans.length &&
      quotedValueSpans[valueIndex][0] < position
    ) {
      const [start, end] = quotedValueSpans[valueIndex++];
      if (open === null || start < open.start) continue;
      const value = text.slice(start, end);
      const unclosed =
        (value.match(EXAMPLE_OPEN_TAG_PATTERN)?.length ?? 0) -
        (value.match(EXAMPLE_CLOSE_TAG_PATTERN)?.length ?? 0);
      open.count += Math.max(0, unclosed);
    }
    if (
      spanContains(dataSpans, position) ||
      (tagPositions !== null && !tagPositions.has(position)) ||
      fences.insideFence(position) ||
      spanContains(documentationSpans, position) ||
      /\/\s*>$/.test(match[0])
    ) {
      continue;
    }
    if (match[0].startsWith('</')) {
      if (open === null) continue;
      open.lastCloserEnd = position + match[0].length;
      open.count -= 1;
      if (open.count <= 0) {
        spans.push([open.start, open.lastCloserEnd]);
        open = null;
      }
    } else if (open === null) {
      open = { start: position, count: 1, lastCloserEnd: -1 };
    } else {
      open.count += 1;
    }
  }
  if (open !== null) {
    spans.push([
      open.start,
      open.lastCloserEnd === -1 ? text.length : open.lastCloserEnd,
    ]);
  }
  return spans;
}

interface TurnAnatomy {
  /** Strictly formed closed values: a block reads its argument from the span. */
  ownedValueSpans: Span[];
  /** Owned values that quote a complete call. */
  quotedValueSpans: Span[];
  /** Regions where a call is markup a value quotes, so no block starts there. */
  blockSkipSpans: Span[];
  documentationSpans: Span[];
  exampleSpans: Span[];
  fences: FenceTable;
}

/**
 * Derives the structure of the turn once, in dependency order: element
 * pairing, parameter data, fences, comments and indented code, then example
 * regions. Every guard reads this one view.
 */
function deriveTurnAnatomy(text: string): TurnAnatomy {
  const pairing = pairElements(text);
  // Outermost closed elements only: a nested one is its parent's data.
  const valueSpans: Span[] = [];
  let valueEnd = 0;
  for (const span of [...pairing.closed].sort(
    ([startA], [startB]) => startA - startB,
  )) {
    if (span[0] < valueEnd) continue;
    valueEnd = span[1];
    valueSpans.push(span);
  }

  const ownedValueSpans: Span[] = [];
  const quotedValueSpans: Span[] = [];
  for (const [start, end] of valueSpans) {
    const value = parameterValue(text.slice(start, end));
    if (value === null) continue;
    ownedValueSpans.push([start, end]);
    if (hasBalancedQuotedCalls(value)) quotedValueSpans.push([start, end]);
  }

  // A value the stream never closed is data for the comment scan only. It
  // must not hide fence, comment or example markers that follow it, or a
  // truncated stream would switch those guards off for the rest of the turn.
  // A call inside it is quoted markup only when the owning call did close.
  const openValueSpans: Span[] = [];
  const blockSkipSpans: Span[] = [...valueSpans];
  let closerIndex = 0;
  for (const { start, owner, owned } of pairing.unclosed) {
    if (!owned || owner === null) continue;
    while (
      closerIndex < pairing.callClosers.length &&
      pairing.callClosers[closerIndex] < start
    ) {
      closerIndex++;
    }
    const nextCloser =
      closerIndex < pairing.callClosers.length
        ? pairing.callClosers[closerIndex]
        : text.length;
    openValueSpans.push([
      start,
      Math.min(owner.close ?? text.length, nextCloser),
    ]);
    if (owner.close !== null) blockSkipSpans.push([start, owner.close]);
  }
  const dataSpans = mergeSpans(valueSpans);
  const lines = buildLineIndex(text, dataSpans);
  const fences = buildFenceTable(lines);
  const documentationSpans = mergeSpans(
    computeDocumentationSpans(text, lines, dataSpans, openValueSpans, fences),
  );
  return {
    ownedValueSpans,
    quotedValueSpans,
    blockSkipSpans: mergeSpans(blockSkipSpans),
    documentationSpans,
    exampleSpans: computeExampleSpans(
      text,
      exampleTagPositions(text, dataSpans),
      dataSpans,
      documentationSpans,
      quotedValueSpans,
      fences,
    ),
    fences,
  };
}

/** True when `index` sits in a region that documents calls instead of making them. */
function insideDocumentation(anatomy: TurnAnatomy, index: number): boolean {
  return (
    anatomy.fences.insideFence(index) ||
    spanContains(anatomy.documentationSpans, index) ||
    anatomy.exampleSpans.some(([start, end]) => index >= start && index < end)
  );
}

/**
 * Finds the tool-call blocks that can be dispatched. A block that is
 * ambiguous or malformed is rejected on its own and the scan resumes just
 * past its open tag, so one bad block does not cost the calls beside it.
 * Blocks inside fences, example wrappers, HTML comments or indented code are
 * documentation and are dropped.
 */
function recoverableToolCallBlocks(text: string): ToolCallBlock[] {
  const anatomy = deriveTurnAnatomy(text);
  const { ownedValueSpans, quotedValueSpans, blockSkipSpans } = anatomy;
  const blocks: ToolCallBlock[] = [];
  INVOKE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INVOKE_PATTERN.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    if (spanContains(blockSkipSpans, matchStart)) {
      continue;
    }
    const isInvoke = match[1] !== undefined;
    const toolName = match[1] ?? match[4];
    const closePattern = isInvoke
      ? INVOKE_CLOSE_PATTERN
      : FUNCTION_CLOSE_PATTERN;
    let closeLength = isInvoke ? '</invoke>'.length : match[6].length;
    let closeStart = matchEnd - closeLength;
    const lazyCloseStart = closeStart;
    const paramsStart = lazyCloseStart - (match[2] ?? match[5]).length;
    const openStart = matchStart + (match[3]?.length ?? 0);
    if (
      openTagEnd(text.slice(openStart, matchEnd)) !==
      paramsStart - openStart
    ) {
      // Quote pairing disagrees with the flat match about where the open tag
      // ends, so nothing inside this block can be located reliably. Skip it
      // whole: an offset inside it could re-enter its body.
      INVOKE_PATTERN.lastIndex = matchEnd;
      continue;
    }
    // The lazy match stops at the first closer, which belongs to a value when
    // that value quotes a call. The block's own closer is the first one past
    // every such value.
    for (const [start, end] of quotedValueSpans) {
      if (end <= closeStart) continue;
      if (start > closeStart) break;
      closePattern.lastIndex = end;
      const closer = closePattern.exec(text);
      if (closer === null) {
        closeStart = -1;
        break;
      }
      closeStart = closer.index;
      closeLength = closer[0].length;
    }
    if (closeStart === -1) {
      INVOKE_PATTERN.lastIndex = paramsStart;
      continue;
    }
    const paramsBlock = text.slice(paramsStart, closeStart);
    const blockEnd = closeStart + closeLength;
    INVOKE_PATTERN.lastIndex = blockEnd;

    const args: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    let outsideParameters = '';
    let cursor = 0;
    const parameterSpans: Span[] = [];
    // Only values this block's own scan consumed are removed before looking
    // for a stray call opener; a value that merely lies inside the block is
    // still text the flat scan put into an argument.
    const consumedValueSpans: Span[] = [];
    let duplicateParameter = false;
    PARAMETER_PATTERN.lastIndex = 0;
    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = PARAMETER_PATTERN.exec(paramsBlock)) !== null) {
      const parameterStart = paramsStart + paramMatch.index;
      const owned = ownedValueSpans.find(
        ([start, end]) => start === parameterStart && end <= closeStart,
      );
      let value = paramMatch[3];
      let parameterEnd = paramMatch.index + paramMatch[0].length;
      if (owned) {
        consumedValueSpans.push(owned);
        parameterEnd = owned[1] - paramsStart;
        value = paramsBlock.slice(
          paramMatch.index + openTagEnd(paramMatch[0]),
          parameterEnd - '</parameter>'.length,
        );
        PARAMETER_PATTERN.lastIndex = parameterEnd;
      }
      outsideParameters += paramsBlock.slice(cursor, paramMatch.index);
      cursor = parameterEnd;
      parameterSpans.push([parameterStart, paramsStart + parameterEnd]);
      const paramName = paramMatch[1] ?? paramMatch[2];
      // A repeated name would overwrite the earlier argument, possibly with
      // an element the closer advance pulled into the block.
      if (paramName in args) {
        duplicateParameter = true;
      } else {
        args[paramName] = parseParameterValue(
          decodeXmlEntities(stripDelimitingNewlines(value)),
        );
      }
    }
    outsideParameters += paramsBlock.slice(cursor);
    if (duplicateParameter) {
      INVOKE_PATTERN.lastIndex = paramsStart;
      continue;
    }
    // The search for a later closer is unbounded, so it can land on a closer
    // the following prose only mentions. What the advance stepped over must
    // be nothing but this block's own parameter elements.
    if (
      closeStart > lazyCloseStart &&
      textOutside(text, parameterSpans, lazyCloseStart, closeStart).trim() !==
        ''
    ) {
      INVOKE_PATTERN.lastIndex = paramsStart;
      continue;
    }
    const unquotedParameters = textOutside(
      text,
      consumedValueSpans,
      paramsStart,
      closeStart,
    );
    // A block with a missing close must not borrow a later block's closer and
    // parameters, so a call opener outside the consumed values rejects it, as
    // does any call or parameter tag, or a fence line, between the parameters.
    if (
      /<(?:function|invoke)(?:[\s=>]|$)/.test(unquotedParameters) ||
      /<\/?(?:function|invoke|parameter)(?:[\s=>]|$)/.test(outsideParameters) ||
      /^ {0,3}(?:`{3,}|~{3,})/m.test(outsideParameters)
    ) {
      INVOKE_PATTERN.lastIndex = paramsStart;
      continue;
    }

    if (toolName && Object.keys(args).length > 0) {
      blocks.push({
        name: toolName,
        args,
        start: matchStart,
        end: blockEnd,
        parameterSpans,
      });
    }
  }

  // Both ends are probed: a marker inside the block's own body can leave the
  // start outside a region and the closing tag inside it.
  return blocks.filter(
    ({ start, end, parameterSpans }) =>
      !spanContains(anatomy.documentationSpans, start) &&
      !spanContains(anatomy.documentationSpans, end - 1) &&
      !anatomy.fences.insideFence(start) &&
      !anatomy.fences.insideFence(end - 1) &&
      !anatomy.exampleSpans.some(
        ([exampleStart, exampleEnd]) =>
          (start >= exampleStart && start < exampleEnd) ||
          (end - 1 >= exampleStart &&
            end - 1 < exampleEnd &&
            !parameterSpans.some(
              ([from, to]) => exampleStart >= from && exampleStart < to,
            )),
      ),
  );
}

/**
 * Extracts XML-style tool calls from plain text content.
 * Blocks inside fenced code, `<example>` wrappers, HTML comments or indented
 * code are skipped: they document the format rather than emitting a tool call.
 * Returns an array of extracted tool calls, or an empty array if none found.
 */
export function extractXmlToolCalls(text: string): ExtractedToolCall[] {
  return recoverableToolCallBlocks(text).map(({ name, args }) => ({
    name,
    args,
  }));
}

/**
 * Attempts to recover tool calls from XML-formatted text content.
 * If XML tool calls are found and dominate the content, returns
 * functionCall parts and the remaining text (with recovered XML
 * blocks removed). Parameterless invoke blocks are preserved as
 * plain text since extractXmlToolCalls intentionally skips them.
 */
export function tryRecoverXmlToolCalls(text: string): {
  recovered: boolean;
  functionCallParts: Part[];
  remainingText: string;
} {
  const extracted = recoverableToolCallBlocks(text);

  if (extracted.length === 0) {
    return { recovered: false, functionCallParts: [], remainingText: text };
  }

  const removedRanges: Span[] = extracted.map(({ start, end }) => [start, end]);

  // Intent guard: only recover when XML blocks dominate the content.
  // Substantial surrounding prose suggests the model is documenting or
  // echoing the format, not emitting a tool call. Recovered blocks are
  // measured on their real extent, and every other flat match (parameterless
  // or rejected) still counts as markup rather than prose.
  const markupRanges: Span[] = [...removedRanges];
  INVOKE_PATTERN.lastIndex = 0;
  let claimed: RegExpExecArray | null;
  while ((claimed = INVOKE_PATTERN.exec(text)) !== null) {
    markupRanges.push([claimed.index, claimed.index + claimed[0].length]);
  }
  markupRanges.sort(([startA], [startB]) => startA - startB);
  const proseOnly = textOutside(text, markupRanges)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length > 0 && proseOnly.length / text.length > 0.8) {
    return { recovered: false, functionCallParts: [], remainingText: text };
  }

  // Only the recovered blocks are stripped; parameterless, rejected and
  // documented blocks stay behind as plain text.
  const remainingText = textOutside(text, removedRanges)
    .replace(/<function_calls>\s*<\/function_calls>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const functionCallParts: Part[] = extracted.map((toolCall, index) => ({
    functionCall: {
      id: `xml-recovered-${index}-${Date.now()}`,
      name: toolCall.name,
      args: toolCall.args,
    },
  }));

  return { recovered: true, functionCallParts, remainingText };
}
