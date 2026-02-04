import { NextResponse } from 'next/server';
import { initDatabase } from '@/lib/db';

export async function GET() {
  try {
    const result = await initDatabase();

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Database initialized successfully',
        tables: ['service_requests', 'negotiations'],
        indexes: ['idx_service_requests_status', 'idx_negotiations_request_id']
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to initialize database',
        details: result.error
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Database initialization failed',
      message: error.message
    }, { status: 500 });
  }
}
