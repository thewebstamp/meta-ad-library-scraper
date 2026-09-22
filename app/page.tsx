'use client';

import { useState } from 'react';

type Business = {
  name: string;
  facebookUrl: string;
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [targetCount, setTargetCount] = useState('1000');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);

  async function handleScrape() {
    setError('');
    setBusinesses([]);
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

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || 'Something went wrong while scraping.'
        );
      }

      setBusinesses(data.businesses);
      setCompleted(true);
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

    const csv = [
      headers,
      ...rows,
    ]
      .map((row) =>
        row
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `meta-ad-library-businesses-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-10">
          <div className="mb-4 inline-flex rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300">
            Meta Ad Library Scraper
          </div>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Find Businesses Running Ads
          </h1>

          <p className="mt-4 max-w-2xl text-slate-400">
            Paste a Meta Ad Library search URL, choose how many unique
            businesses you want, and collect their Facebook pages.
          </p>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <div className="grid gap-6 lg:grid-cols-[1fr_220px_auto] lg:items-end">
            <div>
              <label
                htmlFor="meta-url"
                className="mb-2 block text-sm font-medium text-slate-300"
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
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="target-count"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Businesses to scrape
              </label>

              <input
                id="target-count"
                type="number"
                min="1"
                value={targetCount}
                onChange={(event) => setTargetCount(event.target.value)}
                disabled={isScraping}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-slate-500"
              />
            </div>

            <button
              type="button"
              onClick={handleScrape}
              disabled={isScraping || !url.trim()}
              className="rounded-xl bg-white px-7 py-3 font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isScraping ? 'Scraping...' : 'Start Scraping'}
            </button>
          </div>

          {isScraping && (
            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-700 border-t-white" />

                <div>
                  <p className="font-medium">Scraping in progress...</p>
                  <p className="text-sm text-slate-500">
                    The browser is collecting unique Facebook pages from Meta
                    Ad Library.
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-xl border border-red-900 bg-red-950/40 px-4 py-4 text-red-300">
              {error}
            </div>
          )}
        </section>

        {completed && (
          <section className="mt-8 rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium text-emerald-400">
                  Scraping completed
                </p>

                <h2 className="mt-1 text-2xl font-bold">
                  {businesses.length.toLocaleString()} unique businesses found
                </h2>
              </div>

              <button
                type="button"
                onClick={downloadCsv}
                className="rounded-xl bg-white px-6 py-3 font-semibold text-slate-950 transition hover:bg-slate-200"
              >
                Download CSV
              </button>
            </div>
          </section>
        )}

        {businesses.length > 0 && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-6 py-5">
              <h2 className="text-xl font-semibold">Scraped Businesses</h2>
              <p className="mt-1 text-sm text-slate-500">
                Showing {businesses.length.toLocaleString()} unique Facebook
                pages.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-slate-800 bg-slate-950">
                  <tr>
                    <th className="px-6 py-4 text-sm font-medium text-slate-400">
                      #
                    </th>
                    <th className="px-6 py-4 text-sm font-medium text-slate-400">
                      Business Name
                    </th>
                    <th className="px-6 py-4 text-sm font-medium text-slate-400">
                      Facebook Page
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {businesses.map((business, index) => (
                    <tr
                      key={business.facebookUrl}
                      className="border-b border-slate-800 last:border-0"
                    >
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {index + 1}
                      </td>

                      <td className="px-6 py-4 font-medium text-white">
                        {business.name}
                      </td>

                      <td className="px-6 py-4">
                        <a
                          href={business.facebookUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-slate-400 underline decoration-slate-700 underline-offset-4 hover:text-white"
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