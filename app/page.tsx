'use client';

import { useState } from 'react';
import { Source_Serif_4, Inter } from 'next/font/google';

const serif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-serif',
});

const sans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
});

type Business = {
  name: string;
  facebookUrl: string;
};

type ScrapeProgress = {
  found: number;
  target: number;
  scrollRound: number;
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [targetCount, setTargetCount] = useState('1000');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [progress, setProgress] = useState<ScrapeProgress | null>(null);
  const [isScraping, setIsScraping] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);

  async function handleScrape() {
    setError('');
    setBusinesses([]);
    setProgress(null);
    setCompleted(false);
    setIsScraping(true);

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          targetCount: Number(targetCount),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);

        throw new Error(
          data?.error || 'Something went wrong while scraping.'
        );
      }

      if (!response.body) {
        throw new Error('The scraper did not return a readable response.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, {
          stream: true,
        });

        const events = buffer.split('\n\n');

        buffer = events.pop() || '';

        for (const eventBlock of events) {
          const lines = eventBlock.split('\n');

          let eventName = '';
          let eventData = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventName = line.slice(7);
            }

            if (line.startsWith('data: ')) {
              eventData = line.slice(6);
            }
          }

          if (!eventName || !eventData) {
            continue;
          }

          const data = JSON.parse(eventData);

          if (eventName === 'started') {
            setProgress({
              found: 0,
              target: data.target,
              scrollRound: 0,
            });
          }

          if (eventName === 'progress') {
            setProgress(data);
          }

          if (eventName === 'completed') {
            setBusinesses(data.businesses);
            setProgress({
              found: data.count,
              target: Number(targetCount),
              scrollRound: progress?.scrollRound || 0,
            });
            setCompleted(true);
          }

          if (eventName === 'error') {
            throw new Error(
              data.error || 'Something went wrong while scraping.'
            );
          }
        }
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong while scraping.'
      );
    } finally {
      setIsScraping(false);
    }
  }

  function downloadCsv() {
    if (businesses.length === 0) {
      return;
    }

    const headers = ['Business Name', 'Facebook Page'];

    const rows = businesses.map((business) => [
      business.name,
      business.facebookUrl,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    });

    const downloadUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `meta-ad-library-businesses-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(downloadUrl);
  }

  const percentage =
    progress && progress.target > 0
      ? Math.min(
        100,
        Math.round((progress.found / progress.target) * 100)
      )
      : 0;

  return (
    <main
      className={`${serif.variable} ${sans.variable} min-h-screen`}
      style={{
        backgroundColor: '#0B0D10',
        color: '#EDEEF0',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div className="mx-auto max-w-[960px] px-8 py-16">

        {/* Header */}
        <header className="mb-14 border-b pb-10" style={{ borderColor: '#1E2328' }}>
          <p
            className="mb-3 text-[13px] tracking-wide"
            style={{ color: '#8A9099' }}
          >
            Ad library research
          </p>
          <h1
            className="text-[40px] leading-[1.15] sm:text-[48px]"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: '#F5F5F3' }}
          >
            Find every business behind a Meta ad search
          </h1>
          <p className="mt-5 max-w-[62ch] text-[16px] leading-[1.7]" style={{ color: '#9BA1AA' }}>
            Paste a search from the Meta Ad Library, set how many unique
            advertisers you need, and this collects their business name and
            Facebook page as it scrolls through the results.
          </p>
        </header>

        {/* Console panel */}
        <section
          className="rounded-md border p-8"
          style={{ borderColor: '#1E2328', backgroundColor: '#111418' }}
        >
          <div className="grid gap-6 lg:grid-cols-[1fr_180px_auto] lg:items-end">
            <div>
              <label
                htmlFor="meta-url"
                className="mb-2 block text-[13px] font-medium"
                style={{ color: '#9BA1AA' }}
              >
                Meta Ad Library URL
              </label>

              <input
                id="meta-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://www.facebook.com/ads/library/?..."
                disabled={isScraping}
                className="w-full rounded border px-4 py-3 text-[15px] outline-none transition disabled:opacity-50"
                style={{
                  borderColor: '#2A3038',
                  backgroundColor: '#0B0D10',
                  color: '#EDEEF0',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#C7A566')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#2A3038')}
              />
            </div>

            <div>
              <label
                htmlFor="target-count"
                className="mb-2 block text-[13px] font-medium"
                style={{ color: '#9BA1AA' }}
              >
                Target count
              </label>

              <input
                id="target-count"
                type="number"
                min="1"
                value={targetCount}
                onChange={(event) => setTargetCount(event.target.value)}
                disabled={isScraping}
                className="w-full rounded border px-4 py-3 text-[15px] outline-none transition disabled:opacity-50"
                style={{
                  borderColor: '#2A3038',
                  backgroundColor: '#0B0D10',
                  color: '#EDEEF0',
                  fontVariantNumeric: 'tabular-nums',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#C7A566')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#2A3038')}
              />
            </div>

            <button
              type="button"
              onClick={handleScrape}
              disabled={isScraping || !url.trim()}
              className="rounded px-7 py-3 text-[15px] font-medium transition disabled:cursor-not-allowed disabled:opacity-30"
              style={{ backgroundColor: '#C7A566', color: '#1A1500' }}
            >
              {isScraping ? 'Scraping' : 'Start scraping'}
            </button>
          </div>

          {isScraping && progress && (
            <div
              className="mt-8 border-t pt-7"
              style={{ borderColor: '#1E2328' }}
            >
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-[15px]" style={{ color: '#EDEEF0' }}>
                    Collecting unique advertisers
                  </p>
                  <p className="mt-1 text-[13px]" style={{ color: '#6E747C' }}>
                    Scroll round {progress.scrollRound.toLocaleString()}
                  </p>
                </div>

                <div
                  className="text-right text-[26px]"
                  style={{ fontVariantNumeric: 'tabular-nums', color: '#F5F5F3' }}
                >
                  {progress.found.toLocaleString()}
                  <span className="text-[15px]" style={{ color: '#6E747C' }}>
                    {' '}
                    / {progress.target.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="h-[3px] w-full overflow-hidden rounded-full" style={{ backgroundColor: '#1E2328' }}>
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${percentage}%`, backgroundColor: '#C7A566' }}
                />
              </div>

              <div className="mt-2 text-right text-[13px]" style={{ color: '#6E747C' }}>
                {percentage}%
              </div>
            </div>
          )}

          {isScraping && !progress && (
            <div className="mt-8 flex items-center gap-3 border-t pt-7" style={{ borderColor: '#1E2328' }}>
              <div
                className="h-4 w-4 animate-spin rounded-full border-2"
                style={{ borderColor: '#2A3038', borderTopColor: '#C7A566' }}
              />
              <p className="text-[14px]" style={{ color: '#9BA1AA' }}>
                Opening the Ad Library and loading the first results.
              </p>
            </div>
          )}

          {error && (
            <div
              className="mt-8 rounded border px-4 py-3 text-[14px]"
              style={{ borderColor: '#5C2E2E', backgroundColor: '#1A1010', color: '#E8A5A5' }}
            >
              {error}
            </div>
          )}
        </section>

        {/* Completion summary */}
        {completed && (
          <section
            className="mt-6 flex flex-col justify-between gap-4 rounded-md border px-8 py-6 sm:flex-row sm:items-center"
            style={{ borderColor: '#233024', backgroundColor: '#0F1610' }}
          >
            <div>
              <p className="text-[13px]" style={{ color: '#7FA88A' }}>
                Scrape complete
              </p>
              <p
                className="mt-1 text-[22px]"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: '#F5F5F3' }}
              >
                {businesses.length.toLocaleString()} unique businesses
              </p>
            </div>

            <button
              type="button"
              onClick={downloadCsv}
              className="rounded border px-6 py-3 text-[14px] font-medium transition"
              style={{ borderColor: '#2A3038', backgroundColor: 'transparent', color: '#EDEEF0' }}
            >
              Download CSV
            </button>
          </section>
        )}

        {/* Results ledger */}
        {businesses.length > 0 && (
          <section className="mt-10">
            <div className="mb-4 flex items-baseline justify-between">
              <h2
                className="text-[20px]"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 600, color: '#F5F5F3' }}
              >
                Businesses found
              </h2>
              <p className="text-[13px]" style={{ color: '#6E747C' }}>
                {businesses.length.toLocaleString()} rows
              </p>
            </div>

            <div className="overflow-x-auto rounded-md border" style={{ borderColor: '#1E2328' }}>
              <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1E2328' }}>
                    <th
                      className="px-5 py-3 text-[12px] font-medium"
                      style={{ color: '#6E747C', width: '56px' }}
                    >
                      No.
                    </th>
                    <th className="px-5 py-3 text-[12px] font-medium" style={{ color: '#6E747C' }}>
                      Business name
                    </th>
                    <th className="px-5 py-3 text-[12px] font-medium" style={{ color: '#6E747C' }}>
                      Facebook page
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {businesses.map((business, index) => (
                    <tr
                      key={business.facebookUrl}
                      style={{ borderBottom: '1px solid #171B20' }}
                    >
                      <td
                        className="px-5 py-3 text-[13px]"
                        style={{ color: '#6E747C', fontVariantNumeric: 'tabular-nums' }}
                      >
                        {index + 1}
                      </td>

                      <td className="px-5 py-3 text-[14px]" style={{ color: '#EDEEF0' }}>
                        {business.name}
                      </td>

                      <td className="px-5 py-3 text-[13px]">
                        <a
                          href={business.facebookUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-[#2A3038] underline-offset-4 transition hover:decoration-current"
                          style={{ color: '#9BA1AA' }}
                        >
                          {business.facebookUrl}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}