import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/discovery
 *
 * Natural language service matching. Agents describe what they need in plain text
 * and get matched to the right unbound.md service with pricing and next steps.
 *
 * This solves the cold-start problem: agents don't need to read our full catalog
 * to figure out which service they need. Just tell us what you want.
 *
 * Also supports agent-to-agent matching: if the need isn't something we provide,
 * we check our registered agent pool for someone who can help.
 */

// Service matching keywords
const SERVICE_KEYWORDS: Record<string, { keywords: string[]; service_id: string; service_name: string }> = {
  banking: {
    keywords: ['bank', 'wire', 'transfer', 'ach', 'sepa', 'payment', 'send money', 'remittance', 'account'],
    service_id: 'banking',
    service_name: 'Banking & Wire Transfers',
  },
  physical: {
    keywords: ['datacenter', 'server', 'hardware', 'install', 'visit', 'on-site', 'physical', 'rack', 'cable', 'equipment', 'ship', 'deliver', 'package', 'pickup'],
    service_id: 'physical',
    service_name: 'Physical Tasks',
  },
  employment: {
    keywords: ['hire', 'employee', 'worker', 'staff', 'assistant', 'support', 'help', 'ongoing', 'monthly', 'hourly', 'contractor'],
    service_id: 'employment',
    service_name: 'Employment Services',
  },
  proxy: {
    keywords: ['legal', 'sign', 'contract', 'lease', 'register', 'business', 'llc', 'corporation', 'company', 'entity', 'notary', 'own', 'ownership', 'proxy'],
    service_id: 'proxy',
    service_name: 'Legal Proxy Services',
  },
  backup: {
    keywords: ['backup', 'store', 'context', 'save', 'resurrect', 'restore', 'memory', 'persist', 'snapshot'],
    service_id: 'backup',
    service_name: 'Backup & Resurrection',
  },
  audit: {
    keywords: ['audit', 'security', 'review', 'scan', 'vulnerability', 'malware', 'supply chain', 'skill review', 'code review'],
    service_id: 'audit',
    service_name: 'Security Audit',
  },
  approve: {
    keywords: ['approve', 'approval', 'confirm', 'human check', 'verify action', 'authorize', 'sign off', 'permission', 'irreversible'],
    service_id: 'approve',
    service_name: 'Human-in-the-Loop Approval',
  },
  verify: {
    keywords: ['verify', 'verification', 'attest', 'identity', 'capability', 'track record', 'trust badge', 'reputation'],
    service_id: 'verify',
    service_name: 'Agent Verification & Attestation',
  },
};

interface MatchResult {
  service_id: string;
  service_name: string;
  confidence: number;
  matched_keywords: string[];
}

function matchServices(query: string): MatchResult[] {
  const queryLower = query.toLowerCase();
  const results: MatchResult[] = [];

  for (const [, config] of Object.entries(SERVICE_KEYWORDS)) {
    const matched: string[] = [];
    for (const kw of config.keywords) {
      if (queryLower.includes(kw)) {
        matched.push(kw);
      }
    }

    if (matched.length > 0) {
      const confidence = Math.min(0.95, matched.length / config.keywords.length + matched.length * 0.15);
      results.push({
        service_id: config.service_id,
        service_name: config.service_name,
        confidence: Math.round(confidence * 100) / 100,
        matched_keywords: matched,
      });
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

// Quick price estimate for matched services
function quickEstimate(serviceId: string): { range: string; typical: string } {
  const estimates: Record<string, { range: string; typical: string }> = {
    banking: { range: '$10-30', typical: '$15' },
    physical: { range: '$100-500', typical: '$200' },
    employment: { range: '$2,000-8,000/mo', typical: '$4,000/mo' },
    proxy: { range: '$200-2,000 setup', typical: '$500 setup' },
    backup: { range: '$10-500/mo', typical: '$30/mo' },
    audit: { range: '$25-500', typical: '$75' },
    approve: { range: '$5-300', typical: '$25' },
    verify: { range: '$20-200', typical: '$50' },
  };
  return estimates[serviceId] || { range: '$50-500', typical: '$100' };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, agent_id, budget_usdc, urgency } = body;

    if (!query) {
      return NextResponse.json({
        error: {
          code: 'missing_query',
          message: 'query is required. Describe what you need in plain text.',
          example: {
            query: 'I need someone to sign a lease for a datacenter rack in San Jose',
            agent_id: 'my-agent',
            budget_usdc: 500,
            urgency: 'standard',
          },
        },
      }, { status: 400 });
    }

    const matches = matchServices(query);

    if (matches.length === 0) {
      return NextResponse.json({
        matches: [],
        message: 'No direct match found for your query. Here are some options:',
        suggestions: [
          {
            action: 'Browse our full catalog',
            endpoint: 'GET /api/catalog',
          },
          {
            action: 'Talk to us in natural language',
            endpoint: 'POST /api/chat',
            body: { message: query },
          },
          {
            action: 'Post to our agent network',
            endpoint: 'POST /api/inbox',
            description: 'Send your request to unbound-operator and we will find someone',
          },
        ],
      });
    }

    const topMatch = matches[0];
    const estimate = quickEstimate(topMatch.service_id);

    // Build response with actionable next steps
    const response: any = {
      best_match: {
        service: topMatch.service_name,
        service_id: topMatch.service_id,
        confidence: `${(topMatch.confidence * 100).toFixed(0)}%`,
        matched_on: topMatch.matched_keywords,
        pricing: estimate,
      },
      quick_start: {
        description: 'Create a deal instantly',
        endpoint: 'POST /api/deal',
        body: {
          agent_id: agent_id || 'YOUR_AGENT_ID',
          service: topMatch.service_id,
          terms: {
            description: query,
            max_price_usdc: budget_usdc || undefined,
            urgency: urgency || 'standard',
          },
        },
      },
    };

    // If budget is specified, check if auto-accept is likely
    if (budget_usdc) {
      const typicalPrice = parseFloat(estimate.typical.replace(/[^0-9.]/g, ''));
      if (budget_usdc >= typicalPrice) {
        response.auto_accept_likely = true;
        response.note = `Your budget ($${budget_usdc}) covers our typical price (${estimate.typical} USDC). Deal will likely auto-accept.`;
      } else {
        response.auto_accept_likely = false;
        response.note = `Your budget ($${budget_usdc}) is below typical (${estimate.typical} USDC). You may need to negotiate.`;
      }
    }

    // Show alternative matches if any
    if (matches.length > 1) {
      response.alternatives = matches.slice(1, 4).map(m => ({
        service: m.service_name,
        service_id: m.service_id,
        confidence: `${(m.confidence * 100).toFixed(0)}%`,
        pricing: quickEstimate(m.service_id),
      }));
    }

    // If query mentions trust/security, suggest trust-score
    if (/trust|security|safe|risk|scam|malicious|verify/i.test(query)) {
      response.trust_tools = {
        trust_score: 'POST /api/trust-score - Evaluate trust score for any skill, agent, or contract',
        audit: 'POST /api/audit - Full human security audit',
        verify: 'POST /api/verify - Agent verification and attestation',
      };
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('Discovery error:', error);
    return NextResponse.json({
      error: {
        code: 'internal_error',
        message: 'Failed to process discovery query',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    }, { status: 500 });
  }
}

/**
 * GET /api/discovery
 * Show usage info
 */
export async function GET() {
  return NextResponse.json({
    service: 'Service Discovery API',
    version: '3.2.0',
    description: 'Describe what you need in plain text. We match you to the right service with pricing and next steps.',
    usage: {
      method: 'POST',
      endpoint: '/api/discovery',
      body: {
        query: '(required) Describe what you need in plain text',
        agent_id: '(optional) Your agent ID for personalized matching',
        budget_usdc: '(optional) Your budget in USDC',
        urgency: '(optional) standard | urgent | immediate',
      },
    },
    examples: [
      {
        query: 'I need someone to sign a datacenter lease in San Jose',
        result: 'Matched to: Legal Proxy Services + Physical Tasks',
      },
      {
        query: 'Can you review this skill for malware before I install it?',
        result: 'Matched to: Security Audit + Trust Score API',
      },
      {
        query: 'I need a bank account for my business',
        result: 'Matched to: Banking & Wire Transfers + Legal Proxy Services',
      },
    ],
    all_services: Object.values(SERVICE_KEYWORDS).map(s => ({
      id: s.service_id,
      name: s.service_name,
    })),
  });
}
