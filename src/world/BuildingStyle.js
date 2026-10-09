import { ATLANTA_PROFILES } from './AtlantaGeography.js';
/** Stable architectural choices keep a building's identity across rebuilds. */
export function buildingStyle(x,z,floors,neighborhood) {
    let seed=Math.imul(Math.round(x*10),73856093)^Math.imul(Math.round(z*10),19349663);
    seed=Math.imul(seed^(seed>>>16),0x45d9f3b);seed=(seed^(seed>>>16))>>>0;
    const variants=ATLANTA_PROFILES[neighborhood]?.variants;
    const variant=variants?variants[seed%variants.length]:seed%4;
    return {variant,name:['brick-mercantile','stucco-shop','industrial-loft','stone-trimmed'][variant],
        tint:[0xb3a08c,0xd1cbb7,0x877e70,0xc4b4a4][variant],
        windowWidth:[1.3,1.05,1.75,1.2][variant],pitch:[2.7,2.25,3.2,2.6][variant],
        awning:variant===1||variant===3,gabled:floors===1&&variant===1,
        trim:[0x9b9585,0x807d70,0x555e58,0xc1b9a5][variant]};
}
