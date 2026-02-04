import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const skillPath = path.join(process.cwd(), 'OPENCLAW_SKILL.md');
    const skillContent = fs.readFileSync(skillPath, 'utf-8');

    return new NextResponse(skillContent, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Skill documentation not found',
    }, { status: 404 });
  }
}
