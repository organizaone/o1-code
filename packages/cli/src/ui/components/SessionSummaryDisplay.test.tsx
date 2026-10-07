/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { SessionSummaryDisplay } from './SessionSummaryDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import type {
  ModelMetrics,
  ModelMetricsCore,
  SessionMetrics,
} from '../contexts/SessionContext.js';
import { MAIN_SOURCE } from '@organizaone/o1-code-core';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { AuthType } from '@organizaone/o1-code-core/utils/auth-type.js';
import type { ContentGeneratorConfig } from '@organizaone/o1-code-core/core/contentGenerator.js';

const mainOnly = (core: ModelMetricsCore): ModelMetrics => ({
  ...core,
  bySource: { [MAIN_SOURCE]: core },
});

vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContext>();
  return {
    ...actual,
    useSessionStats: vi.fn(),
  };
});

const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);

const renderWithMockedStats = (
  metrics: SessionMetrics,
  sessionId: string = 'test-session-id-12345',
  promptCount: number = 5,
  chatRecordingEnabled: boolean = true,
  connection?: ContentGeneratorConfig,
) => {
  useSessionStatsMock.mockReturnValue({
    stats: {
      sessionId,
      sessionStartTime: new Date(),
      metrics,
      lastPromptTokenCount: 0,
      promptCount,
    },

    getPromptCount: () => promptCount,
    startNewPrompt: vi.fn(),
  });

  const mockConfig = {
    getContentGeneratorConfig: () => connection,
    getChatRecordingService: vi.fn(() =>
      chatRecordingEnabled ? ({} as never) : undefined,
    ),
  };

  return render(
    <ConfigContext.Provider value={mockConfig as never}>
      <SessionSummaryDisplay duration="1h 23m 45s" width={100} />
    </ConfigContext.Provider>,
  );
};

describe('<SessionSummaryDisplay />', () => {
  it.each([
    [
      { model: 'runtime-model', authType: AuthType.USE_OPENAI },
      'OpenAI-compatible API',
    ],
    [
      { model: 'runtime-model', authType: AuthType.USE_OPENAI_RESPONSES },
      'OpenAI Responses API',
    ],
    [
      { model: 'runtime-model', authType: AuthType.USE_ANTHROPIC },
      'Anthropic API',
    ],
    [{ model: 'runtime-model', authType: AuthType.USE_GEMINI }, 'Gemini API'],
    [{ model: 'runtime-model', authType: AuthType.USE_VERTEX_AI }, 'Vertex AI'],
    [
      {
        model: 'runtime-model',
        authType: AuthType.USE_ANTHROPIC,
        connection: 'o1-connect',
        baseUrl: 'http://127.0.0.1:1234',
      },
      'OrganizaOne · o1-gateway device code · Anthropic API',
    ],
    [
      {
        model: 'runtime-model',
        authType: AuthType.USE_ANTHROPIC,
        baseUrl: 'https://api.organizago.com',
      },
      'OrganizaOne · Anthropic API',
    ],
    [
      {
        model: 'runtime-model',
        authType: AuthType.USE_OPENAI,
        baseUrl: 'http://[::1]:1234/v1',
      },
      'Local · OpenAI-compatible API',
    ],
    [
      {
        model: 'runtime-model',
        authType: AuthType.USE_OPENAI,
        baseUrl: 'https://user:secret@custom.example/v1',
        apiKey: 'private-api-key',
      },
      'OpenAI-compatible API',
    ],
    [undefined, 'Not connected'],
  ] satisfies Array<[ContentGeneratorConfig | undefined, string]>)(
    'shows the active connection %j',
    (connection, expected) => {
      const metrics: SessionMetrics = {
        models: {},
        tools: {
          totalCalls: 0,
          totalSuccess: 0,
          totalFail: 0,
          totalDurationMs: 0,
          totalDecisions: { accept: 0, reject: 0, modify: 0 },
          byName: {},
        },
        files: { totalLinesAdded: 0, totalLinesRemoved: 0 },
      };
      const { lastFrame } = renderWithMockedStats(
        metrics,
        'test-session-id',
        0,
        false,
        connection,
      );
      expect(lastFrame()).toContain('Connection type:');
      expect(lastFrame()).toContain(expected);
      expect(lastFrame()).not.toContain('private-api-key');
      expect(lastFrame()).not.toContain('user:secret');
    },
  );

  it('renders the summary display with a title', () => {
    const metrics: SessionMetrics = {
      models: {
        'gemini-2.5-pro': mainOnly({
          api: { totalRequests: 10, totalErrors: 1, totalLatencyMs: 50234 },
          tokens: {
            prompt: 1000,
            candidates: 2000,
            total: 3500,
            cached: 500,
            thoughts: 300,
          },
        }),
      },
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
      files: {
        totalLinesAdded: 42,
        totalLinesRemoved: 15,
      },
    };

    const { lastFrame } = renderWithMockedStats(metrics);
    const output = lastFrame();

    expect(output).toContain('Agent powering down. Goodbye!');
    expect(output).toContain('To continue this session, run');
    expect(output).toContain('o1-code --resume test-session-id-12345');
    expect(output).toMatchSnapshot();
  });

  it('does not show resume message when there are no messages', () => {
    const metrics: SessionMetrics = {
      models: {},
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
      files: {
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
    };

    // Pass promptCount = 0 to simulate no messages
    const { lastFrame } = renderWithMockedStats(
      metrics,
      'test-session-id-12345',
      0,
    );
    const output = lastFrame();

    expect(output).toContain('Agent powering down. Goodbye!');
    expect(output).not.toContain('To continue this session, run');
    expect(output).not.toContain('o1-code --resume');
  });

  it('does not show resume message when chat recording is disabled', () => {
    const metrics: SessionMetrics = {
      models: {},
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
      files: {
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
      },
    };

    const { lastFrame } = renderWithMockedStats(
      metrics,
      'test-session-id-12345',
      5,
      false,
    );
    const output = lastFrame();

    expect(output).toContain('Agent powering down. Goodbye!');
    expect(output).not.toContain('To continue this session, run');
    expect(output).not.toContain('o1-code --resume');
  });
});
