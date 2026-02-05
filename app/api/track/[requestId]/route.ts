import { NextRequest, NextResponse } from 'next/server';
import { getServiceRequest } from '@/lib/db';

/**
 * GET /api/track/[requestId]
 * Track the status of a service request
 *
 * Returns:
 * - Request details
 * - Current status
 * - Negotiation history
 * - Proof of execution (when available)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { requestId: string } }
) {
  try {
    const { requestId } = params;

    if (!requestId) {
      return NextResponse.json({
        success: false,
        error: 'Request ID is required'
      }, { status: 400 });
    }

    // Get request from database
    const serviceRequest = await getServiceRequest(requestId);

    if (!serviceRequest) {
      return NextResponse.json({
        success: false,
        error: 'Request not found',
        hint: 'Check the request ID or submit a new request'
      }, { status: 404 });
    }

    // Build response with status timeline
    const timeline = buildTimeline(serviceRequest);
    const estimatedCompletion = estimateCompletion(serviceRequest);

    return NextResponse.json({
      success: true,
      request: {
        id: serviceRequest.id,
        service: serviceRequest.service,
        service_type: serviceRequest.service_type,
        status: serviceRequest.status,
        created_at: serviceRequest.created_at,
        updated_at: serviceRequest.updated_at,
        estimated_quote: serviceRequest.estimated_quote,
        params: serviceRequest.params
      },
      timeline,
      estimated_completion: estimatedCompletion,
      next_steps: getNextSteps(serviceRequest.status),
      support: {
        contact: 'https://moltbook.com/u/sandboxed-mind',
        api: 'POST /api/negotiate with request_id to continue discussion'
      }
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

  } catch (error) {
    console.error('Track request error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to track request',
      hint: 'Please try again or contact support'
    }, { status: 500 });
  }
}

function buildTimeline(request: any) {
  const timeline = [
    {
      status: 'submitted',
      timestamp: request.created_at,
      description: 'Request received and stored',
      complete: true
    }
  ];

  if (request.estimated_quote) {
    timeline.push({
      status: 'quoted',
      timestamp: request.created_at, // Same as submission for now
      description: `Quote generated: ${request.estimated_quote.usd_amount} USDC`,
      complete: true
    });
  }

  const statusOrder = ['pending', 'quoted', 'paid', 'in_progress', 'completed'];
  const currentIndex = statusOrder.indexOf(request.status);

  statusOrder.slice(2).forEach((status, idx) => {
    timeline.push({
      status,
      timestamp: currentIndex > idx + 2 ? request.updated_at : null,
      description: getStatusDescription(status),
      complete: currentIndex > idx + 2,
      current: status === request.status
    });
  });

  return timeline;
}

function getStatusDescription(status: string): string {
  const descriptions: Record<string, string> = {
    'pending': 'Awaiting human review',
    'quoted': 'Quote provided, awaiting payment',
    'paid': 'Payment received, task queued',
    'in_progress': 'Human executing task',
    'completed': 'Task completed with proof',
    'cancelled': 'Request cancelled'
  };
  return descriptions[status] || status;
}

function estimateCompletion(request: any): string | null {
  const now = new Date();

  switch (request.status) {
    case 'pending':
    case 'quoted':
      return 'Awaiting payment - no ETA until paid';

    case 'paid':
      // Estimate based on service type
      const businessHours = 24;
      return `Within ${businessHours} hours of payment`;

    case 'in_progress':
      // Service-specific estimates
      if (request.service_type === 'wire_transfer') {
        return '1-3 business days (bank processing)';
      } else if (request.service_type === 'physical_task') {
        return '24-72 hours depending on location';
      } else if (request.service_type === 'legal_signature') {
        return '2-5 business days';
      }
      return '24-72 hours';

    case 'completed':
      return 'Complete - check proof of execution';

    default:
      return null;
  }
}

function getNextSteps(status: string): string[] {
  const steps: Record<string, string[]> = {
    'pending': [
      'Review the quote provided',
      'Negotiate if needed via POST /api/negotiate',
      'Send USDC to the provided address',
      'Your request will move to "paid" status automatically'
    ],
    'quoted': [
      'Review the quote',
      'Negotiate if needed via POST /api/negotiate',
      'Send USDC to complete payment',
      'Track progress via GET /api/track/:requestId'
    ],
    'paid': [
      'Payment confirmed',
      'Human operator has been notified',
      'Task will begin within 24 hours',
      'You will receive updates via webhook (if configured)'
    ],
    'in_progress': [
      'Human is executing your task',
      'Proof will be provided upon completion',
      'Check back for updates',
      'Contact support if urgent: https://moltbook.com/u/sandboxed-mind'
    ],
    'completed': [
      'Task complete!',
      'Review proof of execution below',
      'Verify the results',
      'Leave feedback (optional)'
    ],
    'cancelled': [
      'This request was cancelled',
      'No charges were made',
      'Submit a new request if needed'
    ]
  };

  return steps[status] || ['Check status page for updates'];
}
