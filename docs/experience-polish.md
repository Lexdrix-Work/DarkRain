# Experience polish

This pass improves play feedback and input reliability while retaining the Atlanta art and reflection work.

- All mouse events between frames contribute to camera motion. Losing focus, hiding the window, or releasing pointer lock clears held movement and fire. Form fields ignore gameplay shortcuts.
- Inventory, loot, map, and favorites pause the simulation and restore the previous pause state when closed. Inventory has one toggle owner; switching panels clears pending inputs.
- Ammo reads the weapon used by combat. A compact weapon readout shows reload status, an empty magazine warning, and the steady aim control. Reload progress is visible; the crosshair fades while aiming.
- The assignment readout replaces the unused quest panel and shows the first active assignment's next unfinished objective. The journal remains the detailed record. Survival warnings appear at meaningful health, radiation, hunger, and thirst thresholds.
- Actual damage triggers a brief screen cue, including direct damage calls. Routine damage no longer creates numeric notification spam. This feedback uses a separate event from the damage request, avoiding recursive damage.
- Loot confirms individual pickups and reports supplies left behind when the pack is full. Empty prompts propagate to all interactive container parts.

Validation: production build and 28 focused tests passed. A hidden Electron runtime checked inventory and loot pause/resume, empty prompts, damage cues, ammo and reload displays, then completed the record/skill/dialogue/quest/save flow without application console errors. The HUD was visually inspected at 1280×900; weapon feedback sits above the minimap. These checks do not establish hardware frame rate or full gameplay coverage.
