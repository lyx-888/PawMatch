# Incident response

> Placeholder. Flesh out before Phase 5 launch.

## Severity levels

- **SEV-1** — site fully down, or PDPA-affecting incident (data leak, accidental account exposure)
- **SEV-2** — major feature broken (swipe fails, notifications down)
- **SEV-3** — degraded performance, minor bug affecting a subset of users

## First response

1. **Stop the bleeding.** Use the kill switches in [tasks/README.md](../docs/tasks/README.md#kill-switches) — disable shelter, disable LLM, enable maintenance mode.
2. **Roll back.** Vercel → Deployments → Promote prior good deployment to Production.
3. **Communicate.** Update status (later: status.pawmatch.sg). For PDPA-relevant incidents, follow the breach notification flow (TBD).
4. **Diagnose.** Sentry → recent errors. Supabase logs → last 30 min. Vercel logs → last 30 min.
5. **Fix.** Smallest possible change that restores service. Defer cleanup.
6. **Postmortem.** Within 48h. Blameless. Document root cause + prevention in this directory.

## Contact tree

- Solo developer: yixuanleong441@gmail.com
- Supabase status: https://status.supabase.com
- Vercel status: https://www.vercel-status.com
- Anthropic status: https://status.anthropic.com
