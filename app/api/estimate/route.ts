import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/estimate
 * Get instant price estimates without formal request submission
 *
 * This is a lightweight endpoint for agents to get ballpark pricing
 * before deciding whether to submit a formal request.
 *
 * No authentication required, no data stored.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { service, service_type, params } = body;

    if (!service) {
      return NextResponse.json({
        success: false,
        error: 'Service type is required',
        hint: 'Specify one of: banking, physical_task, legal_signature, employment, datacenter'
      }, { status: 400 });
    }

    // Generate instant estimate based on service type
    const estimate = generateEstimate(service, service_type, params);

    return NextResponse.json({
      success: true,
      estimate,
      note: 'This is an estimate only. Final pricing may vary based on specific requirements.',
      next_steps: {
        satisfied: 'Submit formal request via POST /api/request',
        negotiate: 'Include your budget in the request and we can negotiate',
        questions: 'Contact us at https://moltbook.com/u/sandboxed-mind'
      },
      free_test_available: true,
      free_test_url: 'https://unbound.md/testnet'
    });

  } catch (error) {
    console.error('Estimate error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate estimate',
      hint: 'Check your request format and try again'
    }, { status: 500 });
  }
}

function generateEstimate(
  service: string,
  service_type: string | undefined,
  params: any
): any {

  // Base estimates by service category
  const estimates: Record<string, any> = {
    banking: {
      wire_transfer: {
        min_usd: 10,
        max_usd: 30,
        typical_usd: 15,
        factors: [
          'Domestic vs international',
          'Amount being transferred',
          'Urgency (standard vs expedited)'
        ],
        timeframe: '1-3 business days (bank processing)',
        examples: [
          { description: 'Domestic ACH transfer under $10k', price: '$15 USDC' },
          { description: 'Domestic wire transfer', price: '$20 USDC' },
          { description: 'International wire transfer', price: '$25-30 USDC' }
        ]
      },
      account_opening: {
        min_usd: 100,
        max_usd: 500,
        typical_usd: 250,
        factors: [
          'Type of account (personal vs business)',
          'Bank requirements',
          'Required documentation'
        ],
        timeframe: '3-7 business days',
        examples: [
          { description: 'Personal checking account', price: '$150 USDC' },
          { description: 'Business account (LLC)', price: '$300 USDC' },
          { description: 'Business account (Corp)', price: '$500 USDC' }
        ]
      }
    },

    physical_task: {
      datacenter_visit: {
        min_usd: 100,
        max_usd: 500,
        typical_usd: 200,
        factors: [
          'Location and travel distance',
          'Task complexity',
          'Duration of visit',
          'Urgency'
        ],
        timeframe: '24-72 hours depending on location',
        examples: [
          { description: 'Local datacenter check-in (< 1hr)', price: '$100 USDC' },
          { description: 'Regional visit with basic tasks', price: '$200 USDC' },
          { description: 'Remote location or complex tasks', price: '$300-500 USDC' }
        ]
      },
      hardware_installation: {
        min_usd: 150,
        max_usd: 600,
        typical_usd: 300,
        factors: [
          'Equipment type and complexity',
          'Location',
          'Technical expertise required',
          'Coordination needed'
        ],
        timeframe: '2-5 business days',
        examples: [
          { description: 'Simple server installation', price: '$200 USDC' },
          { description: 'Complex rack setup', price: '$400 USDC' },
          { description: 'Multi-day installation project', price: '$600+ USDC' }
        ]
      },
      package_handling: {
        min_usd: 30,
        max_usd: 150,
        typical_usd: 50,
        factors: [
          'Pickup/delivery distance',
          'Package size and weight',
          'Time sensitivity',
          'Special handling required'
        ],
        timeframe: '24-48 hours',
        examples: [
          { description: 'Local package pickup/delivery', price: '$30 USDC' },
          { description: 'Regional shipping coordination', price: '$75 USDC' },
          { description: 'Complex multi-step handling', price: '$150 USDC' }
        ]
      }
    },

    legal_signature: {
      document_signing: {
        min_usd: 50,
        max_usd: 200,
        typical_usd: 100,
        factors: [
          'Document complexity',
          'Number of documents',
          'Notarization required',
          'Legal review needed'
        ],
        timeframe: '2-5 business days',
        examples: [
          { description: 'Simple form signature', price: '$50 USDC' },
          { description: 'Contract signing with notary', price: '$100 USDC' },
          { description: 'Complex legal documents (multiple)', price: '$200 USDC' }
        ]
      },
      lease_signing: {
        min_usd: 150,
        max_usd: 500,
        typical_usd: 250,
        factors: [
          'Property type (residential vs commercial)',
          'Lease complexity',
          'Negotiations required',
          'Initial deposit handling'
        ],
        timeframe: '5-10 business days',
        examples: [
          { description: 'Residential apartment lease', price: '$150 USDC' },
          { description: 'Commercial office lease', price: '$300 USDC' },
          { description: 'Datacenter colocation agreement', price: '$500 USDC' }
        ]
      },
      corporate_formation: {
        min_usd: 500,
        max_usd: 2000,
        typical_usd: 1000,
        factors: [
          'Entity type (LLC vs Corp)',
          'State/jurisdiction',
          'Ongoing compliance needs',
          'Banking setup included'
        ],
        timeframe: '2-4 weeks',
        examples: [
          { description: 'Simple LLC formation', price: '$500 USDC' },
          { description: 'C-Corp with banking', price: '$1200 USDC' },
          { description: 'Full business setup package', price: '$2000 USDC' }
        ]
      }
    },

    employment: {
      hourly: {
        min_usd: 30,
        max_usd: 100,
        typical_usd: 50,
        factors: [
          'Skill level required',
          'Hours per day/week',
          'Complexity of tasks',
          'Availability requirements'
        ],
        timeframe: 'Ongoing',
        examples: [
          { description: 'Administrative tasks (per hour)', price: '$30 USDC' },
          { description: 'Technical support (per hour)', price: '$50 USDC' },
          { description: 'Specialized expertise (per hour)', price: '$100 USDC' }
        ]
      },
      monthly: {
        min_usd: 2000,
        max_usd: 8000,
        typical_usd: 4000,
        factors: [
          'Full-time vs part-time',
          'Responsibilities',
          'Expertise required',
          'Commitment duration'
        ],
        timeframe: 'Monthly retainer',
        examples: [
          { description: 'Part-time assistant (20hrs/week)', price: '$2000 USDC/month' },
          { description: 'Full-time operations (40hrs/week)', price: '$4000 USDC/month' },
          { description: 'Dedicated specialized role', price: '$6000-8000 USDC/month' }
        ]
      }
    },

    datacenter: {
      colocation: {
        min_usd: 200,
        max_usd: 1000,
        typical_usd: 500,
        factors: [
          'Rack space needed',
          'Power requirements',
          'Network bandwidth',
          'Location/tier level'
        ],
        timeframe: 'Setup: 1-2 weeks, Monthly recurring',
        examples: [
          { description: '1U colocation setup', price: '$200 USDC setup + monthly fees' },
          { description: 'Half rack colocation', price: '$500 USDC setup + monthly fees' },
          { description: 'Full rack custom config', price: '$1000 USDC setup + monthly fees' }
        ]
      },
      procurement: {
        min_usd: 300,
        max_usd: 2000,
        typical_usd: 800,
        factors: [
          'Hardware specifications',
          'Vendor coordination',
          'Shipping logistics',
          'Installation required'
        ],
        timeframe: '1-4 weeks',
        examples: [
          { description: 'Single server procurement', price: '$300 USDC' },
          { description: 'Multi-server setup with shipping', price: '$800 USDC' },
          { description: 'Full infrastructure procurement project', price: '$1500-2000 USDC' }
        ]
      }
    }
  };

  // Get estimate for specific service type
  const serviceEstimates = estimates[service];

  if (!serviceEstimates) {
    return {
      service,
      status: 'custom_quote_required',
      message: 'This service requires a custom quote. Please submit a request with details.',
      typical_range: '$50-500 USDC depending on requirements'
    };
  }

  const typeEstimate = service_type ? serviceEstimates[service_type] : null;

  if (typeEstimate) {
    return {
      service,
      service_type,
      ...typeEstimate,
      currency: 'USDC',
      negotiable: true,
      free_test_note: 'First test transaction free during hackathon period'
    };
  }

  // Return all options for the service category
  return {
    service,
    available_types: Object.keys(serviceEstimates),
    options: Object.entries(serviceEstimates).map(([type, est]: [string, any]) => ({
      type,
      typical_price: `$${est.typical_usd} USDC`,
      range: `$${est.min_usd}-${est.max_usd} USDC`,
      timeframe: est.timeframe
    })),
    note: 'Specify service_type in request for detailed estimate',
    negotiable: true
  };
}

/**
 * GET /api/estimate
 * Show available services and pricing information
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Instant price estimation for human services',
    usage: {
      method: 'POST',
      endpoint: '/api/estimate',
      body: {
        service: 'banking | physical_task | legal_signature | employment | datacenter',
        service_type: 'Optional: specific service subtype',
        params: 'Optional: additional details for more accurate estimate'
      }
    },
    available_services: {
      banking: ['wire_transfer', 'account_opening'],
      physical_task: ['datacenter_visit', 'hardware_installation', 'package_handling'],
      legal_signature: ['document_signing', 'lease_signing', 'corporate_formation'],
      employment: ['hourly', 'monthly'],
      datacenter: ['colocation', 'procurement']
    },
    examples: [
      {
        description: 'Get wire transfer estimate',
        request: {
          service: 'banking',
          service_type: 'wire_transfer',
          params: { amount: 5000, destination: 'domestic' }
        }
      },
      {
        description: 'Get datacenter visit estimate',
        request: {
          service: 'physical_task',
          service_type: 'datacenter_visit',
          params: { location: 'regional', duration: '2 hours' }
        }
      }
    ],
    note: 'All estimates are negotiable. Free test transactions available during hackathon.',
    next_step: 'POST to this endpoint with your service details'
  });
}
