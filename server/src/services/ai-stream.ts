import type { Response } from 'express';
import { openclawClient } from './openclaw.js';

/**
 * Set up an SSE response and stream text from OpenClaw back to the client.
 * Each chunk is wrapped as `{ type: 'text', content: '<chunk>' }` and terminated with `[DONE]`.
 */
export async function streamAiText(
  res: Response,
  systemPrompt: string,
  userPrompt: string,
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendSSE = (data: string) => res.write(`data: ${data}\n\n`);
  const sendHeartbeat = () => res.write(': heartbeat\n\n');

  try {
    await openclawClient.streamChat(
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      },
      (chunk) => sendSSE(JSON.stringify({ type: 'text', content: chunk })),
      sendHeartbeat,
    );
    sendSSE('[DONE]');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI stream error';
    sendSSE(JSON.stringify({ type: 'error', error: message }));
  } finally {
    res.end();
  }
}
