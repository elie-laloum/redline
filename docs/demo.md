# Reproduce the interface demo

The GIF and MP4 are screen captures of the actual live-shell application. The data comes from its existing seeded scenario, not a live autonomous ticket or published merge requests. The recording moves through opening, plan, implementation and publication views.

Use a dedicated demo directory so production ticket data stays separate:

```sh
cd tools/live-shell
pnpm install --frozen-lockfile
export AUTOPILOT_HOME="$PWD/.demo-home"
export AUTOPILOT_TICKET_ID="FT-1042-demo"
export AUTOPILOT_DEMO_AT="plan"
node demo/seed.ts
pnpm exec vite --host 127.0.0.1 --port 12781
```

Open http://127.0.0.1:12781. Rerun the seed with `ouverture`, `plan`, `implementation`, or `publication` and reload to explore the views. The UI currently uses French operational text. See [the scenario source](../tools/live-shell/demo/run.ts).
