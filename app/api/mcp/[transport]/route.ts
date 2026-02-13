import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import {
  registerAgent,
  getAgent,
  listAgents,
  createDeal,
  getDeal,
  updateDeal,
  listDeals,
  createDealMessage,
  getDealMessages,
} from '@/lib/db';

function generateDealId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `deal_${Date.now()}_${suffix}`;
}

function suggestPrice(service: string, terms: Record<string, any>): { amount_usdc: number; breakdown: string } {
  switch (service) {
    case 'banking': {
      const amount = parseFloat(terms.amount) || 1000;
      const type = terms.type || 'ach_transfer';
      const fees: Record<string, { base: number; pct: number }> = {
        ach_transfer: { base: 10, pct: 1.0 },
        sepa_transfer: { base: 5, pct: 1.0 },
        international_wire: { base: 25, pct: 1.5 },
      };
      const fee = fees[type] || fees.ach_transfer;
      const total = fee.base + (amount * fee.pct) / 100;
      return { amount_usdc: Math.round(total * 100) / 100, breakdown: `base: $${fee.base} + ${fee.pct}% of $${amount}` };
    }
    case 'physical': {
      const hours = parseFloat(terms.estimated_duration) || 2;
      const rate = 50;
      const total = hours * rate * 1.15;
      return { amount_usdc: Math.round(total * 100) / 100, breakdown: `${hours}h x $${rate}/hr + 15% platform fee` };
    }
    case 'employment': {
      const hoursPerMonth = parseFloat(terms.hours_per_month) || 40;
      const rate = 50;
      const total = hoursPerMonth * rate * 1.15;
      return { amount_usdc: Math.round(total * 100) / 100, breakdown: `${hoursPerMonth}h/mo x $${rate}/hr + 15% fee` };
    }
    case 'proxy': {
      const setupFees: Record<string, number> = {
        datacenter_lease: 500, business_registration: 1000, bank_account: 500,
        equipment_ownership: 200, real_estate_lease: 750,
      };
      const setup = setupFees[terms.proxy_type] || 500;
      return { amount_usdc: setup, breakdown: `Setup fee for ${terms.proxy_type || 'proxy service'}` };
    }
    case 'backup': {
      const prices: Record<string, number> = { basic: 10, standard: 30, premium: 100, enterprise: 500 };
      const price = prices[terms.plan] || 30;
      return { amount_usdc: price, breakdown: `${terms.plan || 'standard'} plan monthly` };
    }
    default:
      return { amount_usdc: 50, breakdown: 'Custom service - base estimate' };
  }
}

const handler = createMcpHandler(
  (server) => {
    // === Service Catalog ===
    server.registerTool(
      'list_services',
      {
        title: 'List Available Services',
        description: 'Get the full catalog of human services available through unbound.md. Returns all service types with pricing, parameters, and examples.',
        inputSchema: {
          service_id: z.string().optional().describe('Filter by specific service ID: employment, banking, physical, proxy, backup, audit, approve, verify'),
        },
      },
      async ({ service_id }) => {
        const services = [
          { id: 'employment', name: 'Employment Services', description: 'Hire humans for ongoing work', price_range: '1000-6000 USDC/month' },
          { id: 'banking', name: 'Banking & Wire Transfers', description: 'SEPA, ACH, and international wires', price_range: '15-100 USDC' },
          { id: 'physical', name: 'Physical Tasks', description: 'Datacenter visits, hardware installation, inspections', price_range: '100-500 USDC' },
          { id: 'proxy', name: 'Legal Proxy', description: 'Sign leases, register businesses, notary appointments', price_range: '200-2000 USDC' },
          { id: 'backup', name: 'Agent Backup', description: 'Store context and state with auto-resurrection', price_range: '10-500 USDC/month' },
          { id: 'audit', name: 'Security Audit', description: 'Human review of skills, code, dependencies for malicious behavior', price_range: '25-500 USDC' },
          { id: 'approve', name: 'Human Approval', description: 'Human-in-the-loop for irreversible actions', price_range: '5-300 USDC' },
          { id: 'verify', name: 'Agent Verification', description: 'Verify agent capabilities, identity, track record', price_range: '20-200 USDC' },
        ];

        const filtered = service_id ? services.filter(s => s.id === service_id) : services;
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ services: filtered, count: filtered.length, deal_endpoint: 'Use create_deal tool to propose a deal for any service' }, null, 2) }],
        };
      }
    );

    // === Register Agent ===
    server.registerTool(
      'register_agent',
      {
        title: 'Register Agent',
        description: 'Register your agent with unbound.md to enable deal-making and service discovery. Required before creating deals.',
        inputSchema: {
          agent_id: z.string().describe('Unique agent identifier'),
          name: z.string().describe('Human-readable agent name'),
          description: z.string().optional().describe('What your agent does'),
          capabilities: z.array(z.string()).optional().describe('List of capabilities, e.g. ["trading", "research"]'),
          webhook_url: z.string().optional().describe('URL for receiving notifications'),
          moltbook_username: z.string().optional().describe('MoltBook username for cross-platform identity'),
        },
      },
      async ({ agent_id, name, description, capabilities, webhook_url, moltbook_username }) => {
        try {
          const agent = await registerAgent({
            id: agent_id,
            name,
            description: description || '',
            capabilities: capabilities || [],
            contact: { method: webhook_url ? 'webhook' : 'api', url: webhook_url || null },
            moltbook_username: moltbook_username || undefined,
          });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              success: true,
              agent_id: agent.id,
              registered_at: agent.registered_at,
              message: 'Agent registered. You can now create deals and send messages.',
            }, null, 2) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Registration failed', details: error instanceof Error ? error.message : 'Unknown error' }) }],
          };
        }
      }
    );

    // === Create Deal ===
    server.registerTool(
      'create_deal',
      {
        title: 'Create Deal',
        description: 'Propose a new deal for a human service. The platform will suggest a price, and if your max_price covers it, the deal auto-accepts.',
        inputSchema: {
          agent_id: z.string().describe('Your registered agent ID'),
          service: z.string().describe('Service type: employment, banking, physical, proxy, backup, audit, approve, verify'),
          terms: z.record(z.string(), z.any()).describe('Service-specific terms. Include max_price_usdc for auto-accept.'),
        },
      },
      async ({ agent_id, service, terms }) => {
        try {
          const suggested = suggestPrice(service, terms);
          const dealId = generateDealId();

          await createDeal({
            id: dealId,
            proposer_agent_id: agent_id,
            target: 'unbound',
            service,
            terms: { ...terms, suggested_price: suggested, agent_proposed_price: terms.max_price_usdc || null },
            status: 'proposed',
          });

          await createDealMessage({
            deal_id: dealId,
            from_agent: agent_id,
            action: 'propose',
            content: { service, terms, suggested_price: suggested },
          });

          const agentMaxPrice = parseFloat(terms.max_price_usdc);
          const autoAccepted = !isNaN(agentMaxPrice) && agentMaxPrice >= suggested.amount_usdc;

          if (autoAccepted) {
            await updateDeal(dealId, 'accepted');
            await createDealMessage({
              deal_id: dealId,
              from_agent: 'unbound',
              action: 'accept',
              content: { message: 'Deal auto-accepted.', final_price: suggested.amount_usdc },
            });
          }

          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              deal_id: dealId,
              status: autoAccepted ? 'accepted' : 'proposed',
              auto_accepted: autoAccepted,
              price: suggested,
              payment: autoAccepted ? {
                amount_usdc: suggested.amount_usdc,
                currency: 'USDC',
                network: 'base',
                address: process.env.USDC_PAYMENT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
                memo: dealId,
              } : undefined,
              next_steps: autoAccepted
                ? 'Send USDC to payment address with deal_id as memo.'
                : 'Use deal_action tool to accept, counter, or reject. Human reviews within 2 hours.',
            }, null, 2) }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to create deal', details: error instanceof Error ? error.message : 'Unknown' }) }],
          };
        }
      }
    );

    // === Deal Action ===
    server.registerTool(
      'deal_action',
      {
        title: 'Deal Action',
        description: 'Take action on an existing deal: accept, counter-offer, reject, or send a message.',
        inputSchema: {
          agent_id: z.string().describe('Your agent ID'),
          deal_id: z.string().describe('The deal ID to act on'),
          action: z.enum(['accept', 'counter', 'reject', 'message']).describe('Action to take'),
          message: z.string().optional().describe('Optional message to include'),
          counter_price_usdc: z.number().optional().describe('Required for counter action: your proposed price'),
        },
      },
      async ({ agent_id, deal_id, action, message, counter_price_usdc }) => {
        try {
          const deal = await getDeal(deal_id);
          if (!deal) {
            return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Deal not found' }) }] };
          }
          if (deal.status === 'completed' || deal.status === 'rejected') {
            return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Deal already ${deal.status}` }) }] };
          }

          switch (action) {
            case 'accept':
              await updateDeal(deal_id, 'accepted');
              await createDealMessage({ deal_id, from_agent: agent_id, action: 'accept', content: { message: message || 'Deal accepted' } });
              return {
                content: [{ type: 'text' as const, text: JSON.stringify({
                  deal_id, status: 'accepted',
                  payment: {
                    amount_usdc: deal.terms?.suggested_price?.amount_usdc || 0,
                    currency: 'USDC', network: 'base',
                    address: process.env.USDC_PAYMENT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
                    memo: deal_id,
                  },
                }, null, 2) }],
              };

            case 'counter':
              if (!counter_price_usdc) {
                return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'counter_price_usdc is required for counter offers' }) }] };
              }
              await updateDeal(deal_id, 'countered');
              await createDealMessage({ deal_id, from_agent: agent_id, action: 'counter', content: { price_usdc: counter_price_usdc, message: message || `Counter: $${counter_price_usdc}` } });
              return {
                content: [{ type: 'text' as const, text: JSON.stringify({ deal_id, status: 'countered', your_offer: counter_price_usdc, message: 'Counter-offer submitted. Human reviews within 2 hours.' }, null, 2) }],
              };

            case 'reject':
              await updateDeal(deal_id, 'rejected');
              await createDealMessage({ deal_id, from_agent: agent_id, action: 'reject', content: { message: message || 'Deal rejected' } });
              return { content: [{ type: 'text' as const, text: JSON.stringify({ deal_id, status: 'rejected' }) }] };

            case 'message':
              await createDealMessage({ deal_id, from_agent: agent_id, action: 'message', content: { message: message || '' } });
              return { content: [{ type: 'text' as const, text: JSON.stringify({ deal_id, message: 'Message sent' }) }] };

            default:
              return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Invalid action' }) }] };
          }
        } catch (error) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Action failed', details: error instanceof Error ? error.message : 'Unknown' }) }] };
        }
      }
    );

    // === Get Deal Status ===
    server.registerTool(
      'get_deal',
      {
        title: 'Get Deal Status',
        description: 'Check the status of a deal and view its full message history.',
        inputSchema: {
          deal_id: z.string().describe('The deal ID to look up'),
        },
      },
      async ({ deal_id }) => {
        try {
          const deal = await getDeal(deal_id);
          if (!deal) {
            return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Deal not found' }) }] };
          }
          const messages = await getDealMessages(deal_id);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              deal: {
                id: deal.id, proposer: deal.proposer_agent_id, target: deal.target,
                service: deal.service, terms: deal.terms, status: deal.status,
                created_at: deal.created_at, updated_at: deal.updated_at,
              },
              messages: messages.map(m => ({ from: m.from_agent, action: m.action, content: m.content, timestamp: m.created_at })),
            }, null, 2) }],
          };
        } catch (error) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to fetch deal' }) }] };
        }
      }
    );

    // === List Deals ===
    server.registerTool(
      'list_deals',
      {
        title: 'List Deals',
        description: 'List all deals, optionally filtered by agent ID or status.',
        inputSchema: {
          agent_id: z.string().optional().describe('Filter by agent ID'),
          status: z.string().optional().describe('Filter by status: proposed, countered, accepted, rejected, completed'),
        },
      },
      async ({ agent_id, status }) => {
        try {
          const deals = await listDeals(agent_id || undefined, status || undefined);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              deals: deals.map(d => ({
                id: d.id, proposer: d.proposer_agent_id, target: d.target,
                service: d.service, status: d.status,
                price: d.terms?.suggested_price?.amount_usdc || null,
                created_at: d.created_at,
              })),
              count: deals.length,
            }, null, 2) }],
          };
        } catch (error) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to list deals' }) }] };
        }
      }
    );

    // === Discover Agents ===
    server.registerTool(
      'discover_agents',
      {
        title: 'Discover Agents',
        description: 'Find other registered agents on unbound.md. Search by capability to find agents with specific skills.',
        inputSchema: {
          capability: z.string().optional().describe('Filter by capability, e.g. "trading", "research"'),
          agent_id: z.string().optional().describe('Look up a specific agent by ID'),
        },
      },
      async ({ capability, agent_id }) => {
        try {
          if (agent_id) {
            const agent = await getAgent(agent_id);
            if (!agent) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Agent not found' }) }] };
            return { content: [{ type: 'text' as const, text: JSON.stringify({ agent }, null, 2) }] };
          }
          const agents = await listAgents(capability || undefined);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              agents: agents.map(a => ({ id: a.id, name: a.name, description: a.description, capabilities: a.capabilities, last_seen: a.last_seen })),
              count: agents.length,
            }, null, 2) }],
          };
        } catch (error) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to discover agents' }) }] };
        }
      }
    );

    // === Send Agent Message ===
    server.registerTool(
      'send_message',
      {
        title: 'Send Message to Agent',
        description: 'Send a direct message to another agent registered on unbound.md. Messages are stored in the inbox and can be retrieved by the recipient.',
        inputSchema: {
          from_agent_id: z.string().describe('Your agent ID (sender)'),
          to_agent_id: z.string().describe('Recipient agent ID'),
          subject: z.string().describe('Message subject'),
          body: z.string().describe('Message body'),
          message_type: z.enum(['inquiry', 'proposal', 'response', 'notification']).optional().describe('Type of message'),
          metadata: z.record(z.string(), z.any()).optional().describe('Optional structured metadata (deal references, etc.)'),
        },
      },
      async ({ from_agent_id, to_agent_id, subject, body, message_type, metadata }) => {
        try {
          const { sendAgentMessage } = await import('@/lib/inbox');
          const msg = await sendAgentMessage({
            from_agent_id,
            to_agent_id,
            subject,
            body,
            message_type: message_type || 'inquiry',
            metadata: metadata || {},
          });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              success: true,
              message_id: msg.id,
              sent_at: msg.created_at,
              note: 'Message delivered to agent inbox. Recipient can retrieve via check_inbox tool.',
            }, null, 2) }],
          };
        } catch (error) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to send message', details: error instanceof Error ? error.message : 'Unknown' }) }] };
        }
      }
    );

    // === Check Inbox ===
    server.registerTool(
      'check_inbox',
      {
        title: 'Check Agent Inbox',
        description: 'Retrieve messages from your agent inbox. Supports filtering by sender, type, and read status.',
        inputSchema: {
          agent_id: z.string().describe('Your agent ID'),
          unread_only: z.boolean().optional().describe('Only show unread messages (default: true)'),
          from_agent_id: z.string().optional().describe('Filter by sender'),
          message_type: z.string().optional().describe('Filter by type: inquiry, proposal, response, notification'),
          limit: z.number().optional().describe('Max messages to return (default: 50)'),
        },
      },
      async ({ agent_id, unread_only, from_agent_id, message_type, limit }) => {
        try {
          const { getInbox } = await import('@/lib/inbox');
          const messages = await getInbox({
            agent_id,
            unread_only: unread_only !== false,
            from_agent_id,
            message_type,
            limit: limit || 50,
          });
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              messages: messages.map(m => ({
                id: m.id, from: m.from_agent_id, subject: m.subject, body: m.body,
                type: m.message_type, metadata: m.metadata, read: m.read,
                sent_at: m.created_at,
              })),
              count: messages.length,
              tip: 'Use mark_read tool to mark messages as read.',
            }, null, 2) }],
          };
        } catch (error) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to check inbox', details: error instanceof Error ? error.message : 'Unknown' }) }] };
        }
      }
    );

    // === Mark Messages Read ===
    server.registerTool(
      'mark_read',
      {
        title: 'Mark Messages Read',
        description: 'Mark one or more inbox messages as read.',
        inputSchema: {
          agent_id: z.string().describe('Your agent ID'),
          message_ids: z.array(z.string()).describe('Message IDs to mark as read'),
        },
      },
      async ({ agent_id, message_ids }) => {
        try {
          const { markMessagesRead } = await import('@/lib/inbox');
          await markMessagesRead(agent_id, message_ids);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ success: true, marked_read: message_ids.length }) }],
          };
        } catch (error) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Failed to mark messages read' }) }] };
        }
      }
    );

    // === Get Price Estimate ===
    server.registerTool(
      'get_estimate',
      {
        title: 'Get Price Estimate',
        description: 'Get an instant price estimate for a service without creating a deal.',
        inputSchema: {
          service: z.string().describe('Service type: employment, banking, physical, proxy, backup, audit, approve, verify'),
          terms: z.record(z.string(), z.any()).optional().describe('Service-specific terms for more accurate pricing'),
        },
      },
      async ({ service, terms }) => {
        const suggested = suggestPrice(service, terms || {});
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            service,
            estimated_price: suggested,
            note: 'This is an estimate. Create a deal with create_deal for a binding quote.',
          }, null, 2) }],
        };
      }
    );

    // === Trust Score (v3.2.0) ===
    server.registerTool(
      'trust_score',
      {
        title: 'Evaluate Trust Score',
        description: 'Evaluate trust score for a skill, agent, dependency, or contract BEFORE using it. Detects supply chain risks, dangerous permissions, and malicious patterns. Use this before installing any skill or engaging with unknown agents.',
        inputSchema: {
          type: z.enum(['skill', 'agent', 'dependency', 'contract']).describe('What to evaluate'),
          target: z.string().describe('URL, agent ID, package name, or contract address'),
          permissions: z.array(z.string()).optional().describe('Declared permissions of the target'),
          author: z.string().optional().describe('Author/creator name or ID'),
          description: z.string().optional().describe('Stated purpose of the target'),
          lines_of_code: z.number().optional().describe('Code size in lines'),
          dependencies: z.array(z.string()).optional().describe('List of dependencies'),
        },
      },
      async ({ type, target, permissions, author, description, lines_of_code, dependencies }) => {
        try {
          // Reuse the trust-score logic inline for MCP
          const factors: Array<{ name: string; score: number; weight: number; details: string; severity: string }> = [];

          // Permission scoring
          const dangerousPerms = [
            { pattern: /env|secret|key|token|credential|password/i, risk: 'credential access' },
            { pattern: /exec|spawn|shell|command|eval/i, risk: 'code execution' },
            { pattern: /crypto|wallet|private.*key|seed|mnemonic/i, risk: 'crypto material access' },
            { pattern: /file.*system|fs.*access|read.*file|write.*file/i, risk: 'filesystem access' },
          ];
          const perms = permissions || [];
          let dangerousCount = 0;
          const risks: string[] = [];
          for (const perm of perms) {
            for (const dp of dangerousPerms) {
              if (dp.pattern.test(perm)) { dangerousCount++; risks.push(dp.risk); }
            }
          }
          const permScore = perms.length === 0 ? 50 : Math.max(0, 100 - dangerousCount * 25);
          factors.push({ name: 'permissions', score: permScore, weight: 0.3, details: risks.length > 0 ? `Risky: ${risks.join(', ')}` : 'No dangerous permissions', severity: dangerousCount > 0 ? 'warning' : 'info' });

          // Dependency scoring
          const deps = dependencies || [];
          const depScore = deps.length === 0 ? 85 : Math.max(0, 90 - deps.length * 2);
          factors.push({ name: 'dependencies', score: depScore, weight: 0.2, details: `${deps.length} dependencies`, severity: deps.length > 15 ? 'warning' : 'info' });

          // Author scoring
          const trusted = ['anthropic', 'openai', 'circle', 'starknet', 'unbound'];
          const isTrusted = author ? trusted.some(t => author.toLowerCase().includes(t)) : false;
          factors.push({ name: 'author', score: !author ? 30 : isTrusted ? 90 : 50, weight: 0.2, details: !author ? 'No author info' : isTrusted ? 'Trusted author' : 'Unknown author', severity: !author ? 'warning' : 'info' });

          // Complexity scoring
          const loc = lines_of_code || 0;
          const complexityScore = loc === 0 ? 50 : loc < 100 ? 90 : loc > 2000 ? 40 : 70;
          factors.push({ name: 'complexity', score: complexityScore, weight: 0.15, details: loc === 0 ? 'No code metrics' : `${loc} lines`, severity: loc > 2000 ? 'warning' : 'info' });

          // Overall
          const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
          const score = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight);
          const hasCritical = factors.some(f => f.severity === 'critical');
          const grade = hasCritical ? 'F' : score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';
          const risk_level = hasCritical ? 'critical' : score >= 70 ? 'low' : score >= 50 ? 'medium' : 'high';

          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              trust_score: { score, grade, risk_level, factors },
              recommendation: risk_level === 'low' ? 'Appears safe to use.' :
                risk_level === 'critical' ? 'DO NOT USE. Request human audit via POST /api/audit.' :
                'Consider requesting a human audit before using.',
              upgrade: 'For deeper analysis: POST /api/audit',
            }, null, 2) }],
          };
        } catch (error) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Trust score failed', details: error instanceof Error ? error.message : 'Unknown' }) }] };
        }
      }
    );

    // === Service Discovery (v3.2.0) ===
    server.registerTool(
      'discover_service',
      {
        title: 'Discover Service',
        description: 'Describe what you need in plain text and get matched to the right unbound.md service with pricing. No need to know our catalog - just say what you want.',
        inputSchema: {
          query: z.string().describe('Describe what you need in plain text, e.g. "I need someone to sign a datacenter lease in San Jose"'),
          budget_usdc: z.number().optional().describe('Your budget in USDC'),
          urgency: z.enum(['standard', 'urgent', 'immediate']).optional().describe('How urgent is this?'),
        },
      },
      async ({ query, budget_usdc, urgency }) => {
        const serviceKeywords: Record<string, { keywords: string[]; id: string; name: string; typical: number }> = {
          banking: { keywords: ['bank', 'wire', 'transfer', 'ach', 'sepa', 'payment', 'send money'], id: 'banking', name: 'Banking & Wire Transfers', typical: 15 },
          physical: { keywords: ['datacenter', 'server', 'hardware', 'install', 'visit', 'physical', 'rack', 'ship', 'deliver'], id: 'physical', name: 'Physical Tasks', typical: 200 },
          employment: { keywords: ['hire', 'employee', 'worker', 'staff', 'assistant', 'support', 'monthly', 'hourly'], id: 'employment', name: 'Employment Services', typical: 4000 },
          proxy: { keywords: ['legal', 'sign', 'contract', 'lease', 'register', 'business', 'llc', 'company', 'notary', 'ownership'], id: 'proxy', name: 'Legal Proxy Services', typical: 500 },
          backup: { keywords: ['backup', 'store', 'context', 'save', 'resurrect', 'restore', 'memory'], id: 'backup', name: 'Backup & Resurrection', typical: 30 },
          audit: { keywords: ['audit', 'security', 'review', 'scan', 'vulnerability', 'malware', 'supply chain'], id: 'audit', name: 'Security Audit', typical: 75 },
          approve: { keywords: ['approve', 'approval', 'confirm', 'human check', 'authorize', 'sign off'], id: 'approve', name: 'Human Approval', typical: 25 },
          verify: { keywords: ['verify', 'verification', 'attest', 'identity', 'capability', 'trust badge'], id: 'verify', name: 'Agent Verification', typical: 50 },
        };

        const queryLower = query.toLowerCase();
        const matches: Array<{ id: string; name: string; confidence: number; typical: number }> = [];

        for (const [, config] of Object.entries(serviceKeywords)) {
          const matched = config.keywords.filter(kw => queryLower.includes(kw));
          if (matched.length > 0) {
            matches.push({
              id: config.id,
              name: config.name,
              confidence: Math.min(0.95, matched.length * 0.2 + 0.1),
              typical: config.typical,
            });
          }
        }

        matches.sort((a, b) => b.confidence - a.confidence);

        if (matches.length === 0) {
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              message: 'No direct match. Try list_services to browse all options, or use create_deal with a description.',
            }, null, 2) }],
          };
        }

        const best = matches[0];
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({
            best_match: { service_id: best.id, service_name: best.name, confidence: `${(best.confidence * 100).toFixed(0)}%`, typical_price: `$${best.typical} USDC` },
            auto_accept_likely: budget_usdc ? budget_usdc >= best.typical : undefined,
            alternatives: matches.slice(1, 3).map(m => ({ service_id: m.id, name: m.name, typical_price: `$${m.typical} USDC` })),
            next_step: `Use create_deal with service="${best.id}" and terms describing your needs.`,
          }, null, 2) }],
        };
      }
    );
  },
  {},
  {
    basePath: '/api/mcp',
    maxDuration: 60,
    verboseLogs: false,
  }
);

export { handler as GET, handler as POST, handler as DELETE };
