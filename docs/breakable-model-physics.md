# Dark Rain — shared breakable-model physics

Every gameplay breakable model must participate in collision and gravity, retain material when damaged, and restore from stable saved state. Static supported walls already use the masonry/support path; the jointed test building uses its structural graph. This checkpoint adds the missing general rigid-model path for crates, glazing and explicitly registered fracture assets. It is not a claim that every decorative city mesh has acquired authored breakability or that every building now uses the fixture's joints.

## What changed

- Finite-health box props no longer disappear at zero health and get replaced with temporary effect cubes. They produce fitted fracture geometry, Rapier hulls and mass-preserving rigid fragments. Fragment motion inherits the source body; child linear momentum is corrected. Exact angular momentum conservation remains unverified.
- Window panes produce physical persistent glass fragments. When a failed wall releases its attached glazing, the glass follows that same path rather than silently being removed. Cosmetic dust/sparks can still expire; meaningful model material cannot.
- Registered props respond to bullets, explosions and sufficiently energetic landings. Collision-start events use recent pre-impact velocity and contact normals, avoiding a dependence on force reporting after CCD has stopped the object. The prototype wood/steel energy thresholds require tuning.
- Moving intact breakable props and fragments serialize geometry, identity, mass, pose, velocities and sleeping state. Authored fracture recipes survive intact-model saves. Reload replaces the old physics world rather than duplicating bodies or respawning destroyed crates.
- Bullet and optimized sightline queries include physical model fragments. A retained piece cannot be visually absent but still use its original intact prop collider.

## Asset integration contract

Use `PhysicsSystem.addBody(mesh, size, options)` to register a breakable rigid model. Supply its world pose, mass, collider geometry configuration and stable ID. Declare an object-valued `breakable` recipe in options or `mesh.userData.breakable`:

```text
breakable:
  material: wood | steel | glass | other calibrated material ID
  health: positive number, if not supplied in addBody options
  impactEnergyJ: optional calibrated impact threshold
  shape: box, only when the source really is a box
  fragments: optional authored pieces[]
    geometry: closed piece BufferGeometry with positions and UVs
    size: scale of the normalized piece geometry
    offset: piece origin in source-body local space
    volume: positive relative volume for source-mass distribution
```

Box props and panes can use the existing fitted Voronoi path. Complex models need matching authored geometry; do not fill a door opening, hollow shell or irregular model with bounding-box fragments. If an unprepared non-box model is damaged, its physical source remains instead of disappearing into fake rubble. Builders must register their assets: a visual mesh alone or a name containing “breakable” is not a substitute for the physics definition. Compound/articulated assets still need their appropriate colliders/joints through the structural or dedicated model path.

Breakable records have infinite physical lifetime regardless of temporary effect lifetime options. Collection, explicit world removal or streaming is a separate deliberate operation. The source's material is divided among the authored/generated pieces, not replaced with arbitrary small fragment masses.

## Budgets and limitations

Quality controls subdivision (3/6/8 default pieces for Low/High/Ultra). At 128 resident generic fragments, later procedural subdivision can use one retained physical piece instead of detailed shards. This is a fidelity fallback, not deletion; the resident count can exceed the target when a newly failed pane needs a physical representation. It is not yet the global streaming/body-pooling budget from Step 4. Persistent pieces can increase CPU/draw cost, and 60 fps remains unverified.

Generated glass uses the pane's declared dimensions/density; asset thickness/density should be calibrated rather than inventing mass from its appearance. Saved simple model finishes preserve color/roughness/metalness/transparency; a full versioned material-asset reference system remains pending. Registered rigid debris does not imply cloth, vegetation, vehicle rigs or actor anatomy fracture.

## Verification

100 tests pass. New cases check permanent crate fragments/mass/floor collision, glass fragments and broken-pane restoration, hard-landing crate fracture, moving intact models, repeated reload without duplication and authored cylindrical pieces restored from a model's breakable metadata. The older masonry conservation test now sets its initial velocity/spin explicitly so a random decorative spin does not make the settle-time assertion flaky.

Native packaged WebGL2 checks cover the actual F1 building entry, breach, weak bay failure, full collapse, fixture save/load, one generated crate plus one pane, and the actual death-to-menu button. The model run retained 12 fragment IDs and approximately 60.1933 kg before/after disk restore. Other physical fixtures and masonry tests continue passing. Type checking/build/package pass; this is not exhaustive gameplay/performance coverage. The prior checkpoint's WebGPU allocation limitation and fallback recovery remain documented separately.

Source: `src/systems/destruction/BreakableModels.js`, integrated into `PhysicsSystem.js`. Repeatable native check: `scripts/verify-destruction-fixture.cjs --packaged --darkrain-webgl`.
