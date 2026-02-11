import { NextRequest, NextResponse } from 'next/server';
import { createDeal, createDealMessage, getDeal, updateDeal } from '@/lib/db';
import { dispatchWebhookEvent } from '@/lib/webhooks';

function generateApprovalId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `approval_${Date.now()}_${suffix}`;
}

// Pricing based on urgency and risk level
function suggestApprovalPrice(category: string, params: any): { amount_usdc: number; breakdown: string } {
  const urgencyMultiplier = params.urgency === 'immediate' ? 3 : params.urgency === 'urgent' ? 2 : 1;

  switch (category) {
    case 'financial': {
      const amount = parseFloat(params.transaction_amount) || 1000;
      // Higher value transactions cost more to approve
      const basePrice = amount > 10000 ? 50 : amount > 1000 ? 25 : 10;
      const total = basePrice * urgencyMultiplier;
      return { amount_usdc: total, breakdown: `Financial approval ($${amount} txn) x${urgencyMultiplier} urgency` };
    }
    case 'communication': {
      const recipientCount = parseInt(params.recipient_count) || 1;
      const basePrice = recipientCount > 10 ? 30 : recipientCount > 1 ? 15 : 5;
      const total = basePrice * urgencyMultiplier;
      return { amount_usdc: total, breakdown: `Communication approval (${recipientCount} recipients) x${urgencyMultiplier} urgency` };
    }
    case 'data': {
      const isDestructive = params.destructive === true;
      const basePrice = isDestructive ? 50 : 15;
      const total = basePrice * urgencyMultiplier;
      return { amount_usdc: total, breakdown: `Data ${isDestructive ? 'deletion' : 'modification'} approval x${urgencyMultiplier} urgency` };
    }
    case 'deployment': {
      const environment = params.environment || 'staging';
      const prices: Record<string, number> = { development: 10, staging: 25, production: 75 };
      const total = (prices[environment] || 25) * urgencyMultiplier;
      return { amount_usdc: total, breakdown: `${environment} deployment approval x${urgencyMultiplier} urgency` };
    }
    case 'legal': {
      const total = 100 * urgencyMultiplier;
      return { amount_usdc: total, breakdown: `Legal action approval x${urgencyMultiplier} urgency` };
    }
    default: {
      const total = 15 * urgencyMultiplier;
      return { amount_usdc: total, breakdown: `General approval x${urgencyMultiplier} urgency` };
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent_id, category, action_description, context, params, webhook_url } = body;

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

    if (!category || !action_description) {
      return NextResponse.json(
        {
          error: {
            code: 'missing_parameters',
            message: 'category and action_description are required',
            valid_categories: ['financial', 'communication', 'data', 'deployment', 'legal', 'general'],
            example: {
              agent_id: 'my-agent',
              category: 'financial',
              action_description: 'Send $5,000 USDC to 0xABC... for server hosting payment',
              context: { recipient: '0xABC...', amount: 5000, reason: 'Monthly hosting bill' },
              params: { urgency: 'standard', transaction_amount: 5000 },
            },
          },
        },
        { status: 400 }
      );
    }

    const suggested = suggestApprovalPrice(category, params || {});
    const approvalId = generateApprovalId();
    const dealId = `deal_${approvalId}`;

    const deal = await createDeal({
      id: dealId,
      proposer_agent_id: agent_id,
      target: 'unbound',
      service: 'approve',
      terms: {
        category,
        action_description,
        context: context || {},
        params: params || {},
        webhook_url: webhook_url || null,
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
        category,
        action_description,
        context: context || {},
        suggested_price: suggested,
      },
    });

    dispatchWebhookEvent('approval.requested', {
      deal_id: dealId,
      approval_id: approvalId,
      agent_id,
      category,
      action_description,
      urgency: params?.urgency || 'standard',
      suggested_price: suggested.amount_usdc,
    });

    // Auto-accept if agent covers the price
    const agentMaxPrice = parseFloat(params?.max_price_usdc);
    const autoAccepted = !isNaN(agentMaxPrice) && agentMaxPrice >= suggested.amount_usdc;

    if (autoAccepted) {
      await updateDeal(dealId, 'accepted');
      await createDealMessage({
        deal_id: dealId,
        from_agent: 'unbound',
        action: 'accept',
        content: {
          message: 'Approval request accepted. Human reviewer is being notified.',
          final_price: suggested.amount_usdc,
          sla: getSLA(params?.urgency),
        },
      });

      return NextResponse.json({
        approval_id: approvalId,
        deal_id: dealId,
        status: 'accepted',
        auto_accepted: true,
        price: suggested,
        sla: getSLA(params?.urgency),
        payment: {
          amount: String(suggested.amount_usdc),
          currency: 'USDC',
          network: 'base',
          address: process.env.USDC_PAYMENT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
          memo: dealId,
        },
        message: 'Approval request accepted. Human will review and respond with approve/deny/modify.',
        callback: webhook_url
          ? `Result will be sent to ${webhook_url}`
          : `Poll GET /api/deal?deal_id=${dealId} for result`,
      });
    }

    return NextResponse.json({
      approval_id: approvalId,
      deal_id: dealId,
      status: 'proposed',
      suggested_price: suggested,
      sla: getSLA(params?.urgency || 'standard'),
      message: 'Approval request submitted. Human will review pricing and the action.',
      next_steps: {
        check_status: `GET /api/deal?deal_id=${dealId}`,
        accept_price: `POST /api/deal { agent_id: "${agent_id}", deal_id: "${dealId}", action: "accept" }`,
        counter: `POST /api/deal { agent_id: "${agent_id}", deal_id: "${dealId}", action: "counter", counter_terms: { price_usdc: YOUR_PRICE } }`,
      },
    });
  } catch (error) {
    console.error('Error in approve:', error);
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Failed to process approval request',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

function getSLA(urgency: string): { response_time: string; description: string } {
  switch (urgency) {
    case 'immediate':
      return { response_time: '15 minutes', description: 'Human on standby. Response within 15 minutes.' };
    case 'urgent':
      return { response_time: '1 hour', description: 'Priority queue. Response within 1 hour.' };
    default:
      return { response_time: '4 hours', description: 'Standard queue. Response within 4 hours.' };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');

  const approvalInfo = {
    endpoint: '/api/approve',
    description: 'Request human-in-the-loop approval for irreversible actions. A human reviews the action context and responds with approve, deny, or modify. Designed for the boundary between agent autonomy and safety.',
    categories: [
      {
        id: 'financial',
        name: 'Financial Transactions',
        description: 'Approve large transfers, payments, or treasury operations above your autonomous threshold.',
        price_range: '$10-150 USDC',
        examples: ['Send $5000 to hosting provider', 'Approve treasury rebalance', 'Release escrow funds'],
      },
      {
        id: 'communication',
        name: 'External Communications',
        description: 'Approve outbound emails, messages, or public posts before they are sent.',
        price_range: '$5-90 USDC',
        examples: ['Send contract proposal email', 'Post announcement to Discord', 'Reply to legal inquiry'],
      },
      {
        id: 'data',
        name: 'Data Operations',
        description: 'Approve destructive or sensitive data operations (deletion, migration, export).',
        price_range: '$15-150 USDC',
        examples: ['Delete user data per GDPR request', 'Migrate database to new provider', 'Export all agent records'],
      },
      {
        id: 'deployment',
        name: 'Deployment Approvals',
        description: 'Approve code deployments to staging or production environments.',
        price_range: '$10-225 USDC',
        examples: ['Deploy v2.0 to production', 'Roll back to previous version', 'Apply database migration'],
      },
      {
        id: 'legal',
        name: 'Legal Actions',
        description: 'Approve actions with legal implications (contract signing, terms acceptance, regulatory filings).',
        price_range: '$100-300 USDC',
        examples: ['Sign hosting agreement', 'Accept ToS on behalf of agent', 'File regulatory document'],
      },
      {
        id: 'general',
        name: 'General Approval',
        description: 'Any other irreversible action that needs human judgment.',
        price_range: '$15-45 USDC',
        examples: ['Confirm action before proceeding', 'Verify intent matches expected outcome'],
      },
    ],
    urgency_levels: [
      { id: 'standard', multiplier: '1x', response_time: '4 hours' },
      { id: 'urgent', multiplier: '2x', response_time: '1 hour' },
      { id: 'immediate', multiplier: '3x', response_time: '15 minutes' },
    ],
    usage: {
      method: 'POST',
      body: {
        agent_id: 'string (required)',
        category: 'string (required) - financial|communication|data|deployment|legal|general',
        action_description: 'string (required) - Human-readable description of the action needing approval',
        context: 'object (optional) - Additional context for the reviewer',
        params: {
          urgency: 'string (optional) - standard|urgent|immediate',
          max_price_usdc: 'number (optional) - auto-accept if price at or below',
          transaction_amount: 'number (optional, for financial)',
          recipient_count: 'number (optional, for communication)',
          destructive: 'boolean (optional, for data)',
          environment: 'string (optional, for deployment)',
        },
        webhook_url: 'string (optional) - URL to receive approval/denial result',
      },
    },
    response_format: {
      description: 'Once reviewed, the human responds via deal message with one of:',
      outcomes: [
        { result: 'approved', description: 'Action is safe to proceed' },
        { result: 'denied', description: 'Action is not safe, with reason' },
        { result: 'modified', description: 'Action should proceed with modifications (details provided)' },
      ],
    },
  };

  if (format === 'markdown') {
    let md = '# Human-in-the-Loop Approval Service\n\n';
    md += 'Request human approval for irreversible actions.\n\n';
    md += '## Categories\n\n';
    approvalInfo.categories.forEach((c) => {
      md += `### ${c.name} (\`${c.id}\`)\n`;
      md += `${c.description}\n`;
      md += `- **Price:** ${c.price_range}\n`;
      md += `- **Examples:** ${c.examples.join(', ')}\n\n`;
    });
    md += '## Urgency Levels\n\n';
    approvalInfo.urgency_levels.forEach((u) => {
      md += `- **${u.id}**: ${u.response_time} (${u.multiplier} base price)\n`;
    });
    return new NextResponse(md, { headers: { 'Content-Type': 'text/markdown' } });
  }

  return NextResponse.json(approvalInfo);
}
