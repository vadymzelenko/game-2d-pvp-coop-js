import { S } from './state.js';
import { WEAPONS, WEAPON_ORDER, AIM_FIRE_THRESHOLD } from './config.js';
import { sendMsg } from './net.js';
import { blip } from './audio.js';
import { updateHUD } from './hud.js';

export const keys = {};
export const joy = { active: false, id: null, dx: 0, dy: 0, bx: 0, by: 0 };
export const aim = { active: false, id: null, dx: 0, dy: 0, bx: 0, by: 0, mag: 0, firing: false };

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// Клиентский cooldown, чтобы не спамить сервер и не было холостых выстрелов
let localFireCd = 0;

export function initInput() {
    document.addEventListener('keydown', e => {
        const k = e.key.toLowerCase();
        if (['arrowleft','arrowright','arrowup','arrowdown',' '].includes(k)) e.preventDefault();
        keys[k] = true;
        if (S.mode_ui === 'game') {
            if (k === 'e') tryPickup();
            if (k >= '1' && k <= '7') {
                const idx = +k - 1;
                if (idx < WEAPON_ORDER.length) {
                    const wName = WEAPON_ORDER[idx];
                    if (wName === 'knife' || S.players[S.myId]?.weapons?.[wName]) {
                        S.player.weapon = wName;   // оптимистично
                        updateHUD();
                        sendMsg({ type: 'switch', weapon: wName });
                    }
                }
            }
        }
    });
    document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

    if (!IS_TOUCH) {
        const cv = document.getElementById('cv');
        cv.addEventListener('mousedown', e => { if (e.button === 0) { S.autoFire = true; tryFire(); } });
        cv.addEventListener('mouseup', () => { S.autoFire = false; });
        cv.addEventListener('mouseleave', () => { S.autoFire = false; });
        document.addEventListener('mousemove', e => {
            S.player.dir = Math.atan2(e.clientY - window.innerHeight / 2, e.clientX - window.innerWidth / 2);
        });
    }

    initTouch();
}

export function tryFire() {
    if (S.mode_ui !== 'game' || S.player.dead) return;
    const p = S.player;
    const w = WEAPONS[p.weapon];
    if (!w) return;

    // Клиентский кулдаун — синхронно с сервером
    const nowSec = performance.now() / 1000;
    if (nowSec < localFireCd) return;
    if (!w.melee && p.ammo < 1) return;

    localFireCd = nowSec + w.cd;

    const dx = Math.cos(p.dir), dy = Math.sin(p.dir);
    sendMsg({ type: 'fire', dx, dy });

    // Сразу считаем один патрон в минус для отзывчивости
    if (!w.melee) p.ammo = Math.max(0, p.ammo - 1);

    // Звук
    blip(p.weapon === 'knife' ? 320 : 130, 0.1, 0.08, 'square');

    // Эффекты
    if (p.weapon !== 'knife') {
        S.shake = 1.8;
        S.muzzleFlash = 0.07;
        const col = WEAPONS[p.weapon]?.color || '#ffd060';
        // Искры из дула
        for (let i = 0; i < 6; i++) {
            const ang = p.dir + (Math.random() - 0.5) * 0.6;
            const sp = 180 + Math.random() * 200;
            S.particles.push({
                x: p.x + dx * 20, y: p.y + dy * 20,
                vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
                life: 0.18, max: 0.18, color: col
            });
        }
    } else {
        S.meleeFlash = 0.18;
    }
}

export function tryPickup() {
    if (S.mode_ui !== 'game' || S.player.dead) return;
    const p = S.player;
    let best = null, bd = 30;
    for (const l of S.loot) {
        const d = Math.hypot(l.x - p.x, l.y - p.y);
        if (d < bd) { bd = d; best = l; }
    }
    if (best) sendMsg({ type: 'pickup', id: best.id });
}

/* ============ TOUCH ============ */
function initTouch() {
    // вместо `if (!IS_TOUCH) return;` в начале initTouch:
    if (!IS_TOUCH) {
        // всё равно вешаем click-обработчики для возможных кнопок (например, fullscreen)
        document.getElementById('bUse')?.addEventListener('click', tryPickup);
        document.getElementById('bSwitch')?.addEventListener('click', () => { /* см. cycleWeapon */ });
        return;
    }

    document.getElementById('mob').classList.add('on');

    const joyZone = document.getElementById('joyZone');
    const joyBase = document.getElementById('joyBase');
    const joyKnob = document.getElementById('joyKnob');

    function joyStart(e) {
        e.preventDefault();
        const t = e.changedTouches ? e.changedTouches[0] : e;
        joy.id = e.changedTouches ? t.identifier : 'm';
        joy.bx = t.clientX; joy.by = t.clientY; joy.active = true;
        joyBase.style.transition = 'none';
        const r = joyZone.getBoundingClientRect();
        joyBase.style.left = (t.clientX - r.left) + 'px';
        joyBase.style.top  = (t.clientY - r.top)  + 'px';
    }
    function joyMove(e) {
        if (!joy.active) return;
        let t = e;
        if (e.changedTouches) {
            t = null;
            for (const c of e.changedTouches) if (c.identifier === joy.id) t = c;
            if (!t) return;
        }
        const dx = t.clientX - joy.bx, dy = t.clientY - joy.by;
        const len = Math.hypot(dx, dy), max = 45;
        const k = len > max ? max / len : 1;
        joyKnob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
        joy.dx = dx / max; joy.dy = dy / max;
        const jl = Math.hypot(joy.dx, joy.dy);
        if (jl > 1) { joy.dx /= jl; joy.dy /= jl; }
    }
    function joyEnd() {
        joy.active = false; joy.dx = 0; joy.dy = 0;
        joyKnob.style.transform = 'translate(0,0)';
        joyBase.style.transition = '';
        joyBase.style.left = '50%';
        joyBase.style.top  = '50%';
    }
    joyZone.addEventListener('touchstart', joyStart, { passive: false });
    joyZone.addEventListener('touchmove',  joyMove,  { passive: false });
    joyZone.addEventListener('touchend',   joyEnd);
    joyZone.addEventListener('touchcancel',joyEnd);

    const aimZone = document.getElementById('aimZone');
    const aimBase = document.getElementById('aimBase');
    const aimKnob = document.getElementById('aimKnob');

    function aimStart(e) {
        e.preventDefault();
        const t = e.changedTouches ? e.changedTouches[0] : e;
        aim.id = e.changedTouches ? t.identifier : 'a';
        aim.bx = t.clientX; aim.by = t.clientY; aim.active = true;
        aimBase.style.transition = 'none';
        const r = aimZone.getBoundingClientRect();
        aimBase.style.left = (t.clientX - r.left) + 'px';
        aimBase.style.top  = (t.clientY - r.top)  + 'px';
    }
    function aimMove(e) {
        if (!aim.active) return;
        let t = e;
        if (e.changedTouches) {
            t = null;
            for (const c of e.changedTouches) if (c.identifier === aim.id) t = c;
            if (!t) return;
        }
        const dx = t.clientX - aim.bx, dy = t.clientY - aim.by;
        const len = Math.hypot(dx, dy), max = 45;
        const k = len > max ? max / len : 1;
        aimKnob.style.transform = `translate(${dx * k}px,${dy * k}px)`;

        aim.mag = Math.min(1, len / max);
        const jl = Math.hypot(dx, dy);
        if (jl > 4) {
            S.player.dir = Math.atan2(dy, dx);
            aim.dx = dx / max; aim.dy = dy / max;
            if (aim.mag > 1) { aim.dx /= aim.mag; aim.dy /= aim.mag; }
        }

        const nowFiring = aim.mag >= AIM_FIRE_THRESHOLD;
        if (nowFiring !== aim.firing) {
            aim.firing = nowFiring;
            aimBase.classList.toggle('firing', nowFiring);
            aimKnob.classList.toggle('firing', nowFiring);
        }
    }
    function aimEnd() {
        aim.active = false;
        aim.firing = false;
        aim.mag = 0;
        aim.dx = 0; aim.dy = 0;
        aimKnob.style.transform = 'translate(0,0)';
        aimBase.style.transition = '';
        aimBase.style.left = '50%';
        aimBase.style.top  = '50%';
        aimBase.classList.remove('firing');
        aimKnob.classList.remove('firing');
    }
    aimZone.addEventListener('touchstart', aimStart, { passive: false });
    aimZone.addEventListener('touchmove',  aimMove,  { passive: false });
    aimZone.addEventListener('touchend',   aimEnd);
    aimZone.addEventListener('touchcancel',aimEnd);

    document.getElementById('bUse').addEventListener('touchstart', e => { e.preventDefault(); tryPickup(); }, { passive: false });
    document.getElementById('bUse').addEventListener('click', tryPickup);
    const cycleWeapon = () => {
        const idx = WEAPON_ORDER.indexOf(S.player.weapon);
        for (let i = 1; i < WEAPON_ORDER.length; i++) {
            const next = WEAPON_ORDER[(idx + i) % WEAPON_ORDER.length];
            if (next === 'knife' || S.players[S.myId]?.weapons?.[next]) {
                S.player.weapon = next;     // оптимистично
                updateHUD();
                sendMsg({ type: 'switch', weapon: next });
                break;
            }
        }
    };

    const bSwitch = document.getElementById('bSwitch');
    bSwitch.addEventListener('touchstart', e => { e.preventDefault(); cycleWeapon(); }, { passive: false });
    bSwitch.addEventListener('click', cycleWeapon);
}

export { IS_TOUCH };