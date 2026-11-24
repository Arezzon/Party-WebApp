'use client';

import ProfileCard from '../ProfileCard';
import AnimatedList, { type AnimatedListItem } from '../AnimatedList';
import BorderGlow from '../BorderGlow';

interface Props {
  name: string;
  created: Array<{ id: string; title: string; meta: string; private: boolean }>;
  attending: Array<{ id: string; title: string; meta: string }>;
}

export default function ProfileBits({ name, created, attending }: Props) {
  const go = (item: AnimatedListItem) => {
    if (item && typeof item === 'object' && item.id) window.location.href = `/events/${String(item.id)}`;
  };

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

  return (
    <div className="flex flex-col gap-8">
      <BorderGlow glowColor="#7170ff" backgroundColor="#0b0d12" borderRadius={18} glowIntensity={0.45} animated>
        <div style={{ padding: '8px 10px' }}>
          <ProfileCard
            name={name}
            title="Учасник Тусовки"
            handle={`@${name.toLocaleLowerCase('uk-UA').replace(/\s+/g, '_')}`}
            status="онлайн"
            statusColor="#5ee6a8"
            contactText="Написати"
            showUserInfo
            theme="dark"
            intro
          />
        </div>
      </BorderGlow>

      <section>
        <h2 className="mb-3 text-xl font-medium">Створені події · {created.length}</h2>
        {created.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ви ще не створили жодної події.</p>
        ) : (
          <AnimatedList
            items={createdItems}
            onItemSelect={go}
            selectOnHover
            enableArrowNavigation
            animation="slide"
            animateOnce
            frame
            theme="dark"
            accentColor="#7170ff"
            width="100%"
            maxHeight={360}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-medium">Події, на які я записався · {attending.length}</h2>
        {attending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ви ще не записувалися на події.</p>
        ) : (
          <AnimatedList
            items={attendingItems}
            onItemSelect={go}
            selectOnHover
            enableArrowNavigation
            animation="slide"
            animateOnce
            frame
            theme="dark"
            accentColor="#7170ff"
            width="100%"
            maxHeight={360}
          />
        )}
      </section>
    </div>
  );
}
