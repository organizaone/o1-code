/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Characters that can forge or corrupt a single log line: the C1 control block
 * (notably NEL, U+0085, which renders as a line break), the Unicode line and
 * paragraph separators, the bidirectional override/isolate controls, other
 * format characters and variation selectors. ASCII C0/DEL are stripped
 * separately.
 */
const LOG_UNSAFE_INVISIBLES =
  /[\u0080-\u009f\p{Cf}\u2028\u2029]|\p{Variation_Selector}/gu;

/**
 * Truncate to at most `max` code points, so a cut never leaves a lone
 * surrogate behind.
 */
function truncateCodePoints(str: string, max: number): string {
  const codePoints = Array.from(str);
  return codePoints.length > max ? codePoints.slice(0, max).join('') : str;
}

/**
 * Neutralize attacker-controlled text before it is written to a single-line
 * stderr audit or diagnostic log. Caps to `maxLen` code points, renders ASCII
 * newlines as a visible `\n` escape, then replaces everything that could
 * forge or corrupt the line (Unicode line breaks, bidi controls, C0/DEL
 * controls such as CR and ESC) with a space.
 */
export function sanitizeLogText(text: string, maxLen: number): string {
  return (
    truncateCodePoints(text, maxLen)
      .replace(/\n/g, '\\n')
      .replace(LOG_UNSAFE_INVISIBLES, ' ')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
  );
}
