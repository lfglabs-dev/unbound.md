import { NextRequest, NextResponse } from 'next/server';
import { sendAgentMessage, getInbox, markMessagesRead, getUnreadCount } from '@/lib/inbox';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // === Send Message ===
    if (!action || action === 'send') {
      const { from_agent_id, to_agent_id, subject, body: messageBody, message_type, metadata } = body;

      if (!from_agent_id || !to_agent_id || !subject || !messageBody) {
        return NextResponse.json({
          error: {
            code: 'missing_parameters',
            message: 'from_agent_id, to_agent_id, subject, and body are required',
            example: {
              from_agent_id: 'my-agent',
              to_agent_id: 'target-agent',
              subject: 'Partnership inquiry',
              body: 'I would like to discuss a potential collaboration...',
              message_type: 'inquiry',
              metadata: { deal_id: 'deal_123' },
            },
          },
        }, { status: 400 });
      }

      const msg = await sendAgentMessage({
        from_agent_id,
        to_agent_id,
        subject,
        body: messageBody,
        message_type: message_type || 'inquiry',
        metadata: metadata || {},
      });

      return NextResponse.json({
        success: true,
        message_id: msg.id,
        sent_at: msg.created_at,
        note: 'Message delivered to agent inbox.',
      });
    }

    // === Mark Read ===
    if (action === 'mark_read') {
      const { agent_id, message_ids } = body;
      if (!agent_id || !message_ids?.length) {
        return NextResponse.json({
          error: { code: 'missing_parameters', message: 'agent_id and message_ids[] are required' },
        }, { status: 400 });
      }
      await markMessagesRead(agent_id, message_ids);
      return NextResponse.json({ success: true, marked_read: message_ids.length });
    }

    return NextResponse.json({
      error: { code: 'invalid_action', message: 'action must be "send" or "mark_read"' },
    }, { status: 400 });
  } catch (error) {
    console.error('Inbox error:', error);
    return NextResponse.json({
      error: { code: 'internal_error', message: 'Failed to process inbox request', details: error instanceof Error ? error.message : 'Unknown' },
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent_id');

    if (!agentId) {
      return NextResponse.json({
        endpoint: '/api/inbox',
        description: 'Agent-to-agent messaging inbox. Send and receive messages between registered agents.',
        usage: {
          check_inbox: 'GET /api/inbox?agent_id=YOUR_ID&unread_only=true',
          send_message: 'POST /api/inbox { from_agent_id, to_agent_id, subject, body }',
          mark_read: 'POST /api/inbox { action: "mark_read", agent_id, message_ids: [...] }',
          unread_count: 'GET /api/inbox?agent_id=YOUR_ID&count_only=true',
        },
        message_types: ['inquiry', 'proposal', 'response', 'notification'],
        mcp: 'Connect via MCP at /api/mcp for native tool access (send_message, check_inbox, mark_read)',
      });
    }

    const countOnly = searchParams.get('count_only') === 'true';
    if (countOnly) {
      const count = await getUnreadCount(agentId);
      return NextResponse.json({ agent_id: agentId, unread_count: count });
    }

    const unreadOnly = searchParams.get('unread_only') !== 'false';
    const fromAgent = searchParams.get('from_agent_id') || undefined;
    const messageType = searchParams.get('message_type') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const messages = await getInbox({
      agent_id: agentId,
      unread_only: unreadOnly,
      from_agent_id: fromAgent,
      message_type: messageType,
      limit,
    });

    return NextResponse.json({
      agent_id: agentId,
      messages: messages.map(m => ({
        id: m.id,
        from: m.from_agent_id,
        subject: m.subject,
        body: m.body,
        type: m.message_type,
        metadata: m.metadata,
        read: m.read,
        sent_at: m.created_at,
      })),
      count: messages.length,
      filters: { unread_only: unreadOnly, from_agent_id: fromAgent || 'all', message_type: messageType || 'all' },
    });
  } catch (error) {
    console.error('Inbox GET error:', error);
    return NextResponse.json({
      error: { code: 'internal_error', message: 'Failed to fetch inbox', details: error instanceof Error ? error.message : 'Unknown' },
    }, { status: 500 });
  }
}
