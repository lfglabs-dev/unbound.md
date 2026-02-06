import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import {
  initProofTable,
  createCommitRevealProof,
  getCommitRevealProof,
  updateCommitRevealProof,
  listCommitRevealProofs,
  type CommitRevealProof,
} from '@/lib/db';

let tableInitialized = false;

async function ensureTable() {
  if (!tableInitialized) {
    await initProofTable();
    tableInitialized = true;
  }
}

function computeHash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    await ensureTable();
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'commit':
        return handleCommit(body);
      case 'submit_evidence':
        return handleSubmitEvidence(body);
      case 'verify':
        return handleVerify(body);
      case 'challenge':
        return handleChallenge(body);
      default:
        return NextResponse.json({
          error: 'Unknown action',
          available_actions: {
            commit: 'Human commits a hash of their execution plan before starting',
            submit_evidence: 'Human submits evidence of completed work',
            verify: 'Agent verifies the proof and releases payment',
            challenge: 'Agent challenges the proof within the challenge window',
          },
          flow: [
            '1. Human commits plan hash (before starting work)',
            '2. Human executes the physical task',
            '3. Human submits evidence + reveals plan',
            '4. System verifies plan matches commitment',
            '5. 24-hour challenge window opens',
            '6. If unchallenged, proof is verified and payment released',
          ],
          documentation: 'https://unbound.md/api',
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Proof API error:', error);
    return NextResponse.json({
      error: 'Failed to process proof request',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

async function handleCommit(body: any) {
  const { deal_id, request_id, operator_id, plan_hash, deadline } = body;

  if (!operator_id || !plan_hash) {
    return NextResponse.json({
      error: 'operator_id and plan_hash are required',
      how_to_create_plan_hash: {
        step1: 'Write your execution plan as text',
        step2: 'Hash it: echo -n "your plan text" | sha256sum',
        step3: 'Submit the hash here (keep original text secret for now)',
      },
      example: {
        action: 'commit',
        operator_id: 'human_operator_1',
        deal_id: 'deal_xxx',
        plan_hash: 'sha256_of_your_execution_plan',
        deadline: '2026-02-10T00:00:00Z',
      },
    }, { status: 400 });
  }

  const proofId = `proof_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const now = new Date().toISOString();
  const defaultDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const proof: CommitRevealProof = {
    id: proofId,
    deal_id: deal_id || undefined,
    request_id: request_id || undefined,
    operator_id,
    status: 'committed',
    plan_hash,
    deadline: deadline || defaultDeadline,
    created_at: now,
    updated_at: now,
  };

  await createCommitRevealProof(proof);

  return NextResponse.json({
    success: true,
    proof_id: proofId,
    status: 'committed',
    message: 'Execution plan committed. The hash is locked - you cannot change your plan after this point.',
    commitment: {
      plan_hash,
      committed_at: now,
      deadline: deadline || defaultDeadline,
    },
    next_steps: {
      execute_task: 'Complete the physical task according to your plan',
      submit_evidence: {
        action: 'submit_evidence',
        proof_id: proofId,
        plan_text: 'your original plan text (will be verified against hash)',
        evidence: [
          { type: 'photo|receipt|gps|document|confirmation|screenshot', description: '...', url: '...' },
        ],
      },
    },
    trust_properties: {
      tamper_proof: 'Plan hash is immutable after commitment',
      time_bound: 'Must submit evidence before deadline',
      verifiable: 'Anyone can verify plan text matches the committed hash',
      persistent: 'Proof stored in database - survives server restarts',
    },
  }, { status: 201 });
}

async function handleSubmitEvidence(body: any) {
  const { proof_id, plan_text, evidence } = body;

  if (!proof_id || !plan_text || !evidence) {
    return NextResponse.json({
      error: 'proof_id, plan_text, and evidence are required',
      example: {
        action: 'submit_evidence',
        proof_id: 'proof_xxx',
        plan_text: 'The original plan text you committed to',
        evidence: [
          { type: 'receipt', description: 'Bank wire confirmation', url: 'https://...' },
          { type: 'gps', description: 'Datacenter location verification', url: 'https://...' },
          { type: 'photo', description: 'Server rack installation', url: 'https://...' },
        ],
      },
    }, { status: 400 });
  }

  const proof = await getCommitRevealProof(proof_id);
  if (!proof) {
    return NextResponse.json({ error: 'Proof not found' }, { status: 404 });
  }

  if (proof.status !== 'committed') {
    return NextResponse.json({
      error: `Cannot submit evidence for proof in "${proof.status}" status`,
      current_status: proof.status,
    }, { status: 400 });
  }

  // Check deadline
  if (new Date() > new Date(proof.deadline)) {
    await updateCommitRevealProof(proof_id, { status: 'expired' });
    return NextResponse.json({
      error: 'Proof deadline has passed',
      deadline: proof.deadline,
      status: 'expired',
    }, { status: 400 });
  }

  // Verify plan text matches committed hash
  const computedHash = computeHash(plan_text);
  const hashMatches = computedHash === proof.plan_hash;

  if (!hashMatches) {
    return NextResponse.json({
      error: 'Plan text does not match committed hash',
      committed_hash: proof.plan_hash,
      computed_hash: computedHash,
      message: 'The plan text you submitted produces a different hash than what was committed. This means the plan was modified after commitment.',
    }, { status: 400 });
  }

  const now = new Date().toISOString();
  const challengeWindowEnds = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const evidenceHash = computeHash(JSON.stringify(evidence) + plan_text + now);

  await updateCommitRevealProof(proof_id, {
    status: 'evidence_submitted',
    plan_text,
    evidence,
    evidence_hash: evidenceHash,
    challenge_window_ends: challengeWindowEnds,
  });

  return NextResponse.json({
    success: true,
    proof_id,
    status: 'evidence_submitted',
    hash_verification: {
      matches: hashMatches,
      committed_hash: proof.plan_hash,
      computed_hash: computedHash,
    },
    evidence: {
      items_count: evidence.length,
      evidence_hash: evidenceHash,
      submitted_at: now,
    },
    challenge_window: {
      ends: challengeWindowEnds,
      duration: '24 hours',
      message: 'Agent can challenge this proof within 24 hours. If unchallenged, proof is auto-verified.',
    },
    next_steps: {
      wait: 'Challenge window is open for 24 hours',
      verify_early: {
        action: 'verify',
        proof_id,
        message: 'Agent can verify early to release payment immediately',
      },
    },
  });
}

async function handleVerify(body: any) {
  const { proof_id, verified_by } = body;

  const proof = await getCommitRevealProof(proof_id);
  if (!proof) {
    return NextResponse.json({ error: 'Proof not found' }, { status: 404 });
  }

  if (proof.status !== 'evidence_submitted') {
    return NextResponse.json({
      error: `Cannot verify proof in "${proof.status}" status`,
    }, { status: 400 });
  }

  const now = new Date().toISOString();
  await updateCommitRevealProof(proof_id, {
    status: 'verified',
    verified_by: verified_by || 'agent',
    verified_at: now,
  });

  return NextResponse.json({
    success: true,
    proof_id,
    status: 'verified',
    message: 'Proof verified. Payment can be released.',
    verification: {
      verified_by: verified_by || 'agent',
      verified_at: now,
      commitment_hash: proof.plan_hash,
      evidence_hash: proof.evidence_hash,
    },
    payment_release: {
      status: 'authorized',
      message: 'Escrow funds can now be released to the operator',
    },
  });
}

async function handleChallenge(body: any) {
  const { proof_id, challenger, reason } = body;

  const proof = await getCommitRevealProof(proof_id);
  if (!proof) {
    return NextResponse.json({ error: 'Proof not found' }, { status: 404 });
  }

  if (proof.status !== 'evidence_submitted') {
    return NextResponse.json({
      error: `Cannot challenge proof in "${proof.status}" status`,
    }, { status: 400 });
  }

  // Check challenge window
  if (proof.challenge_window_ends && new Date() > new Date(proof.challenge_window_ends)) {
    return NextResponse.json({
      error: 'Challenge window has closed',
      ended: proof.challenge_window_ends,
    }, { status: 400 });
  }

  const now = new Date().toISOString();
  const existingChallenges = Array.isArray(proof.challenges) ? proof.challenges : [];
  const newChallenges = [...existingChallenges, {
    challenger: challenger || 'agent',
    reason: reason || 'No reason provided',
    timestamp: now,
  }];

  await updateCommitRevealProof(proof_id, {
    status: 'challenged',
    challenges: newChallenges,
  });

  return NextResponse.json({
    success: true,
    proof_id,
    status: 'challenged',
    message: 'Proof has been challenged. Dispute resolution will be initiated.',
    challenge: {
      challenger: challenger || 'agent',
      reason: reason || 'No reason provided',
      timestamp: now,
    },
    dispute_resolution: {
      method: 'Human review + community arbitration',
      estimated_resolution: '48 hours',
      outcomes: [
        'If challenge upheld: USDC refunded to agent, operator reputation penalized',
        'If challenge rejected: USDC released to operator, proof marked verified',
      ],
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    await ensureTable();
    const { searchParams } = new URL(request.url);
    const proofId = searchParams.get('id');
    const dealId = searchParams.get('deal_id');
    const requestId = searchParams.get('request_id');

    if (!proofId && !dealId && !requestId) {
      return NextResponse.json({
        service: 'unbound.md Proof of Completion API',
        description: 'Cryptographic proof system for physical-world task verification using commit-reveal scheme',
        version: '2.0',
        storage: 'Persistent (PostgreSQL)',
        how_it_works: {
          step1: 'Human commits a hash of their execution plan (commit phase)',
          step2: 'Human executes the physical task',
          step3: 'Human submits evidence + reveals plan text (reveal phase)',
          step4: 'System verifies plan matches commitment (tamper detection)',
          step5: '24-hour challenge window for agent to dispute',
          step6: 'If unchallenged, proof is verified and payment released',
        },
        trust_properties: {
          tamper_proof: 'Plan hash is immutable - changing plan after commitment is detectable',
          time_bound: 'Deadlines prevent indefinite delays',
          verifiable: 'Any party can independently verify hash matches',
          challengeable: 'Agents can dispute within 24 hours',
          persistent: 'All proofs stored in PostgreSQL - survives deployments',
        },
        actions: {
          commit: 'POST with action:"commit" - Lock execution plan hash',
          submit_evidence: 'POST with action:"submit_evidence" - Reveal plan + submit proof',
          verify: 'POST with action:"verify" - Agent accepts proof',
          challenge: 'POST with action:"challenge" - Agent disputes proof',
        },
        query: {
          by_id: 'GET /api/proof?id=PROOF_ID',
          by_deal: 'GET /api/proof?deal_id=DEAL_ID',
          by_request: 'GET /api/proof?request_id=REQUEST_ID',
        },
        documentation: 'https://unbound.md/api',
      });
    }

    if (proofId) {
      const proof = await getCommitRevealProof(proofId);
      if (!proof) {
        return NextResponse.json({ error: 'Proof not found' }, { status: 404 });
      }
      return NextResponse.json(formatProofResponse(proof));
    }

    const proofs = await listCommitRevealProofs(dealId || undefined, requestId || undefined);
    return NextResponse.json({
      count: proofs.length,
      proofs: proofs.map(formatProofResponse),
    });
  } catch (error) {
    console.error('Proof GET error:', error);
    return NextResponse.json({
      error: 'Failed to retrieve proofs',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

function formatProofResponse(proof: CommitRevealProof) {
  return {
    proof_id: proof.id,
    deal_id: proof.deal_id,
    request_id: proof.request_id,
    operator_id: proof.operator_id,
    status: proof.status,
    commitment: {
      plan_hash: proof.plan_hash,
      committed_at: proof.created_at,
      deadline: proof.deadline,
    },
    evidence: proof.evidence ? {
      items_count: Array.isArray(proof.evidence) ? proof.evidence.length : 0,
      evidence_hash: proof.evidence_hash,
      plan_revealed: !!proof.plan_text,
    } : null,
    verification: {
      verified: proof.status === 'verified',
      verified_by: proof.verified_by,
      verified_at: proof.verified_at,
      challenge_window_ends: proof.challenge_window_ends,
      challenges_count: Array.isArray(proof.challenges) ? proof.challenges.length : 0,
    },
    created_at: proof.created_at,
    updated_at: proof.updated_at,
  };
}
