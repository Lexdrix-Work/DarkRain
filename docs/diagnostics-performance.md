# Dark Rain — Step 6 diagnostics and regression checks

## Delivered split

| Audience | Surface | Behavior |
|---|---|---|
| Player | Settings → performance health | Waiting, smooth, uneven, or strained; one plain-language suggestion. Reports the last gameplay sample while paused. It never changes settings. |
| Player reporting a bug | Settings → Save performance report | Downloads `Dark-Rain-performance.json` locally. Attach it to a report with what happened and the graphics preset. No automatic upload or external service. |
| Player / developer | F3 | Read-only aggregate timings, render counts, memory and subsystem costs. Toggle hides the display; bounded measurement continues. |
| Developer | JSON profile | Recent frame intervals, CPU submission duration, one-second section samples, hitch records, startup phases, backend, quality, scale, and memory totals. |
| CI / developer | WebGL scene canaries | Fixed workloads, numeric limits, nonblank render checks, physics workload checks, teardown leak checks, JSON artifacts and a failing exit code. |

The diagnostics path has no console, commands, teleport, cheats, entity list, coordinates, faction state, inventory, save contents or filesystem access. Export fields are explicitly selected; game objects are never serialized wholesale. Reports are generated on request and do not include username, save path or GPU identifier. The developer canary records its GPU adapter to establish which renderer actually ran. Its Node-enabled test window and scripts are outside the packaged application's file list.

This does not remove the existing F1 developer menu or `window.game` debugging surface. Locking those down for a public release remains a separate release gate; this work does not claim whole-game anti-cheat protection.

## Overlay specification

F3 is fixed at the upper right on a dark opaque panel, does not receive pointer input, and ignores repeated keydown events. Numeric values and labels accompany colors. Display refresh is limited to four times per second; settings health refreshes once per second and only announces changed text. The overlay no longer traverses the whole scene to count objects.

- FPS is 1000 divided by average **unclamped requestAnimationFrame start interval**, not the inverse of CPU work time.
- Average, nearest-rank p95 and p99 use the last 600 eligible frames. Sample count is visible. The window is about ten seconds at 60 fps, longer at lower rates.
- Menus, pause, loading, hidden documents and the interval crossing back into gameplay are excluded. Long foreground gameplay intervals are retained as hitches; they are not clipped to the simulation delta cap.
- Hitches are intervals of at least 50 ms. The overlay counts hitches in the current window; the export also retains the session total and the last 32 hitch records.
- CPU submission is separately timed. **GPU time is unavailable**, and the overlay says so; draw calls and triangles are render workload counts, not GPU milliseconds.
- Existing renderer counters cover the game's combined render passes. Geometry/texture object counts, estimated texture bytes, geometry buffer bytes, process-private RAM, memory pressure and available JS heap readings are shown. Estimates are not VRAM telemetry.
- Streaming displays resident/pending chunks, latest commit cost, its existing 0.4 ms admission target and cumulative overruns.

Average frame intervals use a 17.5 ms display allowance; p95 uses 20 ms and p99 33.4 ms. For timed rows, green is within the displayed budget, amber is over it, and red is above 1.5 times it. These are diagnostic thresholds, not a guarantee of 60 fps.

| CPU section | Diagnostic budget | Scope |
|---|---:|---|
| Simulation | 6 ms | Inclusive total of variable simulation; do not add its children again |
| Physics | 3 ms | Actual Rapier/physics-system update |
| FixedSimulation | 1 ms | Existing fixed player/entity step |
| Player | 1 ms | Player update |
| World | 1.5 ms | World update, including its streaming scheduling |
| Memory | 0.2 ms | Budgeted memory inventory work |
| Effects | 1 ms | Effects update |
| A-Life | 1 ms | Living-world update when enabled |
| Viewmodel | 0.5 ms | First-person pose update |
| Audio | 0.5 ms | Audio manager update |
| Render | 8 ms | Render submission and any synchronous driver work |

The old `Physics` label covered only the fixed entity step. This implementation names that step accurately and instruments the actual physics system separately. Repeated section calls accumulate within a frame. Section totals are inclusive where nested. A hitch names the previous frame's largest measured CPU section as a lead for investigation; it does not assert that section caused a GPU or operating-system stall.

## Player health rules

At least 120 eligible samples are needed. Smooth requires average ≤17.5 ms, p95 ≤20 ms, p99 ≤33.4 ms, and no high/critical memory pressure. Uneven covers the intermediate range or high memory pressure. Strained means average >25 ms, p95 >33.4 ms, p99 >50 ms or critical pressure. The message recommends Auto Quality or lowering a preset; the player remains in control. A single health reading is not a hardware certification.

## Logging and bug reports

Ordinary frame records occupy three fixed 1,800-entry Float64 rings (about 42 KiB): timestamp, interval and previous-frame CPU submission time. Export preserves chronological order. There are at most 60 one-second section snapshots and 32 hitch records. Those bounded logs allocate only when logged; percentile sorting and DOM formatting occur on the slower reporting path. This does not claim allocation-free instrumentation or an allocation-free game.

The report contains a schema version, capture timestamp, sample age, explicit metric description, thresholds and startup timings. It excludes gameplay data. Sample age makes stale reports identifiable. Export is a browser download requested by the player; there is no disk logging on every frame. For a bug report, reproduce the issue, open Settings and save the report before restarting. Attach the JSON plus steps to reproduce; screenshots/video remain optional and separate.

## Automated regression plan and implementation

The headless harness creates an isolated Electron profile and uses Three.js **WebGLRenderer** at 768×432, without antialiasing, with a 512-pixel shadow map. It is a component canary, not the production WebGPURenderer/TSL compositor. It warms 60 frames and samples 150 per scene. Each timed frame includes workload update, render and `gl.finish()`. This measures synchronous completion cost, not display/vsync intervals; the application overlay measures the latter's requestAnimationFrame proxy. Readback is preserved for the render-output check.

| Scene | Fixed workload | Additional assertions |
|---|---|---|
| Courtyard | 256 instanced concrete boxes, ground, hemisphere and shadow-casting sun | Positive draw/triangle counts and a nonblack readback |
| Debris | 128 Rapier bodies with sleeping disabled, gravity/contact solving, periodic impulses and instance updates | All 128 bodies awake; no omitted physics workload |
| Chunk churn | Courtyard plus eight chunk meshes, replace/dispose one geometry every six frames | Geometry counts stay bounded and return to zero after cleanup |

Every scene requires at least 120 valid samples, ≤32 draw calls, ≤16 geometry objects and ≤8 texture objects. Teardown must leave zero tracked geometries. Missing scenes, missing output, renderer errors, missing bodies and timing failures fail the command.

| Runner | Average | p95 | p99 | Purpose |
|---|---:|---:|---:|---|
| Hosted software rendering | ≤100 ms | ≤150 ms | ≤300 ms | Broad catastrophic-regression smoke gate; shared CI CPU speed is not a gaming benchmark |
| Dedicated Windows GPU | ≤16.67 ms | ≤20 ms | ≤33.4 ms | Fixed-scene work-budget gate on controlled hardware |

Commands: `npm run test:perf:software` and `npm run test:perf`. The hardware command rejects a software adapter. Results go to `work/perf-regression/results.json`; profiles are isolated from campaign saves. Keep OS power mode, driver, resolution and background workload fixed when comparing runs. The current gate uses absolute limits; automatic comparison against an approved rolling baseline is not implemented. Compare saved artifacts and investigate repeatable shifts before replacing a baseline or loosening a budget.

`.github/workflows/performance.yml` runs unit tests, type checking, a production build and the software canary on Ubuntu 24.04 for pushes to main and pull requests. It uploads results even on failure. A manually dispatched main-branch job targets a dedicated runner labeled `self-hosted, Windows, X64, dark-rain-perf`. Untrusted pull requests do not execute on that runner. The runner must be provisioned separately. The workflow is committed locally, has not been pushed, and has not been exercised on GitHub in this checkpoint.

For release performance certification, add controlled production-renderer routes through daylight city streets, rainy night reflections, woodland boundary crossings, a sustained building collapse and save/restore. Record at least 60 seconds after warmup, p95/p99, ≥50 ms hitches, residency and memory growth; repeat three times on each supported GPU tier. Those full-city timed routes and native WebGPU gates remain outstanding. The existing packaged audit already exercises tutorial/city transitions, destruction, saves and the diagnostic UI, but its scripted physics stepping is not a pacing benchmark.

## Verification evidence

123 automated tests and type checking pass. The local software and hardware canaries pass; the hardware adapter was an AMD Radeon RX 9060 XT. Packaged WebGL2 checks exercised F3, the settings health text, an actual report download, tutorial exit and existing destruction/save regressions. During the short tunnel sample, the overlay reported roughly 10.00 ms average, 10.10 ms p95 and 10.60 ms p99 across 151 frames; this small, brief scene does not establish city performance. Evidence is in `comparisons/2026-10-08-diagnostics/`. The prior slow city first draw and high city memory pressure remain open issues.
