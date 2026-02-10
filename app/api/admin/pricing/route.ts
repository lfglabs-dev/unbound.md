import { NextRequest, NextResponse } from 'next/server';
import { getPricingDashboard, getPricingInsights, getAgentPricingProfile } from '@/lib/pricing-intelligence';
import { sql } from '@vercel/postgres';

/**
 * Admin Pricing Dashboard API
 *
 * GET /api/admin/pricing - Overview dashboard
 * GET /api/admin/pricing/recommendations - Active recommendations for Thomas
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'dashboard';

    if (view === 'recommendations') {
      // Get all active countered deals that need Thomas's attention
      const result = await sql`
        SELECT
          d.id as deal_id,
          d.proposer_agent_id as agent_id,
          d.service,
          d.terms,
          d.status,
          d.created_at
        FROM deals d
        WHERE d.status = 'countered'
        ORDER BY d.updated_at DESC
        LIMIT 20
      `;

      const recommendations = await Promise.all(
        result.rows.map(async (deal) => {
          const messages = await sql`
            SELECT content
            FROM deal_messages
            WHERE deal_id = ${deal.deal_id}
              AND action = 'counter'
            ORDER BY created_at DESC
            LIMIT 1
          `;

          const counter_price = messages.rows[0]?.content?.price_usdc;
          const suggested_price = deal.terms?.suggested_price?.amount_usdc;

          if (!counter_price || !suggested_price) {
            return null;
          }

          const agentProfile = await getAgentPricingProfile(deal.agent_id);
          const serviceInsights = await getPricingInsights(deal.service);

          const discount_pct = ((suggested_price - counter_price) / suggested_price) * 100;

          // Simple recommendation logic
          let action_recommendation = 'review';
          let reasoning = '';

          if (agentProfile.negotiation_style === 'quick_decider' && discount_pct < 5) {
            action_recommendation = 'accept';
            reasoning = 'Agent usually accepts quickly. Small discount request.';
          } else if (agentProfile.negotiation_style === 'aggressive_negotiator' && discount_pct > 20) {
            action_recommendation = 'counter';
            reasoning = 'Agent is known aggressive negotiator. Counter at midpoint.';
          } else if (serviceInsights && counter_price < serviceInsights.base_price * 0.8) {
            action_recommendation = 'reject';
            reasoning = 'Counter is significantly below market average.';
          } else if (discount_pct < 10) {
            action_recommendation = 'accept';
            reasoning = 'Reasonable counter, within acceptable range.';
          } else {
            action_recommendation = 'counter';
            reasoning = 'Counter at midpoint to close the deal.';
          }

          return {
            deal_id: deal.deal_id,
            agent_id: deal.agent_id,
            service: deal.service,
            our_price: suggested_price,
            their_counter: counter_price,
            discount_requested: `${discount_pct.toFixed(1)}%`,
            agent_profile: {
              negotiation_style: agentProfile.negotiation_style,
              total_deals: agentProfile.total_deals,
              acceptance_rate: `${(agentProfile.acceptance_rate * 100).toFixed(1)}%`,
            },
            market_data: serviceInsights
              ? {
                  avg_final_price: serviceInsights.base_price,
                  acceptance_rate: `${(serviceInsights.acceptance_rate * 100).toFixed(1)}%`,
                }
              : null,
            recommendation: {
              action: action_recommendation,
              reasoning,
              suggested_counter: action_recommendation === 'counter' ? (suggested_price + counter_price) / 2 : null,
            },
            created_at: deal.created_at,
          };
        })
      );

      return NextResponse.json({
        success: true,
        active_negotiations: recommendations.filter((r) => r !== null),
        summary: {
          total_pending: recommendations.filter((r) => r !== null).length,
          should_accept: recommendations.filter((r) => r?.recommendation.action === 'accept').length,
          should_counter: recommendations.filter((r) => r?.recommendation.action === 'counter').length,
          should_reject: recommendations.filter((r) => r?.recommendation.action === 'reject').length,
        },
      });
    }

    // Default: full dashboard
    const dashboard = await getPricingDashboard();

    // Get top performing services
    const topServices = dashboard
      .filter((s) => s.total_negotiations > 3)
      .sort((a, b) => parseFloat(b.acceptance_rate) - parseFloat(a.acceptance_rate))
      .slice(0, 5);

    // Get services that need pricing adjustment
    const needsAdjustment = dashboard.filter((s) => parseFloat(s.acceptance_rate) < 30 && s.total_negotiations > 2);

    return NextResponse.json({
      success: true,
      dashboard,
      insights: {
        top_performers: topServices,
        needs_price_adjustment: needsAdjustment,
        total_services_tracked: dashboard.length,
      },
      quick_stats: {
        total_negotiations: dashboard.reduce((sum, s) => sum + s.total_negotiations, 0),
        avg_acceptance_rate: (
          dashboard.reduce((sum, s) => sum + parseFloat(s.acceptance_rate), 0) / dashboard.length
        ).toFixed(1) + '%',
      },
    });
  } catch (error) {
    console.error('Error in admin pricing:', error);
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Failed to fetch pricing dashboard',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
