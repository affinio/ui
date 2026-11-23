# Diagram interaction benchmark

Reproduce with `pnpm --filter @affino/diagram-core build` followed by:

```sh
BENCH_DIAGRAM_ENTITY_COUNTS=1000,5000,10000 BENCH_DIAGRAM_SAMPLES=40 node scripts/bench-diagram-core-interactions.mjs
```

The fixture is deterministic and contains exactly the requested total entities (40% nodes, 25% edges, 15% ports, 15% texts, 5% shapes). Each workload receives five warmups and then the configured measured samples. The benchmark reports p50/p95 milliseconds and engine counters. Samples are single-process wall-clock readings; compare only on the same host and runtime.

The workloads cover dependent-edge node drag, waypoint edit/undo, pan/zoom, selection, alignment, equal spacing, and indexed `snapCandidateSearch`. Reproduce the recorded run with `BENCH_DIAGRAM_ENTITY_COUNTS=100,1000,10000 BENCH_DIAGRAM_SAMPLES=40 node scripts/bench-diagram-core-interactions.mjs` after building Core. Each operation uses five warmups and forty measured iterations.

| Entities | Drag node + edges p50 / p95 ms | Waypoint edit + undo p50 / p95 ms | Pan/zoom p50 / p95 ms | Selection p50 / p95 ms | Alignment p50 / p95 ms | Equal spacing p50 / p95 ms | Snap query p50 / p95 ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 0.0767 / 0.2934 | 0.0416 / 0.1254 | 0.0252 / 0.0701 | 0.0424 / 0.1038 | 0.0110 / 0.0364 | 0.0346 / 0.0520 | 0.0105 / 0.0198 |
| 1k | 0.0720 / 0.1205 | 0.0439 / 0.0540 | 0.0373 / 0.0558 | 0.0603 / 0.0792 | 0.0047 / 0.0072 | 0.0318 / 0.0478 | 0.0089 / 0.0176 |
| 10k | 0.4870 / 1.0079 | 0.1127 / 0.1983 | 0.2298 / 0.3621 | 0.2845 / 0.4353 | 0.0053 / 0.0059 | 0.0929 / 0.1548 | 0.0060 / 0.0535 |

The run counted one spatial and dependency index rebuild (fixture initialization), 267 spatial index updates, and 45 snap candidate queries returning 111 candidates per scene. Candidate search stayed indexed; measured p95 variance at 10k reflects local runtime/GC noise.

The 2026-11-23 run used Node in the repository workspace; wall-clock figures are host-specific. The returned candidate count is accumulated across the five warmups and forty measured calls.

## Verification of 1d97269

Run `pnpm --filter @affino/diagram-core build` then `node scripts/bench-diagram-core-verification.mjs`. It compares a reference pairwise/legacy-index policy with the current implementation, using five warmup calls and ten measured calls for each deterministic scene in the same process. Scene size is total entity count; composition is approximately 45% nodes, 30% ports, and 25% edges. The dense local cluster places candidate boxes inside the search bounds to exercise worst-case scanning.

| Entities | Equal spacing before p50 / p95 ms | Equal spacing after p50 / p95 ms |
| ---: | ---: | ---: |
| 1k | 2.5038 / 6.8168 | 0.0941 / 0.1117 |
| 5k | 54.8577 / 59.3769 | 0.4900 / 0.6442 |
| 10k | 216.9478 / 224.9042 | 1.0049 / 1.1501 |

The dependency workload moved one existing edge waypoint and undid it for each sample.

| Entities | Waypoint + undo before p50 / p95 ms; dependency rebuilds | After p50 / p95 ms; dependency rebuilds |
| ---: | ---: | ---: |
| 1k | 0.2377 / 0.3385; 20 | 0.0229 / 0.0450; 0 |
| 5k | 1.0713 / 1.3481; 20 | 0.0471 / 0.0652; 0 |
| 10k | 1.9731 / 2.8017; 20 | 0.0750 / 0.0818; 0 |

The current dependency index reported one rebuild during initialization and no rebuilds during the measured waypoint edits. The reference policy reports 20 measured rebuilds (two commands × 10 samples). Pan/selection changes do not advance document or render-order revisions. Equal spacing considers the nearest overlapping neighbor on each side within the existing local query bounds; distant non-adjacent equal-gap matches can select a different guide.
