import { NextRequest } from 'next/server';
import {
    scrapeMetaAdLibrary,
    type ScrapeProgress,
} from '../../../scrapper/meta-test';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const body = await request.json();

    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const targetCount = Number(body.targetCount);

    if (!url) {
        return new Response(
            JSON.stringify({
                success: false,
                error: 'Meta Ad Library URL is required.',
            }),
            {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
    }

    if (!Number.isInteger(targetCount) || targetCount < 1) {
        return new Response(
            JSON.stringify({
                success: false,
                error: 'Target count must be a positive whole number.',
            }),
            {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event: string, data: unknown) => {
                controller.enqueue(
                    encoder.encode(
                        `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
                    )
                );
            };

            try {
                send('started', {
                    target: targetCount,
                });

                const businesses = await scrapeMetaAdLibrary({
                    url,
                    targetCount,
                    onProgress: (update: ScrapeProgress) => {
                        send('progress', update);
                    },
                });

                send('completed', {
                    businesses,
                    count: businesses.length,
                });

                controller.close();
            } catch (error) {
                console.error('Scrape API error:', error);

                const message =
                    error instanceof Error
                        ? error.message
                        : 'An unexpected error occurred while scraping.';

                send('error', {
                    error: message,
                });

                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        },
    });
}