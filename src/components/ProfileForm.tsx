import { useState } from 'react';
import SpecularButton from './SpecularButton';

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
            style={{ background: '#170b2e', color: '#e6e8ee', border: '1px solid #343b49', borderRadius: 8, padding: '10px 12px' }}
          />
        </label>
        <SpecularButton type="submit" size="sm" disabled={saving} tint="#ff2e88" textColor="#0a0418">
          Зберегти
        </SpecularButton>
      </form>
      {message && <p role="status" style={{ color: '#9aa2b1', marginBottom: 12 }}>{message}</p>}
      <hr style={{ border: 0, borderTop: '1px solid #262b36', margin: '20px 0' }} />
      <SpecularButton
        type="button"
        size="sm"
        onClick={removeAccount}
        disabled={saving}
        tint="#ff6b6b"
        textColor="#0a0418"
      >
        Видалити акаунт
      </SpecularButton>
      <p style={{ color: '#9aa2b1', fontSize: '0.9rem', marginBottom: 0 }}>
        Видалення незворотнє: сесії, ваші події та записи зникають, коментарі стають анонімними («Знайомець»).
      </p>
    </section>
  );
}
