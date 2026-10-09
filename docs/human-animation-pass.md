# Human animation pass — October 6, 2026

Human enemies and NPCs now use a shared anatomical skeleton with weighted skin deformation. Elbows, knees, hips, shoulders, wrists, spine and head move independently; mutants retain their existing procedural animation.

## Motion and movement

- Walk and run clips are retargeted from motions `07_02` and `09_02` in the RancidMilk character animation collection. Idle breathing is authored for Dark Rain.
- Source T-pose frames are excluded. Clips are trimmed into loops, smoothed, aligned to the same gait phase, and stripped of horizontal root travel.
- Each actor owns an animation mixer. Clips and anatomical geometry are shared.
- Actual horizontal movement selects idle, walk or run and determines playback speed. Walk/run changes crossfade over 0.18 seconds and retain their gait phase. Run has hysteresis to reduce repeated switching near the threshold.
- The AI continues to own movement and collision. Animation does not move the actor through walls or change its world position.
- A separate two-bone arm pose supports the rifle using chest-relative wrist targets. It leaves leg animation intact. This is a support pose, not an imported firearm animation.
- Sole contacts raise the visual hips conservatively when feet would penetrate terrain. This is not full foot-lock IK.

## Death and resources

Stopping an animation retains the visible bone transforms for the death handoff. Ragdolls clone their skeleton with Three.js SkeletonUtils, so their bones are independent of the live actor. Shared anatomical geometry is retained when an individual entity is destroyed; actor materials and animation resources are released.

## Verification

The production build passed and all 43 automated tests passed. Hidden Electron render checks exercised walk/run transitions and reported no application errors, no animation-induced actor displacement, preserved death poses, independent ragdoll bones, and a minimum ragdoll geometry height of 0.06 metres above the flat audit ground. Rendered frames were inspected for clothing seams and the rifle support pose.

A separate runtime check confirmed an audible music signal after input, death-to-menu and new-session recovery, passage through a storefront doorway, and terrain-safe enemy death. These software-rendered checks do not establish hardware FPS, exhaustive gameplay coverage, or AAA visual quality.

## Remaining work

Hands have no finger rig. Dedicated aim, fire, reload, crouch, injury and interaction clips remain to be implemented. Character clothing and weapons still need stronger art, textures and silhouettes. Ragdolls retain the existing procedural fall system rather than a fully articulated rigid-body simulation.
