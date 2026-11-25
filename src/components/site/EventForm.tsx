'use client';

import { useMemo, useRef, useState } from 'react';
import { kyivInputToUtc } from '../../lib/timezone';

export interface EventFormInitial {
  id?: string;
  title?: string;
  description?: string;
  startsAt?: string;
  places?: number | string;
  visibility?: 'public' | 'private';
  coverUrl?: string;
}

interface Props {
  action: string;
  initial?: EventFormInitial;
  maxDate?: string;
  error?: string;
  submitLabel?: string;
}

export default function EventForm({ action, initial = {}, maxDate = '', error = '', submitLabel }: Props) {
  const edit = Boolean(initial.id);
  const [localError, setLocalError] = useState('');
  const utcRef = useRef<HTMLInputElement>(null);
  const key = useMemo(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, []);
  const message = localError || error;

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <p className="eyebrow">{edit ? 'Редагування' : 'Нова подія'}</p>
      <h1 className="display mt-4 text-4xl sm:text-5xl">{edit ? 'Змінити подію' : 'Створити подію'}</h1>
      <p className="prose-calm mt-4">Час вказуйте за Києвом. Обкладинка — PNG, JPEG або WebP до 10 МБ.</p>

      {message && <div role="alert" className="notice notice--error mt-6">{message}</div>}

      <form
        method="post"
        action={action}
        encType="multipart/form-data"
        onSubmit={(event) => {
          const form = event.currentTarget;
          const local = form.elements.namedItem('starts_at_local') as HTMLInputElement | null;
          const places = form.elements.namedItem('places') as HTMLInputElement | null;
          const title = form.elements.namedItem('title') as HTMLInputElement | null;
          const problems: string[] = [];
          if (!title?.value.trim()) problems.push('Вкажіть назву події.');
          const count = Number(places?.value);
          if (!Number.isInteger(count) || count < 1 || count > 10000) {
            problems.push('Кількість місць має бути цілим числом від 1 до 10000.');
          }
          const utc = local?.value ? kyivInputToUtc(local.value) : null;
          if (!utc) problems.push('Вкажіть коректну дату й час події.');
          if (problems.length) {
            event.preventDefault();
            setLocalError(problems.join(' '));
            return;
          }
          setLocalError('');
          if (utcRef.current && utc) utcRef.current.value = utc;
        }}
        className="mt-8 flex flex-col gap-5"
      >
        <input type="hidden" name="idempotencyKey" value={key} />
        <input ref={utcRef} type="hidden" name="starts_at" value="" />

        <label className="field-label">
          <span>Назва</span>
          <input name="title" type="text" required maxLength={120} defaultValue={initial.title ?? ''} className="field" />
        </label>

        <label className="field-label">
          <span>Опис</span>
          <textarea name="description" rows={5} maxLength={5000} defaultValue={initial.description ?? ''} className="field" />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="field-label">
            <span>Дата й час (Київ)</span>
            <input name="starts_at_local" type="datetime-local" required max={maxDate || undefined} defaultValue={initial.startsAt ?? ''} className="field" />
          </label>
          <label className="field-label">
            <span>Кількість місць</span>
            <input name="places" type="number" required min={1} max={10000} step={1} defaultValue={initial.places ?? 10} className="field" />
          </label>
        </div>

        <label className="field-label">
          <span>Видимість</span>
          <select name="visibility" defaultValue={initial.visibility ?? 'public'} className="field">
            <option value="public">Публічна — видно всім</option>
            <option value="private">Приватна — тільки за запрошенням</option>
          </select>
        </label>

        <label className="field-label">
          <span>Обкладинка {edit ? '(не обов’язково)' : '(обов’язково)'}</span>
          <input name="cover" type="file" accept="image/png,image/jpeg,image/webp" required={!edit} className="field" />
        </label>
        {edit && initial.coverUrl && (
          <img src={initial.coverUrl} alt="Поточна обкладинка" className="h-32 w-auto rounded-lg object-cover" />
        )}

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="submit" className="pill pill--primary">
            {submitLabel ?? (edit ? 'Зберегти зміни' : 'Створити подію')} <span aria-hidden="true">→</span>
          </button>
          <a href={edit && initial.id ? `/events/${initial.id}` : '/'} className="pill pill--ghost">Скасувати</a>
        </div>
      </form>
    </div>
  );
}
