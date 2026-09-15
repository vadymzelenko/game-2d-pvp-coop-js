import { S } from './state.js';
import { WEAPONS, WEAPON_ORDER } from './config.js';
import { connectWS, sendMsg } from './net.js';
import { initInput, keys, joy, aim, tryFire } from './input.js';
import { setupCanvas, render, getCanvasInfo } from './render.js';
import { updateHUD, showErr, toast } from './hud.js';

/* ==== FULLSCREEN ==== */
async function enterFullscreen() {
    try {
        const el = document.documentElement;
        if (el.requestFullscreen) await el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (e) { /* некоторые браузеры блокируют без user-gesture */ }
}
function exitFullscreen() {
    try {
        if (document.fullscreenElement) document.exitFullscreen();
    } catch (e) {}
}
document.getElementById('fullBtn').addEventListener('click', () => {
    if (document.fullscreenElement) exitFullscreen();
    else enterFullscreen();
});

/* ==== МЕНЮ ==== */
let createMode = 'pvp';
let createMap = 'rooms';

document.getElementById('mPvp').addEventListener('click', () => {
    createMode = 'pvp';
    document.getElementById('mPvp').classList.add('on');
    document.getElementById('mCoop').classList.remove('on');
});
document.getElementById('mCoop').addEventListener('click', () => {
    createMode = 'coop';
    document.getElementById('mCoop').classList.add('on');
    document.getElementById('mPvp').classList.remove('on');
});

const mapBtns = { rooms: 'mapRooms', open: 'mapOpen', maze: 'mapMaze' };
Object.entries(mapBtns).forEach(([type, id]) => {
    document.getElementById(id).addEventListener('click', () => {
        createMap = type;
        for (const t in mapBtns) document.getElementById(mapBtns[t]).classList.toggle('on', t === type);
    });
});

document.getElementById('btnCreate').addEventListener('click', async () => {
    const name = (document.getElementById('nameInp').value.trim() || 'Player').slice(0, 14);
    const monsters = !document.getElementById('noMonsters').checked;
    try {
        const ws = await connectWS();
        ws.send(JSON.stringify({ type: 'create', name, mode: createMode, mapType: createMap, monsters }));
    } catch (e) { showErr('Не удалось подключиться'); }
});

document.getElementById('btnJoin').addEventListener('click', async () => {
    const name = (document.getElementById('nameInp').value.trim() || 'Player').slice(0, 14);
    const room = document.getElementById('codeInp').value.trim().toUpperCase();
    if (room.length !== 4) { showErr('Код: 4 символа'); return; }
    try {
        const ws = await connectWS();
        ws.send(JSON.stringify({ type: 'join', name, room }));
    } catch (e) { showErr('Не удалось подключиться'); }
});
document.getElementById('codeInp').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnJoin').click();
});

function exitToMenu() {
    exitFullscreen();
    if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ type: 'leave' }));
    S.mode_ui = 'menu';
    S.players = {}; S.monsters = []; S.loot = []; S.explored = null;
    document.getElementById('menu').classList.remove('hide');
    document.getElementById('lobby').classList.add('hide');
    document.getElementById('gameover').classList.add('hide');
    document.getElementById('dead').classList.remove('on');
}
document.getElementById('exitBtn').addEventListener('click', exitToMenu);
document.getElementById('btnLeave').addEventListener('click', exitToMenu);
document.getElementById('goBack').addEventListener('click', () => {
    document.getElementById('gameover').classList.add('hide');
    document.getElementById('lobby').classList.remove('hide');
    S.mode_ui = 'lobby';
});

document.getElementById('btnStart').addEventListener('click', async () => {
    // Фуллскрин по user-gesture
    enterFullscreen();

    // Просим сервер начать игру
    sendMsg({ type: 'start' });

    // Сразу переходим в игровой режим локально
    document.getElementById('lobby').classList.add('hide');
    document.getElementById('menu').classList.add('hide');
    document.getElementById('gameover').classList.add('hide');
    S.mode_ui = 'game';

    const p = S.players[S.myId];
    if (p) { S.player.x = p.x; S.player.y = p.y; }

    // Сбрасываем камеру на позицию игрока
    const { W, H } = getCanvasInfo();
    S.camX = Math.max(0, Math.min(S.MAPW - W, S.player.x - W / 2));
    S.camY = Math.max(0, Math.min(S.MAPH - H, S.player.y - H / 2));

    toast('ВЫ ПОД ЗАЩИТОЙ');
});

/* ==== SOLID ==== */
function solid(x, y) {
    const cx = Math.floor(x / 20), cy = Math.floor(y / 20);
    if (cx < 0 || cy < 0 || cx >= S.COLS || cy >= S.ROWS) return true;
    return S.map[cy][cx] === '#';
}

/* ==== UPDATE ==== */
let last = performance.now();

function update(dt) {
    S.t += dt;

    // Всегда обновляем таймеры для эффектов рендера (в т.ч. в лобби)
    if (S.muzzleFlash > 0) S.muzzleFlash -= dt;
    if (S.meleeFlash > 0) S.meleeFlash -= dt;
    S.shake *= 0.9;
    for (let i = S.particles.length - 1; i >= 0; i--) {
        const q = S.particles[i];
        q.x += q.vx * dt; q.y += q.vy * dt;
        q.vx *= 0.9; q.vy *= 0.9;
        q.life -= dt;
        if (q.life <= 0) S.particles.splice(i, 1);
    }
    for (let i = S.autoMeleeFx.length - 1; i >= 0; i--) {
        S.autoMeleeFx[i].life -= dt;
        if (S.autoMeleeFx[i].life <= 0) S.autoMeleeFx.splice(i, 1);
    }

    if (S.mode_ui !== 'game') return;
    const p = S.player;
    if (p.dead) return;

    let dx = 0, dy = 0;
    if (keys['arrowleft']  || keys['a']) dx -= 1;
    if (keys['arrowright'] || keys['d']) dx += 1;
    if (keys['arrowup']    || keys['w']) dy -= 1;
    if (keys['arrowdown']  || keys['s']) dy += 1;
    if (joy.active) { dx += joy.dx; dy += joy.dy; }

    const speedMul = (p.effects.speed > 0) ? 1.7 : 1;
    const sp = 135 * speedMul;
    if (dx || dy) {
        const l = Math.hypot(dx, dy);
        dx /= l; dy /= l;
        const nx = p.x + dx * sp * dt;
        if (!solid(nx, p.y)) p.x = nx;
        const ny = p.y + dy * sp * dt;
        if (!solid(p.x, ny)) p.y = ny;
    }

    S.firingCd -= dt;
    if (S.autoFire && WEAPONS[p.weapon]?.auto && S.firingCd <= 0) {
        tryFire();
        S.firingCd = WEAPONS[p.weapon].cd;
    }
    if (aim.active && aim.firing && S.firingCd <= 0) {
        tryFire();
        S.firingCd = WEAPONS[p.weapon].cd;
    }

    for (const id in S.players) {
        if (+id === S.myId) continue;
        const o = S.players[id];
        if (o._rx === undefined) { o._rx = o.x; o._ry = o.y; o._tx = o.x; o._ty = o.y; }
        o._rx += (o._tx - o._rx) * Math.min(1, dt * 16);
        o._ry += (o._ty - o._ry) * Math.min(1, dt * 16);
    }

    const now = performance.now();
    if (now - S.lastSend > 50) {
        S.lastSend = now;
        sendMsg({ type: 'input', x: p.x, y: p.y, dir: p.dir });
    }

    const { W, H } = getCanvasInfo();
    S.camX += (p.x - W / 2 - S.camX) * Math.min(1, dt * 12);
    S.camY += (p.y - H / 2 - S.camY) * Math.min(1, dt * 12);
    S.camX = Math.max(0, Math.min(S.MAPW - W, S.camX));
    S.camY = Math.max(0, Math.min(S.MAPH - H, S.camY));
}

function loop(now) {
    let dt = (now - last) / 1000;
    if (dt > 0.05) dt = 0.05;
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
}

/* ==== INIT ==== */
setupCanvas();
initInput();
window.addEventListener('resize', () => { setupCanvas(); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => setupCanvas());
window.addEventListener('orientationchange', () => setTimeout(setupCanvas, 200));
document.addEventListener('fullscreenchange', () => setTimeout(setupCanvas, 100));

requestAnimationFrame(loop);