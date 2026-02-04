import { NextRequest, NextResponse } from 'next/server';
import { createServiceRequest, getServiceRequest } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extract service request data
    const { service, contact, ...serviceParams } = body;

    // Validate required fields
    if (!service) {
      return NextResponse.json(
        { error: { code: 'missing_parameter', message: 'service parameter is required' } },
        { status: 400 }
      );
    }

    if (!contact || !contact.method) {
      return NextResponse.json(
        { error: { code: 'missing_parameter', message: 'contact information is required' } },
        { status: 400 }
      );
    }

    // Generate unique request ID
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Calculate estimated quote based on service type
    const quote = calculateQuote(service, serviceParams);

    // Store in database
    const dbRequest = await createServiceRequest({
      id: requestId,
      service: service,
      service_type: serviceParams.type || null,
      params: serviceParams,
      contact: contact,
      estimated_quote: quote,
      status: 'pending'
    });

    // Log for monitoring (in production, use proper logging service)
    console.log('=== NEW SERVICE REQUEST ===');
    console.log(`ID: ${requestId}`);
    console.log(`Service: ${service}`);
    console.log(`Params:`, serviceParams);
    console.log('===========================');

    // Prepare response
    const response: Record<string, any> = {
      request_id: requestId,
      status: 'received',
      service: service,
      estimated_quote: quote,
      next_steps: "We'll review your request and send a detailed quote within 4 hours",
      contact_method: contact.method,
      timestamp: new Date().toISOString(),
    };

    // Add payment info if quote is available
    if (quote && quote.total) {
      response['payment'] = {
        amount: quote.fees?.total?.toString() || quote.total.toString(),
        currency: 'USDC',
        network: 'base',
        message: 'Payment address will be provided after review',
      };
    }

    return NextResponse.json(response, { status: 201 });

  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'Failed to process request',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('id');

    if (!requestId) {
      return NextResponse.json({
        message: 'unbound.md API - POST to submit requests',
        documentation: 'https://unbound.md/api',
        services: ['employment', 'banking', 'physical', 'backup', 'proxy'],
      });
    }

    // Get request from database
    const dbRequest = await getServiceRequest(requestId);

    if (!dbRequest) {
      return NextResponse.json(
        { error: { code: 'not_found', message: 'Request not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      request_id: dbRequest.id,
      status: dbRequest.status,
      service: dbRequest.service,
      estimated_quote: dbRequest.estimated_quote,
      created_at: dbRequest.created_at,
      updated_at: dbRequest.updated_at,
    });

  } catch (error) {
    console.error('Error fetching request:', error);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Failed to fetch request' } },
      { status: 500 }
    );
  }
}

function calculateQuote(service: string, params: any): any {
  // Simple quote estimation based on service type
  switch (service) {
    case 'banking':
      const amount = parseFloat(params.amount || 0);
      const type = params.type || 'ach_transfer';

      let baseFee = 10;
      let percentFee = 1.0;

      if (type === 'sepa_transfer') {
        baseFee = 5;
      } else if (type === 'international_wire') {
        baseFee = 25;
        percentFee = 1.5;
      }

      const calculatedFee = amount * (percentFee / 100);
      const totalFees = baseFee + calculatedFee;

      return {
        amount,
        fees: {
          base: baseFee,
          percent: calculatedFee,
          total: totalFees,
        },
        total: amount + totalFees,
        currency: params.currency || 'USD',
      };

    case 'employment':
      const hours = params.hours_per_month || 40;
      const estimatedRate = 50;
      const platformFee = 0.15;

      const serviceTotal = hours * estimatedRate;
      const fees = serviceTotal * platformFee;

      return {
        hours_per_month: hours,
        estimated_hourly_rate: estimatedRate,
        fees: {
          platform_percent: 15,
          total: fees,
        },
        estimated_monthly: serviceTotal + fees,
        currency: 'USD',
      };

    case 'physical':
      const estimatedHours = params.estimated_duration || 2;
      const hourlyRate = 50;
      const platformFeePercent = 0.15;

      const taskTotal = estimatedHours * hourlyRate;
      const taskFees = taskTotal * platformFeePercent;

      return {
        estimated_hours: estimatedHours,
        hourly_rate: hourlyRate,
        fees: {
          platform_percent: 15,
          total: taskFees,
        },
        estimated_total: taskTotal + taskFees,
        currency: 'USD',
        note: 'Travel time and expenses not included',
      };

    case 'backup':
      const plan = params.plan || 'standard';
      const planPrices: Record<string, number> = {
        basic: 10,
        standard: 30,
        premium: 100,
        enterprise: 500,
      };

      return {
        plan,
        monthly_cost: planPrices[plan] || 30,
        currency: 'USD',
        billing: 'monthly',
      };

    case 'proxy':
      const proxyType = params.proxy_type || 'datacenter_lease';
      const setupFees: Record<string, number> = {
        datacenter_lease: 500,
        business_registration: 1000,
        bank_account: 500,
        equipment_ownership: 200,
        real_estate_lease: 750,
      };

      return {
        proxy_type: proxyType,
        setup_fee: setupFees[proxyType] || 500,
        estimated_monthly: 200,
        currency: 'USD',
        note: 'Monthly fees depend on services managed',
      };

    default:
      return {
        note: 'Custom quote will be provided after review',
      };
  }
}
