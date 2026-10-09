# Dark Rain human locomotion

`human-locomotion.json` contains compact Three.js animation clips for the Dark Rain anatomical skeleton.

- Walk: RancidMilk collection `07_02`, sampled at 30 Hz, trimmed to 1.1166667–2.2166667 seconds.
- Run: RancidMilk collection `09_02`, sampled at 30 Hz, trimmed to 0.25–1.0166667 seconds.
- Idle: original Dark Rain breathing motion.

Collection: https://rancidmilk.itch.io/free-character-animations
Underlying motion capture: Carnegie Mellon University Motion Capture Database, distributed through the collection's CMU/cgspeed pipeline.

The walking and running motion data is adapted, not independently recreated. Retargeting maps source joint directions onto the anatomical bind skeleton, suppresses excessive torso swings, removes horizontal root travel, smooths the loops, and aligns gait phase. The source collection's Blender scripts are not included or used. Runtime needs neither FBX files nor a Blender dependency.

The accompanying source notice is retained in this folder and copied to `public/third-party-notices/human-animation.txt` for packaged builds. It is not displayed in gameplay.
