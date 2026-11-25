import type { APIRoute } from 'astro';
import { requireUser } from '../../../../lib/auth.ts';
import { asHttpError, updateEvent } from '../../../../lib/events.ts';
import { readPayload } from '../../events.ts';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = await requireUser(context);
  if (!user) return Response.json({ error: 'Потрібен вхід у акаунт.' }, { status: 401 });

  const id = context.params.id;
  if (!id) return Response.json({ error: 'Подію не знайдено.' }, { status: 404 });

  try {
    const payload = await readPayload(context.request);
    await updateEvent(id, user.id, {
      title: payload.title,
      description: payload.description,
      startsAt: payload.startsAt || undefined,
      places: payload.places as number,
      visibility: payload.visibility,
      ...(payload.cover ? { cover: payload.cover } : {})
    });
    return new Response(null, {
      status: 303,
      headers: { Location: `/events/${id}`, 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    const friendly = asHttpError(error);
    return Response.json({ error: friendly.message }, { status: friendly.status });
  }
};
