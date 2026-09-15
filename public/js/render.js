import { S, tileBrightness } from './state.js';
import { WEAPONS, POWERUP_INFO, TILE, FOG_FADE_TIME } from './config.js';
import { drawMinimap } from './minimap.js';

let DPR = 1;
let W = 640, H = 360;
let darkCv = document.createElement('canvas');
let dctx = darkCv.getContext('2d');
let noiseCv = document.createElement('canvas');

const MONSTER_NEAR_RADIUS = 120;
const LIT_THRESHOLD = 0.15;

export function getCanvasInfo() { return { W, H, DPR }; }

export function setupCanvas() {
    const cv = document.getElementById('cv');
    const vv = window.visualViewport;
    W = Math.round(vv ? vv.width : window.innerWidth);
    H = Math.round(vv ? vv.height : window.innerHeight);
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);

    darkCv = document.createElement('canvas');
    darkCv.width = W; darkCv.height = H;
    dctx = darkCv.getContext('2d');

    buildNoise();
    S.camX = Math.max(0, Math.min(S.MAPW - W, S.camX));
    S.camY = Math.max(0, Math.min(S.MAPH - H, S.camY));
}

function buildNoise() {
    noiseCv = document.createElement('canvas');
    noiseCv.width = W + 80;
    noiseCv.height = H + 80;
    const nc = noiseCv.getContext('2d');
    const img = nc.createImageData(noiseCv.width, noiseCv.height);
    for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 8;
    }
    nc.putImageData(img, 0, 0);
}

function hash2(x, y) {
    let h = x * 374761393 + y * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function hexRgb(hex) {
    if (hex.startsWith('rgb')) return hex.replace(/rgba?\(|\)/g, '');
    const h = hex.replace('#', '');
    return `${parseInt(h.substring(0,2),16)},${parseInt(h.substring(2,4),16)},${parseInt(h.substring(4,6),16)}`;
}

function isWorldLit(wx, wy, nowSec, threshold = LIT_THRESHOLD) {
    if (!S.explored) return true;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    if (tx < 0 || ty < 0 || tx >= S.COLS || ty >= S.ROWS) return false;
    return tileBrightness(ty * S.COLS + tx, nowSec, FOG_FADE_TIME) > threshold;
}

export function render() {
    const ctx = document.getElementById('cv').getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, W, H);

    // Не рисуем ничего, пока не в игре
    if (S.mode_ui !== 'game' || !S.map) return;

    const p = S.player;
    const camX = S.camX, camY = S.camY;
    const nowSec = performance.now() / 1000;

    ctx.save();
    if (S.shake > 0.05)
        ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);

    const x0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const y0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const x1 = Math.min(S.COLS, Math.ceil((camX + W) / TILE) + 1);
    const y1 = Math.min(S.ROWS, Math.ceil((camY + H) / TILE) + 1);

    ctx.translate(-camX, -camY);

    /* ============ ТАЙЛЫ ============ */
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const idx = y * S.COLS + x;
            const br = tileBrightness(idx, nowSec, FOG_FADE_TIME);
            if (br <= 0.02) continue;

            const isWall = S.map[y][x] === '#';
            const h = hash2(x, y);
            ctx.globalAlpha = br;

            if (isWall) {
                // Стена: тёмно-серый бетон со стальным отливом
                const zone = (Math.floor(x / 8) + Math.floor(y / 6) * 3) % 4;
                // Оттенок задаёт чуть тёплый/холодный тон, но без неона
                const HUE   = [220, 40, 200, 30][zone];
                const SAT   = 6 + h * 4;
                const LIGHT = 32 + h * 8;

                ctx.fillStyle = `hsl(${HUE}, ${SAT}%, ${LIGHT}%)`;
                ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

                // Верхний скол
                ctx.fillStyle = `hsla(${HUE}, ${SAT + 4}%, ${LIGHT + 12}%, 0.85)`;
                ctx.fillRect(x * TILE, y * TILE, TILE, 2);

                // Левая подсветка (объём)
                ctx.fillStyle = `hsla(${HUE}, ${SAT + 3}%, ${LIGHT + 6}%, 0.5)`;
                ctx.fillRect(x * TILE, y * TILE, 2, TILE);

                // Нижняя тень
                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillRect(x * TILE, y * TILE + TILE - 3, TILE, 3);

                // Кирпичная шероховатость
                if (h > 0.5) {
                    ctx.fillStyle = `hsla(${HUE}, ${SAT}%, ${LIGHT + 14}%, 0.28)`;
                    ctx.fillRect(x * TILE + 2,  y * TILE + 7,  8, 1);
                    ctx.fillRect(x * TILE + 11, y * TILE + 13, 7, 1);
                    ctx.fillRect(x * TILE + 3,  y * TILE + 17, 5, 1);
                }
                // Трещинка-акцент
                if (h > 0.93) {
                    ctx.fillStyle = `hsla(0, 0%, ${LIGHT + 20}%, 0.4)`;
                    ctx.fillRect(x * TILE + 6, y * TILE + 4, 1, 6);
                }
            } else {
                // Пол: почти чёрный, с очень тонкой сеткой
                const FH = 220;
                ctx.fillStyle = `hsl(${FH}, 5%, ${13 + h * 4}%)`;
                ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

                ctx.strokeStyle = `hsla(${FH}, 8%, ${14 + h * 4}%, 0.6)`;
                ctx.lineWidth = 0.6;
                ctx.beginPath();
                ctx.moveTo(x * TILE + TILE, y * TILE);
                ctx.lineTo(x * TILE + TILE, y * TILE + TILE);
                ctx.moveTo(x * TILE, y * TILE + TILE);
                ctx.lineTo(x * TILE + TILE, y * TILE + TILE);
                ctx.stroke();

                // Редкие пылинки-детали
                if (h > 0.97) {
                    ctx.fillStyle = `hsla(40, 15%, 35%, 0.35)`;
                    ctx.beginPath();
                    ctx.arc(x * TILE + 10, y * TILE + 10, 1.2, 0, 6.2832);
                    ctx.fill();
                }
                if (h < 0.04) {
                    ctx.fillStyle = `hsla(0, 0%, 0%, 0.4)`;
                    ctx.beginPath();
                    ctx.arc(x * TILE + 10, y * TILE + 10, 5, 0, 6.2832);
                    ctx.fill();
                }
            }
        }
    }
    ctx.globalAlpha = 1;

    /* ============ ЛУТ ============ */
    for (const l of S.loot) {
        if (!isWorldLit(l.x, l.y, nowSec)) continue;
        const pulse = 1 + Math.sin(S.t * 3 + l.id.charCodeAt(1)) * 0.12;
        let col = '#d4913f';
        let draw = null;
        if (l.type === 'ammo') {
            col = '#d4913f';
            draw = (x, y) => {
                for (let i = 0; i < 3; i++) {
                    ctx.fillStyle = col;
                    ctx.fillRect(x - 5 + i * 4, y - 5, 3, 10);
                }
            };
        } else if (l.type === 'health') {
            col = '#c86060';
            draw = (x, y) => {
                ctx.fillStyle = col;
                ctx.fillRect(x - 7, y - 6, 14, 12);
                ctx.fillStyle = '#f0e8e0';
                ctx.fillRect(x - 1.5, y - 4, 3, 8);
                ctx.fillRect(x - 4, y - 1.5, 8, 3);
            };
        } else if (l.type.startsWith('weapon_')) {
            const wn = l.type.substring(7);
            col = WEAPONS[wn]?.color || '#a0a8b4';
            draw = (x, y) => {
                ctx.fillStyle = col;
                ctx.fillRect(x - 9, y - 3, 16, 6);
                ctx.fillStyle = '#1a1d22';
                ctx.fillRect(x - 4, y + 1, 4, 4);
            };
        } else if (l.type.startsWith('powerup_')) {
            const pu = l.type.substring(8);
            const info = POWERUP_INFO[pu] || { color: '#d4913f', icon: '?' };
            col = info.color;
            draw = (x, y) => {
                ctx.fillStyle = col;
                ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.2832); ctx.fill();
                ctx.fillStyle = '#0d0f12';
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(info.icon, x, y + 1);
            };
        }
        if (draw) {
            const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 24 * pulse);
            g.addColorStop(0,   `rgba(${hexRgb(col)},0.28)`);
            g.addColorStop(0.5, `rgba(${hexRgb(col)},0.10)`);
            g.addColorStop(1,   `rgba(${hexRgb(col)},0)`);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(l.x, l.y, 24 * pulse, 0, 6.2832); ctx.fill();
            draw(l.x, l.y);
        }
    }

    /* ============ МОНСТРЫ ============ */
    for (const m of S.monsters) {
        const dNear = Math.hypot(m.x - p.x, m.y - p.y);
        const visible = dNear < MONSTER_NEAR_RADIUS || isWorldLit(m.x, m.y, nowSec);
        if (!visible) continue;

        const pulse = 1 + Math.sin(S.t * 6 + m.id.charCodeAt(1)) * 0.06;
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 26);
        g.addColorStop(0,   'rgba(180,50,50,0.45)');
        g.addColorStop(0.6, 'rgba(120,30,30,0.15)');
        g.addColorStop(1,   'rgba(60,10,10,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(m.x, m.y, 26, 0, 6.2832); ctx.fill();

        ctx.fillStyle = '#1a0a0a';
        ctx.beginPath(); ctx.arc(m.x, m.y, 10 * pulse, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#8a2828';
        ctx.beginPath(); ctx.arc(m.x, m.y - 1, 7 * pulse, 0, 6.2832); ctx.fill();

        ctx.fillStyle = '#d0a040';
        ctx.beginPath(); ctx.arc(m.x - 3, m.y - 2, 1.8, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.arc(m.x + 3, m.y - 2, 1.8, 0, 6.2832); ctx.fill();

        if (m.hitT > 0) {
            ctx.fillStyle = `rgba(255,240,220,${m.hitT * 4})`;
            ctx.beginPath(); ctx.arc(m.x, m.y, 14, 0, 6.2832); ctx.fill();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(m.x - 12, m.y - 19, 24, 3);
        ctx.fillStyle = '#a04040';
        ctx.fillRect(m.x - 12, m.y - 19, 24 * Math.max(0, m.hp / m.maxHp), 3);
    }

    /* ============ ЧУЖИЕ ИГРОКИ ============ */
    for (const id in S.players) {
        if (+id === S.myId) continue;
        const o = S.players[id];
        if (o.dead || o._hidden) continue;
        const revealed = !!o.revealed;
        if (o.effects && o.effects.invisible > 0 && !revealed) continue;
        if (S.mode === 'pvp' && !revealed && !isWorldLit(o.x, o.y, nowSec)) continue;
        drawRemotePlayer(ctx, o, revealed);
    }

    /* ============ СНАРЯДЫ — трассеры ============ */
    for (const pr of S.projectiles) {
        const wc = WEAPONS[pr.weapon]?.color || '#d4913f';
        // Трассер: короткая светящаяся точка + свечение
        const g = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, 12);
        g.addColorStop(0,   `rgba(255,250,220,1)`);
        g.addColorStop(0.35,`rgba(${hexRgb(wc)},0.9)`);
        g.addColorStop(1,   `rgba(${hexRgb(wc)},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 12, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#fff8e0';
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 2.2, 0, 6.2832); ctx.fill();
    }

    /* ============ ВЗРЫВЫ ============ */
    for (const ex of S.explosions) {
        const g = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, ex.r);
        g.addColorStop(0,   'rgba(255,240,200,0.95)');
        g.addColorStop(0.35,'rgba(240,178,85,0.75)');
        g.addColorStop(0.7, 'rgba(180,90,40,0.4)');
        g.addColorStop(1,   'rgba(120,40,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r, 0, 6.2832); ctx.fill();
    }

    /* ============ ЧАСТИЦЫ ============ */
    for (const q of S.particles) {
        ctx.fillStyle = q.color;
        ctx.globalAlpha = Math.max(0, q.life / q.max);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 1.6, 0, 6.2832);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* ============ АВТО-НОЖ ============ */
    for (const fx of S.autoMeleeFx) {
        const k = fx.life / fx.max;
        ctx.save();
        ctx.translate(fx.x, fx.y);
        ctx.globalAlpha = Math.max(0, k);
        ctx.strokeStyle = '#d0c8b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 10 + (1 - k) * 6, -0.9, 0.9);
        ctx.stroke();
        ctx.restore();
    }
    ctx.globalAlpha = 1;

    drawLocalPlayer(ctx, p);

    ctx.restore();

    /* ============ СЛОЙ ТЬМЫ / ФОНАРИК ============ */
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, W, H);
    dctx.fillStyle = 'rgba(2,4,8,0.86)';
    dctx.fillRect(0, 0, W, H);
    dctx.globalCompositeOperation = 'destination-out';

    const psx = p.x - camX, psy = p.y - camY;

    for (const l of S.loot) {
        const sx = l.x - camX, sy = l.y - camY;
        if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
        const g = dctx.createRadialGradient(sx, sy, 0, sx, sy, 28);
        g.addColorStop(0, 'rgba(0,0,0,0.8)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        dctx.fillStyle = g;
        dctx.beginPath(); dctx.arc(sx, sy, 28, 0, 6.2832); dctx.fill();
    }

    for (const id in S.players) {
        if (+id === S.myId) continue;
        const o = S.players[id];
        if (o.dead || o._hidden) continue;
        const revealed = !!o.revealed;
        if (o.effects && o.effects.invisible > 0 && !revealed) continue;

        const sx = (o._rx !== undefined ? o._rx : o.x) - camX;
        const sy = (o._ry !== undefined ? o._ry : o.y) - camY;
        if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;

        const r = revealed ? 70 : 50;
        const g = dctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, 'rgba(0,0,0,0.88)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        dctx.fillStyle = g;
        dctx.beginPath(); dctx.arc(sx, sy, r, 0, 6.2832); dctx.fill();
    }

    const g0 = dctx.createRadialGradient(psx, psy, 0, psx, psy, 140);
    g0.addColorStop(0,   'rgba(0,0,0,0.95)');
    g0.addColorStop(0.5, 'rgba(0,0,0,0.55)');
    g0.addColorStop(1,   'rgba(0,0,0,0)');
    dctx.fillStyle = g0;
    dctx.beginPath(); dctx.arc(psx, psy, 140, 0, 6.2832); dctx.fill();

    dctx.save();
    dctx.beginPath();
    dctx.moveTo(psx, psy);
    dctx.arc(psx, psy, 300, p.dir - 0.62, p.dir + 0.62);
    dctx.closePath();
    dctx.clip();
    const g1 = dctx.createRadialGradient(psx, psy, 0, psx, psy, 300);
    g1.addColorStop(0,    'rgba(0,0,0,0.99)');
    g1.addColorStop(0.55, 'rgba(0,0,0,0.65)');
    g1.addColorStop(1,    'rgba(0,0,0,0)');
    dctx.fillStyle = g1;
    dctx.fillRect(0, 0, W, H);
    dctx.restore();

    dctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(darkCv, 0, 0);


    /* ============ СВЕТ ФОНАРИКА (поверх тьмы) ============ */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

// Мягкий амбиент вокруг игрока
    const ambG = ctx.createRadialGradient(psx, psy, 0, psx, psy, 130);
    ambG.addColorStop(0, 'rgba(255,232,190,0.10)');
    ambG.addColorStop(1, 'rgba(255,232,190,0)');
    ctx.fillStyle = ambG;
    ctx.beginPath(); ctx.arc(psx, psy, 130, 0, 6.2832); ctx.fill();

// Конус
    ctx.beginPath();
    ctx.moveTo(psx, psy);
    ctx.arc(psx, psy, 320, p.dir - 0.62, p.dir + 0.62);
    ctx.closePath();
    ctx.clip();
    const coneG = ctx.createRadialGradient(psx, psy, 0, psx, psy, 320);
    coneG.addColorStop(0,    'rgba(255,240,200,0.28)');
    coneG.addColorStop(0.45, 'rgba(255,235,190,0.14)');
    coneG.addColorStop(1,    'rgba(255,235,190,0)');
    ctx.fillStyle = coneG;
    ctx.fillRect(0, 0, W, H);

    ctx.restore();

    /* ============ ШУМ ============ */
    const nx = -Math.floor(Math.random() * 80), ny = -Math.floor(Math.random() * 80);
    ctx.globalAlpha = 0.25;
    ctx.drawImage(noiseCv, nx, ny);
    ctx.globalAlpha = 1;

    if (p.hp < 40) {
        const pulse = (1 - p.hp / 40) * 0.28 + Math.sin(S.t * 5) * 0.04;
        ctx.fillStyle = 'rgba(160,30,30,' + pulse + ')';
        ctx.fillRect(0, 0, W, H);
    }

    drawMinimap();
}

/* ============ ЛОКАЛЬНЫЙ ИГРОК ============ */
function drawLocalPlayer(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);

    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
    g.addColorStop(0, 'rgba(240,178,85,0.18)');
    g.addColorStop(1, 'rgba(240,178,85,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, 6.2832); ctx.fill();

    if ((p.effects.spawn || 0) > 0) {
        ctx.strokeStyle = 'rgba(95,168,120,' + (0.5 + Math.sin(S.t * 8) * 0.25) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 13, 0, 6.2832); ctx.stroke();
    }

    const invisible = (p.effects.invisible || 0) > 0;
    ctx.globalAlpha = invisible ? 0.45 : 1;

    // Тело
    ctx.fillStyle = '#2a2e35';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#4a5058';
    ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 6.2832); ctx.fill();

    ctx.rotate(p.dir);

    // Ствол
    if (p.weapon !== 'knife') {
        ctx.fillStyle = '#1a1d22';
        ctx.fillRect(4, -1.6, 16, 3.2);
        ctx.fillStyle = WEAPONS[p.weapon]?.color || '#a0a8b4';
        ctx.fillRect(14, -1.2, 6, 2.4);
    } else {
        ctx.fillStyle = '#c8ccd2';
        ctx.fillRect(6, -1, 10, 2);
    }

    // Стрелка направления
    ctx.fillStyle = '#d8dce2';
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(3, -4); ctx.lineTo(3, 4); ctx.closePath(); ctx.fill();

    // MUZZLE FLASH — сразу у дула
    if (S.muzzleFlash > 0) {
        const k = Math.min(1, S.muzzleFlash / 0.07);
        const muzzleX = 20;
        // Основная вспышка
        const mf = ctx.createRadialGradient(muzzleX, 0, 0, muzzleX, 0, 16 * k);
        mf.addColorStop(0,   `rgba(255,240,190,${k})`);
        mf.addColorStop(0.4, `rgba(240,178,85,${k * 0.75})`);
        mf.addColorStop(1,   `rgba(180,90,20,0)`);
        ctx.fillStyle = mf;
        ctx.beginPath(); ctx.arc(muzzleX, 0, 16 * k, 0, 6.2832); ctx.fill();
        // Ядро
        ctx.fillStyle = `rgba(255,255,220,${k})`;
        ctx.beginPath(); ctx.arc(muzzleX, 0, 3.5 * k, 0, 6.2832); ctx.fill();
        // Лучики
        ctx.strokeStyle = `rgba(255,220,150,${k * 0.8})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(muzzleX + 4, -6 * k);
        ctx.lineTo(muzzleX + 12 * k, 0);
        ctx.lineTo(muzzleX + 4, 6 * k);
        ctx.stroke();
    }

    if (S.meleeFlash > 0) {
        ctx.fillStyle = 'rgba(230,220,200,' + (S.meleeFlash * 4) + ')';
        ctx.beginPath(); ctx.arc(14, 0, 10, 0, 6.2832); ctx.fill();
    }

    ctx.globalAlpha = 1;

    if (invisible) {
        ctx.rotate(-p.dir);
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#6b8fc4';
        ctx.fillText('👁', 0, -18);
    }

    ctx.restore();
}

/* ============ ЧУЖИЕ ИГРОКИ ============ */
function drawRemotePlayer(ctx, o, revealed) {
    const rx = o._rx !== undefined ? o._rx : o.x;
    const ry = o._ry !== undefined ? o._ry : o.y;

    ctx.save();
    ctx.translate(rx, ry);

    if (revealed) {
        const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.008);

        const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
        gg.addColorStop(0,   `rgba(212,145,63,${0.45 * pulse})`);
        gg.addColorStop(0.6, `rgba(180,110,50,${0.22 * pulse})`);
        gg.addColorStop(1,   'rgba(120,70,30,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(0, 0, 24, 0, 6.2832); ctx.fill();

        ctx.strokeStyle = `rgba(240,178,85,${0.65 + 0.3 * pulse})`;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -performance.now() * 0.02;
        ctx.beginPath(); ctx.arc(0, 0, 17 + (pulse - 0.55) * 3, 0, 6.2832); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
    } else {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
        g.addColorStop(0, 'rgba(120,140,170,0.28)');
        g.addColorStop(1, 'rgba(120,140,170,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, 6.2832); ctx.fill();
    }

    ctx.globalAlpha = revealed ? 0.7 : 1;
    ctx.fillStyle = revealed ? '#3a2820' : '#1a2430';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.2832); ctx.fill();
    ctx.fillStyle = revealed ? '#7a5030' : '#3a5068';
    ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 6.2832); ctx.fill();

    ctx.rotate(o.dir);
    ctx.fillStyle = revealed ? '#e8a050' : '#a0b8d8';
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(3, -4); ctx.lineTo(3, 4); ctx.closePath(); ctx.fill();

    if (o.weapon !== 'knife') {
        ctx.fillStyle = '#1a1d22';
        ctx.fillRect(4, -1.6, 14, 3.2);
        ctx.fillStyle = WEAPONS[o.weapon]?.color || '#a0a8b4';
        ctx.fillRect(13, -1.2, 5, 2.4);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    ctx.fillStyle = revealed ? '#e8a050' : '#c0c8d4';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(revealed ? `${o.name} ♪` : o.name, rx, ry - 18);

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(rx - 12, ry - 16, 24, 3);
    ctx.fillStyle = '#a04040';
    ctx.fillRect(rx - 12, ry - 16, 24 * Math.max(0, o.hp / 100), 3);
}