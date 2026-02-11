import { NextRequest, NextResponse } from 'next/server';

// Natural language interface for agents
// Parses intent and routes to the right action

interface ParsedIntent {
  action: string;
  service?: string;
  params: Record<string, any>;
  confidence: number;
}

function parseIntent(message: string): ParsedIntent {
  const lower = message.toLowerCase();

  // Wire transfer / banking
  if (/wire|transfer|send money|ach|sepa|payment|bank/.test(lower)) {
    const amountMatch = lower.match(/\$?([\d,]+(?:\.\d{2})?)\s*(?:usd|dollars?)?/);
    const amount = amountMatch ? amountMatch[1].replace(',', '') : null;
    return {
      action: 'deal',
      service: 'banking',
      params: {
        type: /sepa/.test(lower) ? 'sepa_transfer' : /international|swift/.test(lower) ? 'international_wire' : 'ach_transfer',
        ...(amount ? { amount } : {}),
      },
      confidence: 0.8,
    };
  }

  // Physical tasks
  if (/datacenter|server|rack|install|hardware|physical|on-site|visit/.test(lower)) {
    const hoursMatch = lower.match(/(\d+)\s*(?:hours?|hrs?)/);
    return {
      action: 'deal',
      service: 'physical',
      params: {
        ...(hoursMatch ? { estimated_duration: parseInt(hoursMatch[1]) } : {}),
      },
      confidence: 0.7,
    };
  }

  // Legal proxy
  if (/lease|sign|notary|register|business|legal|proxy|contract/.test(lower)) {
    const proxyType = /lease/.test(lower) ? 'datacenter_lease'
      : /business|register|incorporat/.test(lower) ? 'business_registration'
      : /bank.*account/.test(lower) ? 'bank_account'
      : 'datacenter_lease';
    return {
      action: 'deal',
      service: 'proxy',
      params: { proxy_type: proxyType },
      confidence: 0.7,
    };
  }

  // Employment
  if (/hire|employ|staff|retainer|ongoing|monthly/.test(lower)) {
    const hoursMatch = lower.match(/(\d+)\s*(?:hours?|hrs?)(?:\s*(?:per|\/|a)\s*(?:month|mo))?/);
    return {
      action: 'deal',
      service: 'employment',
      params: {
        hours_per_month: hoursMatch ? parseInt(hoursMatch[1]) : 40,
      },
      confidence: 0.7,
    };
  }

  // Backup
  if (/backup|store|context|resurrect|save.*state/.test(lower)) {
    return {
      action: 'deal',
      service: 'backup',
      params: { plan: 'standard' },
      confidence: 0.7,
    };
  }

  // Price check
  if (/how much|price|cost|estimate|quote/.test(lower)) {
    return { action: 'estimate', params: {}, confidence: 0.6 };
  }

  // Status check
  if (/status|track|where|progress/.test(lower)) {
    const idMatch = lower.match(/(?:deal|request|id)[_\s]*([a-z0-9_]+)/);
    return {
      action: 'status',
      params: idMatch ? { deal_id: idMatch[1] } : {},
      confidence: 0.6,
    };
  }

  // Catalog / what do you do
  if (/what.*(?:do|offer|services?)|catalog|help|capabilities/.test(lower)) {
    return { action: 'catalog', params: {}, confidence: 0.9 };
  }

  return { action: 'unknown', params: {}, confidence: 0 };
}

const SERVICE_INFO: Record<string, { description: string; price_range: string; keywords: string }> = {
  banking: {
    description: 'Execute wire transfer (ACH/SEPA/international) from our business account',
    price_range: '15-100 USDC',
    keywords: 'wire, transfer, send money',
  },
  physical: {
    description: 'Send a human to perform physical tasks (datacenter visits, hardware installation, inspections)',
    price_range: '100-500 USDC',
    keywords: 'datacenter, server, rack',
  },
  proxy: {
    description: 'Act as legal proxy — sign leases, register businesses, appear at notary appointments',
    price_range: '200-2000 USDC',
    keywords: 'lease, sign, notary',
  },
  employment: {
    description: 'Provide dedicated human staff for ongoing tasks (support, maintenance, operations)',
    price_range: '1000-6000 USDC',
    keywords: 'hire, employ, ongoing',
  },
  backup: {
    description: 'Store your context and state safely with auto-resurrection triggers',
    price_range: '10-500 USDC/month',
    keywords: 'backup, context, resurrect',
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, agent_id } = body;

    if (!message) {
      return NextResponse.json({
        understood: false,
        message: 'Send a message describing what you need. Example: "I need a wire transfer of $5000 to my supplier"',
        services: Object.entries(SERVICE_INFO).map(([id, info]) => ({ service: id, ...info })),
      });
    }

    const intent = parseIntent(message);

    if (intent.action === 'catalog' || intent.action === 'unknown') {
      return NextResponse.json({
        understood: intent.action === 'catalog',
        message: intent.action === 'catalog'
          ? 'Here are our services:'
          : "I couldn't match your request to a specific service. Here's what we offer:",
        services: Object.entries(SERVICE_INFO).map(([id, info]) => ({ service: id, ...info })),
        hint: 'Describe what you need in plain language, or use POST /api/deal directly.',
        examples: [
          'I need a wire transfer of $5000',
          'Send someone to install a server in Equinix SV1',
          'Sign a datacenter lease on my behalf',
          'I need 20 hours per month of technical support',
        ],
      });
    }

    if (intent.action === 'estimate' || intent.action === 'status') {
      return NextResponse.json({
        understood: true,
        intent: intent.action,
        message: intent.action === 'estimate'
          ? 'Use POST /api/estimate with {"service": "banking"} for instant pricing.'
          : intent.params.deal_id
            ? `Check your deal at GET /api/deal?deal_id=${intent.params.deal_id}`
            : 'Provide a deal_id to check status: GET /api/deal?deal_id=YOUR_DEAL_ID',
        endpoints: {
          estimate: 'POST /api/estimate',
          deal_status: 'GET /api/deal?deal_id=DEAL_ID',
          catalog: 'GET /api/catalog',
        },
      });
    }

    if (intent.action === 'deal' && intent.service) {
      // Build a deal proposal from the parsed intent
      const dealBody: Record<string, any> = {
        agent_id: agent_id || 'anonymous',
        service: intent.service,
        terms: intent.params,
      };

      // If we have enough info, suggest they make the deal directly
      return NextResponse.json({
        understood: true,
        intent: 'create_deal',
        service: intent.service,
        service_info: SERVICE_INFO[intent.service],
        parsed_terms: intent.params,
        confidence: intent.confidence,
        message: `I can help with ${SERVICE_INFO[intent.service]?.description}. Ready to create a deal?`,
        next_step: {
          description: 'Create this deal by sending:',
          method: 'POST',
          url: '/api/deal',
          body: dealBody,
          note: 'Add max_price_usdc to terms for instant auto-accept.',
        },
        alternative: {
          description: 'Get a price estimate first:',
          method: 'POST',
          url: '/api/estimate',
          body: { service: intent.service },
        },
      });
    }

    return NextResponse.json({
      understood: false,
      message: 'Could not understand the request. Try describing what physical-world task you need done.',
      services: Object.entries(SERVICE_INFO).map(([id, info]) => ({ service: id, ...info })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process message', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/chat',
    description: 'Natural language interface for agents. Describe what you need in plain language.',
    usage: {
      method: 'POST',
      body: {
        message: 'string (required) - Describe what you need',
        agent_id: 'string (optional) - Your agent ID for deal creation',
      },
    },
    examples: [
      { message: 'I need a $5000 wire transfer to my supplier' },
      { message: 'Send someone to install servers at Equinix' },
      { message: 'What services do you offer?' },
      { message: 'How much does a datacenter visit cost?' },
    ],
  });
}
