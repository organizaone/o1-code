import type { ScenarioConfig } from '../scenario-runner.js';

export default {
  name: '/hooks command',
  spawn: ['node', 'dist/cli.js', '--yolo'],
  terminal: { title: 'o1-code', cwd: '../../..' },
  flow: [{ type: 'hi' }, { type: '/hooks' }],
} satisfies ScenarioConfig;
