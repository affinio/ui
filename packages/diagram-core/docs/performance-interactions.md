# Diagram interaction benchmark

Reproduce with `pnpm --filter @affino/diagram-core build` followed by:

```sh
BENCH_DIAGRAM_ENTITY_COUNTS=1000,5000,10000 BENCH_DIAGRAM_SAMPLES=40 node scripts/bench-diagram-core-interactions.mjs
```

The fixture is deterministic and contains nodes, edges, ports, texts, and shapes. The benchmark reports p50/p95 milliseconds and engine counters. Samples are single-process wall-clock readings; compare only on the same host and runtime.

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
