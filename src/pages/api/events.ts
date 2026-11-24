import type { APIRoute } from 'astro';
import { requireUser } from '../../lib/auth.ts';
import { asHttpError, createEvent, HttpError, type EventVisibility } from '../../lib/events.ts';

export const prerender = false;

interface EventPayload {
  title: string;
  description: string;
  startsAt: string;
  places: unknown;
  visibility: EventVisibility;
  cover: Blob | null;
  key: string;
}

function asBlob(value: unknown): Blob | null {
  if (value && typeof value === 'object' && typeof (value as Blob).arrayBuffer === 'function' && 'size' in value) {
    const candidate = value as Blob;
    // Empty file input: browsers send a zero-byte File with an empty name.
    if (candidate.size === 0 && 'name' in candidate && !(candidate as File).name) return null;
    return candidate;
  }
  return null;
}

export async function readPayload(request: Request): Promise<EventPayload> {
  const contentType = request.headers.get('content-type') ?? '';
  const headerKey = request.headers.get('Idempotency-Key') ?? '';
  let data: Record<string, unknown>;

  if (contentType.includes('application/json')) {
    try {
      data = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new HttpError(400, 'Некоректний JSON.');
    }
  } else {
    const form = await request.formData();
    data = {};
    for (const [name, value] of form.entries()) data[name] = value;
  }

  const startsAt = String(data.starts_at ?? data.startsAt ?? '').trim()
    || String(data.starts_at_local ?? data.startsAtLocal ?? '').trim();
  const visibility = String(data.visibility ?? 'public') === 'private' ? 'private' : 'public';

  return {
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    startsAt,
    places: data.places,
    visibility,
    cover: asBlob(data.cover),
    key: String(data.idempotencyKey ?? data.idempotency_key ?? headerKey ?? '')
  };
}

function jsonError(error: unknown): Response {
  const friendly = asHttpError(error);
  return Response.json({ error: friendly.message }, { status: friendly.status });
}

export const POST: APIRoute = async (context) => {
  const user = requireUser(context);
  if (!user) return Response.json({ error: 'Потрібен вхід у акаунт.' }, { status: 401 });

  try {
    const payload = await readPayload(context.request);
    if (!payload.cover) throw new HttpError(400, 'Додайте обкладинку події.');
    const event = await createEvent({
      authorId: user.id,
      title: payload.title,
      description: payload.description,
      startsAt: payload.startsAt,
      places: payload.places as number,
      visibility: payload.visibility,
      cover: payload.cover,
      idempotencyKey: payload.key
    });
    return new Response(null, {
      status: 303,
      headers: { Location: `/events/${event.id}`, 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return jsonError(error);
  }
};
