'use client';

import AnimatedList, { type AnimatedListItem } from '../AnimatedList';
import BorderGlow from '../BorderGlow';
import Counter from '../Counter';
import FadeContent from '../FadeContent';
import ShinyText from '../ShinyText';
import SpecularButton from '../SpecularButton';
import SpotlightCard from '../SpotlightCard';
import SplitText from '../SplitText';
import CommentForm from './CommentForm';

export interface CommentItem {
  id: string;
  body: string;
  author: string;
  authorId: string;
  createdAt: string;
}

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
  comments: CommentItem[];
  userId: string;
}

export default function EventDetail(props: Props) {
  const attendeeItems: AnimatedListItem[] = props.attendees.map((name) => ({ title: name }));

  return (
    <div className="flex flex-col gap-8">
      <BorderGlow glowColor="#ff2d87" backgroundColor="#140a26" borderRadius={22} glowIntensity={0.45}>
        <SpotlightCard
          spotlightColor="rgba(16,224,255,0.24)"
          intensity={0.8}
          shape="beam"
          theme="dark"
          className="overflow-hidden rounded-2xl border-0"
        >
          <div className="relative aspect-[16/9] w-full bg-secondary">
            <img src={props.cover} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#07020f]/85 via-transparent to-transparent" />
          </div>

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
                color="#fdf4ff"
                className="vc-neon-text text-3xl font-semibold tracking-tight sm:text-4xl"
              />
              <div className="flex flex-wrap gap-2">
                <span className="vc-chip">{props.isPrivate ? 'Приватна' : 'Публічна'}</span>
                <span className="vc-chip">{props.date}</span>
              </div>
            </div>

            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <span className="text-muted-foreground">Вільних місць:</span>
              <Counter value={props.left} fontSize={22} fontWeight={700} textColor="#10e0ff" intro />
              <span className="text-muted-foreground">з {props.places}</span>
            </p>

            {props.description ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{props.description}</p>
            ) : null}

            <div className="vc-divider" />

            <div className="flex flex-wrap items-center gap-3">
              {props.user && !props.isAuthor && props.going ? (
                <form method="post" action={`/api/events/${props.id}/unrsvp`}>
                  <SpecularButton type="submit" size="sm" tint="#ff3d5f" textColor="#07020f">
                    Скасувати участь
                  </SpecularButton>
                </form>
              ) : null}
              {props.user && !props.isAuthor && !props.going ? (
                <form method="post" action={`/api/events/${props.id}/rsvp`}>
                  <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />
                  <SpecularButton type="submit" size="sm" disabled={props.left === 0} tint="#ff2d87" textColor="#07020f">
                    Іду
                  </SpecularButton>
                </form>
              ) : null}
              {!props.user ? (
                <a href={`/login?next=${encodeURIComponent(`/events/${props.id}`)}`} className="vc-link text-sm">
                  Увійдіть, щоб записатися
                </a>
              ) : null}
              {props.isAuthor ? (
                <a href={`/events/${props.id}/edit`} className="vc-link text-sm">Редагувати подію</a>
              ) : null}
            </div>
          </div>
        </SpotlightCard>
      </BorderGlow>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Учасники · {props.attendees.length}</h2>
          <ShinyText text="_uid order" color="#a48bc4" shineColor="#10e0ff" speed={3} trigger="loop" className="text-[11px] uppercase tracking-widest" />
        </div>
        {attendeeItems.length === 0 ? (
          <p className="vc-panel p-6 text-sm text-muted-foreground">Поки ніхто не записався. Станьте першим.</p>
        ) : (
          <AnimatedList items={attendeeItems} animation="pop" animateOnce frame theme="dark" width="100%" maxHeight={260} accentColor="#ff2d87" className="vc-panel p-2" />
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <FadeContent trigger="scroll" blur duration={0.6} className="vc-panel p-6">
          <h2 className="mb-4 text-lg font-semibold">Коментарі · {props.comments.length}</h2>
          {props.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Тиша. Ідеальний момент щось написати.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {props.comments.map((comment) => (
                <li key={comment.id} className="rounded-lg bg-secondary/50 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{comment.author}</span>
                    <span className="text-xs text-muted-foreground">{comment.createdAt}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{comment.body}</p>
                  {props.user ? (
                    <div className="mt-2 flex flex-wrap gap-3">
                      <form method="post" action={`/api/comments/${comment.id}/report`}>
                        <input type="hidden" name="reason" value="Порушення правил спільноти" />
                        <button type="submit" className="vc-link text-xs">Поскаржитися</button>
                      </form>
                      {(props.isAuthor || comment.authorId === props.userId) ? (
                        <form method="post" action={`/api/comments/${comment.id}/delete`}>
                          <button type="submit" className="text-xs text-[var(--vc-pink)] underline underline-offset-4">Видалити</button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </FadeContent>

        <FadeContent trigger="scroll" blur duration={0.6} delay={0.1} className="vc-panel p-6">
          {props.user ? (
            <CommentForm eventId={props.id} />
          ) : (
            <div className="flex h-full flex-col justify-center gap-3">
              <p className="text-sm text-muted-foreground">Увійдіть, щоб залишити коментар.</p>
              <a href={`/login?next=${encodeURIComponent(`/events/${props.id}`)}`} className="vc-link text-sm">Увійти →</a>
            </div>
          )}
        </FadeContent>
      </section>
    </div>
  );
}
