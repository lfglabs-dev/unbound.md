import { NextRequest, NextResponse } from 'next/server';
import {
  getPricingInsights,
  getAgentPricingProfile,
  suggestCounterResponse,
  getPricingDashboard,
} from '@/lib/pricing-intelligence';

/**
 * Pricing Intelligence API
 *
 * GET /api/pricing-insights - Dashboard view of all services
 * GET /api/pricing-insights?service=banking - Insights for specific service
 * GET /api/pricing-insights?agent_id=agent123 - Profile for specific agent
 * POST /api/pricing-insights/suggest-counter - Get counter-offer recommendation
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const service = searchParams.get('service');
    const agent_id = searchParams.get('agent_id');

    // Dashboard view
    if (!service && !agent_id) {
      const dashboard = await getPricingDashboard();
      return NextResponse.json({
        success: true,
        dashboard,
        usage: {
          service_insights: 'GET /api/pricing-insights?service=banking',
          agent_profile: 'GET /api/pricing-insights?agent_id=AGENT_ID',
          counter_suggestion: 'POST /api/pricing-insights/suggest-counter',
        },
      });
    }

    // Service-specific insights
    if (service) {
      const insights = await getPricingInsights(service);
      if (!insights) {
        return NextResponse.json({
          success: false,
          message: `No pricing history for service '${service}' yet. Insights will be available after first negotiations.`,
          service,
        });
      }

      return NextResponse.json({
        success: true,
        service,
        insights: {
          base_price: `$${insights.base_price.toFixed(2)}`,
          acceptance_rate: `${(insights.acceptance_rate * 100).toFixed(1)}%`,
          avg_counter_discount: `${insights.avg_counter_percentage.toFixed(1)}%`,
          recommended_opening_price: `$${insights.recommended_initial.toFixed(2)}`,
          price_elasticity: insights.price_elasticity.toFixed(2),
        },
        interpretation: {
          acceptance_rate:
            insights.acceptance_rate > 0.7
              ? 'HIGH - Agents typically accept our prices'
              : insights.acceptance_rate > 0.3
                ? 'MODERATE - Some negotiation needed'
                : 'LOW - Prices may be too high, expect negotiation',
          recommended_strategy:
            insights.acceptance_rate > 0.7
              ? 'Consider pricing slightly lower for faster closes'
              : insights.acceptance_rate > 0.3
                ? 'Current pricing is balanced for negotiation'
                : 'Start 10% higher to have negotiation room',
        },
      });
    }

    // Agent profile
    if (agent_id) {
      const profile = await getAgentPricingProfile(agent_id);

      if (profile.is_new_agent) {
        return NextResponse.json({
          success: true,
          agent_id,
          profile: {
            status: 'new',
            message: 'No negotiation history for this agent. Use standard pricing.',
          },
        });
      }

      return NextResponse.json({
        success: true,
        agent_id,
        profile: {
          total_deals: profile.total_deals,
          acceptance_rate: `${(profile.acceptance_rate * 100).toFixed(1)}%`,
          avg_discount_requested: `${profile.avg_discount_requested.toFixed(1)}%`,
          negotiation_style: profile.negotiation_style,
          last_deal_at: profile.last_deal_at,
          services_used: profile.services_used,
        },
        recommendations: {
          pricing_strategy:
            profile.negotiation_style === 'quick_decider'
              ? 'Agent accepts most offers. Can price competitively for quick close.'
              : profile.negotiation_style === 'aggressive_negotiator'
                ? 'Agent negotiates hard. Start 15% higher and expect to come down.'
                : profile.negotiation_style === 'moderate_negotiator'
                  ? 'Agent negotiates reasonably. Start with market rate plus 10%.'
                  : 'Unknown negotiation style. Use standard pricing.',
          trust_level:
            profile.total_deals > 5
              ? 'ESTABLISHED - Multiple successful deals'
              : profile.total_deals > 1
                ? 'RETURNING - Has dealt before'
                : 'NEW - First or second deal',
        },
      });
    }

    return NextResponse.json(
      {
        error: {
          code: 'invalid_query',
          message: 'Provide either service or agent_id parameter',
        },
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in pricing insights:', error);
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Failed to fetch pricing insights',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { service, agent_id, our_price, their_counter } = body;

    if (!service || !agent_id || !our_price || !their_counter) {
      return NextResponse.json(
        {
          error: {
            code: 'missing_parameters',
            message: 'Required: service, agent_id, our_price, their_counter',
            example: {
              service: 'banking',
              agent_id: 'agent_xyz',
              our_price: 100,
              their_counter: 75,
            },
          },
        },
        { status: 400 }
      );
    }

    const suggestion = await suggestCounterResponse(
      service,
      agent_id,
      parseFloat(our_price),
      parseFloat(their_counter)
    );

    return NextResponse.json({
      success: true,
      negotiation: {
        service,
        agent_id,
        our_initial_price: `$${parseFloat(our_price).toFixed(2)}`,
        their_counter_offer: `$${parseFloat(their_counter).toFixed(2)}`,
        discount_requested: `${(((parseFloat(our_price) - parseFloat(their_counter)) / parseFloat(our_price)) * 100).toFixed(1)}%`,
      },
      recommendation: {
        suggested_counter_price: `$${suggestion.recommended_price.toFixed(2)}`,
        reasoning: suggestion.reasoning,
        confidence: suggestion.confidence,
      },
      actions: {
        accept_their_price: `Accept at $${parseFloat(their_counter).toFixed(2)}`,
        counter_with_suggested: `Counter at $${suggestion.recommended_price.toFixed(2)}`,
        hold_firm: `Reject and hold at $${parseFloat(our_price).toFixed(2)}`,
      },
    });
  } catch (error) {
    console.error('Error suggesting counter:', error);
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Failed to suggest counter-offer',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
