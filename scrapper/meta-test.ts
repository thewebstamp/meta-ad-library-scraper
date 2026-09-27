import { chromium, type Page } from 'playwright-core';
import sparticuzChromium from '@sparticuz/chromium';

// Vercel's serverless functions have no display and a read-only filesystem
// outside /tmp, so the full `playwright` package (which bundles its own
// Chromium download) can't run there. `@sparticuz/chromium` ships a
// Lambda-compatible Chromium binary, and `playwright-core` is the same
// Playwright API without the bundled browser. Locally, this still launches
// fine — it just always runs headless now (see below).

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

// A realistic, current desktop Chrome UA. Playwright's default UA on some
// versions still announces itself as "HeadlessChrome" even with headless:
// false in certain configs, which is an easy signal for a site to flag.
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function normalizeAdLibraryUrl(rawUrl: string): string {
    let normalized = rawUrl.trim();

    if (!/^https?:\/\//i.test(normalized)) {
        normalized = `https://${normalized}`;
    }

    // web.facebook.com is the "basic"/legacy surface and is more likely to
    // redirect an unauthenticated or automated session to a login wall.
    // The Ad Library is designed to be publicly browsable on www.
    normalized = normalized.replace(
        /^https?:\/\/web\.facebook\.com/i,
        'https://www.facebook.com'
    );

    normalized = normalized.replace(
        /^https?:\/\/facebook\.com/i,
        'https://www.facebook.com'
    );

    return normalized;
}

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

/**
 * Waits until the page has actually rendered ad-library content, rather
 * than trusting a fixed timeout or `networkidle` (which is unreliable on
 * pages with persistent background network activity, like Facebook).
 * Polls for text that only appears once real ad cards have mounted.
 */
async function waitForAdLibraryContent(
    page: Page,
    timeoutMs = 30000
): Promise<'ready' | 'no-results' | 'login-wall' | 'timeout'> {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        let state: string | null = null;

        try {
            state = await page.evaluate(() => {
                const bodyText = document.body?.innerText || '';

                if (/library id/i.test(bodyText)) {
                    return 'ready';
                }

                if (/no ads match|no results found/i.test(bodyText)) {
                    return 'no-results';
                }

                if (
                    /log in to facebook|you must log in|create new account/i.test(
                        bodyText
                    ) && document.querySelectorAll('a').length < 15
                ) {
                    return 'login-wall';
                }

                return null;
            });
        } catch (err) {
            // The page navigated (a redirect chain, locale/session checks,
            // etc.) at the exact moment we tried to read it. This is not a
            // real failure — the old execution context is just gone. Skip
            // this poll and try again once the new page has settled.
            const message = err instanceof Error ? err.message : '';

            if (
                message.includes('Execution context was destroyed') ||
                message.includes('Target closed') ||
                message.includes('Target page, context or browser has been closed')
            ) {
                await page.waitForTimeout(500);
                continue;
            }

            throw err;
        }

        if (state) {
            return state as 'ready' | 'no-results' | 'login-wall';
        }

        await page.waitForTimeout(500);
    }

    return 'timeout';
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

    const normalizedInputUrl = normalizeAdLibraryUrl(url);

    let parsedUrl: URL;

    try {
        parsedUrl = new URL(normalizedInputUrl);
    } catch {
        throw new Error('The supplied URL is not valid.');
    }

    if (!parsedUrl.hostname.toLowerCase().includes('facebook.com')) {
        throw new Error('The URL must be a Facebook Meta Ad Library URL.');
    }

    const isVercel = !!process.env.VERCEL;

    const browser = await chromium.launch(
        isVercel
            ? {
                headless: true,
                args: [
                    ...sparticuzChromium.args,
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=IsolateOrigins,site-per-process',
                ],
                executablePath: await sparticuzChromium.executablePath(),
            }
            : {
                // Locally, launch your actual installed Chrome instead of a
                // separately downloaded/bundled binary — @sparticuz/chromium
                // only ships a Linux build, so it can't run on Windows/macOS.
                headless: true,
                channel: 'chrome',
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=IsolateOrigins,site-per-process',
                ],
            }
    );

    const context = await browser.newContext({
        viewport: {
            width: 1440,
            height: 900,
        },
        userAgent: USER_AGENT,
        locale: 'en-US',
    });

    // Strip the most common automation fingerprint before any page script
    // runs, so Facebook's client-side checks see a normal navigator object.
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });
    });

    const page = await context.newPage();

    const businesses = new Map<string, Business>();

    let previousCount = 0;
    let noGrowthRounds = 0;
    let scrollRound = 0;

    try {
        await page.goto(normalizedInputUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
        });

        const readiness = await waitForAdLibraryContent(page);

        if (readiness === 'login-wall') {
            throw new Error(
                'Facebook served a login page instead of the Ad Library results. ' +
                'This usually means the session was flagged as automated, or the ' +
                'search requires being logged in. Try opening the same URL in a ' +
                'normal browser window first to confirm it loads without logging in.'
            );
        }

        if (readiness === 'no-results') {
            return [];
        }

        if (readiness === 'timeout') {
            throw new Error(
                'The Ad Library page did not finish loading within 30 seconds. ' +
                'The page may be blocked, throttled, or the URL may not be a valid ' +
                'search. Check the debug screenshot for what actually rendered.'
            );
        }

        while (businesses.size < targetCount && noGrowthRounds < 5) {
            scrollRound++;

            let foundBusinesses: Business[] = [];

            try {
                foundBusinesses = await extractBusinesses(page);
            } catch (err) {
                const message = err instanceof Error ? err.message : '';

                if (
                    message.includes('Execution context was destroyed') ||
                    message.includes('Target closed')
                ) {
                    // The page was mid-navigation/re-render for this one
                    // round. Skip it rather than aborting the whole scrape.
                    await page.waitForTimeout(500);
                    continue;
                }

                throw err;
            }

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
            await page.waitForTimeout(800);
        }

        return Array.from(businesses.values()).slice(0, targetCount);
    } finally {
        await browser.close();
    }
}