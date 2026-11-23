# Diagram interaction benchmark

Reproduce with `pnpm --filter @affino/diagram-core build` followed by:

```sh
BENCH_DIAGRAM_ENTITY_COUNTS=1000,5000,10000 BENCH_DIAGRAM_SAMPLES=40 node scripts/bench-diagram-core-interactions.mjs
```

The fixture is deterministic and contains nodes, edges, ports, texts, and shapes. The benchmark reports p50/p95 milliseconds and engine counters. Samples are single-process wall-clock readings; compare only on the same host and runtime.

## Captured results

The pre-change 1k sample (10 iterations) and post-change 1k sample (40 iterations) bracket the equal-spacing change from pairwise candidate comparisons to nearest compatible neighbors. Sample counts differ, so these are directional rather than a strict statistical comparison.

| Workload, 1k entities | Before p50 / p95 ms | After p50 / p95 ms |
| --- | ---: | ---: |
| Node drag with dependent edges | 0.0639 / 1.2238 | 0.0432 / 0.1048 |
| Waypoint edit and undo | 0.0384 / 0.1171 | 0.0336 / 0.0520 |
| Pan and zoom | 0.0527 / 0.2374 | 0.0362 / 0.0572 |
| Selection | 0.0355 / 0.0857 | 0.0337 / 0.0682 |
| Alignment | 0.0187 / 0.4854 | 0.0080 / 0.0342 |
| Equal spacing | 0.2086 / 0.6951 | 0.0365 / 0.1234 |

Post-change p50 / p95 at larger sizes:

| Entities | Node drag | Waypoint | Pan/zoom | Selection | Alignment | Equal spacing |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 5k | 0.0682 / 0.0890 | 0.0567 / 0.0891 | 0.0865 / 0.1829 | 0.0444 / 0.0675 | 0.0069 / 0.0102 | 0.1004 / 0.2455 |
| 10k | 0.1005 / 0.1351 | 0.0952 / 0.1096 | 0.1157 / 0.1686 | 0.0597 / 0.0903 | 0.0036 / 0.0040 | 0.1086 / 0.1572 |

At 1k/5k/10k, the post-change diagnostics reported one spatial index rebuild, 239 incremental spatial updates, one dependency-index rebuild, and 2,216/8,216/15,716 geometry reads. The before capture, taken after the dependency-index update, reported one dependency rebuild and one spatial rebuild with 59 incremental updates.

Pan/selection changes do not advance document revision or render-order revision. Edge waypoint changes compare cached endpoint signatures and do not rebuild the dependency index. Equal spacing considers the nearest overlapping neighbor on each side within the existing local query bounds; distant non-adjacent equal-gap matches can now select a different guide.
