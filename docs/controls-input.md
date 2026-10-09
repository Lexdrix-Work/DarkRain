# Dark Rain — controls and input

Implemented on top of the existing player, weapon, viewmodel, settings and Rapier systems. No destruction capability is reduced. Preferences use settings schema 4 after the accessibility extension; existing preferences migrate, and two keyboard/mouse bindings per action remain available. The complete settings data is in [settings-schema.json](settings-schema.json).

## Architecture

```text
Keyboard / pointer DOM events ──> canonical chord table ──> retained press/release edges
Gamepad API, once per frame ────> standard device adapter ─> analog axes + button edges
                                      │
                       focus / menu / gameplay context gate
                                      │
                     InputManager.sampleFrame (before simulation)
                         ├─ menus: focus, adjust, select, back
                         ├─ Player: movement / camera / lean / breath
                         ├─ Weapon: fire / aim / reload / weapon cycle
                         └─ world actions: interact / probe / detector
                                      │
                         fixed-step Rapier + render submission
                                      │
                     bounded input timing samples in performance reports
```

Keyboard edges are stored when events arrive, so a press and release between frames still fires a ready semi-automatic weapon. Continuous movement and aim use held state. Gameplay actions are gated while loading, paused, hidden or in menus. Controller buttons and sticks must return to neutral across menu transitions before they can cause unintended gameplay actions. An active controller disconnect pauses play. Blur clears held input; controller play also pauses.

Bindings compile when changed. Physical codes preserve keyboard position. Canonical chords use Ctrl, Alt, Shift, Meta in that order, including mouse buttons: `Ctrl+KeyR`, `Shift+Mouse0`. An exact modifier chord wins over its plain key; when no exact chord exists, the plain key remains usable, allowing Shift+W to sprint. Identical canonical bindings conflict in the menu. A modifier's standalone discrete action is deferred until release if that modifier is also used in a chord; using the chord suppresses that standalone action. Held sprint/breath do not wait for release. F1/F3 tools yield to assigned gameplay keys. Escape remains emergency Back/Pause and cancels capture; Windows shortcuts cannot be overridden reliably.

## Latency target and measurement

Design target at stable 60fps: median click-to-photon at most **45ms**, p95 at most **65ms**, with smoothing off. This is a target, not a measured guarantee. Typical allocations below overlap where CPU and GPU work overlap; worst-case waiting does not simply equal the average frame time.

| Stage | Working allocation / hidden latency |
|---|---|
| Device and OS delivery | Approximately 2ms budget; polling rate and drivers vary |
| Waiting for next input sample | 0–16.67ms, average about 8.3ms at 60Hz |
| Look / fire logic | Same sampled frame; no extra fixed-tick wait for camera or hitscan fire |
| CPU simulation and submission | Aim for 6–8ms total; input processing allocation 0.3ms |
| GPU rendering | Target at most 10ms; presentation queue can add whole frames |
| Presentation wait | 0–16.67ms at 60Hz, OS/driver dependent |
| Display scanout | 0–16.67ms at 60Hz, depending on screen position |
| Physical movement | Rapier alignment can add up to one 60Hz simulation tick |

Sample input before simulation and submit the current camera in that frame. Avoid render-ahead, shader compilation, asset uploads and streaming spikes in combat. Optional mouse smoothing has an 8ms default time constant and adds response delay; it is disabled by default. Vsync follows the existing native shell setting and restart policy, with OS presentation still authoritative.

Diagnostics retain 32 successful first-shot samples: DOM event receipt or controller poll to shot logic, and to render submission. These exclude hardware delivery, actual GPU completion, scanout and photons; they must never be labeled click-to-photon measurements. Verify the actual target with a high-speed camera or sensor while recording frame p95/p99 and presentation timing in the packaged Electron game. The native scripted trace deliberately waits between samples and warms shaders on demand; its timing values are functional evidence, not the latency benchmark.

## Default keyboard and mouse bindings

| Action | Default | Reason |
|---|---|---|
| Move | WASD or arrows | Familiar movement; arrows offer an alternative |
| Jump / crouch / sprint | Space / C or Left Ctrl / Left Shift | Preserve existing movement muscle memory |
| Fire / aim | Left mouse / right mouse | Direct weapon control |
| Reload / interact | R / E | Familiar, separate combat and world actions |
| Lean left / right | Z / X | Adds peeking while preserving Q favorites and E interaction |
| Hold breath | Left Alt while aiming | Separate from sprint; costs stamina |
| Weapons | 1 / 2 / 3; wheel up/down cycles | Primary, secondary, melee and cycling occupied slots |
| Quick items | 5–8 | Existing four item slots; gear menu now offers assignment buttons |
| Inventory / favorites / map | Tab or I / Q / M | Preserve existing interfaces |
| Flashlight / anomaly probe / detector | F / G / N | Independent survival tools |
| Quick save / quick load / pause | F5 / F9 / Escape | Fast recovery and reliable escape from gameplay |

Raw pointer input requests unadjusted movement with a supported fallback and status reporting. Linear mouse response is default and has no smoothing. Precision response lowers slow-motion gain toward 0.7 and rises to 1 for fast movement. Sensitivity scales rotation; both axes can be inverted. Mouse camera rotation continues driving the existing weapon inertia/sway springs.

## Controller tuning and layout

Only standard-mapped Gamepad API devices are supported. Xbox and PlayStation labels are auto-selected with a manual override. Labels describe equivalent physical controls, not separate proprietary driver support. Menus use D-pad or left stick to focus, left/right to adjust ranges and selections, A/Cross to select, and B/Circle to go back. Creator, settings and pause are supported; text naming still needs keyboard/OS input. Native desktop audio permits controller-driven startup. Browser builds retain browser permission and autoplay constraints.

| Action | Xbox | PlayStation |
|---|---|---|
| Move / look | Left / right stick | Left / right stick |
| Aim / fire | LT / RT | L2 / R2 |
| Jump / crouch | A / B | Cross / Circle |
| Reload / next weapon | X / Y | Square / Triangle |
| Lean left / right | LB / RB | L1 / R1 |
| Sprint toggle; hold breath in ADS | LS | L3 |
| Interact | RS | R3 |
| Map / pause | View / Menu | Create / Options |
| Flashlight / inventory / probe / detector | D-pad up / down / left / right | Same |

| Tuning | Default and range | Operation |
|---|---|---|
| Enable controller gameplay | On | Menus remain available when gameplay input is disabled |
| Layout | Auto; Xbox / PlayStation | Changes labels |
| Radial deadzone | 12%; 5–30% | Preserves direction and partial walking speed |
| Turn speed | 180°/s; 60–360°/s | Delta-time scaled, independent of render rate |
| Stick response | Precision or Linear | Precision uses radial exponent 1.6 |
| ADS speed | 55%; 30–100% | Multiplies controller turn rate while aiming |
| Aim friction | 15%; 0–25% | Slows existing input near visible targets; never adds rotation |
| Trigger thresholds | Press 0.25, release 0.15 | Hysteresis avoids noisy repeated toggles |

Friction applies only in ADS, within 35m and a 1.5° target cone, with nonzero right-stick magnitude up to 0.65. It does not affect the mouse, move the reticle toward a target, track a target, or rotate an idle camera. Eligibility checks are bounded to 64 world entities and two line-of-sight rays every 100ms; occlusion changes therefore have up to 100ms eligibility delay. Maximum slowdown is 25%. Physical controller drift, comfort and label detection still require hardware testing.

Lean eases toward a maximum 0.2m camera shift and 0.1-radian roll; a Rapier ray clips it with an 0.08m clearance and excludes the player's collider. The body collision capsule remains unchanged. Hold breath requires ADS, suppresses camera and weapon breathing, drains 18 stamina per second, suspends regeneration, and requires release after exhaustion at 5 stamina. It does not grant accuracy by steering the weapon.

## Verification and limits

Unit coverage includes chord precedence, fast click retention, smoothing impulse conservation, analog magnitude, frame-rate-independent turning, transition fences, trigger hysteresis, disconnect pause, nonmagnetic friction, breath exhaustion and actual Rapier lean collision. The packaged WebGL2 trace checks controller menu entry/back, stick navigation, movement/look, firing without pointer lock, lean/breath, a Ctrl+R chord without reload/crouch conflicts, quick mouse taps, held pause fencing, labels, timing reports and disconnect pause. Synthetic Gamepad API traces are not physical controller verification. WebGPU and external photon timing are not certified by this trace.

Primary API references: [W3C standard Gamepad mapping](https://w3c.github.io/gamepad/), [MDN gamepad polling](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API), [MDN getGamepads](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/getGamepads).
