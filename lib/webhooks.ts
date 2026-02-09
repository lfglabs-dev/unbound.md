import { createHmac } from 'crypto';
import { getWebhooksForEvent, type Webhook } from './db';

/**
 * Dispatch webhook events to all registered listeners.
 * Fire-and-forget: failures are logged but don't block the caller.
 */
export async function dispatchWebhookEvent(
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  let webhooks: Webhook[];
  try {
    webhooks = await getWebhooksForEvent(event);
  } catch (err) {
    console.error('[webhook] Failed to query webhooks for event', event, err);
    return;
  }

  if (webhooks.length === 0) return;

  const timestamp = new Date().toISOString();

  await Promise.allSettled(
    webhooks.map(async (wh) => {
      const payload = {
        event,
        timestamp,
        data,
        webhook_id: wh.id,
      };

      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'unbound.md-webhook/1.0',
        'X-Webhook-Event': event,
        'X-Webhook-Timestamp': timestamp,
      };

      // Sign the payload if a secret was provided at registration
      if (wh.secret) {
        const signature = createHmac('sha256', wh.secret)
          .update(body)
          .digest('hex');
        headers['X-Webhook-Signature'] = `sha256=${signature}`;
      }

      try {
        const resp = await fetch(wh.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(10_000), // 10s timeout per webhook
        });

        if (!resp.ok) {
          console.warn(
            `[webhook] ${wh.id} -> ${wh.url} returned ${resp.status}`
          );
        }
      } catch (err) {
        console.warn(`[webhook] ${wh.id} -> ${wh.url} failed:`, err);
      }
    })
  );
}
