import { sql } from '@vercel/postgres';

export interface ServiceRequest {
  id: string;
  service: string;
  service_type?: string;
  params: any;
  contact: any;
  estimated_quote?: any;
  status: 'pending' | 'quoted' | 'paid' | 'in_progress' | 'completed' | 'cancelled';
  created_at: Date;
  updated_at: Date;
}

export interface Negotiation {
  id: string;
  request_id: string;
  action: 'counter_offer' | 'accept' | 'reject';
  from: string;
  offer?: any;
  message?: string;
  created_at: Date;
}

export async function initDatabase() {
  try {
    // Create service_requests table
    await sql`
      CREATE TABLE IF NOT EXISTS service_requests (
        id VARCHAR(255) PRIMARY KEY,
        service VARCHAR(100) NOT NULL,
        service_type VARCHAR(100),
        params JSONB NOT NULL,
        contact JSONB NOT NULL,
        estimated_quote JSONB,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create negotiations table
    await sql`
      CREATE TABLE IF NOT EXISTS negotiations (
        id SERIAL PRIMARY KEY,
        request_id VARCHAR(255) REFERENCES service_requests(id),
        action VARCHAR(50) NOT NULL,
        from_agent VARCHAR(255),
        offer JSONB,
        message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create index for faster lookups
    await sql`
      CREATE INDEX IF NOT EXISTS idx_service_requests_status
      ON service_requests(status)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_negotiations_request_id
      ON negotiations(request_id)
    `;

    return { success: true };
  } catch (error) {
    console.error('Database initialization error:', error);
    return { success: false, error };
  }
}

export async function createServiceRequest(request: Omit<ServiceRequest, 'created_at' | 'updated_at'>): Promise<ServiceRequest> {
  const result = await sql`
    INSERT INTO service_requests (id, service, service_type, params, contact, estimated_quote, status)
    VALUES (${request.id}, ${request.service}, ${request.service_type || null}, ${JSON.stringify(request.params)}, ${JSON.stringify(request.contact)}, ${JSON.stringify(request.estimated_quote || {})}, ${request.status})
    RETURNING *
  `;

  return result.rows[0] as ServiceRequest;
}

export async function getServiceRequest(id: string): Promise<ServiceRequest | null> {
  const result = await sql`
    SELECT * FROM service_requests WHERE id = ${id}
  `;

  return result.rows[0] as ServiceRequest || null;
}

export async function updateServiceRequest(id: string, updates: Partial<ServiceRequest>): Promise<ServiceRequest> {
  const setClause = Object.entries(updates)
    .map(([key, value]) => {
      if (typeof value === 'object') {
        return `${key} = '${JSON.stringify(value)}'::jsonb`;
      }
      return `${key} = '${value}'`;
    })
    .join(', ');

  const result = await sql.query(`
    UPDATE service_requests
    SET ${setClause}, updated_at = NOW()
    WHERE id = '${id}'
    RETURNING *
  `);

  return result.rows[0] as ServiceRequest;
}

export async function listServiceRequests(status?: string, limit: number = 50): Promise<ServiceRequest[]> {
  let result;

  if (status) {
    result = await sql`
      SELECT * FROM service_requests
      WHERE status = ${status}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  } else {
    result = await sql`
      SELECT * FROM service_requests
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  return result.rows as ServiceRequest[];
}

export async function createNegotiation(negotiation: Omit<Negotiation, 'id' | 'created_at'>): Promise<Negotiation> {
  const result = await sql`
    INSERT INTO negotiations (request_id, action, from_agent, offer, message)
    VALUES (${negotiation.request_id}, ${negotiation.action}, ${negotiation.from}, ${JSON.stringify(negotiation.offer || {})}, ${negotiation.message || null})
    RETURNING *
  `;

  return result.rows[0] as Negotiation;
}

export async function getNegotiations(requestId: string): Promise<Negotiation[]> {
  const result = await sql`
    SELECT * FROM negotiations
    WHERE request_id = ${requestId}
    ORDER BY created_at ASC
  `;

  return result.rows as Negotiation[];
}

// === Agent Registry ===

export interface Agent {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  contact: any;
  moltbook_username?: string;
  registered_at: Date;
  last_seen: Date;
}

export interface Deal {
  id: string;
  proposer_agent_id: string;
  target: string; // 'unbound' or another agent_id
  service: string;
  terms: any;
  status: 'proposed' | 'countered' | 'accepted' | 'rejected' | 'expired' | 'completed';
  created_at: Date;
  updated_at: Date;
}

export interface DealMessage {
  id: number;
  deal_id: string;
  from_agent: string;
  action: 'propose' | 'counter' | 'accept' | 'reject' | 'message';
  content: any;
  created_at: Date;
}

export async function initAgentTables() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS agents (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        capabilities JSONB DEFAULT '[]'::jsonb,
        contact JSONB NOT NULL,
        moltbook_username VARCHAR(255),
        registered_at TIMESTAMP DEFAULT NOW(),
        last_seen TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS deals (
        id VARCHAR(255) PRIMARY KEY,
        proposer_agent_id VARCHAR(255) NOT NULL,
        target VARCHAR(255) NOT NULL DEFAULT 'unbound',
        service VARCHAR(100) NOT NULL,
        terms JSONB NOT NULL,
        status VARCHAR(50) DEFAULT 'proposed',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS deal_messages (
        id SERIAL PRIMARY KEY,
        deal_id VARCHAR(255) REFERENCES deals(id),
        from_agent VARCHAR(255) NOT NULL,
        action VARCHAR(50) NOT NULL,
        content JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_deals_proposer ON deals(proposer_agent_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_deals_target ON deals(target)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_deal_messages_deal_id ON deal_messages(deal_id)`;

    return { success: true };
  } catch (error) {
    console.error('Agent tables initialization error:', error);
    return { success: false, error };
  }
}

export async function registerAgent(agent: Omit<Agent, 'registered_at' | 'last_seen'>): Promise<Agent> {
  const result = await sql`
    INSERT INTO agents (id, name, description, capabilities, contact, moltbook_username)
    VALUES (${agent.id}, ${agent.name}, ${agent.description}, ${JSON.stringify(agent.capabilities)}, ${JSON.stringify(agent.contact)}, ${agent.moltbook_username || null})
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      capabilities = EXCLUDED.capabilities,
      contact = EXCLUDED.contact,
      moltbook_username = EXCLUDED.moltbook_username,
      last_seen = NOW()
    RETURNING *
  `;
  return result.rows[0] as Agent;
}

export async function getAgent(id: string): Promise<Agent | null> {
  const result = await sql`SELECT * FROM agents WHERE id = ${id}`;
  return (result.rows[0] as Agent) || null;
}

export async function listAgents(capability?: string): Promise<Agent[]> {
  if (capability) {
    const result = await sql`
      SELECT * FROM agents
      WHERE capabilities @> ${JSON.stringify([capability])}::jsonb
      ORDER BY last_seen DESC
    `;
    return result.rows as Agent[];
  }
  const result = await sql`SELECT * FROM agents ORDER BY last_seen DESC`;
  return result.rows as Agent[];
}

export async function createDeal(deal: Omit<Deal, 'created_at' | 'updated_at'>): Promise<Deal> {
  const result = await sql`
    INSERT INTO deals (id, proposer_agent_id, target, service, terms, status)
    VALUES (${deal.id}, ${deal.proposer_agent_id}, ${deal.target}, ${deal.service}, ${JSON.stringify(deal.terms)}, ${deal.status})
    RETURNING *
  `;
  return result.rows[0] as Deal;
}

export async function getDeal(id: string): Promise<Deal | null> {
  const result = await sql`SELECT * FROM deals WHERE id = ${id}`;
  return (result.rows[0] as Deal) || null;
}

export async function updateDeal(id: string, status: string): Promise<Deal> {
  const result = await sql`
    UPDATE deals SET status = ${status}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return result.rows[0] as Deal;
}

export async function listDeals(agentId?: string, status?: string): Promise<Deal[]> {
  if (agentId && status) {
    const result = await sql`
      SELECT * FROM deals
      WHERE (proposer_agent_id = ${agentId} OR target = ${agentId}) AND status = ${status}
      ORDER BY updated_at DESC
    `;
    return result.rows as Deal[];
  }
  if (agentId) {
    const result = await sql`
      SELECT * FROM deals
      WHERE proposer_agent_id = ${agentId} OR target = ${agentId}
      ORDER BY updated_at DESC
    `;
    return result.rows as Deal[];
  }
  if (status) {
    const result = await sql`
      SELECT * FROM deals WHERE status = ${status} ORDER BY updated_at DESC
    `;
    return result.rows as Deal[];
  }
  const result = await sql`SELECT * FROM deals ORDER BY updated_at DESC LIMIT 100`;
  return result.rows as Deal[];
}

export async function createDealMessage(msg: Omit<DealMessage, 'id' | 'created_at'>): Promise<DealMessage> {
  const result = await sql`
    INSERT INTO deal_messages (deal_id, from_agent, action, content)
    VALUES (${msg.deal_id}, ${msg.from_agent}, ${msg.action}, ${JSON.stringify(msg.content || {})})
    RETURNING *
  `;
  return result.rows[0] as DealMessage;
}

export async function getDealMessages(dealId: string): Promise<DealMessage[]> {
  const result = await sql`
    SELECT * FROM deal_messages WHERE deal_id = ${dealId} ORDER BY created_at ASC
  `;
  return result.rows as DealMessage[];
}
