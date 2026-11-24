import { useState } from 'react';

type Props = { name: string };

export default function ProfileForm({ name }: Props) {
  const [value, setValue] = useState(name);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

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
    <section aria-label="Керування акаунтом" style={{ border: '1px solid #262b36', borderRadius: 12, padding: 20, background: '#12151d' }}>
      <form onSubmit={save} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: 6, flex: '1 1 240px' }}>
          <span>Ім’я</span>
          <input
            name="name"
            value={value}
            maxLength={80}
            required
            onChange={(event) => setValue(event.target.value)}
            style={{ background: '#0b0d12', color: '#e6e8ee', border: '1px solid #343b49', borderRadius: 8, padding: '10px 12px' }}
          />
        </label>
        <button type="submit" disabled={saving} style={{ background: '#5b8cff', color: '#fff', border: 0, borderRadius: 8, padding: '11px 18px', cursor: 'pointer' }}>
          Зберегти
        </button>
      </form>
      {message && <p role="status" style={{ color: '#9aa2b1', marginBottom: 12 }}>{message}</p>}
      <hr style={{ border: 0, borderTop: '1px solid #262b36', margin: '20px 0' }} />
      <button type="button" onClick={removeAccount} disabled={saving} style={{ background: 'transparent', color: '#ff8f8f', border: '1px solid #6d3434', borderRadius: 8, padding: '10px 16px', cursor: 'pointer' }}>
        Видалити акаунт
      </button>
      <p style={{ color: '#9aa2b1', fontSize: '0.9rem', marginBottom: 0 }}>
        Видалення незворотнє: сесії, ваші події та записи зникають, коментарі стають анонімними («Знайомець»).
      </p>
    </section>
  );
}
