'use client';

import { useMemo, useRef, useState } from 'react';
import AnimatedContent from '../AnimatedContent';
import SpotlightCard from '../SpotlightCard';
import SpecularButton from '../SpecularButton';
import SplitText from '../SplitText';
import ShinyText from '../ShinyText';
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
    <AnimatedContent trigger="mount" distance={22} duration={0.55} className="mx-auto w-full max-w-2xl">
      <SpotlightCard
        spotlightColor="rgba(16,224,255,0.2)"
        intensity={0.7}
        theme="dark"
        className="vc-panel p-6 sm:p-8"
      >
        <div className="mb-6 flex flex-col gap-2">
          <ShinyText
            text="Нічна зміна · новий ефір"
            color="#10e0ff"
            shineColor="#ff2d87"
            speed={2.4}
            trigger="loop"
            className="text-[11px] uppercase tracking-[0.2em]"
          />
          <SplitText
            text={edit ? 'Редагувати подію' : 'Нова подія'}
            tag="h1"
            splitType="words"
            effect="blur"
            trigger="load"
            color="#fdf4ff"
            className="vc-neon-text text-3xl font-semibold tracking-tight"
          />
          <p className="text-sm text-muted-foreground">Час вказується за Києвом (Europe/Kyiv).</p>
        </div>

        {message && (
          <div role="alert" className="mb-4 rounded-lg bg-[var(--vc-pink)]/10 px-3 py-2 text-sm text-[var(--vc-pink)]">
            {message}
          </div>
        )}

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
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="idempotencyKey" value={key} />
          <input ref={utcRef} type="hidden" name="starts_at" value="" />

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Назва
            <input name="title" type="text" required maxLength={120} defaultValue={initial.title ?? ''} className="vc-field" />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Опис
            <textarea name="description" rows={5} maxLength={5000} defaultValue={initial.description ?? ''} className="vc-field" />
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
                className="vc-field"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Кількість місць
              <input name="places" type="number" required min={1} max={10000} step={1} defaultValue={initial.places ?? 10} className="vc-field" />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Видимість
            <select name="visibility" defaultValue={initial.visibility ?? 'public'} className="vc-field">
              <option value="public">Публічна — видно всім</option>
              <option value="private">Приватна — тільки за запрошенням</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Обкладинка {edit ? '(не обов’язково)' : '(PNG, JPEG або WebP, до 10 МБ)'}
            <input
              name="cover"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              required={!edit}
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
            />
          </label>
          {edit && initial.coverUrl && (
            <img src={initial.coverUrl} alt="Поточна обкладинка" className="h-32 w-auto rounded-lg object-cover" />
          )}

          <div className="mt-2 flex flex-wrap items-center gap-4">
            <SpecularButton type="submit" size="lg" tint="#ff2d87" textColor="#07020f">
              {submitLabel ?? (edit ? 'Зберегти зміни' : 'Створити подію')}
            </SpecularButton>
            <a href={edit && initial.id ? `/events/${initial.id}` : '/'} className="vc-link text-sm">
              Скасувати
            </a>
          </div>
        </form>
      </SpotlightCard>
    </AnimatedContent>
  );
}
