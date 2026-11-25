'use client';

import AnimatedList, { type AnimatedListItem } from '../AnimatedList';
import CurvedInput from '../CurvedInput';
import Counter from '../Counter';

export interface EventItem {
  id: string;
  title: string;
  date: string;
  free: number;
  cover: string | null;
}

interface Props {
  query: string;
  events: EventItem[];
}

export default function EventExplorer({ query, events }: Props) {
  const items: AnimatedListItem[] = events.map((event) => ({
    id: event.id,
    image: event.cover ?? undefined,
    title: event.title,
    description: event.date,
    meta: (
      <span className="inline-flex items-center gap-1 text-[var(--vc-cyan)]">
        вільно&nbsp;
        <Counter value={event.free} fontSize={13} fontWeight={700} textColor="#10e0ff" intro />
      </span>
    )
  }));

  return (
    <section className="flex flex-col gap-5">
      <CurvedInput
        defaultValue={query}
        onSubmit={(value) => {
          const q = value.trim();
          window.location.href = q ? `/?q=${encodeURIComponent(q)}` : '/';
        }}
        placeholder="Шукаємо подію…"
        buttonText="Знайти"
        ariaLabel="Пошук подій за назвою"
        type="search"
        width="100%"
        height={62}
        bend={14}
        theme="dark"
        backgroundColor="#140a26"
        textColor="#fdf4ff"
        placeholderColor="#a48bc4"
        borderColor="rgba(16,224,255,0.34)"
        buttonColor="#ff2d87"
        buttonTextColor="#07020f"
        shadowColor="#ff2d87"
      />

      {events.length === 0 ? (
        <div className="vc-panel p-10 text-center text-sm text-muted-foreground">
          Подій поки немає. Створіть першу — і місто прокинеться.
        </div>
      ) : (
        <AnimatedList
          items={items}
          onItemSelect={(item) => {
            if (item && typeof item === 'object' && item.id) {
              window.location.href = `/events/${String(item.id)}`;
            }
          }}
          selectOnHover
          enableArrowNavigation
          animation="pop"
          animateOnce
          stagger={0.05}
          showGradients
          frame
          theme="dark"
          accentColor="#ff2d87"
          radius={18}
          gap={12}
          width="100%"
          className="vc-panel p-2"
        />
      )}
    </section>
  );
}
