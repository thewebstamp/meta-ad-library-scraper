import { NextRequest, NextResponse } from 'next/server';
import {
    scrapeMetaAdLibrary,
    type ScrapeProgress,
} from '../../../scrapper/meta-test';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const url = typeof body.url === 'string' ? body.url.trim() : '';
        const targetCount = Number(body.targetCount);

        if (!url) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Meta Ad Library URL is required.',
                },
                { status: 400 }
            );
        }

        if (!Number.isInteger(targetCount) || targetCount < 1) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Target count must be a positive whole number.',
                },
                { status: 400 }
            );
        }

        const progress: ScrapeProgress[] = [];

        const businesses = await scrapeMetaAdLibrary({
            url,
            targetCount,
            onProgress: (update) => {
                progress.push(update);
                console.log(
                    `Scraping progress: ${update.found}/${update.target} businesses`
                );
            },
        });

        return NextResponse.json({
            success: true,
            businesses,
            count: businesses.length,
            progress,
        });
    } catch (error) {
        console.error('Scrape API error:', error);

        const message =
            error instanceof Error
                ? error.message
                : 'An unexpected error occurred while scraping.';

        return NextResponse.json(
            {
                success: false,
                error: message,
            },
            { status: 500 }
        );
    }
}