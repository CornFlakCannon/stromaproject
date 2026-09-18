# STROMA

The site of STROMA — *un tessuto di creativi*. Next.js (App Router), React, Tailwind,
exported as static files and served by GitHub Pages.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static export into out/
npx serve out      # preview exactly what gets published
```

- **Content** — `app/content.ts` (sections, people, projects) and `app/testi.ts` (poems and prose).
  Both languages live side by side in every string.
- **Scroll engine** — `app/scrollkit/`, documented in `app/scrollkit/docs/`.
- **Deploying** — every push to `main` publishes the site. Setup, DNS and troubleshooting
  are in [DEPLOY.md](DEPLOY.md).

Everything in `public/` is published as-is: add images already cut to web size, and nothing
that is not meant to be public.
