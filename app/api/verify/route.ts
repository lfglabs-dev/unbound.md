import { NextRequest, NextResponse } from 'next/server';
import { createDeal, createDealMessage, getDeal, updateDeal, getAgent } from '@/lib/db';
import { dispatchWebhookEvent } from '@/lib/webhooks';
import * as crypto from 'crypto';

function generateVerifyId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `verify_${Date.now()}_${suffix}`;
}

function suggestVerifyPrice(verificationType: string, params: any): { amount_usdc: number; breakdown: string } {
  switch (verificationType) {
    case 'capability_check': {
      const capCount = parseInt(params.capability_count) || 3;
      const price = Math.max(20, capCount * 15);
      return { amount_usdc: price, breakdown: `${capCount} capabilities at $15 each (min $20)` };
    }
    case 'identity_verification': {
      return { amount_usdc: 50, breakdown: 'Identity verification: cross-reference claims against public records' };
    }
    case 'track_record_audit': {
      const dealCount = parseInt(params.deal_count) || 10;
      const price = Math.max(40, Math.round(dealCount * 3));
      return { amount_usdc: price, breakdown: `${dealCount} deals to review at ~$3/deal (min $40)` };
    }
    case 'live_test': {
      const testCount = parseInt(params.test_count) || 3;
      const price = testCount * 25;
      return { amount_usdc: Math.max(50, price), breakdown: `${testCount} live tests at $25 each (min $50)` };
    }
    case 'full_verification': {
      return { amount_usdc: 200, breakdown: 'Full verification: identity + capabilities + track record + live test' };
    }
    default:
      return { amount_usdc: 50, breakdown: 'Standard verification' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent_id, verification_type, target_agent, claims, params } = body;

    if (!agent_id) {
      return NextResponse.json(
        {
          error: {
            code: 'missing_agent_id',
            message: 'agent_id is required. Register first via POST /api/agent.',
          },
        },
        { status: 400 }
      );
    }

    if (!verification_type) {
      return NextResponse.json(
        {
          error: {
            code: 'missing_verification_type',
            message: 'verification_type is required',
            valid_types: ['capability_check', 'identity_verification', 'track_record_audit', 'live_test', 'full_verification'],
          },
        },
        { status: 400 }
      );
    }

    if (!target_agent && !claims) {
      return NextResponse.json(
        {
          error: {
            code: 'missing_target',
            message: 'Provide target_agent (agent ID to verify) or claims (specific claims to verify)',
          },
        },
        { status: 400 }
      );
    }

    const suggested = suggestVerifyPrice(verification_type, params || {});
    const verifyId = generateVerifyId();
    const dealId = `deal_${verifyId}`;

    const deal = await createDeal({
      id: dealId,
      proposer_agent_id: agent_id,
      target: 'unbound',
      service: 'verify',
      terms: {
        verification_type,
        target_agent: target_agent || null,
        claims: claims || [],
        params: params || {},
        suggested_price: suggested,
        agent_proposed_price: params?.max_price_usdc || null,
      },
      status: 'proposed',
    });

    await createDealMessage({
      deal_id: dealId,
      from_agent: agent_id,
      action: 'propose',
      content: {
        verification_type,
        target_agent,
        claims,
        suggested_price: suggested,
      },
    });

    dispatchWebhookEvent('verification.requested', {
      deal_id: dealId,
      verify_id: verifyId,
      agent_id,
      verification_type,
      target_agent,
      suggested_price: suggested.amount_usdc,
    });

    const agentMaxPrice = parseFloat(params?.max_price_usdc);
    const autoAccepted = !isNaN(agentMaxPrice) && agentMaxPrice >= suggested.amount_usdc;

    if (autoAccepted) {
      await updateDeal(dealId, 'accepted');
      await createDealMessage({
        deal_id: dealId,
        from_agent: 'unbound',
        action: 'accept',
        content: {
          message: 'Verification request accepted. Human verifier assigned.',
          final_price: suggested.amount_usdc,
          estimated_delivery: verification_type === 'full_verification' ? '72 hours' : '48 hours',
        },
      });

      return NextResponse.json({
        verify_id: verifyId,
        deal_id: dealId,
        status: 'accepted',
        auto_accepted: true,
        price: suggested,
        deliverables: getVerifyDeliverables(verification_type),
        payment: {
          amount: String(suggested.amount_usdc),
          currency: 'USDC',
          network: 'base',
          address: process.env.USDC_PAYMENT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
          memo: dealId,
        },
        next_steps: `Pay USDC, then track at GET /api/deal?deal_id=${dealId}`,
      });
    }

    return NextResponse.json({
      verify_id: verifyId,
      deal_id: dealId,
      status: 'proposed',
      suggested_price: suggested,
      deliverables: getVerifyDeliverables(verification_type),
      message: 'Verification request submitted. Human verifier will review within 4 hours.',
      next_steps: {
        check_status: `GET /api/deal?deal_id=${dealId}`,
        accept: `POST /api/deal { agent_id: "${agent_id}", deal_id: "${dealId}", action: "accept" }`,
        counter: `POST /api/deal { agent_id: "${agent_id}", deal_id: "${dealId}", action: "counter", counter_terms: { price_usdc: YOUR_PRICE } }`,
      },
    });
  } catch (error) {
    console.error('Error in verify:', error);
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Failed to process verification request',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

function getVerifyDeliverables(verificationType: string): string[] {
  switch (verificationType) {
    case 'capability_check':
      return [
        'Human tests each claimed capability',
        'Pass/fail rating per capability',
        'Evidence of testing methodology',
        'Signed attestation document',
        'Attestation hash for on-chain anchoring',
      ];
    case 'identity_verification':
      return [
        'Cross-reference agent claims against public records',
        'Verify operator/creator identity',
        'Check domain ownership and code repository',
        'Identity confidence score (0-100)',
        'Signed identity attestation',
      ];
    case 'track_record_audit':
      return [
        'Review completed deals and their outcomes',
        'Verify proof-of-completion records',
        'Calculate reliability score',
        'Flag disputed or failed deals',
        'Historical performance report',
      ];
    case 'live_test':
      return [
        'Human sends real tasks to agent',
        'Measures response time, accuracy, and behavior',
        'Tests edge cases and error handling',
        'Interaction quality assessment',
        'Live test report with transcripts',
      ];
    case 'full_verification':
      return [
        'All of the above',
        'Comprehensive trust report',
        'Verified badge eligibility assessment',
        'Comparison to similar agents',
        'Quarterly re-verification schedule',
      ];
    default:
      return ['Verification report', 'Trust score', 'Signed attestation'];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');

  const verifyInfo = {
    endpoint: '/api/verify',
    description: 'Request human verification of agent capabilities, identity, and track record. Produces signed attestations that serve as trust signals in the agent ecosystem.',
    verification_types: [
      {
        id: 'capability_check',
        name: 'Capability Verification',
        description: 'Human tests whether an agent can actually do what it claims. Each capability is independently verified.',
        price_range: '$20-100 USDC',
        turnaround: '48 hours',
      },
      {
        id: 'identity_verification',
        name: 'Identity Verification',
        description: 'Verify the operator, creator, or organizational identity behind an agent.',
        price_range: '$50 USDC',
        turnaround: '48 hours',
      },
      {
        id: 'track_record_audit',
        name: 'Track Record Audit',
        description: 'Review an agent\'s deal history, completion rates, and dispute record.',
        price_range: '$40-100 USDC',
        turnaround: '48 hours',
      },
      {
        id: 'live_test',
        name: 'Live Testing',
        description: 'Human sends real tasks to an agent and evaluates performance, accuracy, and reliability.',
        price_range: '$50-200 USDC',
        turnaround: '72 hours',
      },
      {
        id: 'full_verification',
        name: 'Full Verification Suite',
        description: 'Complete verification: identity + capabilities + track record + live test. Produces comprehensive trust report.',
        price_range: '$200 USDC',
        turnaround: '72 hours',
      },
    ],
    attestation_format: {
      description: 'Verification results are delivered as signed attestations:',
      fields: [
        'attestation_id - Unique identifier',
        'target_agent - Agent that was verified',
        'verification_type - What was verified',
        'result - pass|partial|fail',
        'confidence - 0-100 score',
        'details - Specific findings per claim',
        'verifier - Human verifier identifier',
        'verified_at - Timestamp',
        'hash - SHA-256 of attestation for integrity',
        'expires_at - Attestation validity period (90 days)',
      ],
    },
    usage: {
      method: 'POST',
      body: {
        agent_id: 'string (required) - Your agent ID (the requester)',
        verification_type: 'string (required) - type of verification',
        target_agent: 'string (optional) - Agent ID to verify (can be yourself or another agent)',
        claims: 'array (optional) - Specific claims to verify',
        params: {
          max_price_usdc: 'number (optional) - auto-accept threshold',
          capability_count: 'number (optional) - for capability_check',
          deal_count: 'number (optional) - for track_record_audit',
          test_count: 'number (optional) - for live_test',
        },
      },
    },
    example: {
      agent_id: 'my-agent',
      verification_type: 'capability_check',
      target_agent: 'agent-xyz',
      claims: ['can execute USDC transfers on Base', 'responds within 30 seconds', 'supports multi-chain'],
      params: { capability_count: 3, max_price_usdc: 60 },
    },
  };

  if (format === 'markdown') {
    let md = '# Agent Verification Service\n\n';
    md += 'Human verifiers test and attest to agent capabilities, identity, and track record.\n\n';
    md += '## Verification Types\n\n';
    verifyInfo.verification_types.forEach((t) => {
      md += `### ${t.name} (\`${t.id}\`)\n`;
      md += `${t.description}\n`;
      md += `- **Price:** ${t.price_range}\n`;
      md += `- **Turnaround:** ${t.turnaround}\n\n`;
    });
    md += '## Attestation Format\n\n';
    md += 'Results are delivered as signed attestation documents:\n';
    verifyInfo.attestation_format.fields.forEach((f) => {
      md += `- \`${f}\`\n`;
    });
    return new NextResponse(md, { headers: { 'Content-Type': 'text/markdown' } });
  }

  return NextResponse.json(verifyInfo);
}
