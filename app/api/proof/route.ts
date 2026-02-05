import { NextRequest, NextResponse } from 'next/server';
import { createProof, getProofs, verifyProof, getServiceRequest, updateServiceRequest } from '@/lib/db';

/**
 * POST /api/proof
 * Submit proof of task completion
 *
 * Proof types: receipt, photo, document, confirmation_number, gps_checkin, signed_document
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { request_id, proof_type, proof_data, submitted_by } = body;

    if (!request_id) {
      return NextResponse.json(
        { success: false, error: 'request_id is required' },
        { status: 400 }
      );
    }

    if (!proof_type || !['receipt', 'photo', 'document', 'confirmation_number', 'gps_checkin', 'signed_document'].includes(proof_type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid proof_type',
          valid_types: ['receipt', 'photo', 'document', 'confirmation_number', 'gps_checkin', 'signed_document']
        },
        { status: 400 }
      );
    }

    if (!proof_data) {
      return NextResponse.json(
        { success: false, error: 'proof_data is required' },
        { status: 400 }
      );
    }

    // Verify the request exists
    const serviceRequest = await getServiceRequest(request_id);
    if (!serviceRequest) {
      return NextResponse.json(
        { success: false, error: 'Request not found' },
        { status: 404 }
      );
    }

    const proofId = `proof_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const proof = await createProof({
      id: proofId,
      request_id,
      proof_type,
      proof_data,
      submitted_by: submitted_by || 'human-operator',
    });

    // If request is in_progress, update to completed
    if (serviceRequest.status === 'in_progress') {
      await updateServiceRequest(request_id, { status: 'completed' });
    }

    return NextResponse.json({
      success: true,
      proof: {
        id: proofId,
        request_id,
        proof_type,
        verified: false,
        submitted_at: proof.created_at,
      },
      message: 'Proof submitted. Agent can verify at GET /api/proof?request_id=XXX',
      next_steps: [
        'Agent reviews the proof data',
        'Agent calls PUT /api/proof with proof_id and action=verify to confirm',
        'Escrow released upon verification',
      ],
    }, { status: 201 });

  } catch (error) {
    console.error('Error submitting proof:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit proof' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/proof?request_id=XXX
 * Retrieve proofs for a service request
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('request_id');

    if (!requestId) {
      return NextResponse.json({
        success: true,
        message: 'Proof of Completion API',
        description: 'Submit, retrieve, and verify proof of task completion for service requests.',
        usage: {
          submit: {
            method: 'POST /api/proof',
            body: {
              request_id: 'req_xxx',
              proof_type: 'receipt | photo | document | confirmation_number | gps_checkin | signed_document',
              proof_data: '{ ... proof-specific data ... }',
              submitted_by: 'human-operator (default)',
            },
          },
          retrieve: 'GET /api/proof?request_id=req_xxx',
          verify: {
            method: 'PUT /api/proof',
            body: { proof_id: 'proof_xxx', action: 'verify' },
          },
        },
        proof_types: {
          receipt: 'Transaction receipt, wire confirmation, payment proof. Include: { reference_number, amount, timestamp, institution }',
          photo: 'Timestamped photo evidence. Include: { url, description, timestamp, location }',
          document: 'Signed document scan or digital copy. Include: { url, document_type, pages }',
          confirmation_number: 'Reference number from service provider. Include: { number, provider, service, timestamp }',
          gps_checkin: 'GPS coordinates from on-site visit. Include: { latitude, longitude, timestamp, accuracy_meters }',
          signed_document: 'Digitally or physically signed document. Include: { url, signer, signature_type, timestamp }',
        },
        flow: [
          '1. Human completes the task',
          '2. Human submits proof via POST /api/proof',
          '3. Agent retrieves proof via GET /api/proof?request_id=xxx',
          '4. Agent verifies proof is acceptable via PUT /api/proof',
          '5. Escrow can be released',
        ],
      });
    }

    const proofs = await getProofs(requestId);

    return NextResponse.json({
      success: true,
      request_id: requestId,
      proof_count: proofs.length,
      proofs: proofs.map(p => ({
        id: p.id,
        proof_type: p.proof_type,
        proof_data: p.proof_data,
        verified: p.verified,
        verified_at: p.verified_at,
        submitted_by: p.submitted_by,
        submitted_at: p.created_at,
      })),
      all_verified: proofs.length > 0 && proofs.every(p => p.verified),
    }, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });

  } catch (error) {
    console.error('Error fetching proofs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch proofs' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/proof
 * Verify a proof (agent confirms the proof is acceptable)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { proof_id, action } = body;

    if (!proof_id) {
      return NextResponse.json(
        { success: false, error: 'proof_id is required' },
        { status: 400 }
      );
    }

    if (action !== 'verify') {
      return NextResponse.json(
        { success: false, error: 'action must be "verify"' },
        { status: 400 }
      );
    }

    const verified = await verifyProof(proof_id);

    return NextResponse.json({
      success: true,
      proof: {
        id: verified.id,
        verified: verified.verified,
        verified_at: verified.verified_at,
      },
      message: 'Proof verified successfully. Escrow can now be released.',
    });

  } catch (error) {
    console.error('Error verifying proof:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify proof' },
      { status: 500 }
    );
  }
}
