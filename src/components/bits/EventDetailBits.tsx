'use client';

import SpotlightCard from '../SpotlightCard';
import SplitText from '../SplitText';
import ShinyText from '../ShinyText';
import Counter from '../Counter';
import SpecularButton from '../SpecularButton';
import AnimatedList, { type AnimatedListItem } from '../AnimatedList';
import BorderGlow from '../BorderGlow';

interface Props {
  id: string;
  title: string;
  date: string;
  description: string;
  left: number;
  places: number;
  isPrivate: boolean;
  cover: string;
  user: boolean;
  isAuthor: boolean;
  going: boolean;
  idempotencyKey: string;
  attendees: string[];
}

export default function EventDetailBits(props: Props) {
  const attendeeItems: AnimatedListItem[] = props.attendees.map((name) => ({ title: name }));

  return (
    <div className="flex flex-col gap-6">
      <BorderGlow glowColor="#ff2e88" backgroundColor="#170b2e" borderRadius={18} glowIntensity={0.4}>
        <SpotlightCard
          spotlightColor="rgba(113,112,255,0.35)"
          intensity={0.8}
          shape="beam"
          theme="dark"
          className="overflow-hidden rounded-2xl border-0"
        >
          <img
            src={props.cover}
            alt={`Обкладинка події «${props.title}»`}
            className="aspect-[16/9] w-full bg-muted object-cover"
          />
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SplitText
                text={props.title}
                tag="h1"
                splitType="words"
                effect="blur"
                duration={0.9}
                trigger="load"
                textAlign="left"
                color="#fff5fb"
                className="text-3xl font-semibold tracking-tight"
              />
              {props.isPrivate ? (
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">Приватна</span>
              ) : null}
            </div>

            <ShinyText
              text={props.date}
              color="#9aa2b1"
              shineColor="#00e5ff"
              speed={2.2}
              trigger="loop"
              className="text-sm"
            />

            <p className="flex items-center gap-2 text-sm font-medium">
              Вільних місць:
              <Counter value={props.left} fontSize={20} fontWeight={600} textColor="#fff5fb" intro />
              з {props.places}
            </p>

            {props.description ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{props.description}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {props.user && !props.isAuthor && props.going ? (
                <form method="post" action={`/api/events/${props.id}/unrsvp`}>
                  <SpecularButton type="submit" size="sm" tint="#ff6b6b" textColor="#0a0418">
                    Скасувати участь
                  </SpecularButton>
                </form>
              ) : null}
              {props.user && !props.isAuthor && !props.going ? (
                <form method="post" action={`/api/events/${props.id}/rsvp`}>
                  <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />
                  <SpecularButton type="submit" size="sm" disabled={props.left === 0} tint="#ff2e88" textColor="#0a0418">
                    Іду
                  </SpecularButton>
                </form>
              ) : null}
              {!props.user ? (
                <a href={`/login?next=${encodeURIComponent(`/events/${props.id}`)}`} className="text-sm underline underline-offset-4">
                  Увійдіть, щоб записатися
                </a>
              ) : null}
              {props.isAuthor ? (
                <a href={`/events/${props.id}/edit`} className="text-sm underline underline-offset-4">
                  Редагувати подію
                </a>
              ) : null}
            </div>
          </div>
        </SpotlightCard>
      </BorderGlow>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Учасники · {props.attendees.length}</h2>
        {attendeeItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Поки ніхто не записався. Станьте першим!</p>
        ) : (
          <AnimatedList
            items={attendeeItems}
            animation="pop"
            animateOnce
            frame
            theme="dark"
            width="100%"
            maxHeight={280}
          />
        )}
      </section>
    </div>
  );
}
