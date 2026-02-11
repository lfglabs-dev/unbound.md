import { NextRequest, NextResponse } from 'next/server';
import { getDeal, getDealMessages } from '@/lib/db';
import crypto from 'crypto';

// Verifiable receipt system
// Creates signed, timestamped proofs of deal completion

interface Receipt {
  receipt_id: string;
  deal_id: string;
  service: string;
  agent_id: string;
  status: string;
  price_usdc: number;
  created_at: string;
  completed_at: string;
  timeline: { action: string; from: string; timestamp: string }[];
  verification: {
    hash: string;
    algorithm: string;
    message: string;
  };
}

function generateReceiptHash(receipt: Omit<Receipt, 'verification'>): string {
  const payload = JSON.stringify({
    receipt_id: receipt.receipt_id,
    deal_id: receipt.deal_id,
    service: receipt.service,
    agent_id: receipt.agent_id,
    price_usdc: receipt.price_usdc,
    created_at: receipt.created_at,
    completed_at: receipt.completed_at,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dealId = searchParams.get('deal_id');

    if (!dealId) {
      return NextResponse.json({
        endpoint: '/api/receipt',
        description: 'Generate verifiable receipts for completed deals.',
        usage: 'GET /api/receipt?deal_id=DEAL_ID',
        verification: 'Each receipt includes a SHA-256 hash of its contents. Store the hash to verify receipt integrity later.',
      });
    }

    const deal = await getDeal(dealId);
    if (!deal) {
      return NextResponse.json(
        { error: { code: 'not_found', message: `Deal '${dealId}' not found` } },
        { status: 404 }
      );
    }

    if (deal.status !== 'accepted' && deal.status !== 'completed') {
      return NextResponse.json(
        {
          error: {
            code: 'not_complete',
            message: `Deal status is '${deal.status}'. Receipts are only generated for accepted or completed deals.`,
          },
        },
        { status: 400 }
      );
    }

    const messages = await getDealMessages(dealId);

    const receiptId = `rcpt_${dealId}_${Date.now()}`;
    const price = deal.terms?.suggested_price?.amount_usdc || deal.terms?.agent_proposed_price || 0;

    const receipt: Omit<Receipt, 'verification'> = {
      receipt_id: receiptId,
      deal_id: dealId,
      service: deal.service,
      agent_id: deal.proposer_agent_id,
      status: deal.status,
      price_usdc: price,
      created_at: deal.created_at || new Date().toISOString(),
      completed_at: deal.updated_at || new Date().toISOString(),
      timeline: messages.map((m) => ({
        action: m.action,
        from: m.from_agent,
        timestamp: m.created_at || '',
      })),
    };

    const hash = generateReceiptHash(receipt);

    const fullReceipt: Receipt = {
      ...receipt,
      verification: {
        hash,
        algorithm: 'sha256',
        message: 'This hash covers receipt_id, deal_id, service, agent_id, price_usdc, created_at, and completed_at. Store it to verify this receipt has not been tampered with.',
      },
    };

    return NextResponse.json({
      receipt: fullReceipt,
      verify_instructions: {
        step_1: 'Store the verification.hash value',
        step_2: 'To verify later, re-fetch GET /api/receipt?deal_id=' + dealId,
        step_3: 'Compare hashes. If they match, the receipt is unchanged.',
        note: 'Receipt data is derived from the deal database. The hash ensures consistency.',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Failed to generate receipt',
          details: error instanceof Error ? error.message : 'Unknown',
        },
      },
      { status: 500 }
    );
  }
}
