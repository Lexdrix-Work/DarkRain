# City structure and collapse — October 7, 2026

## Architecture and Atlanta-inspired layout

Four stable facade families vary finishes, window spacing, trim, awnings, and roof shapes: brick commercial, stucco shop, industrial loft, and stone-trimmed. Lot widths and depths vary. Side elevations now have real glazed openings rather than uninterrupted solid walls. Instanced cell materials preserve physical texture scale.

A central cluster has 7–13-storey surrounding buildings and 22–31-storey landmark towers with varied stepped crowns. Smaller neighborhood buildings remain around it. The western transport corridor adds a divided highway with one congested carriageway, 72 instanced abandoned sedans, freight tracks, and an elevated crossing. The existing cross-city road connects the highway to the neighborhoods; trees avoid the carriageways and tracks.

These are original layouts guided by the supplied Atlanta reference images, not a geographically accurate Atlanta map or recreated television set. The elevated crossing currently has no approach ramps. Street clutter, vines, and interior furnishings remain procedural and need further art refinement.

## Destruction

Ground-floor wall cells are approximately 0.85 × 0.66 metres. Upper walls, slabs, and roofs are subdivided into cells no larger than roughly 1.4 metres per axis. Front piers and lintels join the same support network. Small infill cells have 68 health and take full weapon damage: two ordinary rifle hits breach one cell.

A cached spatial support graph finds disconnected cells and distributes approximate gravity loads toward anchored cells. Material density, support area, remaining health, and carried rigid-body mass affect stress. Unsupported or overloaded cells become falling rigid bodies, and their old collision is rebuilt. Attached nearby glazing is removed when its support falls. Tall buildings have stronger structural capacities so they remain stable before damage.

This is a cell-based gameplay model, not finite-element material simulation or a continuously voxelized terrain engine. It does not model plastic bending or fracture within an individual cell. Cosmetic furnishings, vine decals, exterior dressings, and transport infrastructure do not yet participate in the building support graph.

At most 24 failed cells convert per structural update, and at most 48 structural debris bodies remain active. Structural debris expires after 45 seconds; rigid bodies can sleep when settled. Smaller fragment effects share a separate bounded budget. Saved destruction retains missing cells; settled rubble poses are not saved.

## Glass and faces

Display windows now use smaller independently breakable panes with mullions. Glass produces small varied shards, roughly 3.5–14 cm before aspect scaling, with angular velocity, lower opacity, and short lifetimes. Side-facing panes use correctly oriented fragments. Masonry produces irregular small chips instead of identical cubes.

Human faces have inset, narrower sclera, distinct iris and dark pupil geometry, and upper/lower eyelid rims. Eye-shape choices remain supported. These changes reduce the exposed round-eye appearance; they are not a replacement for a finished textured character asset.

## Validation

Production build succeeded and all 69 tests passed, including generated-shell stability through 32 storeys, support severance, overload from damage/carried mass, and two-shot masonry breaches. Hidden Electron software-rendered checks verified four facade families, skyline/corridor rendering, glass and wall breakage, falling structure, prop response, ragdolls, and destroyed-cell save restoration without application errors. The final support check found zero spontaneous failures before damage.

Software rendering does not establish hardware frame rates. Dense tower geometry and collapse events need testing on the player's machine. This pass improves city composition and destruction behavior; it does not establish reference-image or AAA visual fidelity.
