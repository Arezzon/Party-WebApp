'use client';

import { useMemo, useState } from 'react';

interface Props {
  mode?: 'login' | 'register';
  error?: string;
  notice?: string;
  next?: string;
}

export default function AuthForm({ mode = 'login', error = '', notice = '', next = '' }: Props) {
  const register = mode === 'register';
  const [localError, setLocalError] = useState('');
  const key = useMemo(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, []);
  const message = localError || error;

  return (
    <div className="mx-auto w-full max-w-[430px]">
      <p className="eyebrow">{register ? 'Новий учасник' : 'З поверненням'}</p>
      <h1 className="display mt-4 text-4xl sm:text-5xl">{register ? 'Створити акаунт' : 'Вхід'}</h1>
      <p className="prose-calm mt-4">
        {register ? 'Реєстрація займе менше хвилини.' : 'Раді бачити вас знову.'}
      </p>

      {(message || notice) && (
        <div role="status" aria-live="polite" className={`notice mt-6 ${message ? 'notice--error' : 'notice--ok'}`}>
          {message || notice}
        </div>
      )}

      <form
        method="post"
        action={register ? '/register' : '/login'}
        onSubmit={(event) => {
          const form = event.currentTarget;
          const password = form.elements.namedItem('password') as HTMLInputElement | null;
          if (register && password && password.value.length < 8) {
            event.preventDefault();
            setLocalError('Пароль має бути щонайменше 8 символів.');
          } else {
            setLocalError('');
          }
        }}
        className="mt-8 flex flex-col gap-5"
      >
        {next && !register && <input type="hidden" name="next" value={next} />}
        <input type="hidden" name="idempotencyKey" value={key} />

        {register && (
          <label className="field-label">
            <span>Ім’я</span>
            <input name="name" type="text" required minLength={1} maxLength={80} autoComplete="name" className="field" />
          </label>
        )}

        <label className="field-label">
          <span>Електронна пошта</span>
          <input name="email" type="email" required autoComplete="email" className="field" />
        </label>

        <label className="field-label">
          <span>Пароль</span>
          <input
            name="password"
            type="password"
            required
            minLength={register ? 8 : undefined}
            autoComplete={register ? 'new-password' : 'current-password'}
            className="field"
          />
        </label>

        <button type="submit" className="pill pill--primary mt-2 w-full">
          {register ? 'Зареєструватися' : 'Увійти'} <span aria-hidden="true">→</span>
        </button>

        {register && <a href="/privacy" className="link self-start text-sm">Політика конфіденційності</a>}
      </form>

      <p className="mt-8 text-sm text-muted-foreground">
        {register ? (
          <>Вже є акаунт? <a href="/login" className="link">Увійти</a></>
        ) : (
          <>Немає акаунта? <a href="/register" className="link">Зареєструватися</a></>
        )}
      </p>
    </div>
  );
}
