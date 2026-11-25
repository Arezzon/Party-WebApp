/** Bridges Workers bindings into the app's runtime configuration. */
// @ts-ignore -- virtual module provided by @astrojs/cloudflare / workerd
import { env } from 'cloudflare:workers';
import { bindDatabase } from './db';
import { bindAppEnv } from './env';

let bound = false;

export function bindCloudflareEnv(): void {
  if (bound) return;
  bindAppEnv(env as unknown as Record<string, unknown>);
  bindDatabase((env as unknown as { DB?: unknown }).DB);
  bound = true;
}
