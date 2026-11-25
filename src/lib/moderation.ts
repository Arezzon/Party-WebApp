/**
 * Moderation helpers: role check, idempotent reports and resolution actions.
 * All database writes are transaction-friendly and rely on the partial unique
 * index created in src/lib/db.ts for race-safe deduplication.
 */
// @ts-ignore -- node:crypto is available at runtime; no @types/node in the project
import { randomUUID } from 'node:crypto';
import { env } from './env';

export interface ReportInput {
  commentId: string;
  eventId: string;
  reporterId: string;
  reason: string;
}

export interface ActionInput {
  reportId?: string | null;
  commentId: string;
  eventId: string;
  actorId: string;
  action: 'dismiss' | 'delete_comment' | 'event_author_delete';
  reason?: string;
}

export function isModerator(
  email?: string | null,
  configured: readonly string[] = env.moderatorEmails
): boolean {
  if (!email) return false;
  const value = String(email).trim().toLocaleLowerCase();
  return configured.some((item) => String(item).trim().toLocaleLowerCase() === value);
}

export async function findOpenReport(db: any, commentId: string, reporterId: string): Promise<any | null> {
  return (await db.prepare(
    `SELECT * FROM Reports WHERE comment_id = ? AND reporter_id = ? AND status = 'open' LIMIT 1`
  ).get(commentId, reporterId)) ?? null;
}

export async function createOpenReport(db: any, input: ReportInput): Promise<{ report: any; created: boolean }> {
  const existing = await findOpenReport(db, input.commentId, input.reporterId);
  if (existing) return { report: existing, created: false };

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO Reports (id, comment_id, event_id, reporter_id, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?)`
    ).run(id, input.commentId, input.eventId, input.reporterId, input.reason, createdAt);
  } catch (error) {
    const replay = await findOpenReport(db, input.commentId, input.reporterId);
    if (replay) return { report: replay, created: false };
    throw error;
  }
  return {
    report: await db.prepare('SELECT * FROM Reports WHERE id = ?').get(id),
    created: true
  };
}

export async function logModerationAction(db: any, input: ActionInput): Promise<string> {
  const id = randomUUID();
  await db.prepare(
    `INSERT INTO ModerationActions
       (id, report_id, comment_id, event_id, actor_id, action, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.reportId ?? null,
    input.commentId,
    input.eventId,
    input.actorId,
    input.action,
    input.reason ?? '',
    new Date().toISOString()
  );
  return id;
}

export async function listOpenReports(db: any): Promise<any[]> {
  return (await db.prepare(
    `SELECT r.id, r.reason, r.created_at,
            c.id AS comment_id, c.body AS comment_body, c.author_id AS comment_author_id,
            COALESCE(cu.name, 'Знайомець') AS comment_author,
            e.id AS event_id, e.title AS event_title,
            r.reporter_id, COALESCE(ru.name, 'Учасник') AS reporter_name
       FROM Reports r
       JOIN Comments c ON c.id = r.comment_id
       JOIN Events e ON e.id = c.event_id
       LEFT JOIN Users cu ON cu.id = c.author_id
       LEFT JOIN Users ru ON ru.id = r.reporter_id
      WHERE r.status = 'open'
      ORDER BY r.created_at DESC, r.id DESC`
  ).all()) as any[];
}

export async function resolveReport(
  db: any,
  reportId: string,
  actorId: string,
  action: 'dismiss' | 'delete_comment',
  reason = ''
): Promise<any | null> {
  const report = (await db.prepare(
    `SELECT r.*, c.event_id, c.id AS comment_id
       FROM Reports r LEFT JOIN Comments c ON c.id = r.comment_id
      WHERE r.id = ? AND r.status = 'open'`
  ).get(reportId)) as any;
  if (!report) return null;

  const status = action === 'dismiss' ? 'dismissed' : 'comment_deleted';
  await db.prepare(
    `UPDATE Reports SET status = ?, resolved_at = ?, resolved_by = ?
      WHERE id = ? AND status = 'open'`
  ).run(status, new Date().toISOString(), actorId, reportId);

  await logModerationAction(db, {
    reportId,
    commentId: report.comment_id ?? '',
    eventId: report.event_id ?? '',
    actorId,
    action,
    reason
  });
  return report;
}

export async function deleteCommentWithReport(db: any, reportId: string, actorId: string): Promise<any | null> {
  const report = (await db.prepare(
    `SELECT r.id AS report_id, r.reason, c.id AS comment_id, c.event_id
       FROM Reports r JOIN Comments c ON c.id = r.comment_id
      WHERE r.id = ? AND r.status = 'open'`
  ).get(reportId)) as any;
  if (!report) return null;

  await logModerationAction(db, {
    reportId,
    commentId: report.comment_id,
    eventId: report.event_id,
    actorId,
    action: 'delete_comment',
    reason: report.reason
  });
  await db.prepare('DELETE FROM Comments WHERE id = ?').run(report.comment_id);
  await db.prepare(
    `UPDATE Reports SET status = 'comment_deleted', resolved_at = ?, resolved_by = ?
      WHERE id = ? AND status = 'open'`
  ).run(new Date().toISOString(), actorId, reportId);
  return report;
}
