'use client';

import { useState } from 'react';

interface Props {
  name: string;
  created: Array<{ id: string; title: string; meta: string; private: boolean }>;
  attending: Array<{ id: string; title: string; meta: string }>;
}

export default function ProfilePanel({ name, created, attending }: Props) {
  const [value, setValue] = useState(name);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setIsError(false);
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: value })
      });
      const ok = response.ok || response.status === 303;
      setIsError(!ok);
      setMessage(ok ? 'Ім’я збережено.' : 'Не вдалося зберегти ім’я.');
    } catch {
      setIsError(true);
      setMessage('Помилка з’єднання. Спробуйте ще раз.');
    } finally {
      setSaving(false);
    }
  }

  async function removeAccount() {
    if (!window.confirm('Видалити акаунт? Події та записи буде видалено, коментарі знеособлено.')) return;
    setSaving(true);
    try {
      const response = await fetch('/api/profile/delete', { method: 'POST', credentials: 'same-origin' });
      if (response.ok || response.status === 303) window.location.assign('/');
      else {
        setIsError(true);
        setMessage('Не вдалося видалити акаунт.');
      }
    } catch {
      setIsError(true);
      setMessage('Помилка з’єднання. Спробуйте ще раз.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-12">
      <section id="profile-settings" className="card p-6 sm:p-8">
        <p className="eyebrow">Особисті дані</p>
        <form onSubmit={save} className="mt-5 flex flex-wrap items-end gap-4">
          <label className="field-label min-w-[240px] flex-1">
            <span>Ім’я</span>
            <input name="name" value={value} maxLength={80} required onChange={(event) => setValue(event.target.value)} className="field" />
          </label>
          <button type="submit" className="pill pill--primary" disabled={saving}>Зберегти</button>
        </form>
        {message && <p role={isError ? 'alert' : 'status'} className={`notice mt-4 ${isError ? 'notice--error' : 'notice--ok'}`}>{message}</p>}
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <form method="post" action="/logout">
            <button type="submit" className="pill pill--ghost" disabled={saving}>Вийти з акаунта</button>
          </form>
          <span className="text-sm text-muted-foreground">Завершити поточну сесію на цьому пристрої.</span>
        </div>
        <div className="hairline my-7" />
        <button type="button" className="pill pill--danger" onClick={removeAccount} disabled={saving}>Видалити акаунт</button>
        <p className="mt-3 text-sm text-muted-foreground">
          Видалення незворотнє: сесії, події та записи зникають, коментарі стають анонімними.
        </p>
      </section>

      <div className="grid gap-10 md:grid-cols-2">
        <section>
          <p className="eyebrow">Мої події · {created.length}</p>
          <div className="mt-4">
            {created.length ? created.map((event) => (
              <a key={event.id} href={`/events/${event.id}`} className="event-row !grid-cols-[1fr] !gap-1">
                <span className="text-base font-medium">{event.title}</span>
                <span className="text-xs text-muted-foreground">{event.meta} · {event.private ? 'приватна' : 'публічна'}</span>
              </a>
            )) : <p className="text-sm text-muted-foreground">Ви ще нічого не створили.</p>}
          </div>
        </section>

        <section>
          <p className="eyebrow">Я йду · {attending.length}</p>
          <div className="mt-4">
            {attending.length ? attending.map((event) => (
              <a key={event.id} href={`/events/${event.id}`} className="event-row !grid-cols-[1fr] !gap-1">
                <span className="text-base font-medium">{event.title}</span>
                <span className="text-xs text-muted-foreground">{event.meta}</span>
              </a>
            )) : <p className="text-sm text-muted-foreground">Поки що жодної записі.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
