import { S, applyFogDelta, resetFog } from './state.js';
import { updateLobbyList, updateHUD, toast, killfeed, showErr, onJoined, onGameOver } from './hud.js';
import { blip } from './audio.js';

export function connectWS() {
    return new Promise((res, rej) => {
        if (S.ws && S.ws.readyState === 1) return res(S.ws);
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${proto}://${location.host}`);
        ws.onopen = () => res(ws);
        ws.onerror = () => rej(new Error('WS error'));
        ws.onmessage = e => handleMsg(JSON.parse(e.data));
        ws.onclose = () => { if (S.mode_ui === 'game') toast('Соединение потеряно'); };
        S.ws = ws;
    });
}

export function handleMsg(msg) {
    switch (msg.type) {
        case 'error': showErr(msg.msg || 'Ошибка'); break;

        case 'joined':
            S.myId = msg.id;
            S.roomCode = msg.code;
            S.mode = msg.mode;
            S.mapType = msg.mapType || 'rooms';
            S.map = msg.map;
            S.COLS = msg.mapW;
            S.ROWS = msg.mapH;
            S.MAPW = msg.mapW * 20;
            S.MAPH = msg.mapH * 20;
            resetFog();
            onJoined(msg);
            break;

        case 'player_joined': killfeed(`+ ${msg.name}`); break;
        case 'player_left':   killfeed(`− игрок вышел`); break;

        case 'state': {
            S.players = msg.players;
            S.monsters = msg.monsters;
            S.loot = msg.loot;
            S.projectiles = msg.projectiles;
            S.explosions = msg.explosions;
            applyFogDelta(msg.explored);

            const me = S.players[S.myId];
            if (me) {
                if (me.dead) { S.player.x = me.x; S.player.y = me.y; }
                S.player.hp = me.hp;
                S.player.ammo = me.ammo;
                S.player.weapon = me.weapon;
                S.player.score = me.score;
                const wasProtected = (S.player.effects.spawn || 0) > 0;
                S.player.effects = me.effects;
                const nowProtected = (me.effects.spawn || 0) > 0;
                if (wasProtected && !nowProtected) toast('ЗАЩИТА СНЯТА');

                const wasDead = S.player.dead;
                S.player.dead = me.dead;
                document.getElementById('dead').classList.toggle('on', me.dead);
                if (me.dead && !wasDead) { /* just died */ }
                updateHUD();
            }

            // Интерполяция чужих игроков
            for (const id in S.players) {
                if (+id === S.myId) continue;
                const o = S.players[id];
                if (o._tx === undefined) { o._tx = o.x; o._ty = o.y; o._rx = o.x; o._ry = o.y; }
                o._tx = o.x; o._ty = o.y;
            }
            break;
        }

        case 'pickup_done':
            if (msg.ammo !== undefined) S.player.ammo = msg.ammo;
            if (msg.hp !== undefined) S.player.hp = msg.hp;
            if (msg.weapon) S.player.weapon = msg.weapon;
            if (msg.feedback) toast(msg.feedback);
            blip(880, 0.1, 0.06, 'triangle');
            break;

        case 'respawn':
            S.player.x = msg.x;
            S.player.y = msg.y;
            S.player.dead = false;
            document.getElementById('dead').classList.remove('on');
            toast('ВЫ ПОД ЗАЩИТОЙ');
            break;

        case 'automelee':
            S.autoMeleeFx.push({ x: msg.tx, y: msg.ty, life: 0.22, max: 0.22 });
            if (msg.from === S.myId) blip(300, 0.07, 0.05, 'square');
            break;

        case 'death': {
            const k = msg.killer && msg.killer !== 'monster' ? S.players[msg.killer] : null;
            const v = S.players[msg.id];
            killfeed(k ? `${k.name} ⚔ ${v ? v.name : '?'}` : `☠ монстр · ${v ? v.name : '?'}`);
            break;
        }

        case 'gameover':
            onGameOver(msg);
            break;

        case 'reset':
            toast('НОВЫЙ РАУНД');
            break;
    }
}

export function sendMsg(obj) {
    if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(obj));
}