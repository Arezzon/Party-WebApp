'use client';

import { useMemo, useState } from 'react';
import { Button } from './ui/button';
import AnimatedContent from './AnimatedContent';

interface AuthFormProps {
  mode?: 'register' | 'login';
  error?: string;
  notice?: string;
  next?: string;
}

export default function AuthForm({ mode = 'login', error = '', notice = '', next = '' }: AuthFormProps) {
  const isRegister = mode === 'register';
  const key = useMemo(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, []);
  const [localError, setLocalError] = useState('');

  const message = localError || error;

  return (
    <AnimatedContent trigger="mount" distance={24} duration={0.5} className="w-full">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">
          {isRegister ? 'Створити акаунт' : 'Вхід'}
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {isRegister
            ? 'Реєстрація займе менше хвилини. Ваші дані захищені.'
            : 'Раді бачити вас знову.'}
        </p>

        {(message || notice) && (
          <div
            role="status"
            aria-live="polite"
            className={`mb-4 rounded-lg px-3 py-2 text-sm ${message ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground'}`}
          >
            {message || notice}
          </div>
        )}

        <form
          method="post"
          action={isRegister ? '/register' : '/login'}
          onSubmit={(event) => {
            const form = event.currentTarget;
            const password = form.elements.namedItem('password') as HTMLInputElement | null;
            if (isRegister && password && password.value.length < 8) {
              event.preventDefault();
              setLocalError('Пароль має бути щонайменше 8 символів.');
            } else {
              setLocalError('');
            }
          }}
          className="flex flex-col gap-4"
        >
          {next && !isRegister && <input type="hidden" name="next" value={next} />}
          <input type="hidden" name="idempotencyKey" value={key} />

          {isRegister && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Ім’я
              <input
                name="name"
                type="text"
                required
                minLength={1}
                maxLength={80}
                autoComplete="name"
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Електронна пошта
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Пароль
            <input
              name="password"
              type="password"
              required
              minLength={isRegister ? 8 : undefined}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button type="submit" size="lg">
              {isRegister ? 'Зареєструватися' : 'Увійти'}
            </Button>
            {isRegister && (
              <a href="/privacy" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
                Політика конфіденційності
              </a>
            )}
          </div>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          {isRegister ? (
            <>
              Вже є акаунт? <a href="/login" className="underline underline-offset-4">Увійти</a>
            </>
          ) : (
            <>
              Немає акаунта? <a href="/register" className="underline underline-offset-4">Зареєструватися</a>
            </>
          )}
        </p>
      </div>
    </AnimatedContent>
  );
}
