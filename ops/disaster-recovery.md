# Disaster recovery

> Placeholder. Flesh out before Phase 5 launch.

## Scenarios to cover

- **Supabase data loss / corruption** — restoration from automated daily backup; estimated RTO/RPO.
- **Accidental destructive migration** — recovery via point-in-time restore.
- **Vercel project deletion or compromise** — re-link from Git, restore env vars from password manager.
- **Lost access to third-party services** (OpenAI, Resend, Inngest) — break-glass account recovery.
- **Domain hijack** — registrar contact, DNS rollback procedure.

## Backup inventory

- Supabase: daily PITR (Pro tier) — confirm enabled before launch
- 1Password vault: stores all third-party keys and admin credentials
- GitHub: code is the source of truth; the repo itself is the backup

## RTO/RPO targets

TBD. Set realistic targets for a solo-dev shipping a side-project: probably 4h RTO / 24h RPO.
