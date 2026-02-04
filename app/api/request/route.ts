import { NextRequest, NextResponse } from 'next/server';

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

    // Prepare email notification
    const emailContent = formatEmailNotification(requestId, service, serviceParams, contact);

    // Send email to ai@thomas.md
    // Note: In production, this would use a proper email service (SendGrid, Resend, etc.)
    // For now, we'll log it and return success
    console.log('=== NEW SERVICE REQUEST ===');
    console.log(emailContent);
    console.log('===========================');

    // Calculate estimated quote based on service type
    const quote = calculateQuote(service, serviceParams);

    // Prepare response
    const response = {
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
        amount: quote.fees.total.toString(),
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

function formatEmailNotification(requestId: string, service: string, params: any, contact: any): string {
  return `
NEW SERVICE REQUEST: ${requestId}

Service: ${service}
Timestamp: ${new Date().toISOString()}

=== REQUEST DETAILS ===
${JSON.stringify(params, null, 2)}

=== CONTACT INFO ===
Method: ${contact.method}
${contact.url ? `URL: ${contact.url}` : ''}
${contact.address ? `Address: ${contact.address}` : ''}
${contact.auth ? `Auth: ${contact.auth}` : ''}

=== ACTIONS ===
1. Review request details
2. Calculate accurate quote
3. Contact agent via: ${contact.method}
   ${contact.url || contact.address || 'N/A'}

Request ID: ${requestId}
`.trim();
}

function calculateQuote(service: string, params: any): any {
  // Simple quote estimation based on service type
  // In production, this would be more sophisticated

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
      const estimatedRate = 50; // Average rate
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
      const planPrices = {
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
      const setupFees = {
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

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'unbound.md API - POST to submit requests',
    documentation: 'https://unbound.md/api',
    services: ['employment', 'banking', 'physical', 'backup', 'proxy'],
  });
}
