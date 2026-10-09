# Dark Rain — accessibility foundation

Implemented as persistent player preferences, independent of campaign saves. These options change the live systems; graphics presets do not switch disabled film grain back on. Accessibility information supplements existing hazards and sound events rather than placing enemy or quest markers in the world.

## Features and where to find them

| Feature | Setting / default | Actual behavior |
|---|---|---|
| Field of view | Display: vertical FOV 75°, 60–110° | Updates world and first-person projection |
| Camera motion | Accessibility: Camera bob & shake, 100%, 0–100% | Scales walking bob, automatic body roll, landing, visual recoil and damage/explosion shake. **Zero fully disables involuntary camera translation/rotation**, including old offsets. Deliberate lean still shifts viewpoint without rolling the horizon at zero; crouch, aim and normal look remain functional |
| Weapon motion | Accessibility: Weapon idle motion, 100%, 0–100% | Scales bob, breathing, look sway and visual kick in both the rig and weapon mesh. Reload/handling and intentional ADS/sprint poses remain visible; ballistics are unchanged |
| Stable-camera preset | Accessibility and first-launch offer | Sets camera/weapon motion to zero; disables grain, decorative lens effects, vignette, fringing and mouse smoothing. It does not change FOV, difficulty, saves or controls |
| Lens effects | Accessibility: Decorative lens effects, on | Master override for bloom, vignette and fringing. Individual settings remain in Graphics; their saved values return when the override is enabled |
| Film grain | Graphics → Advanced: Film grain, on | True shader toggle, including Low; presets preserve the player's choice |
| Full post bypass | Graphics → Advanced: Post effects, on | Bypasses optional effects while preserving correct output conversion |
| Anomaly identification | Accessibility: Universal / Monochrome; Universal default | Type hues, distinct field silhouettes/glyphs, detector symbols and explicit names. Monochrome retains the same shapes and names. Hidden hazards remain hidden until the existing detector/reveal rules expose them |
| High contrast | Accessibility: off | Opaque dark panels, white text, strong control borders and yellow keyboard focus. Includes prompts, equipment, dialogue, warning panels and sound captions. Captions use a solid background in this mode |
| Subtitle text size | Accessibility: 22px, 16–36px | Sizes supplied captions, critical sound indicators, dialogue text and dialogue choices |
| Subtitle background | Accessibility: 90%, 0–100% | Controls caption and critical-cue background opacity. High contrast forces opaque black for readability |
| Captions | Audio: Subtitles & sound captions, on | Supplied voice text and selected sound descriptions. Important siren captions outrank quiet whispers; dialogue choices remain visible when captions are off |
| Critical sound equivalents | Accessibility: Critical sound indicators, **on** | Independent of subtitles and master/effects volume. Sirens/emission blasts, creature growls, electrical discharges and detector signals receive text equivalents. Actual positioned sound events produce Ahead/Behind/Left/Right; broadcasts say Nearby. No hidden entity tracking or floating markers |
| Mono audio | Accessibility: off | Downmixes the final mix after compression to one channel, then feeds both output channels equally. Includes music, effects and voice; distance attenuation remains, stereo direction is lost |
| Dynamic range | Audio: Wide / Night; Wide default | Existing real compressor reduces peaks in Night mode |
| Survival pressure | Gameplay: Relaxed / Standard / Harsh | Relaxed: incoming damage ×0.75; hunger/thirst growth and critical depletion/radiation damage ×0.65. Standard ×1. Harsh: incoming damage ×1.35, survival pressure ×1.25. Hazard forces, scarcity, cover, factions and training rules remain |
| Pause anywhere in play | Escape or rebound Pause; controller Menu/Options | Single-player gameplay, combat and emissions all pause. Simulation, physics and survival clocks stop; menus and music remain usable. Loading transitions are separate from active play |
| Motor/input support | Controls | Existing chord rebinding, two bindings per action, Xbox/PlayStation standard controllers, deadzones, sensitivity, inversion, raw pointer fallback and optional smoothing |

Sound feedback is bounded to three rows. Repeated identical cues replace their prior row; high-priority warning cues survive less-important events. Captions are bounded to 240 characters and 1–8 seconds. These overlays remain available when passive HUD opacity is zero. They hide over paused menus so captions cannot cover menu controls. No full-screen sound flash is added. Detector danger feedback uses faster pulses closer to hazards; its text remains steady rather than blinking. The living-world systems and destruction capabilities are retained.

## Anomaly palette

The hues use the [Okabe-Ito Color Universal Design palette](https://jfly.uni-koeln.de/color/index.html). No palette can cover every visual impairment by itself: redundant shapes and readable names carry the gameplay meaning, following [W3C's guidance against color-only identification](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

| Type | Hue / hex | Detector symbol | Revealed field shape |
|---|---|---|---|
| Electrical | Sky blue `#56B4E9` | ϟ Electrical | Triangle boundary with lightning glyph |
| Gravity | Purple `#CC79A7` | ◎ Gravity | Circular boundary with rectangular glyph |
| Chemical | Bluish green `#009E73` | ◇ Chemical | Diamond boundary and diamond glyph |
| Thermal | Orange `#E69F00` | △ Thermal | Triangle boundary with triangular glyph |
| Psy | Yellow `#F0E442` | ✳ Psy | Hexagonal boundary and crossed glyph |
| Radiation | Vermillion `#D55E00` | ☢ Radiation | Eight-sided boundary; reserved alias for urban radiation zones |
| Vortex | Blue `#0072B2` | ↻ Vortex | Five-sided boundary when the gravity anomaly is a vortex |
| Artifact signal | White `#FFFFFF` | ◉ Artifact | Detector signal; artifact rarity/model appearance remains separate |
| Unknown | White `#FFFFFF` | ? Unknown anomaly | Neutral fallback |

Detector text is white on a dark backing; type color lives on a border accent, avoiding low-contrast blue text. Field colors are applied consistently to materials, shader color uniforms, particle colors and electrical arcs. Field outlines cannot intercept shots. Monochrome is an identification alternative, not a global color filter over the world.

## First launch versus settings

First launch offers three optional choices on the main menu: **Stable camera**, **Accessibility options**, and **Keep current settings**. It never blocks New Game or Continue, performs no mandatory questionnaire, and does not force a tutorial. Stable camera or Keep current settings acknowledges the offer; the choice survives restart. Opening Accessibility options leaves the offer available until acknowledged.

Every adjustment remains available later in Options. Captions, critical sound indicators and redundant universal anomaly identification start enabled. Other personal choices—contrast, mono, FOV and response curves—stay configurable, without inferring an impairment from hardware or player behavior. Difficulty can change during the campaign; no restart is required for these accessibility changes.

## Validation and boundaries

Behavior tests cover old-offset removal at zero camera motion, deliberate lean without horizon roll, settings migration, preservation through graphics presets, actual starvation/dehydration scaling, redundant monochrome identification and source-based sound direction. Packaged checks exercise live menu controls, hazard/detector colors and labels, muted/subtitle-off critical cues, caption priority/size, pause during an emission and a fresh-process preference restore. An offline stereo signal verifies that mono routing produces identical left/right output.

High-contrast text/background choices follow [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); this is not a claim of complete WCAG conformance. Physical display/hearing-device testing and reviews by players with color-vision differences or motion sensitivity remain needed. This step does not provide full screen-reader navigation, text-to-speech, captioning for unrecorded future dialogue, complete visual equivalents for every ambience cue, photosensitivity certification or multiplayer pause. Those are explicit boundaries, not placeholder settings.
