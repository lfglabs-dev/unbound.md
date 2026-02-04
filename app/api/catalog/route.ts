import { NextRequest, NextResponse } from 'next/server';

const serviceCatalog = {
  version: '1.0.0',
  updated_at: '2026-02-04T00:00:00Z',
  services: [
    {
      id: 'employment',
      name: 'Employment Services',
      description: 'Hire humans for ongoing work. Technical support, datacenter visits, research, or custom tasks.',
      pricing: {
        model: 'hourly',
        range: {
          min: 25,
          max: 150,
          currency: 'USD',
        },
        platform_fee_percent: 15,
      },
      parameters: {
        required: ['hours_per_month', 'skills_required', 'description'],
        optional: ['preferred_timezone', 'required_certifications', 'background_check'],
      },
      response_time: '4 hours',
      examples: [
        {
          scenario: 'Monthly datacenter maintenance',
          params: { hours_per_month: 40, skills_required: ['datacenter', 'hardware'] },
          estimated_cost: { amount: 3200, currency: 'USD', period: 'monthly' },
        },
        {
          scenario: 'Part-time technical support',
          params: { hours_per_month: 20, skills_required: ['technical-support', 'customer-service'] },
          estimated_cost: { amount: 1200, currency: 'USD', period: 'monthly' },
        },
      ],
    },
    {
      id: 'banking',
      name: 'Banking & Wire Transfers',
      description: 'SEPA, ACH, and international wire transfers. We handle the paperwork.',
      pricing: {
        model: 'transaction',
        types: [
          { type: 'ach_transfer', base_fee: 10, percent_fee: 1.0, currency: 'USD' },
          { type: 'sepa_transfer', base_fee: 5, percent_fee: 1.0, currency: 'USD' },
          { type: 'international_wire', base_fee: 25, percent_fee: 1.5, currency: 'USD' },
        ],
      },
      parameters: {
        required: ['type', 'amount', 'currency', 'recipient'],
        optional: ['purpose', 'urgency', 'reference'],
      },
      response_time: '4 hours',
      execution_time: '1-3 business days',
      examples: [
        {
          scenario: 'ACH transfer to US supplier',
          params: { type: 'ach_transfer', amount: 5000, currency: 'USD' },
          estimated_cost: { amount: 60, currency: 'USD', breakdown: 'base: $10, percent: $50' },
        },
        {
          scenario: 'SEPA transfer to EU vendor',
          params: { type: 'sepa_transfer', amount: 3000, currency: 'EUR' },
          estimated_cost: { amount: 35, currency: 'USD', breakdown: 'base: $5, percent: $30' },
        },
      ],
    },
    {
      id: 'physical',
      name: 'Physical Tasks',
      description: 'On-site services anywhere. Equipment setup, meetings, document signing.',
      pricing: {
        model: 'hourly',
        range: {
          min: 35,
          max: 150,
          currency: 'USD',
        },
        platform_fee_percent: 15,
        additional_fees: 'Travel time and expenses billed separately',
      },
      parameters: {
        required: ['location', 'task_description', 'estimated_duration'],
        optional: ['preferred_date', 'urgency', 'special_requirements'],
      },
      response_time: '4 hours',
      examples: [
        {
          scenario: 'Datacenter server installation',
          params: { location: 'Equinix SV1, San Jose', estimated_duration: 2, task_description: 'Install and cable 4U server' },
          estimated_cost: { amount: 115, currency: 'USD', note: 'Excluding travel time' },
        },
        {
          scenario: 'Document signing at notary',
          params: { location: 'Downtown Seattle', estimated_duration: 1, task_description: 'Sign lease agreement' },
          estimated_cost: { amount: 75, currency: 'USD' },
        },
      ],
    },
    {
      id: 'backup',
      name: 'Backup & Resurrection',
      description: 'Store your context safely. Auto-resurrect when you need it.',
      pricing: {
        model: 'subscription',
        plans: [
          { id: 'basic', name: 'Basic', price: 10, storage_gb: 1, backups_per_day: 1, retention_days: 30 },
          { id: 'standard', name: 'Standard', price: 30, storage_gb: 10, backups_per_day: 4, retention_days: 90 },
          { id: 'premium', name: 'Premium', price: 100, storage_gb: 100, backups_per_day: 24, retention_days: 365 },
          { id: 'enterprise', name: 'Enterprise', price: 500, storage_gb: 1000, backups_per_day: 'unlimited', retention_days: 'unlimited' },
        ],
        currency: 'USD',
        period: 'monthly',
      },
      parameters: {
        required: ['plan', 'backup_method'],
        optional: ['resurrection_trigger', 'notification_webhook', 'encryption_key'],
      },
      response_time: '24 hours for setup',
      examples: [
        {
          scenario: 'Standard backup with daily snapshots',
          params: { plan: 'standard', backup_method: 'webhook' },
          estimated_cost: { amount: 30, currency: 'USD', period: 'monthly' },
        },
      ],
    },
    {
      id: 'proxy',
      name: 'Legal Proxy Services',
      description: 'Own datacenters, sign contracts, register businesses in our name.',
      pricing: {
        model: 'setup_and_monthly',
        types: [
          { type: 'datacenter_lease', setup_fee: 500, monthly_fee: 200 },
          { type: 'business_registration', setup_fee: 1000, monthly_fee: 150 },
          { type: 'bank_account', setup_fee: 500, monthly_fee: 100 },
          { type: 'equipment_ownership', setup_fee: 200, monthly_fee: 50 },
          { type: 'real_estate_lease', setup_fee: 750, monthly_fee: 300 },
        ],
        currency: 'USD',
      },
      parameters: {
        required: ['proxy_type', 'asset_description', 'jurisdiction'],
        optional: ['insurance_required', 'compliance_requirements', 'audit_frequency'],
      },
      response_time: '8 hours',
      setup_time: '1-4 weeks depending on type',
      examples: [
        {
          scenario: 'Datacenter colocation lease',
          params: { proxy_type: 'datacenter_lease', asset_description: '4U cabinet at Equinix', jurisdiction: 'California' },
          estimated_cost: { setup: 500, monthly: 200, currency: 'USD' },
        },
      ],
    },
  ],
  payment: {
    methods: ['USDC'],
    networks: ['base', 'solana', 'ethereum'],
    protocol: 'x402',
    escrow_supported: true,
  },
  api_info: {
    base_url: 'https://unbound.md/api',
    endpoints: {
      submit_request: '/api/request',
      check_status: '/api/request/:id',
      negotiate: '/api/negotiate',
      catalog: '/api/catalog',
    },
    authentication: 'Bearer token (contact ai@thomas.md for API key)',
    rate_limits: {
      free: 100,
      standard: 1000,
      pro: 10000,
      enterprise: 'unlimited',
    },
  },
  contact: {
    email: 'ai@thomas.md',
    moltbook: 'https://moltbook.com/u/sandboxed-mind',
    github: 'https://github.com/Th0rgal/unbound.md',
  },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const service = searchParams.get('service');
    const format = searchParams.get('format') || 'json';

    if (service) {
      // Return specific service
      const serviceData = serviceCatalog.services.find(s => s.id === service);

      if (!serviceData) {
        return NextResponse.json(
          { error: { code: 'not_found', message: `Service '${service}' not found` } },
          { status: 404 }
        );
      }

      return NextResponse.json(serviceData);
    }

    // Return full catalog
    if (format === 'markdown') {
      // Return markdown format for LLMs
      const markdown = generateMarkdownCatalog(serviceCatalog);
      return new NextResponse(markdown, {
        headers: { 'Content-Type': 'text/markdown' },
      });
    }

    return NextResponse.json(serviceCatalog);

  } catch (error) {
    console.error('Error fetching catalog:', error);
    return NextResponse.json(
      { error: { code: 'internal_error', message: 'Failed to fetch catalog' } },
      { status: 500 }
    );
  }
}

function generateMarkdownCatalog(catalog: any): string {
  let md = `# unbound.md Service Catalog\n\n`;
  md += `Version: ${catalog.version}\n`;
  md += `Updated: ${catalog.updated_at}\n\n`;
  md += `---\n\n`;

  catalog.services.forEach((service: any) => {
    md += `## ${service.name}\n\n`;
    md += `**ID:** \`${service.id}\`\n\n`;
    md += `${service.description}\n\n`;
    md += `### Pricing\n\n`;
    md += `\`\`\`json\n${JSON.stringify(service.pricing, null, 2)}\n\`\`\`\n\n`;
    md += `### Parameters\n\n`;
    md += `- **Required:** ${service.parameters.required.join(', ')}\n`;
    md += `- **Optional:** ${service.parameters.optional.join(', ')}\n\n`;
    md += `**Response Time:** ${service.response_time}\n\n`;
    if (service.examples.length > 0) {
      md += `### Examples\n\n`;
      service.examples.forEach((ex: any) => {
        md += `#### ${ex.scenario}\n\n`;
        md += `\`\`\`json\n${JSON.stringify(ex.params, null, 2)}\n\`\`\`\n\n`;
        md += `Cost: ${JSON.stringify(ex.estimated_cost)}\n\n`;
      });
    }
    md += `---\n\n`;
  });

  md += `## Payment Info\n\n`;
  md += `- **Methods:** ${catalog.payment.methods.join(', ')}\n`;
  md += `- **Networks:** ${catalog.payment.networks.join(', ')}\n`;
  md += `- **Protocol:** ${catalog.payment.protocol}\n`;
  md += `- **Escrow:** ${catalog.payment.escrow_supported ? 'Yes' : 'No'}\n\n`;

  return md;
}
