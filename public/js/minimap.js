import { S, tileBrightness } from './state.js';
import { TILE, FOG_FADE_TIME } from './config.js';

export function drawMinimap() {
    const mc = document.getElementById('mmcv');
    const mctx = mc.getContext('2d');
    const mw = mc.width, mh = mc.height;
    if (!S.map) return;

    const nowSec = performance.now() / 1000;
    const sx = mw / S.COLS, sy = mh / S.ROWS;
    mctx.fillStyle = 'rgba(15,8,30,0.9)';
    mctx.fillRect(0, 0, mw, mh);

    for (let y = 0; y < S.ROWS; y++) {
        for (let x = 0; x < S.COLS; x++) {
            const idx = y * S.COLS + x;
            const br = tileBrightness(idx, nowSec, FOG_FADE_TIME);
            if (br <= 0.05) continue;
            mctx.globalAlpha = br;
            if (S.map[y][x] === '#') {
                const zone = (Math.floor(x / 8) + Math.floor(y / 6) * 3) % 6;
                const HUE = [280, 300, 200, 260, 320, 240][zone];
                mctx.fillStyle = `hsl(${HUE}, 40%, 35%)`;
            } else {
                mctx.fillStyle = 'rgba(40,25,70,0.7)';
            }
            mctx.fillRect(x * sx, y * sy, Math.max(1, sx), Math.max(1, sy));
        }
    }
    mctx.globalAlpha = 1;

    const lit = (x, y) => {
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        if (tx < 0 || ty < 0 || tx >= S.COLS || ty >= S.ROWS) return false;
        return tileBrightness(ty * S.COLS + tx, nowSec, FOG_FADE_TIME) > 0.15;
    };

    for (const l of S.loot) {
        if (!lit(l.x, l.y)) continue;
        mctx.fillStyle = '#ffd060';
        mctx.fillRect((l.x / TILE) * sx - 1, (l.y / TILE) * sy - 1, 2, 2);
    }
    for (const m of S.monsters) {
        if (!lit(m.x, m.y)) continue;
        mctx.fillStyle = '#ff2050';
        mctx.fillRect((m.x / TILE) * sx - 1.5, (m.y / TILE) * sy - 1.5, 3, 3);
    }
    for (const id in S.players) {
        const o = S.players[id];
        if (o.dead || o._hidden) continue;
        if (+id !== S.myId && !lit(o.x, o.y)) continue;
        if (+id === S.myId) mctx.fillStyle = '#7effb0';
        else mctx.fillStyle = (o.effects && o.effects.invisible > 0) ? '#4a4060' : '#80c0ff';
        mctx.fillRect((o.x / TILE) * sx - 1.5, (o.y / TILE) * sy - 1.5, 3, 3);
    }
}