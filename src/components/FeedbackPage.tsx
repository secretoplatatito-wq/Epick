import React, { useEffect, useState } from 'react';
import { Star, CheckCircle2, AlertCircle } from 'lucide-react';
import type { FeedbackSubmission } from '../../backend/types';
import { fetchFeedbackList, submitFeedbackApi } from '../lib/api';

interface FeedbackPageProps {
  activeWorkspaceUuid?: string;
}

const CATEGORIES: FeedbackSubmission['category'][] = [
  'AI Ranking',
  'Video Render',
  'MCP Integration',
  'UI / UX',
  'Bug Report',
  'General',
];

export const FeedbackPage: React.FC<FeedbackPageProps> = ({ activeWorkspaceUuid }) => {
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [category, setCategory] = useState<FeedbackSubmission['category']>('AI Ranking');
  const [projectUuid, setProjectUuid] = useState<string>(activeWorkspaceUuid || '');
  const [comment, setComment] = useState<string>('');
  const [issueDescription, setIssueDescription] = useState<string>('');
  const [honeypot, setHoneypot] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<FeedbackSubmission | null>(null);
  const [recentList, setRecentList] = useState<FeedbackSubmission[]>([]);

  useEffect(() => {
    if (activeWorkspaceUuid && !projectUuid) {
      setProjectUuid(activeWorkspaceUuid);
    }
  }, [activeWorkspaceUuid, projectUuid]);

  useEffect(() => {
    fetchFeedbackList()
      .then((res) => setRecentList(res.submissions))
      .catch(() => {});
  }, []);

  const displayStarCount = hoverRating > 0 ? hoverRating : rating;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rating < 1 || rating > 5) {
      setError('Please select a star rating from 1 to 5 before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitFeedbackApi({
        rating,
        category,
        comment,
        issueDescription,
        projectUuid,
        website: honeypot,
      });
      setConfirmation(res.submission);
      setRecentList((prev) => [res.submission, ...prev]);
      setComment('');
      setIssueDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-[1000px] px-4 py-8 sm:px-8">
      <div className="mb-8">
        <p className="text-xs font-medium text-slate-400">
          CLIPPAH BY YUANGAMES77 · Review & Feedback
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white">
          Rate your clipping & rendering experience
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          Share feedback on autonomous AI moment ranking, FFmpeg rendering, or MCP tooling. Submissions are validated server-side and delivered directly to the CLIPPAH engineering team.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-white/10 bg-[#131722] p-6 lg:col-span-7"
        >
          {/* Interactive 5-Star Rating */}
          <div>
            <label className="block text-sm font-semibold text-white">
              Overall Rating
            </label>
            <p className="mt-1 text-xs text-slate-400">
              Click a star to highlight your rating from 1 to 5.
            </p>
            <div
              className="mt-3 flex items-center gap-2"
              role="radiogroup"
              aria-label="Star rating"
              onMouseLeave={() => setHoverRating(0)}
            >
              {[1, 2, 3, 4, 5].map((starValue) => {
                const isHighlighted = starValue <= displayStarCount;
                return (
                  <button
                    key={starValue}
                    type="button"
                    aria-label={`Rate ${starValue} out of 5 stars`}
                    aria-pressed={rating === starValue}
                    onMouseEnter={() => setHoverRating(starValue)}
                    onClick={() => setRating(starValue)}
                    className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                      isHighlighted
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-white/10 bg-[#0B0D12] text-slate-500 hover:border-white/25 hover:text-slate-300'
                    }`}
                  >
                    <Star
                      className="h-5 w-5"
                      fill={isHighlighted ? 'currentColor' : 'none'}
                    />
                  </button>
                );
              })}
              <span className="ml-3 font-mono text-sm text-slate-300 tabular-nums">
                {rating > 0 ? `${rating} / 5` : 'Not selected'}
              </span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="fb-category" className="block text-xs font-medium text-slate-300">
                Feedback Category
              </label>
              <select
                id="fb-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as FeedbackSubmission['category'])}
                className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3 text-sm text-white focus:border-[var(--accent)] focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="fb-uuid" className="block text-xs font-medium text-slate-300">
                Project UUID (optional)
              </label>
              <input
                id="fb-uuid"
                type="text"
                value={projectUuid}
                onChange={(e) => setProjectUuid(e.target.value)}
                placeholder="Paste workspace UUID"
                className="mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-[#0B0D12] px-3 font-mono text-xs text-white placeholder:text-slate-500 focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-4">
            <label htmlFor="fb-comment" className="block text-xs font-medium text-slate-300">
              Written Feedback (optional)
            </label>
            <textarea
              id="fb-comment"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What worked well, or what would make CLIPPAH faster for your workflow?"
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0B0D12] p-3 text-sm text-white placeholder:text-slate-500 focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          <div className="mt-4">
            <label htmlFor="fb-issue" className="block text-xs font-medium text-slate-300">
              Issue Description (optional)
            </label>
            <textarea
              id="fb-issue"
              rows={2}
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              placeholder="Steps to reproduce an issue, unexpected timestamp, or MCP response error..."
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0B0D12] p-3 text-sm text-white placeholder:text-slate-500 focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          {/* Anti-spam honeypot field hidden from human users */}
          <div className="hidden" aria-hidden="true">
            <label htmlFor="fb-website">Website</label>
            <input
              id="fb-website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {confirmation && (
            <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-200">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>Feedback Submitted ({confirmation.rating}/5 Stars)</span>
              </div>
              <p className="mt-1 text-emerald-300/90">
                Target: {confirmation.recipient} · Status: {confirmation.deliveryStatus} · Time:{' '}
                <span className="font-mono">{confirmation.timestamp}</span>
              </p>
              {confirmation.deliveryStatus === 'queued-local-spool' && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-emerald-500/20 pt-2.5">
                  <a
                    href={`mailto:${encodeURIComponent(confirmation.recipient)}?subject=${encodeURIComponent(
                      `[CLIPPAH Feedback] ${confirmation.rating}/5 Stars — ${confirmation.category}`
                    )}&body=${encodeURIComponent(
                      [
                        `Rating: ${confirmation.rating}/5 Stars`,
                        `Category: ${confirmation.category}`,
                        `Project UUID: ${confirmation.projectUuid || 'N/A'}`,
                        `Timestamp: ${confirmation.timestamp}`,
                        '',
                        `Feedback: ${confirmation.comment || '(none)'}`,
                        `Issue Description: ${confirmation.issueDescription || '(none)'}`,
                      ].join('\n')
                    )}`}
                    className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500"
                  >
                    Send Copy via Email App ({confirmation.recipient})
                  </a>
                  <span className="text-[11px] text-emerald-200/80">
                    Saved locally on server; click to email with your own mail app ($0 setup).
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-4">
            <span className="text-xs text-slate-500">
              Routed securely via server-side mail/webhook handler
            </span>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </form>

        <aside className="rounded-xl border border-white/10 bg-[#131722] p-6 lg:col-span-5">
          <h2 className="font-display text-base font-semibold text-white">
            Recent Submissions
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Latest persisted feedback records from this instance.
          </p>

          {recentList.length === 0 ? (
            <div className="mt-6 rounded-lg border border-white/5 bg-[#0B0D12] p-6 text-center text-xs text-slate-500">
              No feedback entries recorded yet.
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-white/10">
              {recentList.slice(0, 6).map((item) => (
                <li key={item.id} className="py-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-white">
                      {item.rating}/5 Stars · {item.category}
                    </span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {new Date(item.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                  {item.comment && (
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">{item.comment}</p>
                  )}
                  {item.projectUuid && (
                    <p className="mt-1 font-mono text-[11px] text-slate-500 truncate">
                      UUID: {item.projectUuid}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
};
