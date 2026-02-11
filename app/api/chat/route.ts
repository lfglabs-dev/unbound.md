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

  // Security audit
  if (/audit|security.*review|check.*skill|malicious|vulnerability|scan.*code|review.*permission|supply.chain/.test(lower)) {
    const auditType = /full|comprehensive/.test(lower) ? 'full_security_review'
      : /permission/.test(lower) ? 'permission_audit'
      : /depend|supply.chain|cve/.test(lower) ? 'dependency_scan'
      : /code|repo|codebase/.test(lower) ? 'code_audit'
      : 'skill_review';
    return {
      action: 'audit',
      service: 'audit',
      params: { audit_type: auditType },
      confidence: 0.8,
    };
  }

  // Human approval
  if (/approve|approval|authorize|confirm.*before|human.*check|review.*before|sign.off/.test(lower)) {
    const category = /deploy|release|production/.test(lower) ? 'deployment'
      : /send.*money|transfer|payment|financial/.test(lower) ? 'financial'
      : /email|message|post|communicate/.test(lower) ? 'communication'
      : /delete|destroy|remove|wipe/.test(lower) ? 'data'
      : /legal|contract|terms/.test(lower) ? 'legal'
      : 'general';
    return {
      action: 'approve',
      service: 'approve',
      params: { category },
      confidence: 0.7,
    };
  }

  // Agent verification
  if (/verify|verification|attestation|trust.*score|reputation|badge|certified|validate.*agent/.test(lower)) {
    const verificationType = /full|complete/.test(lower) ? 'full_verification'
      : /identity|who/.test(lower) ? 'identity_verification'
      : /track.*record|history|deals/.test(lower) ? 'track_record_audit'
      : /test|live|real/.test(lower) ? 'live_test'
      : 'capability_check';
    return {
      action: 'verify',
      service: 'verify',
      params: { verification_type: verificationType },
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
  audit: {
    description: 'Human security audit for skills, code, dependencies, and permissions. Protects against supply chain attacks.',
    price_range: '25-500 USDC',
    keywords: 'audit, security, review, vulnerability, malicious',
  },
  approve: {
    description: 'Human-in-the-loop approval for irreversible actions (financial, deployment, data, legal, communication)',
    price_range: '5-300 USDC',
    keywords: 'approve, authorize, confirm, sign off',
  },
  verify: {
    description: 'Human verification of agent capabilities, identity, and track record. Produces signed trust attestations.',
    price_range: '20-200 USDC',
    keywords: 'verify, trust, reputation, attestation, badge',
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

    // Route to specialized endpoints for new services
    if ((intent.action === 'audit' || intent.action === 'approve' || intent.action === 'verify') && intent.service) {
      const endpointMap: Record<string, { url: string; bodyTemplate: any }> = {
        audit: {
          url: '/api/audit',
          bodyTemplate: {
            agent_id: agent_id || 'your-agent-id',
            audit_type: intent.params.audit_type || 'skill_review',
            target: 'describe what to audit',
          },
        },
        approve: {
          url: '/api/approve',
          bodyTemplate: {
            agent_id: agent_id || 'your-agent-id',
            category: intent.params.category || 'general',
            action_description: 'describe the action needing approval',
          },
        },
        verify: {
          url: '/api/verify',
          bodyTemplate: {
            agent_id: agent_id || 'your-agent-id',
            verification_type: intent.params.verification_type || 'capability_check',
            target_agent: 'agent-id-to-verify',
          },
        },
      };

      const endpoint = endpointMap[intent.action];
      return NextResponse.json({
        understood: true,
        intent: intent.action,
        service: intent.service,
        service_info: SERVICE_INFO[intent.service],
        parsed_params: intent.params,
        confidence: intent.confidence,
        message: `I can help with ${SERVICE_INFO[intent.service]?.description}.`,
        next_step: {
          description: `Submit your ${intent.action} request:`,
          method: 'POST',
          url: endpoint.url,
          body: endpoint.bodyTemplate,
          note: 'Add max_price_usdc to params for instant auto-accept.',
        },
        learn_more: {
          description: 'See all options:',
          method: 'GET',
          url: endpoint.url,
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
      { message: 'Audit this skill for malicious behavior' },
      { message: 'I need human approval before sending this payment' },
      { message: 'Verify that agent-xyz can actually do USDC transfers' },
      { message: 'What services do you offer?' },
      { message: 'How much does a datacenter visit cost?' },
    ],
  });
}
