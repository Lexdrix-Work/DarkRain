# Dark Rain — city physics checkpoint

Physics is shared across the generated city, rather than reserved for the jointed demonstration building. All generated building support groups retain their existing progressive masonry destruction, detached rigid material, hard-landing fracture and saved rubble.

This update closes the visual-only fitting path:

- Attached facade/roof details retain their original batches. Local attachment candidates are derived from neighboring structural cells. Losing those supports queues the actual detail geometry for gravity, without waiting for every wall in the building to disappear.
- Detached details use Rapier convex colliders, collision impulses, sleeping and persistent rigid bodies. They land on actual floors, elevated ledges and rubble. The old terrain-height clamp and forced flat landing pose are removed.
- Up to four fitting promotions run per update. Pending material survives saves; overflow is not deleted. Exact pose, velocity, angular velocity and sleeping state restore without duplicate bodies.
- Physical model fragments, wall chips and fittings contribute to the existing approximate building load/contact checks. Detached fittings participate in projectile raycasts.
- Temporary-effect cleanup now selects finite-lifetime effects only. It cannot evict retained glazing, model fragments or city fittings.

## Validation

101 automated tests pass, including local support release with a neighboring fitting left attached, landing on an elevated shelf, queued promotion across save/load, retained mass, repeated restoration and protection from temporary-effect cleanup. Type checking, production build and local executable packaging pass.

The packaged renderer probe starts a real session, exercises the F1 jointed building, destroys a generated city's local support, checks the resulting physical fitting collider/raycast target, saves and reloads through the Electron filesystem, and returns through the death screen to the menu. The sampled city contains 142 building support groups, 709 structural meshes and fitting ownership for all 142 groups. This is a behavior/coverage check on generated buildings, not simultaneous demolition of all buildings or a normal-play frame-rate measurement.

## Remaining boundaries

The whole generated building network still uses its approximate incremental masonry support solver; the specialized fixture uses fixed joints. This update does not convert the entire city into the fixture's joint graph. Fittings retain their authored geometry as physical pieces; secondary material-specific fracture recipes are not automatically inferred for arbitrary decorative shapes. Terrain, roads, vehicle shells and standalone static furniture are not made universally breakable by this change. Those assets need authored support/collider/fracture definitions to avoid hollow shapes becoming fake solid rubble.

The successful native probe uses WebGL2 recovery. WebGPU hardware recovery limitations and the unverified 60 FPS target remain as documented in the runtime checkpoint. There is no city-wide enforced resident-body cap yet; promotion budgeting limits creation work, not total sustained simulation cost.
