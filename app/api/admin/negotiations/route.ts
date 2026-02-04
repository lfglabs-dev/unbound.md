import { NextResponse } from 'next/server';
import { getNegotiations } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('request_id');

    if (!requestId) {
      return NextResponse.json({
        success: false,
        error: 'Missing request_id parameter'
      }, { status: 400 });
    }

    const negotiations = await getNegotiations(requestId);

    return NextResponse.json({
      success: true,
      negotiations,
      count: negotiations.length
    });
  } catch (error: any) {
    console.error('Error fetching negotiations:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch negotiations',
      message: error.message,
      negotiations: []
    }, { status: 500 });
  }
}
