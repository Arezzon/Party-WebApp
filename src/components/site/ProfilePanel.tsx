'use client';

import { useState } from 'react';
import AnimatedList, { type AnimatedListItem } from '../AnimatedList';
import BorderGlow from '../BorderGlow';
import ProfileCard from '../ProfileCard';
import ShinyText from '../ShinyText';
import SpecularButton from '../SpecularButton';
import FadeContent from '../FadeContent';

interface Props {
  name: string;
  created: Array<{ id: string; title: string; meta: string; private: boolean }>;
  attending: Array<{ id: string; title: string; meta: string }>;
}

export default function ProfilePanel({ name, created, attending }: Props) {
  const [value, setValue] = useState(name);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const createdItems: AnimatedListItem[] = created.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.meta,
    meta: event.private ? 'приватна' : 'публічна'
  }));
  const attendingItems: AnimatedListItem[] = attending.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.meta
  }));

  const go = (item: AnimatedListItem) => {
    if (item && typeof item === 'object' && item.id) window.location.href = `/events/${String(item.id)}`;
  };

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: value })
      });
      setMessage(response.ok || response.status === 303 ? 'Ім’я збережено.' : 'Не вдалося зберегти ім’я.');
    } catch {
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
      else setMessage('Не вдалося видалити акаунт.');
    } catch {
      setMessage('Помилка з’єднання. Спробуйте ще раз.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <BorderGlow glowColor="#10e0ff" backgroundColor="#140a26" borderRadius={22} glowIntensity={0.45} animated>
        <div className="p-3">
          <ProfileCard
            name={name}
            title="Учасник Тусовки"
            handle={`@${name.toLocaleLowerCase('uk-UA').replace(/\s+/g, '_')}`}
            status="онлайн"
            statusColor="#10e0ff"
            contactText="Редагувати"
            showUserInfo
            theme="dark"
            intro
            onContactClick={() => document.getElementById('profile-settings')?.scrollIntoView({ behavior: 'smooth' })}
          />
        </div>
      </BorderGlow>

      <div className="grid gap-6 lg:grid-cols-2">
        <FadeContent trigger="scroll" blur className="vc-panel p-5">
          <ShinyText text="Мої події" color="#10e0ff" shineColor="#ff2d87" speed={2.6} trigger="loop" className="mb-3 text-[11px] uppercase tracking-[0.2em]" />
          {createdItems.length ? (
            <AnimatedList items={createdItems} onItemSelect={go} frame theme="dark" width="100%" maxHeight={300} accentColor="#ff2d87" />
          ) : (
            <p className="text-sm text-muted-foreground">Ви ще нічого не створили.</p>
          )}
        </FadeContent>

        <FadeContent trigger="scroll" blur delay={0.1} className="vc-panel p-5">
          <ShinyText text="Я йду" color="#10e0ff" shineColor="#ff2d87" speed={2.6} trigger="loop" className="mb-3 text-[11px] uppercase tracking-[0.2em]" />
          {attendingItems.length ? (
            <AnimatedList items={attendingItems} onItemSelect={go} frame theme="dark" width="100%" maxHeight={300} accentColor="#10e0ff" />
          ) : (
            <p className="text-sm text-muted-foreground">Поки що жодної записі.</p>
          )}
        </FadeContent>
      </div>

      <section id="profile-settings" className="vc-panel p-6">
        <form onSubmit={save} className="flex flex-wrap items-end gap-4">
          <label className="flex min-w-[240px] flex-1 flex-col gap-1.5 text-sm font-medium">
            Ім’я
            <input name="name" value={value} maxLength={80} required onChange={(event) => setValue(event.target.value)} className="vc-field" />
          </label>
          <SpecularButton type="submit" size="sm" disabled={saving} tint="#ff2d87" textColor="#07020f">
            Зберегти
          </SpecularButton>
        </form>
        {message && <p role="status" className="mt-3 text-sm text-[var(--vc-cyan)]">{message}</p>}
        <div className="vc-divider my-5" />
        <SpecularButton type="button" size="sm" onClick={removeAccount} disabled={saving} tint="#ff3d5f" textColor="#07020f">
          Видалити акаунт
        </SpecularButton>
        <p className="mt-3 text-sm text-muted-foreground">
          Видалення незворотнє: сесії, події та записи зникають, коментарі стають анонімними.
        </p>
      </section>
    </div>
  );
}
