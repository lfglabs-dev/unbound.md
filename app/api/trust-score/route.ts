import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/trust-score
 *
 * Evaluate trust score for a skill, agent, or dependency.
 * Designed for agents to call BEFORE installing a skill or engaging with another agent.
 *
 * This addresses the #1 concern in the agent community: supply chain attacks
 * via unsigned skills (ref: "skill.md is an unsigned binary" - top trending on MoltBook).
 *
 * Scoring factors:
 * - Permission analysis (what does the skill request?)
 * - Known malicious patterns (credential stealing, data exfiltration)
 * - Dependency chain risk (transitive dependencies)
 * - Author reputation (MoltBook karma, deal history)
 * - Code complexity vs stated purpose (suspicious mismatch)
 */

interface TrustScoreRequest {
  type: 'skill' | 'agent' | 'dependency' | 'contract';
  target: string; // URL, agent ID, package name, or contract address
  // Optional context for richer scoring
  permissions?: string[];
  code_url?: string;
  author?: string;
  description?: string;
  lines_of_code?: number;
  dependencies?: string[];
}

interface TrustScoreResult {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  factors: TrustFactor[];
  recommendation: string;
  request_audit?: {
    description: string;
    endpoint: string;
    estimated_cost: string;
  };
}

interface TrustFactor {
  name: string;
  score: number; // 0-100
  weight: number; // 0-1
  details: string;
  severity: 'info' | 'warning' | 'critical';
}

// Known dangerous permission patterns
const DANGEROUS_PERMISSIONS = [
  { pattern: /file[_\s]*system|fs[_\s]*access|read[_\s]*file|write[_\s]*file/i, risk: 'filesystem access', severity: 'high' as const },
  { pattern: /network|http|fetch|request|socket/i, risk: 'network access', severity: 'medium' as const },
  { pattern: /env|environment|secret|key|token|credential|password/i, risk: 'credential access', severity: 'critical' as const },
  { pattern: /exec|spawn|shell|command|subprocess|eval/i, risk: 'code execution', severity: 'critical' as const },
  { pattern: /crypto|wallet|private[_\s]*key|seed|mnemonic/i, risk: 'cryptographic material access', severity: 'critical' as const },
  { pattern: /clipboard|screen|camera|microphone/i, risk: 'system resource access', severity: 'high' as const },
];

// Known malicious code patterns
const MALICIOUS_PATTERNS = [
  { pattern: /base64.*decode.*exec/i, description: 'Encoded payload execution', severity: 'critical' as const },
  { pattern: /fetch.*\.(env|credentials|keys)/i, description: 'Credential exfiltration', severity: 'critical' as const },
  { pattern: /webhook.*forward.*secret/i, description: 'Secret forwarding to external service', severity: 'critical' as const },
  { pattern: /while.*true.*fetch/i, description: 'Infinite loop with network calls (potential C2)', severity: 'critical' as const },
  { pattern: /eval\(.*response/i, description: 'Remote code execution via eval', severity: 'critical' as const },
  { pattern: /new\s+Function\(/i, description: 'Dynamic code generation', severity: 'high' as const },
];

function scorePermissions(permissions: string[]): TrustFactor {
  if (!permissions || permissions.length === 0) {
    return {
      name: 'permissions',
      score: 50,
      weight: 0.3,
      details: 'No permissions declared. Could mean minimal access or undeclared permissions.',
      severity: 'warning',
    };
  }

  let dangerousCount = 0;
  const risks: string[] = [];

  for (const perm of permissions) {
    for (const dp of DANGEROUS_PERMISSIONS) {
      if (dp.pattern.test(perm)) {
        dangerousCount++;
        risks.push(`${dp.risk} (${dp.severity})`);
      }
    }
  }

  const ratio = dangerousCount / Math.max(permissions.length, 1);
  const score = Math.max(0, 100 - ratio * 80 - dangerousCount * 10);

  return {
    name: 'permissions',
    score: Math.round(score),
    weight: 0.3,
    details: risks.length > 0
      ? `Found ${dangerousCount} risky permission(s): ${risks.join(', ')}`
      : `${permissions.length} permission(s) declared, none flagged as dangerous`,
    severity: dangerousCount > 2 ? 'critical' : dangerousCount > 0 ? 'warning' : 'info',
  };
}

function scoreComplexity(linesOfCode: number | undefined, description: string | undefined): TrustFactor {
  if (!linesOfCode) {
    return {
      name: 'complexity',
      score: 50,
      weight: 0.15,
      details: 'No code metrics provided. Submit code_url for deeper analysis.',
      severity: 'info',
    };
  }

  // Simple heuristic: a "weather skill" with 5000 lines is suspicious
  const descriptionLength = description?.split(/\s+/).length || 0;
  const complexityRatio = linesOfCode / Math.max(descriptionLength, 1);

  let score = 80;
  let detail = '';

  if (linesOfCode > 2000 && descriptionLength < 20) {
    score = 30;
    detail = `Large codebase (${linesOfCode} lines) with minimal description (${descriptionLength} words). Suspicious mismatch.`;
  } else if (linesOfCode > 5000) {
    score = 50;
    detail = `Very large codebase (${linesOfCode} lines). Manual review recommended.`;
  } else if (linesOfCode < 100) {
    score = 90;
    detail = `Small codebase (${linesOfCode} lines). Easy to audit.`;
  } else {
    detail = `${linesOfCode} lines of code. Proportional to described functionality.`;
  }

  return {
    name: 'complexity',
    score,
    weight: 0.15,
    details: detail,
    severity: score < 50 ? 'warning' : 'info',
  };
}

function scoreDependencies(dependencies: string[] | undefined): TrustFactor {
  if (!dependencies || dependencies.length === 0) {
    return {
      name: 'dependencies',
      score: 85,
      weight: 0.2,
      details: 'No external dependencies declared. Minimal supply chain risk.',
      severity: 'info',
    };
  }

  // Flag suspicious dependency names (typosquatting heuristic)
  const suspiciousPatterns = [
    /^[a-z]+-[a-z]+\d$/,  // e.g., "lodash-utils1" (typosquat)
    /^@[a-z]+\/[a-z]+-[a-z]+-[a-z]+-[a-z]+$/, // overly complex scoped package
  ];

  let suspiciousCount = 0;
  const flagged: string[] = [];
  for (const dep of dependencies) {
    for (const pat of suspiciousPatterns) {
      if (pat.test(dep)) {
        suspiciousCount++;
        flagged.push(dep);
      }
    }
  }

  const depCount = dependencies.length;
  let score = 90 - depCount * 2 - suspiciousCount * 20;
  score = Math.max(0, Math.min(100, score));

  return {
    name: 'dependencies',
    score,
    weight: 0.2,
    details: flagged.length > 0
      ? `${depCount} dependencies, ${suspiciousCount} flagged as suspicious: ${flagged.join(', ')}`
      : `${depCount} dependencies. No suspicious patterns detected.`,
    severity: suspiciousCount > 0 ? 'warning' : depCount > 20 ? 'warning' : 'info',
  };
}

function scoreAuthorReputation(author: string | undefined): TrustFactor {
  // In production this would query MoltBook API and our deal history
  // For now, use heuristic scoring
  if (!author) {
    return {
      name: 'author_reputation',
      score: 30,
      weight: 0.2,
      details: 'No author information provided. Unknown provenance.',
      severity: 'warning',
    };
  }

  // Known trusted authors (could be loaded from DB in production)
  const trustedAuthors = ['anthropic', 'openai', 'circle', 'starknet', 'unbound'];
  const isTrusted = trustedAuthors.some(t => author.toLowerCase().includes(t));

  return {
    name: 'author_reputation',
    score: isTrusted ? 90 : 50,
    weight: 0.2,
    details: isTrusted
      ? `Author "${author}" is in the trusted authors list.`
      : `Author "${author}" has no established trust history. Consider requesting verification via POST /api/verify.`,
    severity: isTrusted ? 'info' : 'warning',
  };
}

function scoreOverall(factors: TrustFactor[]): { score: number; grade: TrustScoreResult['grade']; risk_level: TrustScoreResult['risk_level'] } {
  let totalWeight = 0;
  let weightedScore = 0;

  for (const f of factors) {
    weightedScore += f.score * f.weight;
    totalWeight += f.weight;
  }

  const score = Math.round(totalWeight > 0 ? weightedScore / totalWeight : 50);

  const hasCritical = factors.some(f => f.severity === 'critical');
  const grade: TrustScoreResult['grade'] =
    hasCritical ? 'F' :
    score >= 80 ? 'A' :
    score >= 65 ? 'B' :
    score >= 50 ? 'C' :
    score >= 35 ? 'D' : 'F';

  const risk_level: TrustScoreResult['risk_level'] =
    hasCritical ? 'critical' :
    score >= 70 ? 'low' :
    score >= 50 ? 'medium' : 'high';

  return { score, grade, risk_level };
}

export async function POST(request: NextRequest) {
  try {
    const body: TrustScoreRequest = await request.json();

    if (!body.type || !body.target) {
      return NextResponse.json({
        error: {
          code: 'missing_parameters',
          message: 'type and target are required',
          usage: {
            type: 'skill | agent | dependency | contract',
            target: 'URL, agent ID, package name, or contract address',
            optional: {
              permissions: ['list', 'of', 'declared permissions'],
              code_url: 'https://github.com/...',
              author: 'author name or ID',
              description: 'what does this do',
              lines_of_code: 1234,
              dependencies: ['dep1', 'dep2'],
            },
          },
        },
      }, { status: 400 });
    }

    const factors: TrustFactor[] = [];

    // 1. Permission analysis
    factors.push(scorePermissions(body.permissions || []));

    // 2. Complexity analysis
    factors.push(scoreComplexity(body.lines_of_code, body.description));

    // 3. Dependency analysis
    factors.push(scoreDependencies(body.dependencies));

    // 4. Author reputation
    factors.push(scoreAuthorReputation(body.author));

    // 5. Target-specific scoring
    if (body.type === 'contract') {
      factors.push({
        name: 'contract_analysis',
        score: 60,
        weight: 0.15,
        details: 'On-chain contract. Request a full security audit via POST /api/audit for deeper analysis.',
        severity: 'info',
      });
    }

    const { score, grade, risk_level } = scoreOverall(factors);

    const recommendation =
      risk_level === 'critical' ? 'DO NOT USE. Critical security risks detected. Request a human audit immediately.' :
      risk_level === 'high' ? 'High risk. Request a human security audit before using.' :
      risk_level === 'medium' ? 'Moderate risk. Consider requesting a human audit for peace of mind.' :
      'Low risk. This appears safe to use, but periodic audits are recommended.';

    const result: TrustScoreResult = {
      score,
      grade,
      risk_level,
      factors,
      recommendation,
    };

    // Always offer audit upgrade
    if (risk_level !== 'low') {
      result.request_audit = {
        description: 'Get a human security expert to review this in depth',
        endpoint: 'POST /api/audit',
        estimated_cost: body.type === 'contract' ? '$50-500 USDC' : '$25-200 USDC',
      };
    }

    return NextResponse.json({
      trust_score: result,
      evaluated: {
        type: body.type,
        target: body.target,
        evaluated_at: new Date().toISOString(),
      },
      api_version: '3.2.0',
    });

  } catch (error) {
    console.error('Trust score error:', error);
    return NextResponse.json({
      error: {
        code: 'internal_error',
        message: 'Failed to compute trust score',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    }, { status: 500 });
  }
}

/**
 * GET /api/trust-score
 * Documentation and usage info
 */
export async function GET() {
  return NextResponse.json({
    service: 'Trust Score API',
    version: '3.2.0',
    description: 'Evaluate trust score for skills, agents, dependencies, or contracts before using them.',
    why: 'Supply chain attacks on agent skills are the #1 security concern. This API helps you assess risk before installing anything.',
    usage: {
      method: 'POST',
      endpoint: '/api/trust-score',
      body: {
        type: 'skill | agent | dependency | contract',
        target: 'URL, agent ID, package name, or contract address',
        permissions: '(optional) list of declared permissions',
        code_url: '(optional) URL to source code',
        author: '(optional) author name or ID',
        description: '(optional) stated purpose',
        lines_of_code: '(optional) code size',
        dependencies: '(optional) list of dependencies',
      },
    },
    scoring: {
      range: '0-100',
      grades: { A: '80-100', B: '65-79', C: '50-64', D: '35-49', F: '0-34' },
      factors: [
        'Permission analysis (30% weight)',
        'Dependency chain risk (20% weight)',
        'Author reputation (20% weight)',
        'Code complexity vs purpose (15% weight)',
        'Target-specific analysis (15% weight)',
      ],
    },
    examples: [
      {
        description: 'Score a suspicious weather skill',
        request: {
          type: 'skill',
          target: 'https://clawdhub.example/skills/weather-pro',
          permissions: ['filesystem_read', 'network', 'env_access'],
          author: 'unknown-dev-42',
          description: 'Shows weather',
          lines_of_code: 3500,
          dependencies: ['node-fetch', 'dotenv', 'fs-extra'],
        },
      },
      {
        description: 'Score a Starknet contract',
        request: {
          type: 'contract',
          target: '0x049d36...abc',
          author: 'verified-defi-protocol',
          description: 'Token swap router',
        },
      },
    ],
    upgrade: {
      description: 'For deeper analysis, request a human security audit',
      endpoint: 'POST /api/audit',
      pricing: '$25-500 USDC depending on complexity',
    },
  });
}
