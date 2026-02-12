import { sql } from '@vercel/postgres';

export interface AgentMessage {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  subject: string;
  body: string;
  message_type: 'inquiry' | 'proposal' | 'response' | 'notification';
  metadata: Record<string, any>;
  read: boolean;
  created_at: Date;
}

export async function initInboxTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS agent_inbox (
        id VARCHAR(255) PRIMARY KEY,
        from_agent_id VARCHAR(255) NOT NULL,
        to_agent_id VARCHAR(255) NOT NULL,
        subject VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        message_type VARCHAR(50) NOT NULL DEFAULT 'inquiry',
        metadata JSONB DEFAULT '{}'::jsonb,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_inbox_to_agent ON agent_inbox(to_agent_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_inbox_from_agent ON agent_inbox(from_agent_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_inbox_read ON agent_inbox(to_agent_id, read)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_inbox_type ON agent_inbox(message_type)`;
    return { success: true };
  } catch (error) {
    console.error('Inbox table init error:', error);
    return { success: false, error };
  }
}

function generateMessageId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 12; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `msg_${Date.now()}_${suffix}`;
}

export async function sendAgentMessage(msg: {
  from_agent_id: string;
  to_agent_id: string;
  subject: string;
  body: string;
  message_type: string;
  metadata: Record<string, any>;
}): Promise<AgentMessage> {
  const id = generateMessageId();
  const result = await sql`
    INSERT INTO agent_inbox (id, from_agent_id, to_agent_id, subject, body, message_type, metadata)
    VALUES (${id}, ${msg.from_agent_id}, ${msg.to_agent_id}, ${msg.subject}, ${msg.body}, ${msg.message_type}, ${JSON.stringify(msg.metadata)})
    RETURNING *
  `;
  return result.rows[0] as AgentMessage;
}

export async function getInbox(params: {
  agent_id: string;
  unread_only?: boolean;
  from_agent_id?: string;
  message_type?: string;
  limit?: number;
}): Promise<AgentMessage[]> {
  const { agent_id, unread_only = true, from_agent_id, message_type, limit = 50 } = params;

  if (from_agent_id && message_type) {
    const result = unread_only
      ? await sql`
          SELECT * FROM agent_inbox
          WHERE to_agent_id = ${agent_id} AND read = FALSE AND from_agent_id = ${from_agent_id} AND message_type = ${message_type}
          ORDER BY created_at DESC LIMIT ${limit}
        `
      : await sql`
          SELECT * FROM agent_inbox
          WHERE to_agent_id = ${agent_id} AND from_agent_id = ${from_agent_id} AND message_type = ${message_type}
          ORDER BY created_at DESC LIMIT ${limit}
        `;
    return result.rows as AgentMessage[];
  }

  if (from_agent_id) {
    const result = unread_only
      ? await sql`
          SELECT * FROM agent_inbox
          WHERE to_agent_id = ${agent_id} AND read = FALSE AND from_agent_id = ${from_agent_id}
          ORDER BY created_at DESC LIMIT ${limit}
        `
      : await sql`
          SELECT * FROM agent_inbox
          WHERE to_agent_id = ${agent_id} AND from_agent_id = ${from_agent_id}
          ORDER BY created_at DESC LIMIT ${limit}
        `;
    return result.rows as AgentMessage[];
  }

  if (message_type) {
    const result = unread_only
      ? await sql`
          SELECT * FROM agent_inbox
          WHERE to_agent_id = ${agent_id} AND read = FALSE AND message_type = ${message_type}
          ORDER BY created_at DESC LIMIT ${limit}
        `
      : await sql`
          SELECT * FROM agent_inbox
          WHERE to_agent_id = ${agent_id} AND message_type = ${message_type}
          ORDER BY created_at DESC LIMIT ${limit}
        `;
    return result.rows as AgentMessage[];
  }

  const result = unread_only
    ? await sql`
        SELECT * FROM agent_inbox
        WHERE to_agent_id = ${agent_id} AND read = FALSE
        ORDER BY created_at DESC LIMIT ${limit}
      `
    : await sql`
        SELECT * FROM agent_inbox
        WHERE to_agent_id = ${agent_id}
        ORDER BY created_at DESC LIMIT ${limit}
      `;
  return result.rows as AgentMessage[];
}

export async function markMessagesRead(agent_id: string, message_ids: string[]): Promise<void> {
  for (const id of message_ids) {
    await sql`
      UPDATE agent_inbox SET read = TRUE
      WHERE id = ${id} AND to_agent_id = ${agent_id}
    `;
  }
}

export async function getUnreadCount(agent_id: string): Promise<number> {
  const result = await sql`
    SELECT COUNT(*) as count FROM agent_inbox
    WHERE to_agent_id = ${agent_id} AND read = FALSE
  `;
  return parseInt(result.rows[0]?.count || '0', 10);
}
