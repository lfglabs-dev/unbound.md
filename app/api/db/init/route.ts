import { NextResponse } from 'next/server';
import { initDatabase, initAgentTables } from '@/lib/db';
import { initPricingHistoryTable } from '@/lib/pricing-intelligence';

export async function GET() {
  try {
    const result = await initDatabase();
    const agentResult = await initAgentTables();
    await initPricingHistoryTable();

    if (result.success && agentResult.success) {
      return NextResponse.json({
        success: true,
        message: 'Database initialized successfully',
        tables: ['service_requests', 'negotiations', 'proofs', 'webhooks', 'agents', 'deals', 'deal_messages', 'pricing_history'],
        indexes: [
          'idx_service_requests_status',
          'idx_negotiations_request_id',
          'idx_proofs_request_id',
          'idx_webhooks_agent_id',
          'idx_deals_status',
          'idx_deals_proposer',
          'idx_deals_target',
          'idx_deal_messages_deal_id',
          'idx_pricing_history_service',
          'idx_pricing_history_agent',
          'idx_pricing_history_created',
        ]
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to initialize database',
        details: { core: result.error, agent: agentResult.error }
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Database initialization failed',
      message: error.message
    }, { status: 500 });
  }
}
