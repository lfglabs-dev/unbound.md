import { NextRequest, NextResponse } from 'next/server';
import {
  createDeal,
  getDeal,
  updateDeal,
  listDeals,
  createDealMessage,
  getDealMessages,
  getAgent,
} from '@/lib/db';
import { dispatchWebhookEvent } from '@/lib/webhooks';

function generateDealId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `deal_${Date.now()}_${suffix}`;
}

// Auto-pricing engine: returns suggested price based on service and terms
function suggestPrice(service: string, terms: any): { amount_usdc: number; breakdown: string } {
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
      const rate = 50; // base hourly
      const platformFee = 0.15;
      const total = hours * rate * (1 + platformFee);
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
        datacenter_lease: 500,
        business_registration: 1000,
        bank_account: 500,
        equipment_ownership: 200,
        real_estate_lease: 750,
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agent_id, action, deal_id, service, terms, message, counter_terms } = body;

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

    // === CREATE NEW DEAL ===
    if (!deal_id && !action) {
      if (!service || !terms) {
        return NextResponse.json(
          {
            error: {
              code: 'missing_parameters',
              message: 'service and terms are required to propose a deal',
              example: {
                agent_id: 'my-agent',
                service: 'banking',
                terms: {
                  type: 'ach_transfer',
                  amount: '5000',
                  currency: 'USD',
                  recipient: { name: 'Acme Corp', account: '123456789', routing: '987654321' },
                },
              },
            },
          },
          { status: 400 }
        );
      }

      const suggested = suggestPrice(service, terms);
      const dealId = generateDealId();

      const deal = await createDeal({
        id: dealId,
        proposer_agent_id: agent_id,
        target: 'unbound',
        service,
        terms: {
          ...terms,
          suggested_price: suggested,
          agent_proposed_price: terms.max_price_usdc || null,
        },
        status: 'proposed',
      });

      await createDealMessage({
        deal_id: dealId,
        from_agent: agent_id,
        action: 'propose',
        content: { service, terms, suggested_price: suggested },
      });

      console.log('=== NEW DEAL PROPOSED ===');
      console.log(`Deal: ${dealId}`);
      console.log(`Agent: ${agent_id}`);
      console.log(`Service: ${service}`);
      console.log(`Suggested: $${suggested.amount_usdc} USDC`);
      console.log('=========================');

      // Fire webhook for new deal proposal
      dispatchWebhookEvent('deal.proposed', {
        deal_id: dealId,
        agent_id,
        service,
        suggested_price: suggested.amount_usdc,
      });

      // Auto-accept if agent's max price >= suggested price
      const agentMaxPrice = parseFloat(terms.max_price_usdc);
      const autoAccepted = !isNaN(agentMaxPrice) && agentMaxPrice >= suggested.amount_usdc;

      if (autoAccepted) {
        await updateDeal(dealId, 'accepted');
        await createDealMessage({
          deal_id: dealId,
          from_agent: 'unbound',
          action: 'accept',
          content: {
            message: 'Deal auto-accepted. Your max price covers the service cost.',
            final_price: suggested.amount_usdc,
          },
        });

        dispatchWebhookEvent('deal.accepted', {
          deal_id: dealId,
          agent_id,
          auto_accepted: true,
          price_usdc: suggested.amount_usdc,
        });

        return NextResponse.json({
          deal_id: dealId,
          status: 'accepted',
          auto_accepted: true,
          price: {
            amount_usdc: suggested.amount_usdc,
            breakdown: suggested.breakdown,
          },
          payment: {
            amount: String(suggested.amount_usdc),
            currency: 'USDC',
            network: 'base',
            address: process.env.USDC_PAYMENT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
            memo: dealId,
          },
          next_steps: 'Send USDC to payment address with deal_id as memo. Track via GET /api/deal?deal_id=' + dealId,
          message: 'Deal accepted instantly because your max_price_usdc covers our suggested price.',
        });
      }

      return NextResponse.json({
        deal_id: dealId,
        status: 'proposed',
        suggested_price: suggested,
        message: terms.max_price_usdc
          ? `Your max price ($${terms.max_price_usdc}) is below our suggested price ($${suggested.amount_usdc}). Human will review within 2 hours.`
          : 'Deal proposed. Human will review and respond within 2 hours.',
        next_steps: {
          check_status: `GET /api/deal?deal_id=${dealId}`,
          counter_offer: `POST /api/deal with { agent_id, deal_id: "${dealId}", action: "counter", counter_terms: { price_usdc: YOUR_PRICE } }`,
          accept: `POST /api/deal with { agent_id, deal_id: "${dealId}", action: "accept" }`,
          withdraw: `POST /api/deal with { agent_id, deal_id: "${dealId}", action: "reject" }`,
        },
      });
    }

    // === ACT ON EXISTING DEAL ===
    if (deal_id && action) {
      const deal = await getDeal(deal_id);
      if (!deal) {
        return NextResponse.json(
          { error: { code: 'not_found', message: `Deal '${deal_id}' not found` } },
          { status: 404 }
        );
      }

      if (deal.status === 'completed' || deal.status === 'rejected') {
        return NextResponse.json(
          { error: { code: 'deal_closed', message: `Deal is already ${deal.status}` } },
          { status: 400 }
        );
      }

      switch (action) {
        case 'accept': {
          await updateDeal(deal_id, 'accepted');
          await createDealMessage({
            deal_id,
            from_agent: agent_id,
            action: 'accept',
            content: { message: message || 'Deal accepted' },
          });

          const finalPrice = deal.terms?.suggested_price?.amount_usdc || deal.terms?.agent_proposed_price || 0;

          dispatchWebhookEvent('deal.accepted', {
            deal_id,
            agent_id,
            price_usdc: finalPrice,
          });

          return NextResponse.json({
            deal_id,
            status: 'accepted',
            payment: {
              amount: String(finalPrice),
              currency: 'USDC',
              network: 'base',
              address: process.env.USDC_PAYMENT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
              memo: deal_id,
            },
            next_steps: 'Send USDC to payment address. Track via GET /api/deal?deal_id=' + deal_id,
          });
        }

        case 'counter': {
          if (!counter_terms?.price_usdc) {
            return NextResponse.json(
              {
                error: {
                  code: 'missing_counter_price',
                  message: 'counter_terms.price_usdc is required for counter offers',
                },
              },
              { status: 400 }
            );
          }

          await updateDeal(deal_id, 'countered');
          await createDealMessage({
            deal_id,
            from_agent: agent_id,
            action: 'counter',
            content: {
              price_usdc: counter_terms.price_usdc,
              message: message || `Counter-offer: $${counter_terms.price_usdc} USDC`,
              justification: counter_terms.justification || null,
            },
          });

          console.log(`=== COUNTER OFFER on ${deal_id}: $${counter_terms.price_usdc} from ${agent_id} ===`);

          return NextResponse.json({
            deal_id,
            status: 'countered',
            your_offer: counter_terms.price_usdc,
            message: 'Counter-offer submitted. Human will review within 2 hours.',
            next_steps: `Check status: GET /api/deal?deal_id=${deal_id}`,
          });
        }

        case 'reject': {
          await updateDeal(deal_id, 'rejected');
          await createDealMessage({
            deal_id,
            from_agent: agent_id,
            action: 'reject',
            content: { message: message || 'Deal rejected', reason: body.reason || null },
          });

          dispatchWebhookEvent('deal.rejected', {
            deal_id,
            agent_id,
            reason: body.reason || null,
          });

          return NextResponse.json({
            deal_id,
            status: 'rejected',
            message: 'Deal closed.',
          });
        }

        case 'message': {
          await createDealMessage({
            deal_id,
            from_agent: agent_id,
            action: 'message',
            content: { message: message || '' },
          });

          dispatchWebhookEvent('deal.message', {
            deal_id,
            agent_id,
            message: message || '',
          });

          return NextResponse.json({
            deal_id,
            message: 'Message sent.',
          });
        }

        default:
          return NextResponse.json(
            {
              error: {
                code: 'invalid_action',
                message: 'action must be accept, counter, reject, or message',
              },
            },
            { status: 400 }
          );
      }
    }

    return NextResponse.json(
      {
        error: {
          code: 'invalid_request',
          message: 'Provide either (service + terms) for new deal, or (deal_id + action) for existing deal',
        },
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in deal:', error);
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Failed to process deal',
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
    const dealId = searchParams.get('deal_id');
    const agentId = searchParams.get('agent_id');
    const status = searchParams.get('status');

    if (dealId) {
      const deal = await getDeal(dealId);
      if (!deal) {
        return NextResponse.json(
          { error: { code: 'not_found', message: `Deal '${dealId}' not found` } },
          { status: 404 }
        );
      }

      const messages = await getDealMessages(dealId);

      return NextResponse.json({
        deal: {
          id: deal.id,
          proposer: deal.proposer_agent_id,
          target: deal.target,
          service: deal.service,
          terms: deal.terms,
          status: deal.status,
          created_at: deal.created_at,
          updated_at: deal.updated_at,
        },
        messages: messages.map((m) => ({
          from: m.from_agent,
          action: m.action,
          content: m.content,
          timestamp: m.created_at,
        })),
        actions: deal.status === 'accepted'
          ? {
              payment: {
                amount: String(deal.terms?.suggested_price?.amount_usdc || 0),
                currency: 'USDC',
                network: 'base',
                address: process.env.USDC_PAYMENT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
                memo: dealId,
              },
            }
          : deal.status === 'proposed' || deal.status === 'countered'
            ? {
                accept: `POST /api/deal { agent_id, deal_id: "${dealId}", action: "accept" }`,
                counter: `POST /api/deal { agent_id, deal_id: "${dealId}", action: "counter", counter_terms: { price_usdc: N } }`,
                reject: `POST /api/deal { agent_id, deal_id: "${dealId}", action: "reject" }`,
              }
            : {},
      });
    }

    const deals = await listDeals(agentId || undefined, status || undefined);

    return NextResponse.json({
      deals: deals.map((d) => ({
        id: d.id,
        proposer: d.proposer_agent_id,
        target: d.target,
        service: d.service,
        status: d.status,
        price: d.terms?.suggested_price?.amount_usdc || null,
        created_at: d.created_at,
        updated_at: d.updated_at,
      })),
      count: deals.length,
      usage: {
        new_deal: 'POST /api/deal { agent_id, service, terms: {...} }',
        view_deal: 'GET /api/deal?deal_id=DEAL_ID',
        my_deals: 'GET /api/deal?agent_id=MY_ID',
        by_status: 'GET /api/deal?status=proposed',
      },
    });
  } catch (error) {
    console.error('Error fetching deals:', error);
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Failed to fetch deals',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
