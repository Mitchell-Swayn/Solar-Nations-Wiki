/** Prefix a path with Astro's configured base URL (for GitHub Pages subpath deploys). */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${normalized}`;
}
