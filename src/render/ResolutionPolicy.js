/** Two-second samples; slow recovery avoids burning headroom on oscillation.
 *  Only scales internal render resolution. Never touches physics, fracture,
 *  debris, collision, or any destruction systems.
 */
export function resolutionStep(scale, target, frameMs, submissionMs, goodStreak = 0) {
    const ceiling = Math.max(0.5, Math.min(1, target));
    scale = Math.min(scale, ceiling);

    // Drop resolution when the frame is late (GPU/CPU pressure)
    if (frameMs > 17.5 && scale > 0.5) {
        const step = frameMs > 25 ? 0.1 : 0.05;
        return { scale: Math.max(0.5, scale - step), goodStreak: 0 };
    }

    // Recover slowly: need sustained headroom before climbing back
    if (frameMs <= 16.8 && submissionMs < 12.5 && scale < ceiling) {
        goodStreak++;
        if (goodStreak >= 10) {
            return { scale: Math.min(ceiling, scale + 0.025), goodStreak: 0 };
        }
        return { scale, goodStreak };
    }

    return { scale, goodStreak: 0 };
}
