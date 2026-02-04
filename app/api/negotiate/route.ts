import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for negotiations (in production, use a database)
const negotiations = new Map<string, any>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { request_id, action, offer, message, agent_id } = body;

    if (!request_id) {
      return NextResponse.json(
        { error: { code: 'missing_parameter', message: 'request_id is required' } },
        { status: 400 }
      );
    }

    if (!action || !['counter_offer', 'accept', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: { code: 'invalid_action', message: 'action must be counter_offer, accept, or reject' } },
        { status: 400 }
      );
    }

    // Get or create negotiation thread
    let negotiation = negotiations.get(request_id) || {
      request_id,
      created_at: new Date().toISOString(),
      status: 'active',
      history: [],
    };

    // Add negotiation event
    const event = {
      timestamp: new Date().toISOString(),
      action,
      from: agent_id || 'agent',
      offer: offer || null,
      message: message || '',
    };

    negotiation.history.push(event);

    // Update status based on action
    if (action === 'accept') {
      negotiation.status = 'accepted';
      negotiation.final_offer = offer || negotiation.history[negotiation.history.length - 2]?.offer;
    } else if (action === 'reject') {
      negotiation.status = 'rejected';
    }

    negotiations.set(request_id, negotiation);

    // Log for human review
    console.log('=== NEGOTIATION EVENT ===');
    console.log(`Request: ${request_id}`);
    console.log(`Action: ${action}`);
    console.log(`From: ${event.from}`);
    if (offer) console.log(`Offer: ${JSON.stringify(offer, null, 2)}`);
    if (message) console.log(`Message: ${message}`);
    console.log('========================');

    // Prepare response
    const response: any = {
      request_id,
      negotiation_status: negotiation.status,
      history: negotiation.history,
    };

    if (action === 'counter_offer') {
      response.message = 'Counter-offer received. Human will review and respond within 2 hours.';
      response.next_steps = 'Wait for human response or check GET /api/negotiate/:id';
    } else if (action === 'accept') {
      response.message = 'Offer accepted! Proceed to payment.';
      response.payment = {
        amount: negotiation.final_offer.amount_usdc || negotiation.final_offer.total,
        currency: 'USDC',
        network: 'base',
        address: process.env.USDC_PAYMENT_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        memo: request_id,
      };
      response.next_steps = 'Send USDC to payment address with request_id as memo';
    } else if (action === 'reject') {
      response.message = 'Negotiation ended.';
    }

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Error in negotiation:', error);
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Failed to process negotiation',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const request_id = searchParams.get('request_id');

    if (!request_id) {
      // Return all negotiations summary
      const allNegotiations = Array.from(negotiations.entries()).map(([id, neg]) => ({
        request_id: id,
        status: neg.status,
        events: neg.history.length,
        created_at: neg.created_at,
      }));

      return NextResponse.json({
        negotiations: allNegotiations,
        count: allNegotiations.length,
      });
    }

    // Return specific negotiation
    const negotiation = negotiations.get(request_id);

    if (!negotiation) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Negotiation not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      request_id,
      status: negotiation.status,
      history: negotiation.history,
      created_at: negotiation.created_at,
    });

  } catch (error) {
    console.error('Error fetching negotiation:', error);
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Failed to fetch negotiation',
        }
      },
      { status: 500 }
    );
  }
}
