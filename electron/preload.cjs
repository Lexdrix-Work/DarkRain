/**
 * Dark Rain preload — minimal, hardened bridge.
 * The game itself is pure web tech; it only needs to know it's on desktop.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('darkRainDesktop', {
    isDesktop: true
});
