import { chromium, type Page } from 'playwright';

export type Business = {
    name: string;
    facebookUrl: string;
};

export type ScrapeProgress = {
    found: number;
    target: number;
    scrollRound: number;
};

type ScrapeOptions = {
    url: string;
    targetCount: number;
    onProgress?: (progress: ScrapeProgress) => void;
};

const EXCLUDED_PATTERNS = [
    '/ads/',
    '/marketplace/',
    '/privacy/',
    '/policies/',
    '/help/',
    '/login/',
    '/about/',
    '/groups/',
    '/events/',
    '/language/',
];

const EXCLUDED_NAMES = [
    'log in',
    'sign up',
    'english (uk)',
    'english (us)',
    'like page',
];

async function extractBusinesses(page: Page): Promise<Business[]> {
    return page.locator('a').evaluateAll(
        (elements, data) => {
            const results: Business[] = [];

            const excludedPatterns = data.excludedPatterns;
            const excludedNames = data.excludedNames;

            for (const element of elements) {
                const anchor = element as HTMLAnchorElement;

                const name = anchor.textContent?.trim() || '';
                const href = anchor.href || '';

                if (!name || !href) {
                    continue;
                }

                if (!href.toLowerCase().includes('facebook.com')) {
                    continue;
                }

                if (href.toLowerCase().includes('l.facebook.com/l.php')) {
                    continue;
                }

                if (
                    excludedPatterns.some((pattern) =>
                        href.toLowerCase().includes(pattern)
                    )
                ) {
                    continue;
                }

                if (excludedNames.includes(name.toLowerCase())) {
                    continue;
                }

                try {
                    const url = new URL(href);

                    const path = url.pathname.replace(/\/+$/, '');

                    if (!path || path === '/') {
                        continue;
                    }

                    const normalizedUrl =
                        `https://www.facebook.com${path}`.toLowerCase();

                    results.push({
                        name,
                        facebookUrl: normalizedUrl,
                    });
                } catch {
                    continue;
                }
            }

            return results;
        },
        {
            excludedPatterns: EXCLUDED_PATTERNS,
            excludedNames: EXCLUDED_NAMES,
        }
    );
}

export async function scrapeMetaAdLibrary({
    url,
    targetCount,
    onProgress,
}: ScrapeOptions): Promise<Business[]> {
    if (!url.trim()) {
        throw new Error('Meta Ad Library URL is required.');
    }

    if (!Number.isInteger(targetCount) || targetCount < 1) {
        throw new Error('Target count must be a positive whole number.');
    }

    let parsedUrl: URL;

    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error('The supplied URL is not valid.');
    }

    if (!parsedUrl.hostname.toLowerCase().includes('facebook.com')) {
        throw new Error('The URL must be a Facebook Meta Ad Library URL.');
    }

    const browser = await chromium.launch({
        headless: false,
    });

    const page = await browser.newPage({
        viewport: {
            width: 1440,
            height: 900,
        },
    });

    const businesses = new Map<string, Business>();

    let previousCount = 0;
    let noGrowthRounds = 0;
    let scrollRound = 0;

    try {
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });

        // Short initial wait for Meta's first results.
        await page.waitForTimeout(1500);

        while (businesses.size < targetCount && noGrowthRounds < 5) {
            scrollRound++;

            const foundBusinesses = await extractBusinesses(page);

            for (const business of foundBusinesses) {
                if (!businesses.has(business.facebookUrl)) {
                    businesses.set(business.facebookUrl, business);
                }

                if (businesses.size >= targetCount) {
                    break;
                }
            }

            onProgress?.({
                found: Math.min(businesses.size, targetCount),
                target: targetCount,
                scrollRound,
            });

            if (businesses.size >= targetCount) {
                break;
            }

            if (businesses.size === previousCount) {
                noGrowthRounds++;
            } else {
                noGrowthRounds = 0;
                previousCount = businesses.size;
            }

            // Fast scrolling to trigger more results.
            await page.mouse.wheel(0, 4000);

            // Give Meta a short amount of time to render new results.
            await page.waitForTimeout(500);
        }

        return Array.from(businesses.values()).slice(0, targetCount);
    } finally {
        await browser.close();
    }
}