'use client';

import { useMemo, useState } from 'react';
import AnimatedContent from '../AnimatedContent';
import SpotlightCard from '../SpotlightCard';
import SpecularButton from '../SpecularButton';
import SplitText from '../SplitText';
import ShinyText from '../ShinyText';

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
    <AnimatedContent trigger="mount" distance={22} duration={0.55} className="mx-auto w-full max-w-lg">
      <SpotlightCard
        spotlightColor="rgba(255,45,135,0.24)"
        intensity={0.7}
        theme="dark"
        className="vc-panel p-6 sm:p-8"
      >
        <div className="mb-6 flex flex-col gap-2">
          <ShinyText
            text={register ? 'Новий гравець' : 'З поверненням'}
            color="#10e0ff"
            shineColor="#ff2d87"
            speed={2.4}
            trigger="loop"
            className="text-[11px] uppercase tracking-[0.2em]"
          />
          <SplitText
            text={register ? 'Створити акаунт' : 'Вхід'}
            tag="h1"
            splitType="words"
            effect="blur"
            trigger="load"
            color="#fdf4ff"
            className="vc-neon-text text-3xl font-semibold tracking-tight"
          />
          <p className="text-sm text-muted-foreground">
            {register ? 'Реєстрація займе менше хвилини.' : 'Раді бачити вас знову.'}
          </p>
        </div>

        {(message || notice) && (
          <div
            role="status"
            aria-live="polite"
            className={`mb-4 rounded-lg px-3 py-2 text-sm ${message ? 'bg-[var(--vc-pink)]/10 text-[var(--vc-pink)]' : 'bg-secondary text-secondary-foreground'}`}
          >
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
          className="flex flex-col gap-4"
        >
          {next && !register && <input type="hidden" name="next" value={next} />}
          <input type="hidden" name="idempotencyKey" value={key} />

          {register && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Ім’я
              <input name="name" type="text" required minLength={1} maxLength={80} autoComplete="name" className="vc-field" />
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Електронна пошта
            <input name="email" type="email" required autoComplete="email" className="vc-field" />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Пароль
            <input
              name="password"
              type="password"
              required
              minLength={register ? 8 : undefined}
              autoComplete={register ? 'new-password' : 'current-password'}
              className="vc-field"
            />
          </label>

          <div className="mt-2 flex flex-wrap items-center gap-4">
            <SpecularButton type="submit" size="lg" tint="#ff2d87" textColor="#07020f">
              {register ? 'Зареєструватися' : 'Увійти'}
            </SpecularButton>
            {register && <a href="/privacy" className="vc-link text-sm">Політика конфіденційності</a>}
          </div>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          {register ? (
            <>Вже є акаунт? <a href="/login" className="vc-link">Увійти</a></>
          ) : (
            <>Немає акаунта? <a href="/register" className="vc-link">Зареєструватися</a></>
          )}
        </p>
      </SpotlightCard>
    </AnimatedContent>
  );
}
