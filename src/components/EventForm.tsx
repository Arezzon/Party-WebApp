'use client';

import { useMemo, useRef, useState } from 'react';
import SpecularButton from './SpecularButton';
import AnimatedContent from './AnimatedContent';

export interface EventFormInitial {
  id?: string;
  title?: string;
  description?: string;
  /** Local datetime input value in Europe/Kyiv, e.g. 2027-01-15T19:30 */
  startsAt?: string;
  places?: number | string;
  visibility?: 'public' | 'private';
  coverUrl?: string;
}

interface EventFormProps {
  action: string;
  initial?: EventFormInitial;
  maxDate?: string;
  error?: string;
  submitLabel?: string;
}

/** Offset of Europe/Kyiv at the given local wall-clock time, in minutes. */
function kyivOffsetMinutes(local: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) return 180;
  const [, y, m, d, hh, mm] = match.map(Number) as unknown as number[];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Kyiv',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
        .formatToParts(new Date(guess))
        .map((p) => [p.type, p.value])
    );
    const back = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour) % 24,
      Number(parts.minute)
    );
    return Math.round((back - guess) / 60000);
  } catch {
    return 180;
  }
}

export default function EventForm({
  action,
  initial = {},
  maxDate = '',
  error = '',
  submitLabel
}: EventFormProps) {
  const key = useMemo(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, []);
  const [localError, setLocalError] = useState('');
  const hiddenUtcRef = useRef<HTMLInputElement>(null);
  const isEdit = Boolean(initial.id);

  const message = localError || error;

  return (
    <AnimatedContent trigger="mount" distance={24} duration={0.5} className="w-full">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">
          {isEdit ? 'Редагувати подію' : 'Нова подія'}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Час вказується за Києвом (Europe/Kyiv).
        </p>

        {message && (
          <div role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {message}
          </div>
        )}

        <form
          method="post"
          action={action}
          encType="multipart/form-data"
          onSubmit={(event) => {
            const form = event.currentTarget;
            const localInput = form.elements.namedItem('starts_at_local') as HTMLInputElement | null;
            const placesInput = form.elements.namedItem('places') as HTMLInputElement | null;
            const titleInput = form.elements.namedItem('title') as HTMLInputElement | null;
            const problems: string[] = [];
            if (!titleInput?.value.trim()) problems.push('Вкажіть назву події.');
            const places = Number(placesInput?.value);
            if (!Number.isInteger(places) || places < 1 || places > 10000) {
              problems.push('Кількість місць має бути цілим числом від 1 до 10000.');
            }
            if (!localInput?.value) problems.push('Вкажіть дату й час події.');
            if (problems.length) {
              event.preventDefault();
              setLocalError(problems.join(' '));
              return;
            }
            setLocalError('');
            const offset = kyivOffsetMinutes(localInput!.value);
            const utc = new Date(Date.parse(`${localInput!.value}:00`) - offset * 60000).toISOString();
            if (hiddenUtcRef.current) hiddenUtcRef.current.value = utc;
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="idempotencyKey" value={key} />
          <input ref={hiddenUtcRef} type="hidden" name="starts_at" value="" />

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Назва
            <input
              name="title"
              type="text"
              required
              maxLength={120}
              defaultValue={initial.title ?? ''}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Опис
            <textarea
              name="description"
              rows={5}
              maxLength={5000}
              defaultValue={initial.description ?? ''}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Дата й час (за Києвом)
              <input
                name="starts_at_local"
                type="datetime-local"
                required
                max={maxDate || undefined}
                defaultValue={initial.startsAt ?? ''}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Кількість місць
              <input
                name="places"
                type="number"
                required
                min={1}
                max={10000}
                step={1}
                defaultValue={initial.places ?? 10}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Видимість
            <select
              name="visibility"
              defaultValue={initial.visibility ?? 'public'}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="public">Публічна — видно всім</option>
              <option value="private">Приватна — тільки за запрошенням</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Обкладинка {isEdit ? '(не обов’язково — залишиться поточний)' : '(PNG, JPEG або WebP, до 10 МБ)'}
            <input
              name="cover"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required={!isEdit}
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
            />
          </label>
          {isEdit && initial.coverUrl && (
            <img src={initial.coverUrl} alt="Поточна обкладинка" className="h-32 w-auto rounded-lg object-cover" />
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <SpecularButton type="submit" size="lg" tint="#ff2e88" textColor="#0a0418">
              {submitLabel ?? (isEdit ? 'Зберегти зміни' : 'Створити подію')}
            </SpecularButton>
            <a href={isEdit && initial.id ? `/events/${initial.id}` : '/'} className="text-sm text-muted-foreground underline underline-offset-4">
              Скасувати
            </a>
          </div>
        </form>
      </div>
    </AnimatedContent>
  );
}
