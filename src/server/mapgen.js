const { MAP_W, MAP_H } = require('./constants');

function generateMap(type = 'rooms') {
    if (type === 'open') return generateOpen();
    if (type === 'maze') return generateMaze();
    return generateRooms();
}

function emptyMap() {
    const map = [];
    for (let y = 0; y < MAP_H; y++) map.push(new Array(MAP_W).fill('#'));
    return map;
}

/* ==== ОТКРЫТАЯ АРЕНА ==== */
function generateOpen() {
    const map = emptyMap();
    for (let y = 1; y < MAP_H - 1; y++)
        for (let x = 1; x < MAP_W - 1; x++)
            map[y][x] = '.';

    for (let i = 0; i < 90; i++) {
        const x = 3 + Math.floor(Math.random() * (MAP_W - 8));
        const y = 3 + Math.floor(Math.random() * (MAP_H - 8));
        const w = 1 + Math.floor(Math.random() * 4);
        const h = 1 + Math.floor(Math.random() * 4);
        for (let yy = y; yy < y + h && yy < MAP_H - 1; yy++)
            for (let xx = x; xx < x + w && xx < MAP_W - 1; xx++)
                map[yy][xx] = '#';
    }
    return { map: map.map(r => r.join('')), rooms: [] };
}

/* ==== ЛАБИРИНТ (recursive backtracker, ячейка 3x3) ==== */
function generateMaze() {
    const map = emptyMap();
    const cellW = 3;
    const cellsW = Math.floor((MAP_W - 2) / cellW);
    const cellsH = Math.floor((MAP_H - 2) / cellW);
    const visited = Array.from({ length: cellsH }, () => new Array(cellsW).fill(false));
    const stack = [[0, 0]];
    visited[0][0] = true;

    const carveCell = (cx, cy) => {
        const bx = 1 + cx * cellW, by = 1 + cy * cellW;
        for (let y = 0; y < cellW - 1 && by + y < MAP_H - 1; y++)
            for (let x = 0; x < cellW - 1 && bx + x < MAP_W - 1; x++)
                map[by + y][bx + x] = '.';
    };
    carveCell(0, 0);

    while (stack.length) {
        const [cx, cy] = stack[stack.length - 1];
        const nb = [];
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < cellsW && ny < cellsH && !visited[ny][nx])
                nb.push([nx, ny, dx, dy]);
        }
        if (!nb.length) { stack.pop(); continue; }

        const [nx, ny, dx, dy] = nb[Math.floor(Math.random() * nb.length)];
        visited[ny][nx] = true;
        const bx = 1 + cx * cellW, by = 1 + cy * cellW;
        if (dx === 1)       { for (let y = 0; y < cellW - 1; y++) map[by + y][bx + cellW - 1] = '.'; }
        else if (dx === -1) { for (let y = 0; y < cellW - 1; y++) map[by + y][bx - 1] = '.'; }
        else if (dy === 1)  { for (let x = 0; x < cellW - 1; x++) map[by + cellW - 1][bx + x] = '.'; }
        else                { for (let x = 0; x < cellW - 1; x++) map[by - 1][bx + x] = '.'; }
        carveCell(nx, ny);
        stack.push([nx, ny]);
    }

    // Пробить часть стен — избежать слишком унылых тупиков
    for (let i = 0; i < 180; i++) {
        const x = 1 + Math.floor(Math.random() * (MAP_W - 2));
        const y = 1 + Math.floor(Math.random() * (MAP_H - 2));
        if (map[y][x] === '#') map[y][x] = '.';
    }
    return { map: map.map(r => r.join('')), rooms: [] };
}

/* ==== СТАНЦИЯ (комнаты + коридоры) — оригинальный генератор ==== */
function generateRooms() {
    const map = emptyMap();
    const chunkW = 22, chunkH = 19;
    const cols = Math.floor((MAP_W - 2) / chunkW);
    const rows = Math.floor((MAP_H - 2) / chunkH);
    const roomList = [];

    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
        const padX = 1 + Math.floor(Math.random() * 2);
        const padY = 1 + Math.floor(Math.random() * 2);
        const rx = cx * chunkW + padX + 1;
        const ry = cy * chunkH + padY + 1;
        const rw = chunkW - padX * 2 - 1;
        const rh = chunkH - padY * 2 - 1;
        const rcx = rx + Math.floor(rw / 2);
        const rcy = ry + Math.floor(rh / 2);
        roomList.push({ x: rx, y: ry, w: rw, h: rh, cx: rcx, cy: rcy });

        for (let y = ry; y < ry + rh; y++)
            for (let x = rx; x < rx + rw; x++)
                if (x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1) map[y][x] = '.';

        const numPillars = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < numPillars; i++) {
            const px = rx + 2 + Math.floor(Math.random() * Math.max(1, rw - 4));
            const py = ry + 2 + Math.floor(Math.random() * Math.max(1, rh - 4));
            if (Math.abs(px - rcx) < 3 && Math.abs(py - rcy) < 3) continue;
            if (px <= 0 || py <= 0 || px >= MAP_W - 1 || py >= MAP_H - 1) continue;
            map[py][px] = '#';
            if (Math.random() < 0.35 && px + 1 < MAP_W - 1 && py + 1 < MAP_H - 1) {
                map[py][px + 1] = '#';
                map[py + 1][px] = '#';
                map[py + 1][px + 1] = '#';
            }
        }
    }

    for (let cy = 0; cy < rows; cy++) {
        const midY = Math.floor(cy * chunkH + chunkH / 2);
        for (let x = 1; x < MAP_W - 1; x++)
            for (let dy = -1; dy <= 1; dy++) {
                const y = midY + dy;
                if (y > 0 && y < MAP_H - 1) map[y][x] = '.';
            }
    }
    for (let cx = 0; cx < cols; cx++) {
        const midX = Math.floor(cx * chunkW + chunkW / 2);
        for (let y = 1; y < MAP_H - 1; y++)
            for (let dx = -1; dx <= 1; dx++) {
                const x = midX + dx;
                if (x > 0 && x < MAP_W - 1) map[y][x] = '.';
            }
    }
    return { map: map.map(r => r.join('')), rooms: roomList };
}

module.exports = { generateMap };