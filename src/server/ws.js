const { Room } = require('./room');
const { MAP_W, MAP_H } = require('./constants');

const rooms = new Map();
let nextPlayerId = 1;

function makeCode() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 4; i++) code += c[Math.floor(Math.random() * c.length)];
    } while (rooms.has(code));
    return code;
}

function leave(ws) {
    if (!ws.roomCode) return;
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    room.removePlayer(ws.playerId);
    room.broadcast({ type: 'player_left', id: ws.playerId });
    if (room.players.size === 0) {
        clearInterval(room.interval);
        rooms.delete(ws.roomCode);
        console.log(`[room ${ws.roomCode}] closed`);
    }
    ws.roomCode = null; ws.playerId = null;
}

function handleConnection(ws) {
    ws.playerId = null;
    ws.roomCode = null;

    ws.on('message', raw => {
        let msg; try { msg = JSON.parse(raw); } catch (e) { return; }

        if (msg.type === 'create') {
            const code = makeCode();
            const room = new Room(code, msg.mode || 'pvp', msg.mapType || 'rooms');
            rooms.set(code, room);
            const id = nextPlayerId++;
            const p = room.addPlayer(id, msg.name || 'Player', ws);
            ws.playerId = id; ws.roomCode = code;
            ws.send(JSON.stringify({
                type: 'joined', id, code, mode: room.mode, mapType: room.mapType,
                map: room.map, mapW: MAP_W, mapH: MAP_H,
                players: Array.from(room.players.values()).map(x => ({ id: x.id, name: x.name }))
            }));
            console.log(`[room ${code}] created by ${p.name} (${room.mode}/${room.mapType})`);
        }
        else if (msg.type === 'join') {
            const room = rooms.get(msg.room);
            if (!room) return ws.send(JSON.stringify({ type: 'error', msg: 'Комната не найдена' }));
            if (room.players.size >= 4) return ws.send(JSON.stringify({ type: 'error', msg: 'Комната заполнена' }));
            const id = nextPlayerId++;
            const p = room.addPlayer(id, msg.name || 'Player', ws);
            ws.playerId = id; ws.roomCode = msg.room;
            ws.send(JSON.stringify({
                type: 'joined', id, code: msg.room, mode: room.mode, mapType: room.mapType,
                map: room.map, mapW: MAP_W, mapH: MAP_H,
                players: Array.from(room.players.values()).map(x => ({ id: x.id, name: x.name }))
            }));
            room.broadcast({ type: 'player_joined', id, name: p.name }, id);
        }
        else if (msg.type === 'input') {
            const room = rooms.get(ws.roomCode); if (!room) return;
            const p = room.players.get(ws.playerId); if (!p || p.dead) return;
            p.x = msg.x; p.y = msg.y; p.dir = msg.dir;
        }
        else if (msg.type === 'switch') {
            const room = rooms.get(ws.roomCode); if (!room) return;
            const p = room.players.get(ws.playerId); if (!p) return;
            const { WEAPON_ORDER } = require('./constants');
            if (WEAPON_ORDER.includes(msg.weapon) && (msg.weapon === 'knife' || p.weapons[msg.weapon]))
                p.currentWeapon = msg.weapon;
        }
        else if (msg.type === 'fire') {
            const room = rooms.get(ws.roomCode); if (!room) return;
            const p = room.players.get(ws.playerId); if (!p || p.dead) return;
            room.fireWeapon(p, msg.dx, msg.dy);
        }
        else if (msg.type === 'pickup') {
            const room = rooms.get(ws.roomCode); if (!room) return;
            const p = room.players.get(ws.playerId); if (!p) return;
            const l = room.loot.find(x => x.id === msg.id);
            if (!l || l.taken) return;
            if (Math.hypot(l.x - p.x, l.y - p.y) > 30) return;
            l.taken = true;
            l.respawn = Date.now() + (l.temp ? 30000 : 12000);
            const now = Date.now() / 1000;
            const { WEAPONS, POWERUPS } = require('./constants');
            let feedback = null;
            if (l.type === 'ammo') { p.ammo += 25; feedback = '+25 патронов'; }
            else if (l.type === 'health') { p.hp = Math.min(p.maxHp, p.hp + 50); feedback = '+50 HP'; }
            else if (l.type.startsWith('weapon_')) {
                const wName = l.type.substring(7);
                p.weapons[wName] = true;
                p.currentWeapon = wName;
                p.ammo += 25;
                feedback = 'ОРУЖИЕ: ' + (WEAPONS[wName]?.name || wName);
            }
            else if (l.type.startsWith('powerup_')) {
                const pu = l.type.substring(8);
                const cfg = POWERUPS[pu];
                if (pu === 'ammo') { p.ammo += 25; feedback = '+25 патронов'; }
                else if (pu === 'health') { p.hp = Math.min(p.maxHp, p.hp + 50); feedback = '+50 HP'; }
                else if (cfg) { p.effects[pu] = now + cfg.dur; feedback = cfg.icon + ' ' + cfg.label; }
            }
            try { p.ws.send(JSON.stringify({ type: 'pickup_done', feedback, ammo: p.ammo, hp: p.hp, weapon: p.currentWeapon })); } catch (e) {}
        }
        else if (msg.type === 'leave') leave(ws);
    });

    ws.on('close', () => leave(ws));
}

/* ==== ГЛОБАЛЬНЫЙ ТИК ВОЗРОЖДЕНИЯ ====
   Вот эта строчка отсутствовала — из-за неё мёртвые игроки не воскресали. */
setInterval(() => {
    for (const r of rooms.values()) {
        try { r.respawnLoop(); } catch (e) { console.error('respawn loop error', e); }
    }
}, 400);

module.exports = { handleConnection };