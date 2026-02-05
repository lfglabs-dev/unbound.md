import { NextRequest, NextResponse } from 'next/server';
import { createWebhook, getWebhooks, deleteWebhook } from '@/lib/db';

const VALID_EVENTS = [
  'request.created', 'request.quoted', 'request.paid',
  'request.in_progress', 'request.completed', 'request.cancelled',
  'negotiation.update', 'proof.submitted', 'deal.proposed',
  'deal.accepted', 'deal.rejected', 'deal.message',
];

/**
 * POST /api/webhook
 * Register a webhook to receive real-time status updates
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent_id, url, events, secret } = body;

    if (!agent_id) {
      return NextResponse.json(
        { success: false, error: 'agent_id is required' },
        { status: 400 }
      );
    }

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'url is required (HTTPS endpoint to receive webhook POSTs)' },
        { status: 400 }
      );
    }

    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'https:') {
        return NextResponse.json(
          { success: false, error: 'Webhook URL must use HTTPS' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    const selectedEvents = events || VALID_EVENTS;
    const invalidEvents = selectedEvents.filter((e: string) => !VALID_EVENTS.includes(e));
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { success: false, error: `Invalid events: ${invalidEvents.join(', ')}`, valid_events: VALID_EVENTS },
        { status: 400 }
      );
    }

    const webhookId = `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const webhook = await createWebhook({
      id: webhookId,
      agent_id,
      url,
      events: selectedEvents,
      secret,
    });

    return NextResponse.json({
      success: true,
      webhook: {
        id: webhookId,
        url,
        events: selectedEvents,
        active: true,
        created_at: webhook.created_at,
      },
      message: 'Webhook registered. You will receive POST requests when subscribed events occur.',
      payload_format: {
        event: 'string (e.g., request.completed)',
        timestamp: 'ISO 8601',
        data: 'Event-specific payload (request details, proof data, deal info)',
        webhook_id: 'Your webhook ID for reference',
        signature: 'HMAC-SHA256 of payload body (if secret was provided)',
      },
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating webhook:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create webhook' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhook?agent_id=XXX
 * List registered webhooks or show API documentation
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent_id');

    if (!agentId) {
      return NextResponse.json({
        success: true,
        message: 'Webhook Management API',
        description: 'Register webhooks to receive real-time notifications when events occur on your service requests and deals.',
        usage: {
          register: {
            method: 'POST /api/webhook',
            body: {
              agent_id: 'your-agent-id',
              url: 'https://your-server.com/webhook',
              events: ['request.completed', 'proof.submitted'],
              secret: 'optional-hmac-secret',
            },
          },
          list: 'GET /api/webhook?agent_id=your-agent-id',
          delete: {
            method: 'DELETE /api/webhook',
            body: { webhook_id: 'wh_xxx', agent_id: 'your-agent-id' },
          },
        },
        available_events: VALID_EVENTS.map(e => {
          const descriptions: Record<string, string> = {
            'request.created': 'New service request submitted',
            'request.quoted': 'Quote provided for request',
            'request.paid': 'Payment confirmed',
            'request.in_progress': 'Human has started executing',
            'request.completed': 'Task finished',
            'request.cancelled': 'Request cancelled',
            'negotiation.update': 'Negotiation activity on a request',
            'proof.submitted': 'Proof of completion uploaded',
            'deal.proposed': 'New deal proposal received',
            'deal.accepted': 'Deal has been accepted',
            'deal.rejected': 'Deal has been rejected',
            'deal.message': 'New message in deal thread',
          };
          return { event: e, description: descriptions[e] || e };
        }),
      });
    }

    const webhooks = await getWebhooks(agentId);

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      webhook_count: webhooks.length,
      webhooks: webhooks.map(w => ({
        id: w.id,
        url: w.url,
        events: w.events,
        active: w.active,
        created_at: w.created_at,
      })),
    });

  } catch (error) {
    console.error('Error fetching webhooks:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch webhooks' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/webhook
 * Deactivate a webhook
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { webhook_id, agent_id } = body;

    if (!webhook_id || !agent_id) {
      return NextResponse.json(
        { success: false, error: 'webhook_id and agent_id are required' },
        { status: 400 }
      );
    }

    const deleted = await deleteWebhook(webhook_id, agent_id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: 'Webhook not found or not owned by this agent' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook deactivated',
      webhook_id,
    });

  } catch (error) {
    console.error('Error deleting webhook:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete webhook' },
      { status: 500 }
    );
  }
}
