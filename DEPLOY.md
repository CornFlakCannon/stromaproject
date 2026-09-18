# Putting STROMA online — GitHub Pages + Aruba domain

The site is built as a static export (`output: "export"` in `next.config.ts`) and served for
free by GitHub Pages. The domain stays registered on Aruba; only its DNS records point at
GitHub. Every `git push` to `main` rebuilds and republishes the site in about two minutes.

Throughout this guide replace `TUODOMINIO.it` with the domain you bought and `NUOVO-REPO`
with the name you give the public repository.

**Time needed:** ~30 minutes of work, plus waiting for DNS and the HTTPS certificate
(usually under an hour, at worst 24–48 h).

---

## How it fits together

```
you: git push ──► GitHub repo (public) ──► Action: npm ci + next build ──► out/ ──► GitHub Pages
                                                                                       ▲
visitor: TUODOMINIO.it ──► Aruba DNS (A / CNAME records) ───────────────────────────────┘
```

Two repositories from now on:

| Repo | Visibility | Role |
|---|---|---|
| `stroma-portfolio` (this one) | private | Archive: full history, notes, original files |
| `NUOVO-REPO` | public | The working repo; what Pages publishes |

Free GitHub Pages only works on public repos, and a public repo shows its entire history.
Starting the public one from a single clean commit keeps your personal email (it is in the
old commits), the working notes and the original media out of view.

---

## 0. Before you start

- [ ] You can log in to GitHub as `CornFlakCannon`
- [ ] You can log in to the Aruba customer area (*Area Clienti*) and see the domain
- [ ] The GitHub token saved on this computer has the **`workflow`** permission, or the push
      in step 2 is rejected (see *If something goes wrong*)
- [ ] The clean-up changes on this branch are **committed** — step 2 copies the last commit,
      so uncommitted changes would be left behind:
      ```bash
      git status          # should say "nothing to commit"
      ```

## 1. Keep your email out of public commits

On GitHub: **Settings → Emails** → tick **Keep my email addresses private**.

Your private commit address is `137178601+CornFlakCannon@users.noreply.github.com`
(GitHub shows it on that same page). You will set it for the new repo in step 2.

> Optional, stricter: on the same page, **Block command line pushes that expose my email**.
> Careful — it will then also refuse pushes from your *other* projects until you switch them
> to the noreply address too (`git config --global user.email …`).

## 2. Create the clean public repo

**On GitHub:** *New repository* → name `NUOVO-REPO` → **Public** → do **not** add a README,
.gitignore or license (it must be empty) → *Create*.

**On your computer:**

```bash
cd ~/Desktop/PROGRAMMING/stroma_portfolio

# Copy the last commit's files — no .git, no node_modules — into a new folder
mkdir ../stroma-site
git archive HEAD | tar -x -C ../stroma-site
cd ../stroma-site

# Working notes stay in the private repo
rm -f todo.md todo_next.md TODOLIST.md CAST_PHOTOS.md tree_view.md

# New history, private email
git init -b main
git config user.email "137178601+CornFlakCannon@users.noreply.github.com"
git add -A
git commit -m "STROMA"

# CHECK before pushing: this must print only the noreply address
git log --format='%ae'

git remote add origin https://github.com/CornFlakCannon/NUOVO-REPO.git
git push -u origin main
```

A separate folder — rather than a new branch in the old one — means the old history cannot
be pushed to the public repo by mistake.

**From now on you work in `stroma-site`.** Run `npm install` there once, then `npm run dev`
as usual. The old folder is the archive.

> Look through the public repo once it is up. Things that are visible to anyone:
> `app/content.ts` (including the commented-out founder entry), `manifesto.md`, the texts in
> `app/testi.ts`. Everything that was in `public/` without being used by the site has
> already been removed.

## 3. Turn on GitHub Pages

In the **new** repo: **Settings → Pages → Build and deployment → Source: `GitHub Actions`**.

Then open the **Actions** tab. The workflow *Deploy to GitHub Pages*
(`.github/workflows/deploy.yml`) should be running or finished. If it ran before you
switched the source and failed, open it and press **Re-run all jobs**.

Green tick = the site is published at `https://cornflakcannon.github.io/NUOVO-REPO/`.
**It will look broken there (no styles, no images) — that is expected.** The site is built
to live at the root of a domain, and that address puts it in a sub-folder. It fixes itself
in step 6.

## 4. Verify the domain with GitHub (5 minutes, prevents hijacking)

This proves to GitHub that the domain is yours, so nobody else can attach it to their Pages.

1. GitHub → your **account** **Settings → Pages** (not the repo's) → **Add a domain** →
   enter `TUODOMINIO.it`.
2. GitHub shows a **TXT record**: a name like `_github-pages-challenge-CornFlakCannon` and a
   code. Leave this tab open.
3. Add that TXT record on Aruba (next step shows where), then come back and press **Verify**.

## 5. DNS records on Aruba

Aruba customer area → your domain → **Pannello di controllo** → **Gestione DNS e Name
Server** → **Gestione DNS**. (Aruba renames these menus now and then; you are looking for the
table of DNS records for the domain.) The name servers must stay Aruba's — don't change those.

**First remove** the default records Aruba created for its parking page: any `A` record for
the bare domain (`@` / empty name) and any `A` or `CNAME` record for `www`.

**Leave alone** everything about mail: `MX` records, `mail`, `pop3`, `smtp`, `imap`,
`webmail`, `autodiscover`, and any `TXT` starting with `v=spf1`. Deleting those breaks email
on the domain.

**Then add:**

| Tipo | Nome host | Valore |
|---|---|---|
| A | `@` (or leave empty) | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `cornflakcannon.github.io.` |
| TXT | `_github-pages-challenge-CornFlakCannon` | the code from step 4 |

Optional, for IPv6 — four `AAAA` records on `@`:
`2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.

Notes:
- All four `A` records are needed; they are GitHub's four servers.
- The `CNAME` value is your GitHub **username** address, not the repo's, and ends with a dot.
  If Aruba's form rejects the final dot, enter it without.
- These addresses were checked against GitHub's documentation on 2026-09-18. If this guide is
  old when you read it, confirm them at
  <https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site>.

Save, then check from a terminal (repeat every few minutes until it matches):

```bash
dig +short TUODOMINIO.it          # → the four 185.199.xxx.153 addresses
dig +short www.TUODOMINIO.it      # → cornflakcannon.github.io. then the same four
```

Once the TXT record is visible, go back to the GitHub tab from step 4 and press **Verify**.

## 6. Attach the domain to the site

New repo → **Settings → Pages → Custom domain** → type `TUODOMINIO.it` (without `www`) →
**Save**.

GitHub runs a DNS check. When it turns green it requests an HTTPS certificate; this takes
from a few minutes up to 24 h. When the **Enforce HTTPS** checkbox becomes clickable,
**tick it**.

`www.TUODOMINIO.it` redirects to `TUODOMINIO.it` automatically, thanks to the `CNAME` record.

> No `CNAME` *file* is needed in the repo. That is only for sites published from a branch;
> with an Actions workflow GitHub ignores it and uses this setting.

## 7. Check that it is really live

- [ ] `https://TUODOMINIO.it` loads, with the padlock
- [ ] `https://www.TUODOMINIO.it` redirects to it
- [ ] `http://` redirects to `https://`
- [ ] Scroll the whole home page; open the gallery lightbox and a founder portrait
- [ ] Open a project, then **reload the page** while on it — e.g.
      `/opere/cinema/i_giorni_della_vertigine` (a reload is the real test of a deep link)
- [ ] Open a text in the *Frammenti di Orrori* reader; switch IT / EN
- [ ] A nonsense address such as `/xyz` shows the 404 page
- [ ] Try it on a phone on mobile data (a different network from your computer)

## 8. Updating the site from now on

```bash
cd ~/Desktop/PROGRAMMING/stroma-site
# ...edit...
npm run build              # optional but wise: catches errors before GitHub does
git add -A && git commit -m "what changed"
git push
```

Live in ~2 minutes; progress is in the repo's **Actions** tab. A failed build leaves the
previous version online — nothing breaks for visitors.

To preview exactly what Pages will serve: `npm run build && npx serve out`.

**Remember:** every file in `public/` is published and can be downloaded by anyone who
guesses its address, whether or not a page uses it. Don't park originals, sources (`.kra`)
or not-yet-public photos there.

## What GitHub Pages cannot do

The site is plain files with no server behind it, so none of these will work: API routes,
server actions, cookies, redirects/headers in `next.config.ts`, `proxy`/middleware, and
automatic image resizing by `next/image` (`images.unoptimized` is on — so **export images at
web size before adding them**, as the current ones are: ≤ 1800 px on the long side, `.webp`).
A contact form would need an external service. If the project ever needs a server, moving to
Vercel is a small change: remove the two lines in `next.config.ts` and re-point the DNS.

Limits: 1 GB per site (it is ~15 MB now), ~100 GB of traffic per month, and Pages is not
meant for running an online shop.

## If something goes wrong

| Symptom | Cause / fix |
|---|---|
| Page without styles or images on `cornflakcannon.github.io/NUOVO-REPO` | Expected — see step 3. Use the real domain. |
| Same, but on the real domain | Custom domain not saved (step 6), or the last Action failed — check the **Actions** tab. |
| Aruba's parking page still shows | An old Aruba `A` record is still there (step 5), or DNS hasn't propagated — check with `dig`, try from mobile data. |
| "Domain's DNS record could not be retrieved" / "improperly configured" | Records missing or mistyped; all four `A` records must exist. Wait 15 min, then remove and re-add the custom domain in step 6. |
| **Enforce HTTPS** greyed out | Certificate not issued yet. Wait up to 24 h. Still stuck: remove the custom domain, save, add it again. |
| Browser says "not secure" | Same as above — the certificate is still on its way. |
| `git push` rejected: *refusing to allow a Personal Access Token to create or update workflow … without `workflow` scope* | Not a mistake in the commit: GitHub only lets a token push files under `.github/workflows/` if it has that permission. GitHub → Settings → Developer settings → Personal access tokens → your token: **classic** → tick `workflow` → *Update token* (the token value doesn't change); **fine-grained** → *Repository permissions → Workflows: Read and write*, and make sure the token's *Repository access* includes `NUOVO-REPO`. Then push again. |
| Action fails at `npm ci` | `package-lock.json` out of step with `package.json`: run `npm install` locally, commit the lock file, push. |
| Action fails at *Build* | A real code error. Run `npm run build` locally; it shows the same message. |
| Action fails at *Deploy* with a permissions/environment error | Pages source is not set to *GitHub Actions* (step 3). |
| Email on the domain stopped working | A mail record was deleted in step 5. In Aruba's DNS panel use the option to restore the default records, then redo only the `A`/`CNAME`/`TXT` changes. |

## Optional, later

Not needed to go live, each is a small addition: `metadataBase` in `app/layout.tsx` plus an
Open Graph image (so links shared on WhatsApp/Instagram show a preview), `app/sitemap.ts`
and `app/robots.ts` for search engines, a designed `app/not-found.tsx`.
