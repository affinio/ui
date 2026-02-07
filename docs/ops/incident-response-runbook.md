# Incident Response Runbook

Date: `2026-02-07`

## Trigger conditions

- CI repeatedly failing on `main`.
- High-severity regression in published package.
- Security issue requiring coordinated response.

## Response flow

1. Open incident thread with severity (`SEV-1/2/3`) and impacted packages.
2. Assign incident lead and owner(s) from impacted paths.
3. Stabilize first:
   - stop further risky deploy/publish actions,
   - identify rollback option or short-term mitigation.
4. Produce fix branch/PR with focused scope.
5. Validate with targeted tests + full required CI.
6. Release patch/hotfix if needed.
7. Publish postmortem action items.

## Incident checklist

- Affected version(s) identified.
- Blast radius documented.
- Rollback strategy confirmed.
- User-facing communication drafted (if public impact exists).
- Follow-up tasks created with owners and deadlines.
