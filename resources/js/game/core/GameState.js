export const GameState = Object.freeze({
    MENU: 'MENU',
    HANGAR: 'HANGAR',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    LEVEL_UP: 'LEVEL_UP',
    GAMEOVER: 'GAMEOVER',
});

/** 結局代碼，需與 StoreScoreRequest 的 outcome 枚舉一致。 */
export const Outcome = Object.freeze({
    MISSION_COMPLETE: 'mission_complete',
    TIME_UP: 'time_up',
    SHOT_DOWN: 'shot_down',
    WATER_IMPACT: 'water_impact',
    TERRAIN_CRASH: 'terrain_crash',
    BOSS_DEFEATED: 'boss_defeated',
});

export const OUTCOME_TITLES = Object.freeze({
    [Outcome.MISSION_COMPLETE]: 'MISSION COMPLETE',
    [Outcome.TIME_UP]: 'TIME UP',
    [Outcome.SHOT_DOWN]: 'SHOT DOWN',
    [Outcome.WATER_IMPACT]: 'WATER IMPACT',
    [Outcome.TERRAIN_CRASH]: 'TERRAIN CRASH',
    [Outcome.BOSS_DEFEATED]: 'FORTRESS DOWN',
});
