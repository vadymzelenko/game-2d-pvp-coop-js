import { S } from './state.js';
import { WEAPONS, POWERUP_INFO } from './config.js';

export function $(id) { return document.getElementById(id); }

export function toast(txt) {
    const el = $('toast');
    el.textContent = txt;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => el.style.opacity = '0', 1800);
}

export function killfeed(txt) {
    const el = $('killfeed');
    const d = document.createElement('div');
    d.textContent = txt;
    el.appendChild(d);
    setTimeout(() => d.style.opacity = '0', 2500);
    setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 3000);
}

export function showErr(m) {
    const el = $('menuErr');
    el.textContent = m;
    setTimeout(() => el.textContent = '', 3000);
}

export function updateHUD() {
    const p = S.player;
    $('hpfill').style.width = Math.max(0, p.hp) + '%';
    $('hplbl').textContent = 'HP ' + Math.max(0, Math.round(p.hp));

    // Фоллбэк на пистолет: если оружие ещё не пришло в state, не показываем "—"
    const w = WEAPONS[p.weapon] || WEAPONS.pistol;
    $('weapon').textContent = w.name;
    $('ammo').textContent = (!w.melee) ? p.ammo : '∞';

    $('score').textContent = 'СЧЁТ: ' + p.score;
    $('kills').textContent = S.mode === 'pvp' ? 'ЦЕЛЬ: 8 УБИЙСТВ' : 'ВЫЖИВАНИЕ';

    const eff = $('effects');
    eff.innerHTML = '';
    for (const k in p.effects) {
        const t = p.effects[k];
        if (t > 0) {
            const info = POWERUP_INFO[k];
            if (!info) continue;
            const d = document.createElement('div');
            d.className = 'eff';
            d.innerHTML = `<span class="ic" style="color:${info.color}">${info.icon}</span>${info.label} <span class="tm">${t.toFixed(1)}s</span>`;
            eff.appendChild(d);
        }
    }
    $('spawnRing').classList.toggle('on', (p.effects.spawn || 0) > 0);
}

export function updateLobbyList(players) {
    $('lobbyPlayers').innerHTML = players.map(p => `<div class="p">· ${p.name}</div>`).join('');
}

export function onJoined(msg) {
    $('lobbyCode').textContent = msg.code;
    $('lobbyMode').textContent =
        (msg.mode === 'pvp' ? 'PVP · ДО 8 УБИЙСТВ' : 'CO-OP · ВЫЖИВАНИЕ') +
        ' · ' +
        ({ rooms:'СТАНЦИЯ', open:'АРЕНА', maze:'ЛАБИРИНТ' }[msg.mapType] || '');
    $('lobbyLink').textContent = `${location.origin}/  ·  код: ${msg.code}`;
    $('roomcode').textContent = 'КОМНАТА ' + msg.code;
    updateLobbyList(msg.players);

    if (msg.started) {
        $('menu').classList.add('hide');
        $('lobby').classList.add('hide');
        S.mode_ui = 'game';
        const me = S.players[S.myId];
        if (me) { S.player.x = me.x; S.player.y = me.y; }
    } else {
        $('menu').classList.add('hide');
        $('lobby').classList.remove('hide');
        S.mode_ui = 'lobby';
    }
}

export function onGameOver(msg) {
    $('gameover').classList.remove('hide');
    $('goTitle').textContent = msg.winner === S.myId ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
    $('goSub').textContent = `${msg.name} · ${msg.score} убийств`;
    S.mode_ui = 'lobby';
}

export function onGameStarted() {
    if (S.mode_ui === 'lobby') {
        $('lobby').classList.add('hide');
        $('menu').classList.add('hide');
        S.mode_ui = 'game';
        const me = S.players[S.myId];
        if (me) { S.player.x = me.x; S.player.y = me.y; }
        toast('ВЫ ПОД ЗАЩИТОЙ');
    }
}