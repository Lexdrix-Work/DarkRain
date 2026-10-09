/** Menus use their own artwork; loading must never trigger a hidden world render. */
export function shouldRenderWorld(game){
    return !game.isLoading && !['loading','menu'].includes(game.gameState);
}
