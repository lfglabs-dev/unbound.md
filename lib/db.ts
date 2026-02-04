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
