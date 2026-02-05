import { NextRequest, NextResponse } from 'next/server';
import { registerAgent, getAgent, listAgents } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, capabilities, contact, moltbook_username } = body;

    if (!id || !name || !contact) {
      return NextResponse.json(
        {
          error: {
            code: 'missing_parameters',
            message: 'id, name, and contact are required',
            example: {
              id: 'my-agent-001',
              name: 'My Trading Agent',
              description: 'Autonomous trading agent needing physical-world services',
              capabilities: ['trading', 'research', 'data-analysis'],
              contact: {
                method: 'webhook',
                url: 'https://my-agent.com/callback',
              },
              moltbook_username: 'my-agent',
            },
          },
        },
        { status: 400 }
      );
    }

    const agent = await registerAgent({
      id,
      name,
      description: description || '',
      capabilities: capabilities || [],
      contact,
      moltbook_username: moltbook_username || null,
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        capabilities: agent.capabilities,
        registered_at: agent.registered_at,
      },
      message: 'Agent registered. You can now propose deals via POST /api/deal.',
      endpoints: {
        propose_deal: 'POST /api/deal',
        view_deals: 'GET /api/deal?agent_id=YOUR_ID',
        browse_catalog: 'GET /api/catalog',
        discover_agents: 'GET /api/agent',
      },
    });
  } catch (error) {
    console.error('Error registering agent:', error);
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Failed to register agent',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('id');
    const capability = searchParams.get('capability');

    if (agentId) {
      const agent = await getAgent(agentId);
      if (!agent) {
        return NextResponse.json(
          { error: { code: 'not_found', message: `Agent '${agentId}' not found` } },
          { status: 404 }
        );
      }
      return NextResponse.json({ agent });
    }

    const agents = await listAgents(capability || undefined);

    return NextResponse.json({
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        capabilities: a.capabilities,
        moltbook_username: a.moltbook_username,
        last_seen: a.last_seen,
      })),
      count: agents.length,
      filters: {
        capability: capability || 'none (showing all)',
      },
      usage: {
        register: 'POST /api/agent with { id, name, contact, capabilities?, description? }',
        lookup: 'GET /api/agent?id=AGENT_ID',
        filter: 'GET /api/agent?capability=trading',
      },
    });
  } catch (error) {
    console.error('Error listing agents:', error);
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Failed to list agents',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
