# Dark Rain save/session verification

154 Node tests passed; TypeScript check, production build and Windows packaging passed. Packaged WebGL2 save/session, controller input and accessibility audits passed.

The native session audit restores enemy health 63, one offscreen party, emission elapsed time 111, flashlight battery zero, faction state, exact container contents and structural failed-joint IDs. It checks explicit unlimited melee ammo, combat-deferred autosaving, five visible manual-slot buttons, a persisted dropped pack and respawn, and ended hardcore records that cannot load.

Checksum/backup failure and campaign-outcome protection are covered by filesystem tests. Loading-frame waits are bounded when animation callbacks stop arriving. A menu-registration issue found during review was fixed; native visibility and button hit testing verify the panel. Electron screenshot capture returned UnknownVizError and no stale screenshot is retained.

These are focused functional checks. They do not certify full-city hitch-free saving, every legacy random world layout, physical power-loss recovery, unloaded-region/offline catch-up or WebGPU operation.
