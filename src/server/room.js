const {
    TILE, MAP_W, MAP_H,
    WEAPONS, WEAPON_ORDER, POWERUPS,
    LOOT_WEAPONS, LOOT_BASIC, KILL_DROPS,
    SPAWN_PROTECT_SEC, AUTO_MELEE_RANGE, AUTO_MELEE_CD, AUTO_MELEE_DMG,
    VIEW_RANGE, VIEW_HALF_ANGLE, VIEW_RADIUS, FOG_RAYS,
    VISIBILITY_HYSTERESIS,
    REVEAL_TIME, REVEAL_RADIUS
} = require('./constants');
const { generateMap } = require('./mapgen');

let nextEntityId = 1;

function solid(map, x, y) {
    const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
    if (cx < 0 || cy < 0 || cx >= MAP_W || cy >= MAP_H) return true;
    return map[cy][cx] === '#';
}
function rayWall(map, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist / 10);
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const px = x0 + dx * t, py = y0 + dy * t;
        if (solid(map, px, py)) return { x: px, y: py, hit: true, dist: dist * t };
    }
    return { x: x1, y: y1, hit: false, dist };
}
function segCircleDist(x0, y0, x1, y1, cx, cy) {
    const dx = x1 - x0, dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot((x0 + dx * t) - cx, (y0 + dy * t) - cy);
}

class Room {
    constructor(code, mode, mapType, monstersEnabled = true) {
        this.code = code;
        this.mode = mode;
        this.mapType = mapType || 'rooms';
        this.monstersEnabled = monstersEnabled !== false;
        this.players = new Map();
        this.monsters = [];
        this.loot = [];
        this.projectiles = [];
        this.explosions = [];

        this.started = false;

        const data = generateMap(this.mapType);
        this.map = data.map;
        this.rooms = data.rooms;

        this._markers = new Int32Array(MAP_W * MAP_H);
        this._tickGen = 0;

        this.lastTick = Date.now();
        this.spawnLoot();
        if (this.monstersEnabled) this.spawnMonsters();
        this.interval = setInterval(() => this.tick(), 40);
    }

    /* ---------- Публичный помощник для ws.js ---------- */
    isSolid(x, y) {
        return solid(this.map, x, y);
    }

    /* ---------- Спавн ---------- */
    findOpenSpot() {
        for (let i = 0; i < 500; i++) {
            const x = (2 + Math.random() * (MAP_W - 4)) * TILE;
            const y = (2 + Math.random() * (MAP_H - 4)) * TILE;
            if (!solid(this.map, x, y)) return { x, y };
        }
        return { x: 3 * TILE, y: 3 * TILE };
    }
    findSafeSpawnSpot() {
        let best = null, bestD = -1;
        for (let i = 0; i < 40; i++) {
            const p = this.findOpenSpot();
            let nearest = 99999;
            for (const m of this.monsters) {
                const d = Math.hypot(m.x - p.x, m.y - p.y);
                if (d < nearest) nearest = d;
            }
            if (nearest > 160) return p;
            if (nearest > bestD) { bestD = nearest; best = p; }
        }
        return best || this.findOpenSpot();
    }
    spawnLoot() {
        for (let i = 0; i < 32; i++) {
            const p = this.findOpenSpot();
            const type = Math.random() < 0.32
                ? LOOT_WEAPONS[Math.floor(Math.random() * LOOT_WEAPONS.length)]
                : LOOT_BASIC[Math.floor(Math.random() * LOOT_BASIC.length)];
            this.loot.push({ id: 'l' + nextEntityId++, type, x: p.x, y: p.y, taken: false, respawn: 0 });
        }
    }
    spawnMonsters() {
        const count = this.mode === 'coop' ? 26 : 10;
        for (let i = 0; i < count; i++) {
            const p = this.findOpenSpot();
            this.monsters.push({
                id: 'm' + nextEntityId++, x: p.x, y: p.y,
                hp: 90, maxHp: 90, speed: 55 + Math.random() * 45,
                dmg: 12, wander: 0, wa: Math.random() * Math.PI * 2,
                hitT: 0, atk: 0, r: 8
            });
        }
    }
    dropPowerup(x, y) {
        const type = KILL_DROPS[Math.floor(Math.random() * KILL_DROPS.length)];
        this.loot.push({
            id: 'pu' + nextEntityId++, type: 'powerup_' + type,
            x, y, taken: false, respawn: 0, temp: true
        });
    }

    addPlayer(id, name, ws) {
        const p = this.findSafeSpawnSpot();
        const now = Date.now() / 1000;
        const pl = {
            id, name, ws, x: p.x, y: p.y, dir: 0,
            hp: 100, maxHp: 100,
            weapons: { pistol: true },
            currentWeapon: 'pistol',
            ammo: 30,
            score: 0, kills: 0, deaths: 0, dead: false,
            effects: { invisible: 0, speed: 0, shield: 0, damage: 0, spawn: now + SPAWN_PROTECT_SEC },
            cd: 0, respawnT: 0, autoMeleeCd: 0,
            _visCache: {},
            lastShotAt: 0
        };
        this.players.set(id, pl);
        return pl;
    }
    removePlayer(id) { this.players.delete(id); }

    startGame() {
        if (this.started) return false;
        this.started = true;
        const now = Date.now() / 1000;
        for (const p of this.players.values()) {
            p.effects.spawn = now + SPAWN_PROTECT_SEC;
        }
        return true;
    }

    /* ---------- Видимые тайлы ---------- */
    computeVisibleTiles(p) {
        const gen = ++this._tickGen;
        const marks = this._markers;
        const indices = [];
        const px = p.x, py = p.y;
        const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE);

        const R = VIEW_RADIUS;
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
            if (dx * dx + dy * dy > R * R + R) continue;
            const tx = cx + dx, ty = cy + dy;
            if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
            const idx = ty * MAP_W + tx;
            if (marks[idx] !== gen) { marks[idx] = gen; indices.push(idx); }
        }

        const half = VIEW_HALF_ANGLE;
        const range = VIEW_RANGE;
        const step = TILE;
        for (let i = 0; i <= FOG_RAYS; i++) {
            const a = p.dir - half + (2 * half) * (i / FOG_RAYS);
            const dx = Math.cos(a), dy = Math.sin(a);
            for (let r = 0; r <= range; r += step) {
                const x = px + dx * r, y = py + dy * r;
                const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
                if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) break;
                const idx = ty * MAP_W + tx;
                if (marks[idx] !== gen) { marks[idx] = gen; indices.push(idx); }
                if (this.map[ty][tx] === '#') break;
            }
        }
        return indices;
    }

    isVisibleTo(viewer, target) {
        const dx = target.x - viewer.x, dy = target.y - viewer.y;
        const dist = Math.hypot(dx, dy);
        if (dist > VIEW_RANGE) return false;
        if (dist > 80) {
            const angle = Math.atan2(dy, dx);
            let diff = angle - viewer.dir;
            while (diff >  Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            if (Math.abs(diff) > VIEW_HALF_ANGLE + 0.25) return false;
        }
        return !rayWall(this.map, viewer.x, viewer.y, target.x, target.y).hit;
    }

    /* ---------- Стрельба ---------- */
    fireWeapon(player, dirX, dirY) {
        if (!this.started) return;
        const now = Date.now() / 1000;
        if (player.cd > now) return;
        const wName = player.currentWeapon;
        const w = WEAPONS[wName];
        if (!w) return;

        player.lastShotAt = now;

        if (w.melee) {
            player.cd = now + w.cd;
            const hx = player.x + dirX * 22, hy = player.y + dirY * 22;
            for (const m of this.monsters)
                if (Math.hypot(m.x - hx, m.y - hy) < 26) {
                    m.hp -= this.calcDmg(player, w.dmg); m.hitT = 0.2;
                    if (m.hp <= 0) this.killMonster(m, player);
                }
            if (this.mode === 'pvp')
                for (const [id, p] of this.players) {
                    if (id === player.id || p.dead || p.effects.invisible > now) continue;
                    if (Math.hypot(p.x - hx, p.y - hy) < 26)
                        this.hurtPlayer(id, this.calcDmg(player, w.dmg), player.id);
                }
            this.broadcast({ type: 'melee', from: player.id, x: player.x, y: player.y, dx: dirX, dy: dirY });
            return;
        }
        if (player.ammo < 1) return;
        player.ammo--;
        player.cd = now + w.cd;

        const pellets = w.pellets || 1;
        const baseA = Math.atan2(dirY, dirX);
        for (let i = 0; i < pellets; i++) {
            const a = baseA + (Math.random() - 0.5) * (w.spread || 0) * 2;
            this.projectiles.push({
                id: 'pr' + nextEntityId++,
                x: player.x + Math.cos(a) * 18,
                y: player.y + Math.sin(a) * 18,
                vx: Math.cos(a) * w.speed,
                vy: Math.sin(a) * w.speed,
                dmg: this.calcDmg(player, w.dmg),
                owner: player.id, weapon: wName,
                life: w.life, maxLife: w.life,
                homing: w.homing, explode: w.explode, drag: w.drag || 1
            });
        }
        this.broadcast({ type: 'shot', from: player.id, weapon: wName, x: player.x, y: player.y });
    }
    calcDmg(player, base) {
        return player.effects.damage > Date.now() / 1000 ? base * 2 : base;
    }
    killMonster(m, killer) {
        this.monsters = this.monsters.filter(x => x !== m);
        if (killer) killer.score++;
        this.dropPowerup(m.x, m.y);
        if (!this.monstersEnabled) return;
        setTimeout(() => {
            if (!this.monstersEnabled || !this.started) return;
            if (!this.players.size) return;
            const p = this.findOpenSpot();
            this.monsters.push({
                id: 'm' + nextEntityId++, x: p.x, y: p.y,
                hp: 90, maxHp: 90, speed: 55 + Math.random() * 45,
                dmg: 12, wander: 0, wa: Math.random() * Math.PI * 2,
                hitT: 0, atk: 0, r: 8
            });
        }, 6000);
    }
    explodeAt(x, y, radius, dmg, ownerId) {
        this.explosions.push({ x, y, r: 4, maxR: radius, life: 0.4, maxLife: 0.4 });
        for (const m of this.monsters) {
            const d = Math.hypot(m.x - x, m.y - y);
            if (d < radius) {
                m.hp -= dmg * (1 - d / radius);
                m.hitT = 0.2;
                if (m.hp <= 0) this.killMonster(m, ownerId ? this.players.get(ownerId) : null);
            }
        }
        for (const [id, p] of this.players) {
            if (id === ownerId || p.dead) continue;
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < radius) this.hurtPlayer(id, dmg * (1 - d / radius), ownerId);
        }
    }
    hurtPlayer(id, dmg, srcId) {
        const p = this.players.get(id);
        if (!p || p.dead) return;
        const now = Date.now() / 1000;
        if (p.effects.spawn > now) return;
        if (p.effects.shield > now) dmg *= 0.5;
        p.hp -= dmg;
        if (p.hp <= 0) {
            p.hp = 0; p.dead = true; p.deaths++; p.respawnT = now + 3;
            this.dropPowerup(p.x, p.y);
            if (srcId && srcId !== 'monster') {
                const k = this.players.get(srcId);
                if (k) { k.score++; k.kills++; }
            }
            this.broadcast({ type: 'death', id, killer: srcId });
            this.checkWin();
        }
    }
    checkWin() {
        if (this.mode !== 'pvp') return;
        for (const p of this.players.values()) {
            if (p.score >= 8) {
                this.broadcast({ type: 'gameover', winner: p.id, name: p.name, score: p.score });
                setTimeout(() => {
                    for (const pp of this.players.values()) { pp.score = 0; pp.kills = 0; }
                    this.broadcast({ type: 'reset' });
                }, 5000);
                return;
            }
        }
    }

    respawnLoop() {
        if (!this.started) return;
        const now = Date.now() / 1000;
        for (const p of this.players.values()) {
            if (p.dead && p.respawnT < now) {
                const pos = this.findSafeSpawnSpot();
                p.x = pos.x; p.y = pos.y;
                p.hp = p.maxHp;
                p.dead = false;
                p.ammo = 30;
                p.weapons = { pistol: true };
                p.currentWeapon = 'pistol';
                p.effects = { invisible: 0, speed: 0, shield: 0, damage: 0, spawn: now + SPAWN_PROTECT_SEC };
                p.autoMeleeCd = 0;
                p._visCache = {};
                p.lastShotAt = 0;
                try { p.ws.send(JSON.stringify({ type: 'respawn', x: p.x, y: p.y })); } catch (e) {}
            }
        }
    }

    broadcast(msg, except) {
        const data = JSON.stringify(msg);
        for (const [pid, p] of this.players) {
            if (pid === except) continue;
            if (p.ws.readyState === 1) try { p.ws.send(data); } catch (e) {}
        }
    }

    /* ---------- Главный тик ---------- */
    tick() {
        if (!this.started) return;

        const now = Date.now() / 1000;
        const dt = Math.min(0.1, (Date.now() - this.lastTick) / 1000);
        this.lastTick = Date.now();

        for (const p of this.players.values())
            for (const k in p.effects) if (p.effects[k] < now) p.effects[k] = 0;

        // --- Монстры ---
        for (const m of this.monsters) {
            if (m.hitT > 0) m.hitT -= dt;
            let target = null, td = 99999;
            for (const p of this.players.values()) {
                if (p.dead || p.effects.invisible > now || p.effects.spawn > now) continue;
                const d = Math.hypot(p.x - m.x, p.y - m.y);
                if (d < td && d < 340) { td = d; target = p; }
            }
            let vx = 0, vy = 0;
            if (target) { vx = (target.x - m.x) / td * m.speed; vy = (target.y - m.y) / td * m.speed; }
            else {
                m.wander -= dt;
                if (m.wander <= 0) { m.wander = 1 + Math.random() * 2; m.wa = Math.random() * Math.PI * 2; }
                vx = Math.cos(m.wa) * m.speed * 0.4;
                vy = Math.sin(m.wa) * m.speed * 0.4;
            }
            const nx = m.x + vx * dt;
            if (!solid(this.map, nx, m.y)) m.x = nx;
            const ny = m.y + vy * dt;
            if (!solid(this.map, m.x, ny)) m.y = ny;
            if (target && td < 20 && now - m.atk > 1) { m.atk = now; this.hurtPlayer(target.id, m.dmg, 'monster'); }
        }

        // --- Авто-нож ---
        for (const p of this.players.values()) {
            if (p.dead || p.effects.spawn > now || p.autoMeleeCd > now) continue;
            let nearest = null, nd = AUTO_MELEE_RANGE;
            for (const m of this.monsters) {
                const d = Math.hypot(m.x - p.x, m.y - p.y);
                if (d < nd) { nd = d; nearest = m; }
            }
            if (nearest) {
                p.autoMeleeCd = now + AUTO_MELEE_CD;
                nearest.hp -= this.calcDmg(p, AUTO_MELEE_DMG);
                nearest.hitT = 0.2;
                this.broadcast({ type: 'automelee', from: p.id, x: p.x, y: p.y, tx: nearest.x, ty: nearest.y });
                if (nearest.hp <= 0) this.killMonster(nearest, p);
            }
        }

        // --- Снаряды ---
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const pr = this.projectiles[i];
            if (pr.homing) {
                let best = null, bd = 400;
                for (const m of this.monsters) {
                    const d = Math.hypot(m.x - pr.x, m.y - pr.y);
                    if (d < bd) { bd = d; best = m; }
                }
                if (this.mode === 'pvp')
                    for (const [id, p] of this.players) {
                        if (id === pr.owner || p.dead) continue;
                        const d = Math.hypot(p.x - pr.x, p.y - pr.y);
                        if (d < bd) { bd = d; best = p; }
                    }
                if (best) {
                    const tx = best.x - pr.x, ty = best.y - pr.y;
                    const tl = Math.hypot(tx, ty) || 1;
                    const sp = Math.hypot(pr.vx, pr.vy) || 1;
                    pr.vx = (pr.vx / sp * 0.85 + tx / tl * 0.15) * sp;
                    pr.vy = (pr.vy / sp * 0.85 + ty / tl * 0.15) * sp;
                }
            }
            const stepX = pr.vx * dt, stepY = pr.vy * dt;
            const x0 = pr.x, y0 = pr.y, x1 = pr.x + stepX, y1 = pr.y + stepY;
            const hit = rayWall(this.map, x0, y0, x1, y1);
            const travelX = hit.hit ? hit.x : x1, travelY = hit.hit ? hit.y : y1;

            let removed = false;
            let bestM = null, bestMd = Infinity;
            for (const m of this.monsters) {
                const d = segCircleDist(x0, y0, travelX, travelY, m.x, m.y);
                if (d < m.r + 3 && d < bestMd) { bestMd = d; bestM = m; }
            }
            let bestP = null, bestPd = Infinity;
            if (this.mode === 'pvp')
                for (const [id, p] of this.players) {
                    if (id === pr.owner || p.dead) continue;
                    if (p.effects.invisible > now || p.effects.spawn > now) continue;
                    const d = segCircleDist(x0, y0, travelX, travelY, p.x, p.y);
                    if (d < 12 && d < bestPd) { bestPd = d; bestP = p; }
                }

            if (bestM || bestP) {
                const hitMonster = bestM && (!bestP ||
                    Math.hypot(bestM.x - x0, bestM.y - y0) <= Math.hypot(bestP.x - x0, bestP.y - y0));
                if (hitMonster) {
                    if (pr.explode) this.explodeAt(bestM.x, bestM.y, pr.explode, pr.dmg, pr.owner);
                    else {
                        bestM.hp -= pr.dmg; bestM.hitT = 0.2;
                        if (bestM.hp <= 0) this.killMonster(bestM, this.players.get(pr.owner));
                    }
                } else {
                    if (pr.explode) this.explodeAt(bestP.x, bestP.y, pr.explode, pr.dmg, pr.owner);
                    else this.hurtPlayer(bestP.id, pr.dmg, pr.owner);
                }
                this.projectiles.splice(i, 1);
                removed = true;
            }
            if (removed) continue;

            if (hit.hit) {
                if (pr.explode) this.explodeAt(hit.x, hit.y, pr.explode, pr.dmg, pr.owner);
                this.projectiles.splice(i, 1);
                continue;
            }
            pr.x = x1; pr.y = y1;
            if (pr.drag && pr.drag !== 1) { pr.vx *= pr.drag; pr.vy *= pr.drag; }
            pr.life -= dt;
            if (pr.life <= 0) {
                if (pr.explode) this.explodeAt(pr.x, pr.y, pr.explode, pr.dmg, pr.owner);
                this.projectiles.splice(i, 1);
            }
        }

        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const e = this.explosions[i];
            e.life -= dt;
            if (e.life <= 0) this.explosions.splice(i, 1);
        }
        for (const l of this.loot) if (l.taken && now * 1000 > l.respawn) l.taken = false;

        // --- Видимые тайлы ---
        const perPlayerVisible = new Map();
        if (this.mode === 'coop') {
            const combined = new Set();
            for (const [, p] of this.players) {
                if (p.dead) continue;
                for (const t of this.computeVisibleTiles(p)) combined.add(t);
            }
            const arr = Array.from(combined);
            for (const [id] of this.players) perPlayerVisible.set(id, arr);
        } else {
            for (const [id, p] of this.players) {
                if (p.dead) { perPlayerVisible.set(id, []); continue; }
                perPlayerVisible.set(id, this.computeVisibleTiles(p));
            }
        }

        // --- Общая часть state ---
        const monstersArr = [];
        for (const m of this.monsters)
            monstersArr.push({ id: m.id, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp, hitT: m.hitT });

        const lootArr = [];
        for (const l of this.loot)
            if (!l.taken) lootArr.push({ id: l.id, x: l.x, y: l.y, type: l.type });

        const projArr = [];
        for (const pr of this.projectiles)
            projArr.push({ id: pr.id, x: pr.x, y: pr.y, weapon: pr.weapon });

        const explArr = [];
        for (const e of this.explosions)
            explArr.push({ x: e.x, y: e.y, r: e.maxR * (1 - e.life / e.maxLife) });

        const serializedPlayers = {};
        for (const [pid, p] of this.players) {
            serializedPlayers[pid] = {
                id: pid, name: p.name, x: p.x, y: p.y, dir: p.dir,
                hp: p.hp, dead: p.dead, score: p.score, kills: p.kills,
                weapon: p.currentWeapon, ammo: p.ammo, weapons: p.weapons,
                effects: {
                    invisible: Math.max(0, p.effects.invisible - now),
                    speed:     Math.max(0, p.effects.speed     - now),
                    shield:    Math.max(0, p.effects.shield    - now),
                    damage:    Math.max(0, p.effects.damage    - now),
                    spawn:     Math.max(0, (p.effects.spawn || 0) - now)
                }
            };
        }

        for (const [pid, p] of this.players) {
            if (p.ws.readyState !== 1) continue;
            const personalState = {
                type: 'state',
                players: {},
                monsters: monstersArr,
                loot: lootArr,
                projectiles: projArr,
                explosions: explArr,
                visible: perPlayerVisible.get(pid) || []
            };
            for (const [oid, op] of this.players) {
                if (oid === pid) { personalState.players[oid] = serializedPlayers[oid]; continue; }
                if (this.mode === 'coop') { personalState.players[oid] = serializedPlayers[oid]; continue; }

                const dead = op.dead;
                const invisible = (op.effects.invisible > now) && !dead;
                const visibleBySight = !dead && !invisible && this.isVisibleTo(p, op);

                if (visibleBySight) p._visCache[oid] = now + VISIBILITY_HYSTERESIS;
                const inCache = !dead && !invisible && now < (p._visCache[oid] || 0);

                const revealedBySound = !dead
                    && (now - (op.lastShotAt || 0)) < REVEAL_TIME
                    && Math.hypot(op.x - p.x, op.y - p.y) < REVEAL_RADIUS;

                if (visibleBySight || inCache) {
                    personalState.players[oid] = serializedPlayers[oid];
                } else if (revealedBySound) {
                    personalState.players[oid] = Object.assign({}, serializedPlayers[oid], { revealed: true });
                }
            }
            try { p.ws.send(JSON.stringify(personalState)); } catch (e) {}
        }
    }
}

module.exports = { Room };