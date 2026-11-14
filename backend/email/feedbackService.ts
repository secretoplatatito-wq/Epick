import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import type { FeedbackSubmission } from '../types';

const DATA_ROOT = path.resolve(process.cwd(), '.clippah_data');
const FEEDBACK_FILE = path.join(DATA_ROOT, 'feedback.json');
const TARGET_EMAIL = process.env.FEEDBACK_TO_EMAIL || 'retroplasmman@gmail.com';

// Simple per-IP anti-spam sliding window
const recentSubmissions = new Map<string, number[]>();

export function checkSpamRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const windowMs = 60_000;
  const maxPerMinute = 6;
  const entries = (recentSubmissions.get(ip) ?? []).filter((ts) => now - ts < windowMs);
  if (entries.length >= maxPerMinute) {
    return { allowed: false, retryAfterSec: Math.ceil((windowMs - (now - entries[0])) / 1000) };
  }
  entries.push(now);
  recentSubmissions.set(ip, entries);
  return { allowed: true };
}

function readFeedbackLog(): FeedbackSubmission[] {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  if (!fs.existsSync(FEEDBACK_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8')) as FeedbackSubmission[];
  } catch {
    return [];
  }
}

function writeFeedbackLog(items: FeedbackSubmission[]) {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

export function listFeedbackSubmissions(): FeedbackSubmission[] {
  return readFeedbackLog().slice(0, 50);
}

export async function submitFeedback(input: {
  rating: number;
  category: FeedbackSubmission['category'];
  comment?: string;
  issueDescription?: string;
  projectUuid?: string;
  honeypot?: string;
}): Promise<FeedbackSubmission> {
  if (input.honeypot && input.honeypot.trim().length > 0) {
    throw new Error('Spam validation rejected submission.');
  }

  const rating = Math.round(Number(input.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error('Rating must be an integer between 1 and 5.');
  }

  const entry: FeedbackSubmission = {
    id: crypto.randomUUID(),
    projectUuid: input.projectUuid?.trim() || undefined,
    rating,
    category: input.category || 'General',
    comment: (input.comment || '').trim().slice(0, 2000),
    issueDescription: input.issueDescription?.trim().slice(0, 2000) || undefined,
    timestamp: new Date().toISOString(),
    deliveryStatus: 'queued-local-spool',
    recipient: TARGET_EMAIL,
  };

  // Attempt server-side SMTP email if configured
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT || 587) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: TARGET_EMAIL,
        subject: `[CLIPPAH Feedback] ${entry.rating}/5 Stars — ${entry.category}`,
        text: [
          `Rating: ${entry.rating}/5`,
          `Category: ${entry.category}`,
          `Project UUID: ${entry.projectUuid || 'N/A'}`,
          `Timestamp: ${entry.timestamp}`,
          `Comment: ${entry.comment || '(none)'}`,
          `Issue Description: ${entry.issueDescription || '(none)'}`,
        ].join('\n'),
      });
      entry.deliveryStatus = 'sent-smtp';
    } catch (err) {
      console.warn('SMTP feedback delivery failed, keeping spool record:', err);
    }
  } else if (process.env.FEEDBACK_WEBHOOK_URL) {
    try {
      const resp = await fetch(process.env.FEEDBACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...entry, to: TARGET_EMAIL }),
      });
      if (resp.ok) {
        entry.deliveryStatus = 'sent-webhook';
      }
    } catch (err) {
      console.warn('Webhook feedback delivery failed, keeping spool record:', err);
    }
  }

  const existing = readFeedbackLog();
  existing.unshift(entry);
  writeFeedbackLog(existing);
  return entry;
}
