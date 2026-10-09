# Dark Rain input verification

- 140 Node tests passed, including 10 input-specific behavior tests.
- TypeScript check, production build and Windows directory packaging passed.
- Packaged WebGL2 game passed `scripts/verify-input.cjs` with synthetic standard-gamepad signals.
- Checked the captured Controls menu for legibility, working scroll region and focused controller navigation.
- Trace exercises tutorial gameplay, not a district-scale performance benchmark. Timing samples include deliberately delayed test frames and shader warmup.
- Physical Xbox/PlayStation devices, raw-input hardware behavior, WebGPU and click-to-photon latency remain unverified.
- Screenshot capture transiently returned UnknownVizError on early runs; it succeeded on the passing run. Capture is reported separately from gameplay assertions.

See ../../controls-input.md for architecture, budgets and tuning.
