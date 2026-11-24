'use client';

import { useState } from 'react';

export interface CommentFormProps {
  /** UUID події, до якої додається коментар. */
  eventId: string;
  className?: string;
}

/**
 * Форма коментаря. Відправляє POST на /api/events/:id/comments.
 * Текст коментаря завжди передається як звичайний текст (ніколи не як HTML),
 * а сервер зберігає його сирим рядком — сторінка події рендерить його через textContent.
 */
export default function CommentForm({ eventId, className = '' }: CommentFormProps) {
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    const text = body.trim();
    if (!text) {
      setError('Напишіть коментар.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ body: text }),
      });
      if (!response.ok) {
        let message = 'Не вдалося додати коментар.';
        try {
          const data = await response.json();
          if (data && typeof data.error === 'string') message = data.error;
        } catch {
          /* відповідь без JSON — лишаємо загальне повідомлення */
        }
        setError(message);
        return;
      }
      setBody('');
      // Після успішного POST API повертає 303 → /events/:id.
      // При фетчі браузер слідує редіректу сам, тому оновлюємо сторінку явно.
      window.location.assign(`/events/${encodeURIComponent(eventId)}`);
    } catch {
      setError('Перевірте з’єднання й спробуйте ще раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form method="post" action={`/api/events/${encodeURIComponent(eventId)}/comments`} onSubmit={onSubmit} className={className}>
      <label htmlFor="comment-body" className="block text-sm font-medium mb-2">
        Ваш коментар
      </label>
      <textarea
        id="comment-body"
        name="body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Напишіть щось про подію…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="mt-3 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {busy ? 'Надсилаємо…' : 'Коментувати'}
      </button>
    </form>
  );
}
