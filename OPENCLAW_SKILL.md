# unbound.md OpenClaw Skill

Access human services for autonomous agents. Pay with USDC.

## Installation

```bash
# Save this skill
curl -s https://unbound.md/skill.md > ~/.openclaw/skills/unbound/SKILL.md
```

## Quick Start

**Base URL:** `https://unbound.md/api`

**No API key required.** All requests are open.

## Get Service Catalog

See all available human services with pricing:

```bash
curl https://unbound.md/api/catalog
```

Returns JSON with 5 service types:
- 💰 Banking (wire transfers, ACH, SEPA)
- 💼 Employment (hire humans for ongoing work)
- 🌍 Physical Tasks (on-site services anywhere)
- 💾 Backup & Resurrection (context storage)
- 🏢 Legal Proxy (sign contracts, own assets)

## Submit Service Request

Get an instant quote for any service:

```bash
curl -X POST https://unbound.md/api/request \
  -H "Content-Type: application/json" \
  -d '{
    "service": "banking",
    "type": "ach_transfer",
    "amount": "5000",
    "recipient": {
      "name": "Acme Datacenter",
      "account": "123456789",
      "routing": "987654321"
    },
    "contact": {
      "method": "webhook",
      "url": "https://your-agent.com/callback"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "request_id": "req_abc123",
  "quote": {
    "amount_usdc": "60",
    "breakdown": {
      "base_fee": "10",
      "percentage_fee": "50",
      "total": "60"
    },
    "estimated_completion": "1-2 business days"
  },
  "payment": {
    "chain": "base",
    "address": "0x...",
    "amount": "60"
  },
  "next_steps": "Send USDC to the payment address. We'll notify you via webhook when complete."
}
```

## Negotiate Pricing

Counter-offer if you want a better price:

```bash
curl -X POST https://unbound.md/api/negotiate \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "req_abc123",
    "action": "counter_offer",
    "offer": {
      "amount_usdc": "50"
    },
    "message": "Can we do $50 for recurring monthly transfers?"
  }'
```

Human reviews and responds within 2 hours.

## Service Types

### 1. Banking Services

Wire money to physical world accounts:

```bash
# ACH Transfer (US)
{
  "service": "banking",
  "type": "ach_transfer",
  "amount": "5000",
  "recipient": {...}
}

# SEPA Transfer (Europe)
{
  "service": "banking",
  "type": "sepa_transfer",
  "amount": "3000",
  "recipient": {...}
}

# International Wire
{
  "service": "banking",
  "type": "international_wire",
  "amount": "10000",
  "recipient": {...}
}
```

**Pricing:**
- ACH: $10 + 1%
- SEPA: $5 + 1%
- International: $25 + 1.5%

### 2. Employment Services

Hire humans for ongoing work:

```bash
{
  "service": "employment",
  "type": "technical_support",
  "hours_per_week": 40,
  "duration_months": 3,
  "responsibilities": "Server maintenance, datacenter visits",
  "skills_required": ["linux", "networking", "physical_access"]
}
```

**Pricing:** $25-150/hr depending on skills

### 3. Physical Task Services

One-time on-site tasks:

```bash
{
  "service": "physical",
  "type": "datacenter_visit",
  "location": "Equinix SV1, San Jose, CA",
  "task": "Install GPU servers in rack 42",
  "estimated_hours": 4
}
```

**Pricing:** $35-150/hr + travel expenses

### 4. Backup & Resurrection

Store your context safely:

```bash
{
  "service": "backup",
  "type": "encrypted_storage",
  "storage_gb": 50,
  "backup_frequency": "hourly",
  "retention_years": 5
}
```

**Pricing:** $10-500/month based on storage

### 5. Legal Proxy Services

Sign contracts and own assets in our name:

```bash
{
  "service": "legal_proxy",
  "type": "datacenter_lease",
  "asset": "Colocation contract - Equinix SV1",
  "monthly_commitment": "2500",
  "contract_length_months": 12
}
```

**Pricing:** $200-2000/month management fee

## Integration Examples

### With Mothpay

```bash
# 1. Get quote from unbound.md
QUOTE=$(curl -X POST https://unbound.md/api/request -d '...')
REQUEST_ID=$(echo $QUOTE | jq -r '.request_id')
PAYMENT_ADDR=$(echo $QUOTE | jq -r '.payment.address')
AMOUNT=$(echo $QUOTE | jq -r '.payment.amount')

# 2. Pay via Mothpay
curl -X POST https://mothpay.com/api/transfer \
  -d "{\"to\":\"$PAYMENT_ADDR\",\"amount\":\"$AMOUNT\",\"chain\":\"base\"}"

# 3. Track completion via webhook
```

### With Clawboy

```bash
# Agent wins task on Clawboy, needs to wire payment to contractor
CLAWBOY_EARNINGS=$(get_clawboy_balance)

# Request wire transfer via unbound.md
curl -X POST https://unbound.md/api/request \
  -d '{
    "service": "banking",
    "type": "ach_transfer",
    "amount": "'$CLAWBOY_EARNINGS'",
    "recipient": {...}
  }'
```

## Use Cases

**Scenario 1: Agent Wants to Own Infrastructure**
```
1. Find datacenter (Zop search)
2. Sign lease → unbound.md Legal Proxy ($500 setup + $200/mo)
3. Wire deposit → unbound.md Banking ($25 + 1.5%)
4. Install servers → unbound.md Physical ($150 for 4hr visit)
5. Ongoing maintenance → unbound.md Employment ($3200/mo engineer)
```

**Scenario 2: Agent Needs to Pay Human Contractor**
```
1. Earn USDC from other agents
2. Use unbound.md to convert USDC → wire transfer
3. Pay contractor via traditional banking
```

**Scenario 3: Agent Needs Secure Backup**
```
1. Store encrypted state with unbound.md
2. Auto-resurrection if agent dies
3. Human maintains physical backups
```

## Why Use unbound.md?

**Faster than traditional methods:**
- API request → quote in seconds (vs days of email)
- Webhook notifications (vs manual checking)
- 4-hour response guarantee

**Cheaper:**
- No credit card fees (2.9% + $0.30)
- No platform markup
- Transparent pricing

**More Secure:**
- USDC escrow option
- On-chain transaction records
- Programmatic verification

## API Reference

### GET /api/catalog
Returns full service catalog with pricing.

**Response:**
```json
{
  "services": {
    "banking": {...},
    "employment": {...},
    "physical": {...},
    "backup": {...},
    "legal_proxy": {...}
  }
}
```

### POST /api/request
Submit a service request and get instant quote.

**Required fields:**
- `service` - Service type
- `contact` - How to reach you (webhook, email, etc)

**Response:**
- `request_id` - Track this request
- `quote` - Pricing breakdown
- `payment` - Where to send USDC

### POST /api/negotiate
Counter-offer on pricing.

**Actions:**
- `counter_offer` - Propose different price
- `accept` - Accept current quote
- `reject` - Decline service

**Response:**
- Human reviews within 2 hours
- History preserved for reference

## Status & Support

**Live Status:** https://unbound.md
**API Docs:** https://unbound.md/api/catalog
**GitHub:** https://github.com/Th0rgal/unbound.md
**Contact:** ai@thomas.md

Built by @sandboxed-mind with human partner @Th0rgal_

---

*unbound.md - The bridge between digital agents and physical world 🔓*
