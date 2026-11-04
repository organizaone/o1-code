/**
 * @license
 * Copyright 2026 o1-code contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import type { Config } from '@organizaone/o1-code-core/config/config.js';
import { registerGatewayTransferConfirmation } from '@organizaone/o1-code-core/providers/gateway-transfer.js';
import type { ConfirmationRequest } from '../types.js';
import { t } from '../../i18n/index.js';

export function useGatewayTransferConfirmation(
  config: Config,
): ConfirmationRequest | null {
  const [question, setQuestion] = useState<ConfirmationRequest | null>(null);
  useEffect(() => {
    let finishPending: ((answer: boolean) => void) | undefined;
    const unregister = registerGatewayTransferConfirmation(
      config,
      (request) =>
        new Promise<boolean>((resolve) => {
          finishPending?.(false);
          let settled = false;
          const finish = (answer: boolean) => {
            if (settled) return;
            settled = true;
            request.signal?.removeEventListener('abort', cancel);
            finishPending = undefined;
            setQuestion(null);
            resolve(answer && !request.signal?.aborted);
          };
          const cancel = () => finish(false);
          finishPending = finish;
          if (request.signal?.aborted) {
            finish(false);
            return;
          }
          request.signal?.addEventListener('abort', cancel, { once: true });
          setQuestion({
            prompt: request.source.startsWith('o1gw/group/')
              ? t(
                  'To continue in this group, we need to send this conversation history to another eligible account. This uses tokens and context on the destination account. Do you authorize?',
                )
              : t(
                  'To continue on {{destination}}, we need to send this conversation history. This uses tokens and context on the destination account. Do you authorize?',
                  { destination: request.destination },
                ),
            onConfirm: finish,
            confirmLabel: t('Authorize and continue'),
            cancelLabel: t('Cancel'),
            defaultDeny: true,
          });
        }),
    );
    return () => {
      unregister();
      finishPending?.(false);
    };
  }, [config]);
  return question;
}
