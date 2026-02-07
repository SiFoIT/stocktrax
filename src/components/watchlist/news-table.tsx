"use client";

import { NewsArticle } from "@/types";
import { formatRelativeTime } from "@/lib/utils";

interface NewsTableProps {
  articles: NewsArticle[];
  loading: boolean;
  emptyMessage?: string;
}

export function NewsTable({ articles, loading, emptyMessage }: NewsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-black/50 dark:text-white/50">Loading news...</p>
        </div>
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-black dark:text-white mb-2">No News Available</h3>
        <p className="text-black/50 dark:text-white/50">{emptyMessage || "No recent news articles found for the symbols in this watchlist."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {articles.map((article) => (
        <a
          key={article.uuid}
          href={article.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 hover:border-black/10 dark:hover:border-white/10 transition-all group"
        >
          <div className="flex gap-4">
            {article.thumbnail && (
              <div className="flex-shrink-0 w-16 h-16 rounded-md overflow-hidden bg-black/10 dark:bg-white/10">
                <img
                  src={article.thumbnail}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-black dark:text-white group-hover:text-blue-400 transition-colors line-clamp-2 mb-2">
                {article.title}
              </h3>
              <div className="flex items-center gap-3 text-xs text-black/50 dark:text-white/50">
                <span className="font-medium">{article.publisher}</span>
                <span>•</span>
                <span>{formatRelativeTime(article.publishedAt)}</span>
                {article.relatedSymbols.length > 0 && (
                  <>
                    <span>•</span>
                    <div className="flex gap-1">
                      {article.relatedSymbols.slice(0, 3).map((symbol) => (
                        <span
                          key={symbol}
                          className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium"
                        >
                          {symbol}
                        </span>
                      ))}
                      {article.relatedSymbols.length > 3 && (
                        <span className="text-black/40 dark:text-white/40">
                          +{article.relatedSymbols.length - 3}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 self-center">
              <svg className="w-5 h-5 text-black/30 dark:text-white/30 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
