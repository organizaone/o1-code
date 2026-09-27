import type { ScenarioConfig } from '../scenario-runner.js';

const base = {
  terminal: {
    cols: 112,
    rows: 40,
    theme: 'github-dark',
    title: 'o1-code skill review',
    cwd: '../../..',
  },
  gif: false,
} satisfies Pick<ScenarioConfig, 'terminal' | 'gif'>;

const harness = [
  'npx',
  'tsx',
  'integration-tests/terminal-capture/skill-review-harness/text-capture.tsx',
];

export default [
  {
    ...base,
    name: 'skill-review-before-global-o1-code',
    spawn: [...harness, 'before'],
    flow: [
      {
        sleep: 7000,
        capture: 'before-global-o1-code.png',
        captureFull: 'before-global-o1-code-full.png',
      },
    ],
  },
  {
    ...base,
    name: 'skill-review-after-preview',
    spawn: [...harness, 'after-preview'],
    flow: [
      {
        sleep: 7000,
        capture: 'after-preview.png',
        captureFull: 'after-preview-full.png',
      },
    ],
  },
  {
    ...base,
    name: 'skill-review-after-second',
    spawn: [...harness, 'after-second'],
    flow: [
      {
        sleep: 7000,
        capture: 'after-second.png',
        captureFull: 'after-second-full.png',
      },
    ],
  },
  {
    ...base,
    name: 'skill-review-after-turn-off',
    spawn: [...harness, 'after-turn-off'],
    flow: [
      {
        sleep: 7000,
        capture: 'after-turn-off.png',
        captureFull: 'after-turn-off-full.png',
      },
    ],
  },
] satisfies ScenarioConfig[];
