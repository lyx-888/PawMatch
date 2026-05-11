# 01 — Product overview

> Section 1 of the requirements. See `README.md` for the full index.

## 1. Product overview

### 1.1 The problem

Anyone seriously looking to adopt a pet in Singapore has to manually check 6–10 different sources: SPCA's gallery, SOSD's site, Causes for Animals, OSCAS, Mercylight, Voices for Animals, ASD, Exclusively Mongrels, Cat Welfare Society, plus assorted Facebook groups and Instagram accounts. Listings are inconsistent, formats vary wildly, and there's no way to filter across sources or be alerted when a new pet matching one's needs appears. Most prospective adopters spend weeks or months in this loop before adopting — or give up and buy from a pet shop.

### 1.2 The promise

*"Singapore's shelter pets, in one place — and we'll tell you when yours shows up."*

### 1.3 Target users

Anyone in Singapore curious about adopting a shelter pet, from "just looking" to "ready this weekend." The app meets users where they are instead of forcing them to declare intent upfront.

Two interaction modes (same product, different moments):

- **Browse & Go** — find a pet today, get pointed to the shelter to start the real adoption process.
- **Watch & Wait** — set up a watch, live life, get notified when the right pet arrives.

### 1.4 The four pillars

Every feature must serve at least one. Anything else is cut.

1. **Aggregate** — one place for all SG shelter listings, always fresh.
2. **Match** — score pets against the user's actual life, transparently.
3. **Notify** — surface the right pet at the right moment, never spam.
4. **Prepare** — weave adoption-readiness into the flow contextually, not as homework.

### 1.5 Explicit non-goals

- Not a transaction platform — adoption decisions and processes happen between user and shelter.
- Not a messaging platform — handoff to the shelter's own contact flow.
- Not a social network for pet owners.
- Not a pet supplies marketplace.
- Not a lost & found service (separate product, possibly later).
- Not native mobile apps for v1 (PWA only — see §5.9 for iOS implications).
- Not multilingual for v1 (English only — see §5.10 for rationale).

### 1.6 Success metrics

The app is working if these numbers move in the right direction.

| Metric | Target by month 3 | Target by month 6 | How measured |
|---|---|---|---|
| Total installs / first-visit users | 1,000 | 5,000 | Analytics events |
| First-session completion (≥5 swipes) | 60% | 70% | Event logging |
| Profile completion (≥3 essential Qs) | 40% of users | 55% of users | Database |
| Account creation rate | 15% of users | 25% of users | Database |
| 7-day retention | 25% | 35% | Cohort analysis |
| 30-day retention | 10% | 18% | Cohort analysis |
| Saved searches per active user | 0.8 | 1.2 | Database |
| Notification open rate | 30% | 40% | Push + email tracking |
| Tap-throughs to shelter sites | 30% of active users | 45% | Event logging |
| Confirmed adoptions credited to app | 20 | 100 | Post-handoff check-ins |
| Cost per active user | < $0.05/mo | < $0.03/mo | Infra spend / MAU |

These targets are aspirational; the SG pet adoption market is small enough that hitting half is still success.

---

