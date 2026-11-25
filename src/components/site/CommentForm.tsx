'use client';

import { useState } from 'react';

interface Props {
  eventId: string;
}

export default function CommentForm({ eventId }: Props) {
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = body.trim();
    if (!text) { setError('Напишіть коментар.'); return; }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify({ body: text })
      });
      if (!response.ok) {
        let message = 'Не вдалося додати коментар.';
        try {
          const data = await response.json();
          if (data && typeof data.error === 'string') message = data.error;
        } catch { /* keep generic */ }
        setError(message);
        return;
      }
      setBody('');
      window.location.assign(`/events/${encodeURIComponent(eventId)}`);
    } catch {
      setError('Перевірте з’єднання й спробуйте ще раз.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="eyebrow">Залиш свій слід</p>
      <label className="field-label">
        <span>Ваш коментар</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Напишіть щось про подію…"
          aria-label="Ваш коментар"
          className="field"
        />
      </label>
      {error ? <p role="alert" className="notice notice--error">{error}</p> : null}
      <button type="submit" className="pill pill--primary self-start" disabled={busy}>
        {busy ? 'Надсилаємо…' : 'Коментувати'}
      </button>
    </form>
  );
}
