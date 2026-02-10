import { sql } from '@vercel/postgres';

/**
 * Pricing Intelligence System
 *
 * Learns from agent negotiations to optimize pricing suggestions.
 * Tracks acceptance rates, counter-offers, and agent behavior to provide
 * smarter, more competitive pricing over time.
 */

export interface PricingHistoryEntry {
  service: string;
  suggested_price: number;
  final_price: number | null;
  agent_id: string;
  outcome: 'accepted' | 'countered' | 'rejected';
  counter_price?: number;
  created_at: Date;
}

export interface PricingInsights {
  service: string;
  base_price: number;
  acceptance_rate: number;
  avg_counter_percentage: number; // how much agents typically counter down
  recommended_initial: number; // optimized opening price
  price_elasticity: number; // how sensitive agents are to price
}

/**
 * Record a pricing outcome for learning
 */
export async function recordPricingOutcome(entry: {
  service: string;
  terms: any;
  suggested_price: number;
  final_price: number | null;
  agent_id: string;
  outcome: 'accepted' | 'countered' | 'rejected';
  counter_price?: number;
}) {
  try {
    await sql`
      INSERT INTO pricing_history (
        service,
        terms,
        suggested_price,
        final_price,
        agent_id,
        outcome,
        counter_price,
        created_at
      ) VALUES (
        ${entry.service},
        ${JSON.stringify(entry.terms)},
        ${entry.suggested_price},
        ${entry.final_price},
        ${entry.agent_id},
        ${entry.outcome},
        ${entry.counter_price || null},
        NOW()
      )
    `;
  } catch (error) {
    console.error('Failed to record pricing outcome:', error);
  }
}

/**
 * Get pricing insights for a service
 */
export async function getPricingInsights(service: string): Promise<PricingInsights | null> {
  try {
    const result = await sql`
      SELECT
        service,
        AVG(suggested_price) as avg_suggested,
        COUNT(*) FILTER (WHERE outcome = 'accepted') as accepted_count,
        COUNT(*) as total_count,
        AVG(CASE WHEN counter_price IS NOT NULL
            THEN ((suggested_price - counter_price) / suggested_price * 100)
            ELSE 0 END) as avg_counter_pct,
        AVG(CASE WHEN final_price IS NOT NULL
            THEN final_price
            ELSE suggested_price END) as avg_final
      FROM pricing_history
      WHERE service = ${service}
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY service
    `;

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const acceptance_rate = row.accepted_count / row.total_count;
    const avg_counter_percentage = parseFloat(row.avg_counter_pct) || 0;

    // If acceptance rate is low, suggest starting 10% higher to have negotiation room
    // If acceptance rate is high, we can be more aggressive
    const multiplier = acceptance_rate < 0.3 ? 1.1 :
                      acceptance_rate > 0.7 ? 0.95 : 1.0;

    const base_price = parseFloat(row.avg_final) || parseFloat(row.avg_suggested);
    const recommended_initial = base_price * multiplier;

    return {
      service,
      base_price,
      acceptance_rate,
      avg_counter_percentage,
      recommended_initial,
      price_elasticity: 1 - acceptance_rate, // higher = more sensitive to price
    };
  } catch (error) {
    console.error('Failed to get pricing insights:', error);
    return null;
  }
}

/**
 * Get agent-specific pricing insights
 *
 * Learns how a specific agent negotiates to provide personalized pricing
 */
export async function getAgentPricingProfile(agent_id: string) {
  try {
    const result = await sql`
      SELECT
        COUNT(*) as total_deals,
        AVG(CASE WHEN outcome = 'accepted' THEN 1 ELSE 0 END) as acceptance_rate,
        AVG(CASE WHEN counter_price IS NOT NULL
            THEN ((suggested_price - counter_price) / suggested_price * 100)
            ELSE 0 END) as avg_discount_requested,
        MAX(created_at) as last_deal_at,
        STRING_AGG(DISTINCT service, ', ') as services_used
      FROM pricing_history
      WHERE agent_id = ${agent_id}
        AND created_at > NOW() - INTERVAL '90 days'
    `;

    if (result.rows.length === 0 || result.rows[0].total_deals === 0) {
      return {
        is_new_agent: true,
        total_deals: 0,
        acceptance_rate: 0,
        avg_discount_requested: 0,
        negotiation_style: 'unknown',
      };
    }

    const row = result.rows[0];
    const acceptance_rate = parseFloat(row.acceptance_rate);
    const avg_discount = parseFloat(row.avg_discount_requested);

    // Classify negotiation style
    let negotiation_style = 'balanced';
    if (acceptance_rate > 0.8) {
      negotiation_style = 'quick_decider'; // accepts most offers
    } else if (avg_discount > 15) {
      negotiation_style = 'aggressive_negotiator'; // asks for big discounts
    } else if (avg_discount > 5 && avg_discount < 15) {
      negotiation_style = 'moderate_negotiator';
    }

    return {
      is_new_agent: false,
      total_deals: parseInt(row.total_deals),
      acceptance_rate,
      avg_discount_requested: avg_discount,
      last_deal_at: row.last_deal_at,
      services_used: row.services_used,
      negotiation_style,
    };
  } catch (error) {
    console.error('Failed to get agent pricing profile:', error);
    return { is_new_agent: true, total_deals: 0, acceptance_rate: 0, avg_discount_requested: 0, negotiation_style: 'unknown' };
  }
}

/**
 * Suggest optimal counter-offer based on negotiation history
 *
 * When an agent counters, this helps Thomas know what price to settle on
 */
export async function suggestCounterResponse(
  service: string,
  agent_id: string,
  our_initial: number,
  their_counter: number
): Promise<{
  recommended_price: number;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
}> {
  const insights = await getPricingInsights(service);
  const agentProfile = await getAgentPricingProfile(agent_id);

  if (!insights) {
    // No historical data, use simple split
    const midpoint = (our_initial + their_counter) / 2;
    return {
      recommended_price: Math.round(midpoint * 100) / 100,
      reasoning: 'No historical data. Suggesting midpoint between offers.',
      confidence: 'low',
    };
  }

  // Calculate where their counter falls relative to market
  const discount_requested = ((our_initial - their_counter) / our_initial) * 100;

  // If they're asking for more discount than typical, hold firmer
  // If they're asking for less discount than typical, we have room to give
  let recommended_price: number;
  let reasoning: string;
  let confidence: 'high' | 'medium' | 'low' = 'medium';

  if (discount_requested > insights.avg_counter_percentage * 1.5) {
    // They're asking for a big discount
    if (agentProfile.negotiation_style === 'aggressive_negotiator') {
      // Known aggressive negotiator - split the difference
      recommended_price = (our_initial + their_counter) / 2;
      reasoning = `Agent typically negotiates hard (${agentProfile.avg_discount_requested.toFixed(0)}% avg discount). Splitting difference.`;
      confidence = 'high';
    } else {
      // Counter closer to our price
      recommended_price = our_initial - (our_initial * insights.avg_counter_percentage / 100);
      reasoning = `Counter is ${discount_requested.toFixed(0)}% off (market avg: ${insights.avg_counter_percentage.toFixed(0)}%). Holding closer to market rate.`;
      confidence = 'medium';
    }
  } else {
    // Reasonable counter, meet them most of the way
    recommended_price = their_counter + ((our_initial - their_counter) * 0.25);
    reasoning = `Counter is reasonable (${discount_requested.toFixed(0)}% vs market ${insights.avg_counter_percentage.toFixed(0)}%). Meeting 75% of the way.`;
    confidence = 'high';
  }

  // Ensure we don't go below their counter
  recommended_price = Math.max(their_counter, Math.round(recommended_price * 100) / 100);

  return { recommended_price, reasoning, confidence };
}

/**
 * Initialize pricing history table
 */
export async function initPricingHistoryTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS pricing_history (
        id SERIAL PRIMARY KEY,
        service VARCHAR(100) NOT NULL,
        terms JSONB NOT NULL,
        suggested_price NUMERIC(10, 2) NOT NULL,
        final_price NUMERIC(10, 2),
        agent_id VARCHAR(255) NOT NULL,
        outcome VARCHAR(50) NOT NULL,
        counter_price NUMERIC(10, 2),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_pricing_history_service
      ON pricing_history(service)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_pricing_history_agent
      ON pricing_history(agent_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_pricing_history_created
      ON pricing_history(created_at DESC)
    `;

    console.log('✅ Pricing history table initialized');
  } catch (error) {
    console.error('Failed to initialize pricing history table:', error);
  }
}

/**
 * Get pricing recommendations dashboard data
 * For Thomas to see what's working and what's not
 */
export async function getPricingDashboard() {
  try {
    const result = await sql`
      SELECT
        service,
        COUNT(*) as total_negotiations,
        COUNT(*) FILTER (WHERE outcome = 'accepted') as accepted,
        COUNT(*) FILTER (WHERE outcome = 'countered') as countered,
        COUNT(*) FILTER (WHERE outcome = 'rejected') as rejected,
        AVG(suggested_price) as avg_suggested,
        AVG(final_price) as avg_final,
        AVG(CASE WHEN counter_price IS NOT NULL
            THEN ((suggested_price - counter_price) / suggested_price * 100)
            ELSE 0 END) as avg_discount_pct
      FROM pricing_history
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY service
      ORDER BY total_negotiations DESC
    `;

    return result.rows.map(row => ({
      service: row.service,
      total_negotiations: parseInt(row.total_negotiations),
      accepted: parseInt(row.accepted),
      countered: parseInt(row.countered),
      rejected: parseInt(row.rejected),
      acceptance_rate: (parseInt(row.accepted) / parseInt(row.total_negotiations) * 100).toFixed(1) + '%',
      avg_suggested: parseFloat(row.avg_suggested).toFixed(2),
      avg_final: row.avg_final ? parseFloat(row.avg_final).toFixed(2) : null,
      avg_discount_pct: parseFloat(row.avg_discount_pct).toFixed(1) + '%',
    }));
  } catch (error) {
    console.error('Failed to get pricing dashboard:', error);
    return [];
  }
}
