const TILE = 20;
const MAP_W = 90, MAP_H = 60;

const WEAPONS = {
    knife:   { name:'Нож',      melee:true, dmg:45, cd:0.4 },
    pistol:  { name:'Пистолет', dmg:32, speed:720,  cd:0.30,  life:0.75 },
    smg:     { name:'ПП',       dmg:16, speed:820,  cd:0.075, life:0.6,  spread:0.10, auto:true },
    shotgun: { name:'Дробовик', dmg:20, speed:600,  cd:0.85,  life:0.35, pellets:7, spread:0.32 },
    rifle:   { name:'Винтовка', dmg:65, speed:1050, cd:0.8,   life:0.9 },
    rocket:  { name:'Ракета',   dmg:85, speed:320,  cd:1.6,   life:3, homing:true, explode:75 },
    grenade: { name:'Граната',  dmg:95, speed:380,  cd:1.4,   life:1.5, explode:85, drag:0.98 }
};
const WEAPON_ORDER = ['knife','pistol','smg','shotgun','rifle','rocket','grenade'];

const POWERUPS = {
    invisible: { dur:5, color:'#8ac0ff', icon:'👁', label:'НЕВИДИМОСТЬ' },
    speed:     { dur:6, color:'#7ee0a0', icon:'⚡', label:'СКОРОСТЬ' },
    shield:    { dur:6, color:'#c8a860', icon:'◆', label:'ЩИТ' },
    damage:    { dur:8, color:'#e06060', icon:'✦', label:'x2 УРОН' }
};

const LOOT_WEAPONS = ['weapon_pistol','weapon_smg','weapon_shotgun','weapon_rifle','weapon_rocket','weapon_grenade'];
const LOOT_BASIC   = ['ammo','ammo','health','health'];
const KILL_DROPS   = ['invisible','speed','shield','damage','ammo','health'];

const SPAWN_PROTECT_SEC = 3.5;
const AUTO_MELEE_RANGE  = 24;
const AUTO_MELEE_CD     = 0.45;
const AUTO_MELEE_DMG    = 26;

const VIEW_RANGE      = 16 * TILE;
const VIEW_HALF_ANGLE = 0.65;
const VIEW_RADIUS     = 3;
const FOG_RAYS        = 40;

const VISIBILITY_HYSTERESIS = 0.4;

/* ==== ЗВУКОВАЯ ЗАСВЕТКА ====
   После выстрела игрок «слышен» соседям в течение REVEAL_TIME секунд,
   если они ближе REVEAL_RADIUS. Работает и через стены, и в невидимости. */
const REVEAL_TIME   = 2.5;
const REVEAL_RADIUS = 360;

module.exports = {
    TILE, MAP_W, MAP_H,
    WEAPONS, WEAPON_ORDER,
    POWERUPS, LOOT_WEAPONS, LOOT_BASIC, KILL_DROPS,
    SPAWN_PROTECT_SEC, AUTO_MELEE_RANGE, AUTO_MELEE_CD, AUTO_MELEE_DMG,
    VIEW_RANGE, VIEW_HALF_ANGLE, VIEW_RADIUS, FOG_RAYS,
    VISIBILITY_HYSTERESIS,
    REVEAL_TIME, REVEAL_RADIUS
};