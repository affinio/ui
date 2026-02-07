# SLO / SLA Baseline

Date: `2026-02-07`

This baseline applies to release pipelines and package reliability expectations.

## CI service levels (internal)

- Target CI success rate on `main`: `>= 98%` (rolling 30 days).
- Target median CI duration:
  - `verify`: `<= 12 min`
  - full pipeline: `<= 30 min`
- Failed `main` builds should be triaged within `4` business hours.

## Package quality SLO

- No known high-severity regression left untriaged for more than `1` business day.
- Critical adapter regressions should have fix or mitigation within `48` hours.

## Incident severity mapping

- `SEV-1`: production-breaking behavior, no workaround.
- `SEV-2`: major behavior degradation with workaround.
- `SEV-3`: non-critical defect.

## SLA (communication)

- Initial acknowledgement for external bug/security reports: within `72` hours (aligned with `SECURITY.md`).
