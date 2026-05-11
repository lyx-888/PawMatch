# 04 — Screens

> Section 4 of the requirements. See `README.md` for the full index.

## 4. Screens

### 4.1 Public (no auth)
- `/` — Home: counter, stories carousel, swipe stack, bottom tab nav.
- `/pets/[id]` — Pet detail.
- `/search` — Filter form + result grid.
- `/discover` — Curated lanes hub.
- `/discover/long-timers` — Long-timer feed.
- `/share/pet/[id]` — Public pet page (server-rendered, no JS required).
- `/share/search/[id]` — Public saved search (read-only).
- `/about` — Mission, sources, shelter list, disclaimer, contact form.
- `/stories` — Adoption stories feed.
- `/learn` — Adoption readiness deep-dive.
- `/legal/privacy`, `/legal/terms`.

### 4.2 Authenticated
- `/favorites` — Favorited pets, notes, status, compare.
- `/favorites/compare` — Side-by-side.
- `/saved-searches` — List with notification settings.
- `/profile` — Lifestyle, completion %, followed shelters, notif prefs, account mgmt.
- `/auth/sign-in` — Magic link request.
- `/auth/callback` — Magic link redirect + migration handler.

### 4.3 Admin
- `/admin/pets`, `/admin/extractions`, `/admin/stories`, `/admin/scrapers`, `/admin/notifications`, `/admin/costs`, `/admin/users`.

---

