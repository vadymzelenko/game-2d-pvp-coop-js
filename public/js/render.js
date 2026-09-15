import { S, tileBrightness } from './state.js';
import { WEAPONS, POWERUP_INFO, TILE, FOG_FADE_TIME } from './config.js';
import { drawMinimap } from './minimap.js';

let DPR = 1;
let W = 640, H = 360;
let darkCv = document.createElement('canvas');
let dctx = darkCv.getContext('2d');
let noiseCv = document.createElement('canvas');

// Насколько близко монстр должен быть, чтобы его видели даже в темноте
const MONSTER_NEAR_RADIUS = 120;
// Порог яркости тайла, при котором ещё рисуем объекты на нём
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
        img.data[i + 3] = 12;
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

// Свежий ли тайл в мировых координатах (для фильтрации лута/монстров/игроков)
function isWorldLit(wx, wy, nowSec, threshold = LIT_THRESHOLD) {
    if (!S.explored) return true;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    if (tx < 0 || ty < 0 || tx >= S.COLS || ty >= S.ROWS) return false;
    return tileBrightness(ty * S.COLS + tx, nowSec, FOG_FADE_TIME) > threshold;
}

/* ======================= RENDER ======================= */
export function render() {
    const ctx = document.getElementById('cv').getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

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

    /* ============ ТАЙЛЫ С ЗАТУХАНИЕМ ============ */
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const idx = y * S.COLS + x;
            const br = tileBrightness(idx, nowSec, FOG_FADE_TIME);
            if (br <= 0.02) continue; // полностью погас — не рисуем

            const isWall = S.map[y][x] === '#';
            const h = hash2(x, y);
            ctx.globalAlpha = br;

            if (isWall) {
                const zone = (Math.floor(x / 8) + Math.floor(y / 6) * 3) % 6;
                const HUE = [280, 300, 200, 260, 320, 240][zone];
                const SAT = 35;
                const LIGHT = 22 + h * 14;

                ctx.fillStyle = `hsl(${HUE}, ${SAT}%, ${LIGHT}%)`;
                ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

                ctx.fillStyle = `hsla(${HUE}, ${SAT + 15}%, ${LIGHT + 18}%, 0.95)`;
                ctx.fillRect(x * TILE, y * TILE, TILE, 3);
                ctx.fillStyle = `hsla(${HUE}, ${SAT + 10}%, ${LIGHT + 10}%, 0.6)`;
                ctx.fillRect(x * TILE, y * TILE, 2, TILE);
                ctx.fillStyle = 'rgba(0,0,0,0.6)';
                ctx.fillRect(x * TILE, y * TILE + TILE - 3, TILE, 3);

                if (h > 0.55) {
                    ctx.fillStyle = `hsla(${HUE}, 20%, ${LIGHT + 25}%, 0.35)`;
                    ctx.fillRect(x * TILE + 2,  y * TILE + 7,  8, 1);
                    ctx.fillRect(x * TILE + 11, y * TILE + 13, 7, 1);
                    ctx.fillRect(x * TILE + 3,  y * TILE + 17, 5, 1);
                }
                if (h > 0.9) {
                    ctx.fillStyle = `hsla(${HUE}, 90%, 65%, 0.5)`;
                    ctx.fillRect(x * TILE + 4, y * TILE + 4, 3, 3);
                }
            } else {
                const zone = (Math.floor(x / 10) + Math.floor(y / 8)) % 4;
                const FH = [260, 240, 220, 280][zone];
                ctx.fillStyle = `hsl(${FH}, 20%, ${10 + h * 5}%)`;
                ctx.fillRect(x * TILE, y * TILE, TILE, TILE);

                ctx.strokeStyle = `hsla(${FH}, 40%, ${20 + h * 8}%, 0.7)`;
                ctx.lineWidth = 0.7;
                ctx.beginPath();
                ctx.moveTo(x * TILE + TILE, y * TILE);
                ctx.lineTo(x * TILE + TILE, y * TILE + TILE);
                ctx.moveTo(x * TILE, y * TILE + TILE);
                ctx.lineTo(x * TILE + TILE, y * TILE + TILE);
                ctx.stroke();

                if (h > 0.96) {
                    ctx.fillStyle = `hsla(${FH + 60}, 80%, 60%, 0.4)`;
                    ctx.beginPath();
                    ctx.arc(x * TILE + 10, y * TILE + 10, 1.5, 0, 6.2832);
                    ctx.fill();
                }
                if (h < 0.06) {
                    ctx.fillStyle = `hsla(${FH}, 60%, 40%, 0.15)`;
                    ctx.beginPath();
                    ctx.arc(x * TILE + 10, y * TILE + 10, 6, 0, 6.2832);
                    ctx.fill();
                }
            }
        }
    }
    ctx.globalAlpha = 1;

    /* ============ ЛУТ ============ */
    for (const l of S.loot) {
        if (!isWorldLit(l.x, l.y, nowSec)) continue;
        const pulse = 1 + Math.sin(S.t * 3 + l.id.charCodeAt(1)) * 0.15;
        let col = '#ffd060';
        let draw = null;
        if (l.type === 'ammo') {
            col = '#ffd060';
            draw = (x, y) => {
                for (let i = 0; i < 3; i++) {
                    ctx.fillStyle = col;
                    ctx.shadowColor = col; ctx.shadowBlur = 8;
                    ctx.fillRect(x - 5 + i * 4, y - 5, 3, 10);
                }
                ctx.shadowBlur = 0;
            };
        } else if (l.type === 'health') {
            col = '#ff6080';
            draw = (x, y) => {
                ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
                ctx.fillRect(x - 7, y - 6, 14, 12); ctx.shadowBlur = 0;
                ctx.fillStyle = '#fff';
                ctx.fillRect(x - 1.5, y - 4, 3, 8);
                ctx.fillRect(x - 4, y - 1.5, 8, 3);
            };
        } else if (l.type.startsWith('weapon_')) {
            const wn = l.type.substring(7);
            col = WEAPONS[wn]?.color || '#c0b0ff';
            draw = (x, y) => {
                ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12;
                ctx.fillRect(x - 9, y - 3, 16, 6);
                ctx.fillRect(x - 4, y + 3, 4, 4);
                ctx.shadowBlur = 0;
            };
        } else if (l.type.startsWith('powerup_')) {
            const pu = l.type.substring(8);
            const info = POWERUP_INFO[pu] || { color: '#ffd060', icon: '?' };
            col = info.color;
            draw = (x, y) => {
                ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14;
                ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.2832); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#0a0618';
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(info.icon, x, y + 1);
            };
        }
        if (draw) {
            const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 26 * pulse);
            g.addColorStop(0,   `rgba(${hexRgb(col)},0.5)`);
            g.addColorStop(0.5, `rgba(${hexRgb(col)},0.2)`);
            g.addColorStop(1,   `rgba(${hexRgb(col)},0)`);
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(l.x, l.y, 26 * pulse, 0, 6.2832); ctx.fill();
            draw(l.x, l.y);
        }
    }

    /* ============ МОНСТРЫ ============ */
    for (const m of S.monsters) {
        const dNear = Math.hypot(m.x - p.x, m.y - p.y);
        const visible = dNear < MONSTER_NEAR_RADIUS || isWorldLit(m.x, m.y, nowSec);
        if (!visible) continue;

        const pulse = 1 + Math.sin(S.t * 7 + m.id.charCodeAt(1)) * 0.08;
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 30);
        g.addColorStop(0,   'rgba(255,40,80,0.6)');
        g.addColorStop(0.5, 'rgba(180,20,60,0.25)');
        g.addColorStop(1,   'rgba(120,10,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(m.x, m.y, 30, 0, 6.2832); ctx.fill();

        ctx.fillStyle = '#1a0210';
        ctx.beginPath(); ctx.arc(m.x, m.y, 11 * pulse, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#ff2050';
        ctx.shadowColor = '#ff2050'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(m.x, m.y - 2, 8 * pulse, 0, 6.2832); ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffe040';
        ctx.shadowColor = '#ffe040'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(m.x - 3, m.y - 3, 2.2, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.arc(m.x + 3, m.y - 3, 2.2, 0, 6.2832); ctx.fill();
        ctx.shadowBlur = 0;

        if (m.hitT > 0) {
            ctx.fillStyle = 'rgba(255,255,255,' + (m.hitT * 5) + ')';
            ctx.beginPath(); ctx.arc(m.x, m.y, 16, 0, 6.2832); ctx.fill();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.fillRect(m.x - 12, m.y - 20, 24, 4);
        ctx.fillStyle = '#ff2050';
        ctx.shadowColor = '#ff2050'; ctx.shadowBlur = 6;
        ctx.fillRect(m.x - 12, m.y - 20, 24 * Math.max(0, m.hp / m.maxHp), 4);
        ctx.shadowBlur = 0;
    }

    /* ============ ЧУЖИЕ ИГРОКИ ============ */
    for (const id in S.players) {
        if (+id === S.myId) continue;
        const o = S.players[id];
        if (o.dead || o._hidden) continue;
        const revealed = !!o.revealed;

        // Невидимость: показываем только если reveal по звуку
        if (o.effects && o.effects.invisible > 0 && !revealed) continue;

        // В PVP: если не reveal'нут — рисуем только на освещённом тайле
        if (S.mode === 'pvp' && !revealed && !isWorldLit(o.x, o.y, nowSec)) continue;

        drawRemotePlayer(ctx, o, revealed);
    }

    /* ============ СНАРЯДЫ ============ */
    for (const pr of S.projectiles) {
        const wc = WEAPONS[pr.weapon]?.color || '#ffd060';
        const g = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, 14);
        g.addColorStop(0,   `rgba(255,255,255,1)`);
        g.addColorStop(0.3, `rgba(${hexRgb(wc)},0.9)`);
        g.addColorStop(1,   `rgba(${hexRgb(wc)},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 14, 0, 6.2832); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.shadowColor = wc; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, 3, 0, 6.2832); ctx.fill();
        ctx.shadowBlur = 0;
    }

    /* ============ ВЗРЫВЫ ============ */
    for (const ex of S.explosions) {
        const g = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, ex.r);
        g.addColorStop(0,   'rgba(255,255,220,1)');
        g.addColorStop(0.3, 'rgba(255,220,100,0.9)');
        g.addColorStop(0.6, 'rgba(255,120,40,0.6)');
        g.addColorStop(1,   'rgba(255,40,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.r, 0, 6.2832); ctx.fill();
    }

    /* ============ ЧАСТИЦЫ ============ */
    for (const q of S.particles) {
        ctx.fillStyle = q.color;
        ctx.globalAlpha = Math.max(0, q.life / q.max);
        ctx.shadowColor = q.color; ctx.shadowBlur = 6;
        ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    /* ============ ВСПЫШКИ АВТО-НОЖА ============ */
    for (const fx of S.autoMeleeFx) {
        const k = fx.life / fx.max;
        ctx.save();
        ctx.translate(fx.x, fx.y);
        ctx.globalAlpha = Math.max(0, k);
        ctx.strokeStyle = '#e8dcff';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#c080ff'; ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, 10 + (1 - k) * 6, -0.9, 0.9);
        ctx.stroke();
        ctx.restore();
    }
    ctx.globalAlpha = 1;

    drawLocalPlayer(ctx, p);

    ctx.restore();

    /* ============ СЛОЙ ТЕМНОТЫ / ФОНАРИК ============ */
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, W, H);
    dctx.fillStyle = 'rgba(10,4,25,0.65)';
    dctx.fillRect(0, 0, W, H);
    dctx.globalCompositeOperation = 'destination-out';

    const psx = p.x - camX, psy = p.y - camY;

    // Лут подсвечивает вокруг себя
    for (const l of S.loot) {
        const sx = l.x - camX, sy = l.y - camY;
        if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
        const g = dctx.createRadialGradient(sx, sy, 0, sx, sy, 32);
        g.addColorStop(0, 'rgba(0,0,0,0.85)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        dctx.fillStyle = g;
        dctx.beginPath(); dctx.arc(sx, sy, 32, 0, 6.2832); dctx.fill();
    }

    // Чужие игроки подсвечивают себя
    for (const id in S.players) {
        if (+id === S.myId) continue;
        const o = S.players[id];
        if (o.dead || o._hidden) continue;
        const revealed = !!o.revealed;
        if (o.effects && o.effects.invisible > 0 && !revealed) continue;

        const sx = (o._rx !== undefined ? o._rx : o.x) - camX;
        const sy = (o._ry !== undefined ? o._ry : o.y) - camY;
        if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;

        // Revealed "сквозь стену" — даём мягкий прожектор, чтобы читалось
        const r = revealed ? 70 : 54;
        const g = dctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, revealed ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0.85)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        dctx.fillStyle = g;
        dctx.beginPath(); dctx.arc(sx, sy, r, 0, 6.2832); dctx.fill();
    }

    // Свет вокруг игрока
    const g0 = dctx.createRadialGradient(psx, psy, 0, psx, psy, 150);
    g0.addColorStop(0,   'rgba(0,0,0,0.95)');
    g0.addColorStop(0.5, 'rgba(0,0,0,0.6)');
    g0.addColorStop(1,   'rgba(0,0,0,0)');
    dctx.fillStyle = g0;
    dctx.beginPath(); dctx.arc(psx, psy, 150, 0, 6.2832); dctx.fill();

    // Конус фонарика
    dctx.save();
    dctx.beginPath();
    dctx.moveTo(psx, psy);
    dctx.arc(psx, psy, 320, p.dir - 0.62, p.dir + 0.62);
    dctx.closePath();
    dctx.clip();
    const g1 = dctx.createRadialGradient(psx, psy, 0, psx, psy, 320);
    g1.addColorStop(0,    'rgba(0,0,0,0.99)');
    g1.addColorStop(0.55, 'rgba(0,0,0,0.7)');
    g1.addColorStop(1,    'rgba(0,0,0,0)');
    dctx.fillStyle = g1;
    dctx.fillRect(0, 0, W, H);
    dctx.restore();

    dctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(darkCv, 0, 0);

    /* ============ ШУМ ============ */
    const nx = -Math.floor(Math.random() * 80), ny = -Math.floor(Math.random() * 80);
    ctx.globalAlpha = 0.35;
    ctx.drawImage(noiseCv, nx, ny);
    ctx.globalAlpha = 1;

    if (p.hp < 40) {
        const pulse = (1 - p.hp / 40) * 0.3 + Math.sin(S.t * 5) * 0.05;
        ctx.fillStyle = 'rgba(255,20,50,' + pulse + ')';
        ctx.fillRect(0, 0, W, H);
    }

    drawMinimap();
}

/* ================= ИГРОКИ ================= */
function drawLocalPlayer(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);

    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
    g.addColorStop(0, 'rgba(180,120,255,0.4)');
    g.addColorStop(1, 'rgba(180,120,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, 6.2832); ctx.fill();

    if ((p.effects.spawn || 0) > 0) {
        ctx.strokeStyle = 'rgba(126,255,176,' + (0.55 + Math.sin(S.t * 8) * 0.25) + ')';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#7effb0'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(0, 0, 14, 0, 6.2832); ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // Невидимость — полупрозрачный силуэт для себя самого
    const invisible = (p.effects.invisible || 0) > 0;
    ctx.globalAlpha = invisible ? 0.45 : 1;

    ctx.fillStyle = '#3a2050';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#6a40a0';
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.2832); ctx.fill();

    ctx.rotate(p.dir);
    ctx.fillStyle = '#b080ff';
    ctx.shadowColor = '#b080ff'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(3, -5); ctx.lineTo(3, 5); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;

    if (p.weapon !== 'knife') {
        ctx.fillStyle = WEAPONS[p.weapon]?.color || '#ffd060';
        ctx.shadowColor = WEAPONS[p.weapon]?.color || '#ffd060';
        ctx.shadowBlur = 6;
        ctx.fillRect(8, -1.4, 10, 2.8);
        ctx.shadowBlur = 0;
    }
    if (S.meleeFlash > 0) {
        ctx.fillStyle = 'rgba(255,240,200,' + (S.meleeFlash * 5) + ')';
        ctx.beginPath(); ctx.arc(14, 0, 12, 0, 6.2832); ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Иконка "я невидим" — маленький глаз над игроком
    if (invisible) {
        ctx.rotate(-p.dir);
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#8ac0ff';
        ctx.shadowColor = '#8ac0ff'; ctx.shadowBlur = 8;
        ctx.fillText('👁', 0, -18);
        ctx.shadowBlur = 0;
    }

    ctx.restore();
}

function drawRemotePlayer(ctx, o, revealed) {
    const rx = o._rx !== undefined ? o._rx : o.x;
    const ry = o._ry !== undefined ? o._ry : o.y;

    ctx.save();
    ctx.translate(rx, ry);

    // === ЗВУКОВАЯ ЗАСВЕТКА — призрачный ореол ===
    if (revealed) {
        const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.008);

        const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, 26);
        gg.addColorStop(0,   `rgba(255,90,70,${0.55 * pulse})`);
        gg.addColorStop(0.6, `rgba(255,60,40,${0.25 * pulse})`);
        gg.addColorStop(1,   'rgba(255,40,20,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(0, 0, 26, 0, 6.2832); ctx.fill();

        // Пунктирное кольцо — «звуковые волны»
        ctx.strokeStyle = `rgba(255,150,120,${0.7 + 0.3 * pulse})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = -performance.now() * 0.02;
        ctx.beginPath(); ctx.arc(0, 0, 18 + (pulse - 0.55) * 4, 0, 6.2832); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
    } else {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 20);
        g.addColorStop(0, 'rgba(120,200,255,0.4)');
        g.addColorStop(1, 'rgba(120,200,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, 6.2832); ctx.fill();
    }

    // Тело
    ctx.globalAlpha = revealed ? 0.72 : 1;
    ctx.fillStyle = revealed ? '#502430' : '#1a3050';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.2832); ctx.fill();
    ctx.fillStyle = revealed ? '#a05060' : '#3a60a0';
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.2832); ctx.fill();

    ctx.rotate(o.dir);
    ctx.fillStyle = revealed ? '#ff9060' : '#80c0ff';
    ctx.shadowColor = revealed ? '#ff6030' : '#80c0ff';
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(3, -5); ctx.lineTo(3, 5); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;

    if (o.weapon !== 'knife') {
        ctx.fillStyle = WEAPONS[o.weapon]?.color || '#ffd060';
        ctx.fillRect(8, -1.4, 10, 2.8);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Имя + HP
    ctx.fillStyle = revealed ? '#ffb090' : '#c0e0ff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
    ctx.fillText(revealed ? `${o.name} ♪` : o.name, rx, ry - 18);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(rx - 12, ry - 16, 24, 3);
    ctx.fillStyle = '#ff2050';
    ctx.shadowColor = '#ff2050'; ctx.shadowBlur = 5;
    ctx.fillRect(rx - 12, ry - 16, 24 * Math.max(0, o.hp / 100), 3);
    ctx.shadowBlur = 0;
}