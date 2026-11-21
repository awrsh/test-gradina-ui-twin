/**
 * Local process entry for `npm run dev` / `npm start`.
 * Intentionally has no default export so Vercel does not treat this repo as an
 * Express framework project; Vercel uses `api/index.ts` under the Vite preset.
 */
import './twin-server.ts';
