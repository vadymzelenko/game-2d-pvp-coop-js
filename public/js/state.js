export const S = {
    ws: null, myId: null, roomCode: '', mode: 'pvp', mapType: 'rooms',
    map: null, COLS: 0, ROWS: 0, MAPW: 0, MAPH: 0,

    players: {}, monsters: [], loot: [], projectiles: [], explosions: [],
    // explored[idx] = момент (в секундах performance.now()/1000), когда тайл
    // последний раз был в поле зрения. 0 = никогда. Это позволяет затухать.
    explored: null,

    player: { x:0, y:0, dir:0, hp:100, weapon:'pistol', ammo:30, dead:false, score:0, effects:{} },
    meleeFlash: 0, shake: 0, t: 0, autoFire: false,
    firingCd: 0, lastSend: 0, particles: [], autoMeleeFx: [],
    mode_ui: 'menu',
    camX: 0, camY: 0
};

export function resetFog() {
    if (S.COLS && S.ROWS) S.explored = new Float32Array(S.COLS * S.ROWS);
    else S.explored = null;
}

export function markVisible(indices, nowSec) {
    if (!S.explored || !indices) return;
    for (let i = 0; i < indices.length; i++) S.explored[indices[i]] = nowSec;
}

// 0..1 — насколько ярко рисовать тайл
export function tileBrightness(idx, nowSec, fadeTime) {
    if (!S.explored) return 1;
    const t = S.explored[idx];
    if (t === 0) return 0;
    const age = nowSec - t;
    if (age <= 0) return 1;
    if (age >= fadeTime) return 0;
    const half = fadeTime * 0.5;
    if (age < half) return 1;
    return 1 - (age - half) / half;
}