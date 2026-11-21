/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { describe, expect, it } from 'vitest';

import { TrailingThinkingTagFilter } from './trailing-thinking-tag-filter.js';

/** Feeds `chunks` in order; the last call is the final one. */
const run = (chunks: string[], completed = true): string => {
  const filter = new TrailingThinkingTagFilter();
  const last = chunks.length - 1;
  return chunks
    .map((chunk, index) =>
      filter.parse(chunk, index === last, index === last && completed),
    )
    .join('');
};

const byChar = (text: string): string[] => [...text];

/** Every way to cut `text` with at most `maxCuts` cut points. */
const chunkingsUpTo = (text: string, maxCuts: number): string[][] => {
  const out: string[][] = [];
  const walk = (start: number, cuts: number[]): void => {
    const points = [0, ...cuts, text.length];
    out.push(
      points.slice(0, -1).map((point, i) => text.slice(point, points[i + 1])),
    );
    if (cuts.length === maxCuts) return;
    for (let cut = start; cut < text.length; cut++) {
      walk(cut + 1, [...cuts, cut]);
    }
  };
  walk(1, []);
  return out;
};

describe('TrailingThinkingTagFilter', () => {
  it('holds a trailing candidate and drops it on a normal finish', () => {
    const filter = new TrailingThinkingTagFilter();
    expect(filter.parse('Answer.\n</thi', false, false)).toBe('Answer.');
    expect(filter.parse('nking>', false, false)).toBe('');
    expect(filter.parse('', true, true)).toBe('');
    expect(filter.sanitizedTagName).toBe('thinking');
  });

  it('releases the held candidate when the response did not complete', () => {
    const filter = new TrailingThinkingTagFilter();
    expect(filter.parse('Answer.\n</thinking>', true, false)).toBe(
      'Answer.\n</thinking>',
    );
    expect(filter.sanitizedTagName).toBeUndefined();
  });

  it('keeps a tag-only response, which has no prose before it', () => {
    expect(run(['\n</thinking>'])).toBe('\n</thinking>');
  });

  it('releases an incomplete trailing fragment on a normal finish', () => {
    expect(run(['Answer.\n</thi'])).toBe('Answer.\n</thi');
    expect(run(['Answer.\n</th', 'i'])).toBe('Answer.\n</thi');
  });

  it('accepts a CRLF split across chunks without leaving the carriage return', () => {
    expect(run(['Answer.\r', '\n', '</thinking>'])).toBe('Answer.');
    expect(run(['Answer.\nMore.\r', '\n</thinking>'])).toBe('Answer.\nMore.');
  });

  it('keeps an indented code block but strips after a paragraph continuation', () => {
    expect(run(['Sample:\n\n    </thinking>'])).toBe(
      'Sample:\n\n    </thinking>',
    );
    expect(run(['Sample:\n\n\t</thinking>'])).toBe('Sample:\n\n\t</thinking>');
    expect(run(['Sample:\n    </thinking>'])).toBe('Sample:');
  });

  it('holds a tail up to the cap mid-stream and releases a longer one', () => {
    const padded = (spaces: number) =>
      'Answer.\n</thinking>' + ' '.repeat(spaces);
    expect(
      new TrailingThinkingTagFilter().parse(padded(115), false, false),
    ).toBe('Answer.');
    expect(
      new TrailingThinkingTagFilter().parse(padded(117), false, false),
    ).toBe(padded(117));
  });

  it.each([
    'Answer.\n' + ' '.repeat(200) + '</thinking>',
    'Answer.\n</thinking>' + ' '.repeat(200),
    'Answer.\n</thinking>\n' + ' '.repeat(200),
    'Use ```xml\n</thinking>\n```\n</thinking>',
    'Example: `</think>`\n</think>',
    'Use:\n<textarea>\n</thinking>',
    'Example:\n<div>\n</thinking>',
    'Example:\n<th colspan="2">\n</thinking>',
    'Example:\n</div>\n</thinking>',
    'Example:\n<!--\n</thinking>',
    'Example:\n<?xml\n</thinking>',
    'The closer is </thinking>.\nAgain:\n</thinking>',
    '\n</thinking>\nAnswer.\n</thinking>',
    '<!-- </thinking> -->\nTail.\n</thinking>',
    '<think\n</thinking>',
    '<thinking\n</thinking>',
  ])('keeps literal or over-long text whole at any framing: %j', (input) => {
    expect(run([input])).toBe(input);
    expect(run(byChar(input))).toBe(input);
  });

  it.each(['<t', '<thi', '<thinkin'])(
    'does not treat an unresolved thinking opener as literal markup: %s',
    (prefix) => {
      expect(run([prefix, '\n</thinking>'])).toBe(prefix);
    },
  );

  it.each(['Answer~ ~~', 'Answer.< a'])(
    'does not join markers that whitespace separates: %s',
    (answer) => {
      const input = `${answer}\n</thinking>`;
      expect(run([input])).toBe(answer);
      expect(run(byChar(input))).toBe(answer);
    },
  );

  it('gives the same result however the deltas were cut', () => {
    const inputs = [
      '\n</thinking>\n</thinking>',
      '</thinking>\nAnswer.\n</thinking>',
      '<!-- </thinking> -->\nTail.\n</thinking>',
      'First the closer:\n</thinking>\nthen again:\n</thinking>',
      'Answer.\n</thinking>',
      'Answer.\nMore.\r\n</thinking>',
    ];
    for (const input of inputs) {
      const oneShot = run([input]);
      for (const chunks of chunkingsUpTo(input, 2)) {
        expect(run(chunks)).toBe(oneShot);
      }
    }
  });

  it('drains a whitespace hold but not a held tag fragment', () => {
    const blank = new TrailingThinkingTagFilter();
    expect(blank.parse('Answer.\n  ', false, false)).toBe('Answer.');
    expect(blank.drainWhitespace()).toBe('\n  ');
    expect(blank.drainWhitespace()).toBe('');

    const fragment = new TrailingThinkingTagFilter();
    fragment.parse('Answer.\n</thi', false, false);
    expect(fragment.drainWhitespace()).toBe('');
  });
});
