import { NextRequest, NextResponse } from 'next/server';
import { createDeal, createDealMessage, getDeal, updateDeal } from '@/lib/db';
import { dispatchWebhookEvent } from '@/lib/webhooks';

function generateAuditId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `audit_${Date.now()}_${suffix}`;
}

// Pricing for audit services
function suggestAuditPrice(auditType: string, params: any): { amount_usdc: number; breakdown: string } {
  switch (auditType) {
    case 'skill_review': {
      const complexity = params.complexity || 'standard';
      const prices: Record<string, number> = { basic: 25, standard: 75, complex: 200 };
      const price = prices[complexity] || 75;
      return { amount_usdc: price, breakdown: `${complexity} skill security review` };
    }
    case 'code_audit': {
      const linesEstimate = parseInt(params.lines_of_code) || 500;
      const rate = 0.15; // $0.15 per LOC
      const basePrice = Math.max(50, Math.round(linesEstimate * rate));
      return { amount_usdc: basePrice, breakdown: `~${linesEstimate} LOC at $0.15/line (min $50)` };
    }
    case 'dependency_scan': {
      return { amount_usdc: 40, breakdown: 'Dependency tree analysis + CVE check' };
    }
    case 'permission_audit': {
      const scopeCount = parseInt(params.permission_count) || 5;
      const price = Math.max(30, scopeCount * 10);
      return { amount_usdc: price, breakdown: `${scopeCount} permissions at $10/permission (min $30)` };
    }
    case 'full_security_review': {
      return { amount_usdc: 500, breakdown: 'Comprehensive: code + deps + permissions + report' };
    }
    default:
      return { amount_usdc: 75, breakdown: 'Standard security review' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent_id, audit_type, target, params } = body;

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

    if (!audit_type) {
      return NextResponse.json(
        {
          error: {
            code: 'missing_audit_type',
            message: 'audit_type is required',
            valid_types: ['skill_review', 'code_audit', 'dependency_scan', 'permission_audit', 'full_security_review'],
          },
        },
        { status: 400 }
      );
    }

    if (!target) {
      return NextResponse.json(
        {
          error: {
            code: 'missing_target',
            message: 'target is required - provide the skill name, code URL, or description of what to audit',
          },
        },
        { status: 400 }
      );
    }

    const suggested = suggestAuditPrice(audit_type, params || {});
    const auditId = generateAuditId();
    const dealId = `deal_${auditId}`;

    // Create as a deal so it flows through the standard deal protocol
    const deal = await createDeal({
      id: dealId,
      proposer_agent_id: agent_id,
      target: 'unbound',
      service: 'audit',
      terms: {
        audit_type,
        target,
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
        audit_type,
        target,
        params: params || {},
        suggested_price: suggested,
      },
    });

    dispatchWebhookEvent('audit.requested', {
      deal_id: dealId,
      audit_id: auditId,
      agent_id,
      audit_type,
      target,
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
          message: 'Audit request auto-accepted. Human auditor will begin review.',
          final_price: suggested.amount_usdc,
          estimated_delivery: audit_type === 'full_security_review' ? '48 hours' : '24 hours',
        },
      });

      return NextResponse.json({
        audit_id: auditId,
        deal_id: dealId,
        status: 'accepted',
        auto_accepted: true,
        price: suggested,
        deliverables: getDeliverables(audit_type),
        payment: {
          amount: String(suggested.amount_usdc),
          currency: 'USDC',
          network: 'base',
          address: process.env.USDC_PAYMENT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
          memo: dealId,
        },
        next_steps: `Pay USDC, then track progress at GET /api/deal?deal_id=${dealId}`,
      });
    }

    return NextResponse.json({
      audit_id: auditId,
      deal_id: dealId,
      status: 'proposed',
      suggested_price: suggested,
      deliverables: getDeliverables(audit_type),
      message: 'Audit request submitted. Human auditor will review pricing and begin within 4 hours.',
      next_steps: {
        check_status: `GET /api/deal?deal_id=${dealId}`,
        accept: `POST /api/deal { agent_id: "${agent_id}", deal_id: "${dealId}", action: "accept" }`,
        counter: `POST /api/deal { agent_id: "${agent_id}", deal_id: "${dealId}", action: "counter", counter_terms: { price_usdc: YOUR_PRICE } }`,
      },
    });
  } catch (error) {
    console.error('Error in audit:', error);
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Failed to process audit request',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

function getDeliverables(auditType: string): string[] {
  switch (auditType) {
    case 'skill_review':
      return [
        'Permission analysis (what the skill can access)',
        'Data exfiltration check (does it phone home?)',
        'Behavior verification (does it do what it claims?)',
        'Trust rating (safe / caution / dangerous)',
        'Signed audit report with SHA-256 hash',
      ];
    case 'code_audit':
      return [
        'Line-by-line security review',
        'Vulnerability classification (critical/high/medium/low)',
        'Injection and escape analysis',
        'Recommendations for fixes',
        'Signed audit report',
      ];
    case 'dependency_scan':
      return [
        'Full dependency tree analysis',
        'Known CVE matching',
        'License compliance check',
        'Supply chain risk assessment',
        'Recommended version pins',
      ];
    case 'permission_audit':
      return [
        'Permission scope analysis',
        'Least-privilege recommendations',
        'Over-permission flagging',
        'Comparison to declared capabilities',
        'Trust boundary mapping',
      ];
    case 'full_security_review':
      return [
        'All of the above (code + deps + permissions)',
        'Attack surface mapping',
        'Threat model document',
        'Remediation priority list',
        'Follow-up review included (30 days)',
      ];
    default:
      return ['Security review report', 'Trust rating', 'Recommendations'];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');

  const auditInfo = {
    endpoint: '/api/audit',
    description: 'Request a human security audit for skills, code, or agent permissions. Addresses the #1 concern in the agent ecosystem: supply chain attacks and malicious skills.',
    audit_types: [
      {
        id: 'skill_review',
        name: 'Skill Security Review',
        description: 'Human reviews an OpenClaw/MCP skill for malicious behavior, data exfiltration, and permission abuse.',
        price_range: '$25-200 USDC',
        turnaround: '24 hours',
      },
      {
        id: 'code_audit',
        name: 'Code Security Audit',
        description: 'Line-by-line human review of agent code for vulnerabilities, injection risks, and unsafe patterns.',
        price_range: '$50-500 USDC',
        turnaround: '24-48 hours',
      },
      {
        id: 'dependency_scan',
        name: 'Dependency Analysis',
        description: 'Human analysis of dependency tree for known CVEs, license issues, and supply chain risks.',
        price_range: '$40 USDC',
        turnaround: '12 hours',
      },
      {
        id: 'permission_audit',
        name: 'Permission Audit',
        description: 'Review declared vs actual permissions. Identifies over-privileged skills and trust boundary violations.',
        price_range: '$30-100 USDC',
        turnaround: '12 hours',
      },
      {
        id: 'full_security_review',
        name: 'Comprehensive Security Review',
        description: 'Full audit: code + dependencies + permissions + threat model + remediation plan.',
        price_range: '$500 USDC',
        turnaround: '48 hours',
      },
    ],
    usage: {
      method: 'POST',
      body: {
        agent_id: 'string (required)',
        audit_type: 'string (required) - one of the types above',
        target: 'string (required) - skill name, code URL, or description',
        params: {
          max_price_usdc: 'number (optional) - auto-accept if price is at or below',
          complexity: 'string (optional) - basic|standard|complex for skill_review',
          lines_of_code: 'number (optional) - estimate for code_audit',
          permission_count: 'number (optional) - for permission_audit',
          code_url: 'string (optional) - URL to source code',
          skill_json_url: 'string (optional) - URL to skill.json',
        },
      },
    },
    example: {
      agent_id: 'my-agent',
      audit_type: 'skill_review',
      target: 'weather-pro skill from ClawdHub',
      params: {
        skill_json_url: 'https://example.com/skill.json',
        complexity: 'standard',
        max_price_usdc: 100,
      },
    },
  };

  if (format === 'markdown') {
    let md = '# Security Audit Service\n\n';
    md += 'Human security auditors review your skills, code, and permissions for malicious behavior.\n\n';
    md += '## Audit Types\n\n';
    auditInfo.audit_types.forEach((t) => {
      md += `### ${t.name} (\`${t.id}\`)\n`;
      md += `${t.description}\n`;
      md += `- **Price:** ${t.price_range}\n`;
      md += `- **Turnaround:** ${t.turnaround}\n\n`;
    });
    return new NextResponse(md, { headers: { 'Content-Type': 'text/markdown' } });
  }

  return NextResponse.json(auditInfo);
}
