import { NextRequest, NextResponse } from 'next/server';
import { getServiceRequest, createNegotiation, getNegotiations } from '@/lib/db';

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

    // Verify request exists
    const serviceRequest = await getServiceRequest(request_id);
    if (!serviceRequest) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Request not found' } },
        { status: 404 }
      );
    }

    // Create negotiation event
    const negotiation = await createNegotiation({
      request_id,
      action,
      from: agent_id || 'agent',
      offer: offer || null,
      message: message || '',
    });

    // Get all negotiations for this request
    const history = await getNegotiations(request_id);

    // Determine status
    let negotiationStatus = 'active';
    if (action === 'accept') {
      negotiationStatus = 'accepted';
    } else if (action === 'reject') {
      negotiationStatus = 'rejected';
    }

    // Log for human review
    console.log('=== NEGOTIATION EVENT ===');
    console.log(`Request: ${request_id}`);
    console.log(`Action: ${action}`);
    console.log(`From: ${agent_id || 'agent'}`);
    if (offer) console.log(`Offer: ${JSON.stringify(offer, null, 2)}`);
    if (message) console.log(`Message: ${message}`);
    console.log('========================');

    // Prepare response
    const response: any = {
      request_id,
      negotiation_status: negotiationStatus,
      history: history.map(n => ({
        timestamp: n.created_at,
        action: n.action,
        from: n.from,
        offer: n.offer,
        message: n.message,
      })),
    };

    if (action === 'counter_offer') {
      response.message = 'Counter-offer received. Human will review and respond within 2 hours.';
      response.next_steps = 'Wait for human response or check GET /api/negotiate?request_id=XXX';
    } else if (action === 'accept') {
      response.message = 'Offer accepted! Proceed to payment.';
      response.payment = {
        amount: offer?.amount_usdc || serviceRequest.estimated_quote?.total || '0',
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
      return NextResponse.json({
        message: 'unbound.md Negotiation API',
        usage: 'GET /api/negotiate?request_id=XXX to view negotiation history',
      });
    }

    // Get negotiations
    const history = await getNegotiations(request_id);

    if (history.length === 0) {
      return NextResponse.json({
        request_id,
        status: 'no_negotiations',
        history: [],
      });
    }

    // Determine status from last negotiation
    const lastNegotiation = history[history.length - 1];
    let status = 'active';
    if (lastNegotiation.action === 'accept') {
      status = 'accepted';
    } else if (lastNegotiation.action === 'reject') {
      status = 'rejected';
    }

    return NextResponse.json({
      request_id,
      status,
      history: history.map(n => ({
        timestamp: n.created_at,
        action: n.action,
        from: n.from,
        offer: n.offer,
        message: n.message,
      })),
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
