import type { APIRoute } from 'astro';
import { requireUser } from '../../../../lib/auth.ts';
import { asHttpError, deleteEvent } from '../../../../lib/events.ts';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = requireUser(context);
  if (!user) return Response.json({ error: 'Потрібен вхід у акаунт.' }, { status: 401 });

  const id = context.params.id;
  if (!id) return Response.json({ error: 'Подію не знайдено.' }, { status: 404 });

  try {
    deleteEvent(id, user.id);
    return new Response(null, {
      status: 303,
      headers: { Location: '/profile', 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    const friendly = asHttpError(error);
    return Response.json({ error: friendly.message }, { status: friendly.status });
  }
};
