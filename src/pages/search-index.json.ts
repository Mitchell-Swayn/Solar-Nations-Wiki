import type { APIRoute } from 'astro';
import { getSearchEntries } from '../lib/search';

export const prerender = true;

export const GET: APIRoute = () => new Response(JSON.stringify(getSearchEntries()), {
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  },
});
