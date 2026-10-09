/** Segmented road decks follow terrain at the toe and meet the bridge without a step. */
export function bridgeApproach(startX, z, deckTop, direction, terrain, length = 84, segments = 14) {
    const endX = startX + direction * length, endTop = terrain(endX, z) + .065;
    return Array.from({length:segments}, (_,i) => {
        const x1=startX+direction*length*i/segments, x2=startX+direction*length*(i+1)/segments;
        const y1=deckTop+(endTop-deckTop)*i/segments, y2=deckTop+(endTop-deckTop)*(i+1)/segments;
        return { x:(x1+x2)/2, y:(y1+y2)/2-.15, z, length:Math.hypot(x2-x1,y2-y1)+.025,
            angle:Math.atan((y2-y1)/(x2-x1)), start:[x1,y1], end:[x2,y2] };
    });
}
