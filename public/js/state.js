export const S = {
    ws: null, myId: null, roomCode: '', mode: 'pvp', mapType: 'rooms',
    map: null, COLS: 0, ROWS: 0, MAPW: 0, MAPH: 0,

    players: {}, monsters: [], loot: [], projectiles: [], explosions: [],
    explored: null,        // Uint8Array(COLS*ROWS) — туман войны (только у нас)

    player: { x:0, y:0, dir:0, hp:100, weapon:'pistol', ammo:30, dead:false, score:0, effects:{} },
    meleeFlash: 0, shake: 0, t: 0, autoFire: false,
    firingCd: 0, lastSend: 0, particles: [], autoMeleeFx: [],
    mode_ui: 'menu',
    camX: 0, camY: 0
};

export function resetFog() {
    if (S.COLS && S.ROWS) S.explored = new Uint8Array(S.COLS * S.ROWS);
    else S.explored = null;
}

export function applyFogDelta(indices) {
    if (!S.explored || !indices || !indices.length) return;
    for (let i = 0; i < indices.length; i++) S.explored[indices[i]] = 1;
}