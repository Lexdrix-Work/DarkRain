import neighborhoods from '../data/geography/atlanta-neighborhoods.json' with { type: 'json' };

// A compressed, north-up regional reference. Buildings and people retain metre scale.
// This is measured neighborhood geometry, not measured street/building footprints.
export const ATLANTA_ORIGIN = { latitude: 33.760, longitude: -84.390 };
export const ATLANTA_PROFILES = {
    Downtown: { kind: 'downtown', min: 4, max: 9, tower: 25, variants: [3, 0, 1] },
    Midtown: { kind: 'midtown', min: 5, max: 11, tower: 29, variants: [1, 3] },
    'Old Fourth Ward': { kind: 'mixed', min: 2, max: 5, variants: [0, 2] },
    'Sweet Auburn': { kind: 'historic', min: 2, max: 4, variants: [0, 3] },
    'Castleberry Hill': { kind: 'warehouse', min: 2, max: 5, variants: [2, 0] },
    'West End': { kind: 'historic', min: 1, max: 3, variants: [0, 3] },
    'Grant Park': { kind: 'residential', min: 1, max: 2, variants: [0, 1] },
    'Inman Park': { kind: 'residential', min: 1, max: 3, variants: [0, 3] },
    Cabbagetown: { kind: 'mill', min: 1, max: 3, variants: [0, 2] },
    Summerhill: { kind: 'residential', min: 1, max: 3, variants: [0, 1] },
    Mechanicsville: { kind: 'residential', min: 1, max: 3, variants: [0, 2] },
    'Georgia Tech': { kind: 'campus', min: 2, max: 5, variants: [0, 3] },
    'Home Park': { kind: 'residential', min: 1, max: 2, variants: [0, 1] },
};
export const DEFAULT_PROFILE = { kind: 'mixed', min: 1, max: 3, variants: [0, 1, 2, 3] };

export function atlantaSeed(x, z, salt = 0) {
    let s = Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(z * 10), 19349663) ^ salt;
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
}
export function insideRing(x, z, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, az] = ring[i], [bx, bz] = ring[j];
        if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
    }
    return inside;
}
export function createAtlantaGeography(width, depth) {
    const scale = Math.min(width, depth) / 7000;
    const project = (longitude, latitude) => ({
        x: (longitude - ATLANTA_ORIGIN.longitude) * 111320 * Math.cos(ATLANTA_ORIGIN.latitude * Math.PI / 180) * scale,
        z: -(latitude - ATLANTA_ORIGIN.latitude) * 111320 * scale,
    });
    const unproject = (x, z) => ({
        longitude: ATLANTA_ORIGIN.longitude + x / (111320 * Math.cos(ATLANTA_ORIGIN.latitude * Math.PI / 180) * scale),
        latitude: ATLANTA_ORIGIN.latitude - z / (111320 * scale),
    });
    const districts = neighborhoods.features.map(feature => ({
        name: feature.attributes.NAME,
        rings: feature.geometry.rings.map(ring => ring.map(([lon, lat]) => {
            const p = project(lon, lat); return [p.x, p.z];
        })),
    }));
    return { width, depth, scale, districts, project, unproject,
        districtAt(x, z) {
            // Even/odd includes holes and disconnected rings.
            return districts.find(d => d.rings.reduce((hit, ring) => hit !== insideRing(x, z, ring), false))?.name || 'Atlanta fringe';
        },
        profileAt(x, z) { return ATLANTA_PROFILES[this.districtAt(x, z)] || DEFAULT_PROFILE; },
    };
}

// Park locations are approximate layout anchors; boundaries below are authored.
export function atlantaParkAt(geography, x, z) {
    for (const p of [{ name: 'Piedmont Park', lon: -84.3738, lat: 33.7855, rx: 370, rz: 470 },
        { name: 'Grant Park woodland', lon: -84.3710, lat: 33.7372, rx: 330, rz: 400 }]) {
        const c = geography.project(p.lon, p.lat);
        if (((x-c.x)/(p.rx*geography.scale))**2 + ((z-c.z)/(p.rz*geography.scale))**2 < 1) return p.name;
    }
    return null;
}
