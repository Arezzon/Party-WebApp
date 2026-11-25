'use client';

import Counter from '../Counter';
import SpotlightCard from '../SpotlightCard';

export interface EventCardItem {
  id: string;
  title: string;
  date: string;
  free: number;
  cover: string | null;
}

interface Props {
  event: EventCardItem;
}

export default function EventCard({ event }: Props) {
  return (
    <SpotlightCard
      spotlightColor="rgba(16,224,255,0.22)"
      intensity={0.7}
      shape="beam"
      theme="dark"
      className="vc-panel overflow-hidden"
    >
      <a href={`/events/${event.id}`} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="h-24 w-full shrink-0 overflow-hidden rounded-lg bg-secondary sm:h-20 sm:w-32">
          {event.cover ? (
            <img
              src={event.cover}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl opacity-50">✦</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold tracking-tight">{event.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{event.date}</p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-[var(--vc-cyan)]">
            вільно&nbsp;
            <Counter value={event.free} fontSize={14} fontWeight={700} textColor="#10e0ff" intro />
            <span className="text-muted-foreground">місць</span>
          </p>
        </div>

        <span aria-hidden="true" className="text-xl text-[var(--vc-pink)]">→</span>
      </a>
    </SpotlightCard>
  );
}
