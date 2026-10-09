# Abandonment and visual depth — October 7, 2026

The city now shows more visible abandonment while retaining usable entrances and routes.

- Facades have climbing vines, uneven foliage, and translucent runoff stains. Roofs have patchy moss and grass.
- Damaged roofs have physical openings, exposed joists, chipped edges, and broken parapets. Roof surfaces use darker, weathered material. Single-storey roof openings no longer count as shelter from emissions.
- Curbs have weeds, paper, cardboard, cans, garbage bags, and fallen boards. Decorative debris is grounded and merged into static batches.
- Shops have stained tiled floors and sparse furnishings appropriate to pharmacies, diners, workshops, or general stores. Many shelf supplies are missing.
- Window glass is clearer head-on and more reflective at grazing angles, making interiors easier to see.
- Asphalt has finer texture scale and narrow irregular cracks. Rain changes its roughness and reflection strength using the existing reflection probe.
- Nearby interiors receive bounded daylight or occasional warm emergency-light fill. Nearby characters and movable props receive soft contact shading.

Fixed custom-material batching so baked vertex colors remain enabled. This corrects the white vegetation and other incorrectly tinted decorative details.

## Performance limits

Foliage and litter use shared materials and static batching. Interior fill uses no additional shadow maps: zero lights on low, one on medium, and two on high/ultra. Contact shading uses one instanced mesh capped at 24 instances. Nearby selection updates every 0.3 seconds. Wet-road reflections reuse the existing probe.

## Validation

- Production build succeeded; all 64 automated tests passed.
- Hidden Electron render checks captured a shop interior, damaged roof, and vine-covered frontage without application errors.
- Final runtime check verified glass breakage, wall breach, movable-prop response, 17-body human ragdolls, and saved destruction restoration without application errors.

The render checks used software rendering and do not establish hardware frame rates. Geometry and furnishings remain procedural. Foliage and decorative litter are static; interior fill and contact shading approximate lighting rather than simulate global illumination. Destruction remains sectional, rather than full structural collapse.
