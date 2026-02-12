"use client";

import { useState, FormEvent } from "react";

interface ResearchResult {
  companyName: string;
  website: string;
  atsDetected: string;
  liveRoles: number | null;
  linkedinSearchUrl: string;
  careersUrl: string | null;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setResults((prev) => [data, ...prev]);
      setUrl("");
    } catch {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
            Prospect Research Tool
          </h1>
          <p className="mt-2 text-gray-500 text-base">
            Paste a company website to detect their ATS, count live roles, and
            find senior recruiters.
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSubmit} className="mb-10">
          <div className="flex gap-3">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="e.g. https://stripe.com"
              disabled={loading}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-lg text-base
                         placeholder:text-gray-400 focus:outline-none focus:ring-2
                         focus:ring-gray-900 focus:border-transparent
                         disabled:bg-gray-50 disabled:text-gray-400 transition-shadow"
            />
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="px-6 py-3 bg-gray-900 text-white rounded-lg font-medium text-base
                         hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900
                         focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed
                         transition-colors whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Researching...
                </span>
              ) : (
                "Research"
              )}
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="mb-6 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-sm flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4 text-gray-500"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Scanning careers page and detecting ATS... This may take a few
            seconds.
          </div>
        )}

        {/* Results Table */}
        {results.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Company Name
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Website
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ATS Detected
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Live Roles
                    </th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      LinkedIn X-Ray Search
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map((result, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {result.companyName}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <a
                          href={result.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {result.website.replace(/^https?:\/\//, "")}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            result.atsDetected === "Unknown / Custom ATS"
                              ? "bg-gray-100 text-gray-600"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          {result.atsDetected}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {result.liveRoles !== null ? (
                          <span className="font-medium">{result.liveRoles}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <a
                          href={result.linkedinSearchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800
                                     hover:underline font-medium"
                        >
                          Search Recruiters
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                            />
                          </svg>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {results.length === 0 && !loading && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">
              Enter a company URL above to start researching.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
