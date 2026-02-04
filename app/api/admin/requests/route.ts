import { NextResponse } from 'next/server';
import { listServiceRequests } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');

    const requests = await listServiceRequests(status, limit);

    return NextResponse.json({
      success: true,
      requests,
      count: requests.length
    });
  } catch (error: any) {
    console.error('Error fetching requests:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch requests',
      message: error.message,
      requests: []
    }, { status: 500 });
  }
}
