'use client';

import AnimatedList, { type AnimatedListItem } from '../AnimatedList';
import CurvedInput from '../CurvedInput';
import Counter from '../Counter';

export interface EventItem {
  id: string;
  title: string;
  description: string;
  date: string;
  free: number;
  cover: string | null;
}

interface Props {
  query: string;
  events: EventItem[];
}

export default function EventBrowser({ query, events }: Props) {
  const items: AnimatedListItem[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.date,
    image: event.cover || undefined,
    meta: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        вільно&nbsp;
        <Counter
          value={event.free}
          fontSize={13}
          fontWeight={600}
          textColor="#00e5ff"
          duration={0.8}
          intro
        />
      </span>
    )
  }));

  return (
    <div className="flex flex-col gap-6">
      <CurvedInput
        defaultValue={query}
        onSubmit={(value) => {
          const q = value.trim();
          window.location.href = q ? `/?q=${encodeURIComponent(q)}` : '/';
        }}
        placeholder="Пошук подій за назвою…"
        buttonText="Знайти"
        ariaLabel="Пошук подій за назвою"
        type="search"
        width="100%"
        height={64}
        bend={16}
        theme="dark"
        backgroundColor="#170b2e"
        textColor="#fff5fb"
        placeholderColor="#b39fd4"
        borderColor="rgba(0,229,255,0.35)"
        buttonColor="#ff2e88"
        buttonTextColor="#0a0418"
        shadowColor="#ff2e88"
      />

      {events.length === 0 ? null : (
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
          displayScrollbar={false}
          frame
          theme="dark"
          accentColor="#ff2e88"
          radius={14}
          gap={12}
          width="100%"
          maxHeight={620}
        />
      )}
    </div>
  );
}
