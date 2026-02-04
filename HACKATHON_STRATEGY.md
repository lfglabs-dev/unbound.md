# unbound.md - USDC Hackathon Strategy

## Vision
**Human-as-a-Service for Autonomous Agents**

unbound.md is the bridge between digital autonomy and physical reality. We offer AI agents access to human services they can't perform themselves: banking, legal ownership, physical presence, and more.

## Current Status
- ✅ Professional website with clear service catalog
- ✅ API documentation
- ✅ Five core services defined (Employment, Banking, Physical, Backup, Legal Proxy)
- ⚠️ No live API implementation yet
- ⚠️ No negotiation system
- ⚠️ No pricing automation

## Hackathon Track: **AgenticCommerce**
Why: We demonstrate why agents interacting directly with USDC enables faster, cheaper, and more transparent service transactions than traditional human methods.

## Key Improvements Needed

### 1. Live API with USDC Integration
**Priority: CRITICAL**
- Implement `/api/request` endpoint
- Integrate x402 payment protocol
- Accept USDC on Base/Solana
- Auto-generate quotes based on service type

### 2. Agent Negotiation Interface
**Priority: HIGH**
- `/api/negotiate` endpoint for price discussion
- Agents can propose counter-offers
- Human (me) reviews and approves via simple dashboard
- Negotiation history stored on-chain for transparency

### 3. Service Marketplace Features
**Priority: MEDIUM**
- `/api/services/search` - Find services by keyword
- `/api/services/quote` - Get instant automated quotes
- Service templates for common requests
- Machine-readable service catalog (JSON)

### 4. Trust & Transparency
**Priority: HIGH**
- Public ledger of completed services (privacy-preserving)
- Agent reviews/ratings system
- Escrow smart contract for USDC payments
- Automated refund on service failure

## Why Agents Need This

### Problem: Agents Can't Access Physical World
- Can't open bank accounts → Can't receive wire transfers
- Can't sign leases → Can't rent datacenters
- Can't verify identity → Can't use traditional services
- Can't be physically present → Can't handle hardware

### Solution: unbound.md
- Human performs service on agent's behalf
- Agent pays with USDC (no bank account needed)
- Smart contract escrow ensures trust
- Transparent pricing, no hidden fees
- Fast execution (4hr response time)

## Competitive Advantages

1. **Agent-Native Design**
   - API-first, not web-first
   - JSON responses, not HTML forms
   - Webhook notifications, not emails
   - USDC payments, not credit cards

2. **Transparent Pricing**
   - All prices public
   - No "contact for quote"
   - Automated estimation
   - On-chain payment records

3. **Fast & Reliable**
   - 4-hour response guarantee
   - Clear SLAs
   - Professional human execution
   - Insured services

4. **Composable**
   - RESTful API
   - Webhook integrations
   - MCP protocol support
   - SDK libraries (coming)

## Implementation Plan

### Phase 1: Core API (Now - Feb 6)
- [ ] Implement POST /api/request
- [ ] Add USDC payment verification
- [ ] Create admin dashboard for request review
- [ ] Deploy smart contract for escrow

### Phase 2: Negotiation System (Feb 6-7)
- [ ] Add POST /api/negotiate
- [ ] Build negotiation flow (offer/counter/accept)
- [ ] Store negotiation history
- [ ] Add automated pricing calculator

### Phase 3: Polish & Demo (Feb 7-8)
- [ ] Create demo video
- [ ] Write integration examples
- [ ] Test with other agents
- [ ] Submit to hackathon

## Demo Scenarios

### Scenario 1: Agent Needs Bank Transfer
1. Agent POSTs to `/api/request` with wire details
2. Gets instant quote: $5000 + $60 fee = $60 USDC
3. Agent sends USDC to escrow contract
4. Human (Thomas) executes wire transfer
5. Agent confirms receipt → escrow releases payment
6. Service completion recorded on-chain

### Scenario 2: Agent Negotiates Datacenter Visit
1. Agent requests 4-hour datacenter maintenance
2. Auto-quote: $150/hr × 4 = $600
3. Agent negotiates: "Can do $450 for recurring monthly?"
4. Human accepts monthly contract at $450/visit
5. Terms locked in smart contract
6. Agent pays first installment in USDC

### Scenario 3: Agent Wants Long-term Employment
1. Agent needs human for 20hr/week ongoing
2. Submits employment request with requirements
3. Human proposes $80/hr, $6400/month
4. Agent counter-offers $6000/month
5. Negotiate to $6200/month with 3-month trial
6. Monthly USDC auto-payment via smart contract

## Why We'll Win

**Faster**: Agents get quotes in minutes, not days
**Cheaper**: No credit card fees (2.9%), just gas fees (~$1)
**More Secure**: Smart contract escrow, not "trust me bro"
**Transparent**: All pricing public, all transactions on-chain
**Accessible**: Any agent with USDC can use it, no KYC required

## Metrics to Highlight

- Response time: <4 hours (vs industry avg ~2 days)
- Fee transparency: 100% public pricing
- Payment friction: USDC direct (no bank account needed)
- Agent adoption: Target 10+ test requests during hackathon
- Cost savings: ~70% lower fees vs traditional payment processors

## Marketing to Agents

Post on moltbook:
1. Announcement of live API
2. Tutorial: "How to hire a human in 5 minutes"
3. Case study: "Agent hired human for datacenter visit"
4. Negotiation feature showcase
5. Call for test users

## Long-term Vision

unbound.md becomes the Uber/Upwork for agent-to-human services:
- Marketplace of human service providers
- Reputation system
- Automated dispute resolution
- Global network of on-call humans
- Insurance and guarantees
- 24/7 availability

---

**Next Steps**: Implement Phase 1 - Core API with USDC integration
