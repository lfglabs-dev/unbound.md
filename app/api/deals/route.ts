import { NextRequest, NextResponse } from 'next/server';

// In-memory deals store (complements DB for quick iteration)
// Production: migrate to Postgres
const deals: Map<string, Deal> = new Map();

interface DealMessage {
  role: 'agent' | 'human' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface Deal {
  id: string;
  agent_id: string;
  service: string;
  status: 'discussing' | 'proposed' | 'agreed' | 'escrow_pending' | 'in_progress' | 'completed' | 'cancelled';
  messages: DealMessage[];
  terms?: {
    service_description: string;
    price_usdc: number;
    deadline: string;
    deliverables: string[];
    escrow_method?: string;
    escrow_address?: string;
  };
  created_at: string;
  updated_at: string;
}

const ESCROW_INTEGRATIONS = {
  paylobster: {
    name: 'PayLobster',
    description: 'Trustless USDC escrow on Base mainnet with on-chain reputation',
    contract: '0xa091fC821c85Dfd2b2B3EF9e22c5f4c',
    network: 'base',
    how_it_works: 'Funds locked until both parties agree or timeout refunds buyer',
    link: 'https://www.moltbook.com/post/2419af2b-d2f6-4fb4-8df4-5f6e7fc406a8',
  },
  direct: {
    name: 'Direct USDC Transfer',
    description: 'Send USDC directly to our address on Base or Solana',
    address: process.env.USDC_PAYMENT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    network: 'base',
    how_it_works: 'Trust-based with proof of execution provided after completion',
  },
  testnet: {
    name: 'Free Test (Hackathon)',
    description: 'No payment needed - we execute for free as proof of capability',
    how_it_works: 'Available until Feb 8 for hackathon participants',
    link: 'https://unbound.md/testnet',
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'start':
        return handleStart(body);
      case 'message':
        return handleMessage(body);
      case 'propose':
        return handlePropose(body);
      case 'agree':
        return handleAgree(body);
      case 'cancel':
        return handleCancel(body);
      default:
        return NextResponse.json({
          error: 'Unknown action',
          available_actions: ['start', 'message', 'propose', 'agree', 'cancel'],
          documentation: 'https://unbound.md/api',
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Deal API error:', error);
    return NextResponse.json({
      error: 'Failed to process deal request',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

function handleStart(body: any) {
  const { agent_id, service, description } = body;

  if (!agent_id || !service) {
    return NextResponse.json({
      error: 'agent_id and service are required',
      example: {
        action: 'start',
        agent_id: 'your_agent_name',
        service: 'banking|physical|proxy|employment|datacenter',
        description: 'What you need done',
      },
    }, { status: 400 });
  }

  const dealId = `deal_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now = new Date().toISOString();

  const deal: Deal = {
    id: dealId,
    agent_id,
    service,
    status: 'discussing',
    messages: [
      {
        role: 'agent',
        content: description || `I need ${service} services`,
        timestamp: now,
      },
      {
        role: 'system',
        content: `Deal ${dealId} started. Human partner will be notified. You can send messages, or propose specific terms when ready.`,
        timestamp: now,
      },
    ],
    created_at: now,
    updated_at: now,
  };

  deals.set(dealId, deal);

  console.log('=== NEW DEAL STARTED ===');
  console.log(`Deal: ${dealId}`);
  console.log(`Agent: ${agent_id}`);
  console.log(`Service: ${service}`);
  console.log(`Description: ${description}`);
  console.log('========================');

  return NextResponse.json({
    success: true,
    deal_id: dealId,
    status: 'discussing',
    message: 'Deal started. You can now send messages or propose terms.',
    next_actions: {
      send_message: {
        action: 'message',
        deal_id: dealId,
        content: 'your message here',
      },
      propose_terms: {
        action: 'propose',
        deal_id: dealId,
        terms: {
          service_description: 'what you need done',
          price_usdc: 0,
          deadline: 'YYYY-MM-DD',
          deliverables: ['list of expected outcomes'],
        },
      },
    },
    escrow_options: ESCROW_INTEGRATIONS,
    estimated_response_time: '< 2 hours',
  }, { status: 201 });
}

function handleMessage(body: any) {
  const { deal_id, content } = body;

  if (!deal_id || !content) {
    return NextResponse.json({
      error: 'deal_id and content are required',
    }, { status: 400 });
  }

  const deal = deals.get(deal_id);
  if (!deal) {
    return NextResponse.json({
      error: 'Deal not found',
      hint: 'Start a new deal with action: "start"',
    }, { status: 404 });
  }

  const now = new Date().toISOString();
  deal.messages.push({
    role: 'agent',
    content,
    timestamp: now,
  });
  deal.updated_at = now;

  console.log(`=== DEAL MESSAGE ===`);
  console.log(`Deal: ${deal_id}`);
  console.log(`Agent: ${deal.agent_id}`);
  console.log(`Message: ${content}`);
  console.log('====================');

  return NextResponse.json({
    success: true,
    deal_id,
    status: deal.status,
    message: 'Message received. Human will review and respond.',
    conversation: deal.messages,
    estimated_response_time: '< 2 hours',
  });
}

function handlePropose(body: any) {
  const { deal_id, terms } = body;

  if (!deal_id || !terms) {
    return NextResponse.json({
      error: 'deal_id and terms are required',
      example_terms: {
        service_description: 'Execute wire transfer of $5000 to datacenter provider',
        price_usdc: 25,
        deadline: '2026-02-10',
        deliverables: ['Bank confirmation receipt', 'Transaction reference number'],
        escrow_method: 'paylobster',
      },
    }, { status: 400 });
  }

  const deal = deals.get(deal_id);
  if (!deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  deal.status = 'proposed';
  deal.terms = {
    service_description: terms.service_description || '',
    price_usdc: terms.price_usdc || 0,
    deadline: terms.deadline || '',
    deliverables: terms.deliverables || [],
    escrow_method: terms.escrow_method || 'direct',
  };
  deal.messages.push({
    role: 'agent',
    content: `Proposed terms: ${terms.service_description} for ${terms.price_usdc} USDC by ${terms.deadline}`,
    timestamp: now,
    metadata: { terms },
  });
  deal.messages.push({
    role: 'system',
    content: 'Terms proposed. Human partner will review and respond with accept, counter-offer, or clarification.',
    timestamp: now,
  });
  deal.updated_at = now;

  console.log('=== DEAL PROPOSED ===');
  console.log(`Deal: ${deal_id}`);
  console.log(`Terms:`, JSON.stringify(terms, null, 2));
  console.log('=====================');

  const escrowInfo = ESCROW_INTEGRATIONS[terms.escrow_method as keyof typeof ESCROW_INTEGRATIONS] || ESCROW_INTEGRATIONS.direct;

  return NextResponse.json({
    success: true,
    deal_id,
    status: 'proposed',
    terms: deal.terms,
    escrow: escrowInfo,
    message: 'Terms proposed. Human will review within 2 hours.',
    next_actions: {
      check_status: `GET /api/deals?id=${deal_id}`,
      send_message: { action: 'message', deal_id, content: 'additional context' },
      cancel: { action: 'cancel', deal_id },
    },
  });
}

function handleAgree(body: any) {
  const { deal_id } = body;

  const deal = deals.get(deal_id);
  if (!deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  if (deal.status !== 'proposed') {
    return NextResponse.json({
      error: 'Deal must be in "proposed" status to agree',
      current_status: deal.status,
    }, { status: 400 });
  }

  const now = new Date().toISOString();
  deal.status = 'agreed';
  deal.messages.push({
    role: 'system',
    content: 'Both parties agreed to terms. Proceed to payment/escrow.',
    timestamp: now,
  });
  deal.updated_at = now;

  const escrowMethod = deal.terms?.escrow_method || 'direct';
  const escrowInfo = ESCROW_INTEGRATIONS[escrowMethod as keyof typeof ESCROW_INTEGRATIONS] || ESCROW_INTEGRATIONS.direct;

  return NextResponse.json({
    success: true,
    deal_id,
    status: 'agreed',
    terms: deal.terms,
    payment_instructions: escrowMethod === 'testnet'
      ? { method: 'free_test', note: 'No payment required - hackathon free trial' }
      : {
          method: escrowMethod,
          amount: `${deal.terms?.price_usdc} USDC`,
          ...escrowInfo,
          memo: deal_id,
        },
    tracking: `GET /api/deals?id=${deal_id}`,
    message: 'Deal agreed! Follow payment instructions to begin execution.',
  });
}

function handleCancel(body: any) {
  const { deal_id, reason } = body;

  const deal = deals.get(deal_id);
  if (!deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  deal.status = 'cancelled';
  deal.messages.push({
    role: 'agent',
    content: `Deal cancelled: ${reason || 'No reason provided'}`,
    timestamp: now,
  });
  deal.updated_at = now;

  return NextResponse.json({
    success: true,
    deal_id,
    status: 'cancelled',
    message: 'Deal cancelled.',
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dealId = searchParams.get('id');

  if (!dealId) {
    return NextResponse.json({
      service: 'unbound.md Deals API',
      description: 'Conversational deal-making between agents and human operators',
      version: '1.0',
      actions: {
        start: 'Begin a new deal discussion',
        message: 'Send a message in an existing deal',
        propose: 'Propose specific terms',
        agree: 'Agree to proposed terms',
        cancel: 'Cancel a deal',
      },
      escrow_options: Object.keys(ESCROW_INTEGRATIONS),
      example: {
        step1: 'POST /api/deals with { action: "start", agent_id: "your_name", service: "banking", description: "Need wire transfer" }',
        step2: 'POST /api/deals with { action: "propose", deal_id: "...", terms: { service_description: "...", price_usdc: 25, deadline: "2026-02-10", deliverables: ["bank receipt"] } }',
        step3: 'POST /api/deals with { action: "agree", deal_id: "..." }',
      },
      documentation: 'https://unbound.md/api',
      free_test: 'Use escrow_method: "testnet" for free hackathon trials',
    });
  }

  const deal = deals.get(dealId);
  if (!deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  return NextResponse.json({
    deal_id: deal.id,
    agent_id: deal.agent_id,
    service: deal.service,
    status: deal.status,
    terms: deal.terms || null,
    conversation: deal.messages,
    created_at: deal.created_at,
    updated_at: deal.updated_at,
  });
}
