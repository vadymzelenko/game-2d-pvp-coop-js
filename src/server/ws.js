const { Room } = require('./room');
const { MAP_W, MAP_H, WEAPONS, POWERUPS, WEAPON_ORDER } = require('./constants');

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
    ws.roomCode = null;
    ws.playerId = null;
}

function handleConnection(ws) {
    ws.playerId = null;
    ws.roomCode = null;

    // ВАЖНО: обработчик вешается ровно один раз — здесь.
    // Никаких ws.on('message', ...) внутри handleMessage быть не должно.
    ws.on('message', raw => {
        let msg;
        try { msg = JSON.parse(raw); } catch (e) { return; }
        try {
            handleMessage(ws, msg);
        } catch (err) {
            console.error('[ws] handler error:', err, 'msg.type =', msg && msg.type);
        }
    });

    ws.on('close', () => leave(ws));
}

/* ===== Вся логика сообщений — напрямую в этой функции ===== */
function handleMessage(ws, msg) {
    switch (msg.type) {

        case 'create': {
            const code = makeCode();
            const room = new Room(code, msg.mode || 'pvp', msg.mapType || 'rooms', msg.monsters !== false);
            rooms.set(code, room);
            const id = nextPlayerId++;
            const p = room.addPlayer(id, msg.name || 'Player', ws);
            ws.playerId = id;
            ws.roomCode = code;
            ws.send(JSON.stringify({
                type: 'joined', id, code,
                mode: room.mode, mapType: room.mapType,
                started: room.started,
                map: room.map, mapW: MAP_W, mapH: MAP_H,
                players: Array.from(room.players.values()).map(x => ({ id: x.id, name: x.name }))
            }));
            console.log(`[room ${code}] created by ${p.name} (${room.mode}/${room.mapType})`);
            break;
        }

        case 'join': {
            const room = rooms.get(msg.room);
            if (!room) return ws.send(JSON.stringify({ type: 'error', msg: 'Комната не найдена' }));
            if (room.players.size >= 4) return ws.send(JSON.stringify({ type: 'error', msg: 'Комната заполнена' }));
            const id = nextPlayerId++;
            const p = room.addPlayer(id, msg.name || 'Player', ws);
            ws.playerId = id;
            ws.roomCode = msg.room;
            ws.send(JSON.stringify({
                type: 'joined', id, code: msg.room,
                mode: room.mode, mapType: room.mapType,
                started: room.started,
                map: room.map, mapW: MAP_W, mapH: MAP_H,
                players: Array.from(room.players.values()).map(x => ({ id: x.id, name: x.name }))
            }));
            room.broadcast({ type: 'player_joined', id, name: p.name }, id);
            break;
        }

        case 'start': {
            const room = rooms.get(ws.roomCode); if (!room) return;
            if (room.startGame()) {
                room.broadcast({ type: 'game_started' });
                console.log(`[room ${room.code}] started`);
            }
            break;
        }

        case 'input': {
            const room = rooms.get(ws.roomCode); if (!room) return;
            if (!room.started) return;
            const p = room.players.get(ws.playerId);
            if (!p || p.dead) return;

            const bad = (typeof msg.x !== 'number' || typeof msg.y !== 'number' ||
                !isFinite(msg.x) || !isFinite(msg.y) ||
                room.isSolid(msg.x, msg.y));

            if (bad) {
                const safe = room.findOpenSpot();
                p.x = safe.x; p.y = safe.y;
                try { p.ws.send(JSON.stringify({ type: 'respawn', x: p.x, y: p.y })); } catch (e) {}
            } else {
                p.x = msg.x; p.y = msg.y;
            }
            p.dir = msg.dir;
            break;
        }

        case 'switch': {
            const room = rooms.get(ws.roomCode); if (!room) return;
            const p = room.players.get(ws.playerId); if (!p) return;
            if (WEAPON_ORDER.includes(msg.weapon) &&
                (msg.weapon === 'knife' || p.weapons[msg.weapon]))
                p.currentWeapon = msg.weapon;
            break;
        }

        case 'fire': {
            const room = rooms.get(ws.roomCode); if (!room) return;
            const p = room.players.get(ws.playerId);
            if (!p || p.dead) return;
            room.fireWeapon(p, msg.dx, msg.dy);
            break;
        }

        case 'pickup': {
            const room = rooms.get(ws.roomCode); if (!room) return;
            if (!room.started) return;
            const p = room.players.get(ws.playerId); if (!p) return;
            const l = room.loot.find(x => x.id === msg.id);
            if (!l || l.taken) return;
            // Радиус чуть больше клиентского (30), чтобы догон позиции не мешал.
            if (Math.hypot(l.x - p.x, l.y - p.y) > 45) return;

            l.taken = true;
            l.respawn = Date.now() + (l.temp ? 30000 : 12000);
            const now = Date.now() / 1000;
            let feedback = null;

            if (l.type === 'ammo') {
                p.ammo += 25; feedback = '+25 патронов';
            } else if (l.type === 'health') {
                p.hp = Math.min(p.maxHp, p.hp + 50); feedback = '+50 HP';
            } else if (l.type.startsWith('weapon_')) {
                const wName = l.type.substring(7);
                p.weapons[wName] = true;
                p.currentWeapon = wName;
                p.ammo += 25;
                feedback = 'ОРУЖИЕ: ' + (WEAPONS[wName]?.name || wName);
            } else if (l.type.startsWith('powerup_')) {
                const pu = l.type.substring(8);
                const cfg = POWERUPS[pu];
                if (pu === 'ammo')        { p.ammo += 25; feedback = '+25 патронов'; }
                else if (pu === 'health') { p.hp = Math.min(p.maxHp, p.hp + 50); feedback = '+50 HP'; }
                else if (cfg)             { p.effects[pu] = now + cfg.dur; feedback = cfg.icon + ' ' + cfg.label; }
            }

            try {
                p.ws.send(JSON.stringify({
                    type: 'pickup_done', feedback,
                    ammo: p.ammo, hp: p.hp, weapon: p.currentWeapon
                }));
            } catch (e) {}
            break;
        }

        case 'leave':
            leave(ws);
            break;
    }
}

setInterval(() => {
    for (const r of rooms.values()) {
        try { r.respawnLoop(); } catch (e) { console.error('respawn loop error', e); }
    }
}, 400);

module.exports = { handleConnection };