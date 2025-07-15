import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    // Call the backend chat endpoint
    console.log('Calling backend URL:', `${BACKEND_URL}/chat`);
    console.log('Sending messages to backend:', messages);
    
    const response = await fetch(`${BACKEND_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });
    
    console.log('Backend response status:', response.status);
    console.log('Backend response headers:', response.headers);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { 
          error: errorData.error || 'Backend service unavailable',
          message: 'Failed to connect to Sei DeFi Agent backend. Please ensure the backend service is running.' 
        },
        { status: response.status }
      );
    }

    // Check if the response is a streaming response
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      // Create a ReadableStream to forward the SSE stream from backend
      const stream = new ReadableStream({
        async start(controller) {
          if (!response.body) {
            controller.close();
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();

          try {
            while (true) {
              const { done, value } = await reader.read();
              
              if (done) {
                controller.close();
                break;
              }

              // Forward the chunk from backend to frontend
              controller.enqueue(value);
            }
          } catch (error) {
            console.error('Error reading stream from backend:', error);
            controller.error(error);
          }
        }
      });

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // Handle non-streaming response
      const data = await response.json();
      return NextResponse.json(data);
    }
    
  } catch (error) {
    console.error('Error proxying to backend:', error);
    return NextResponse.json(
      { 
        error: 'Frontend proxy error',
        message: 'Failed to communicate with the backend service. Please check if the backend is running on the correct port.'
      },
      { status: 500 }
    );
  }
}
