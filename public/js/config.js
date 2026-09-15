export const TILE = 20;
export const MAP_W = 90, MAP_H = 60;

export const WEAPONS = {
    knife:   { name:'НОЖ',      melee:true, cd:0.4,   ammoCost:0, color:'#c8ccd2' },
    pistol:  { name:'ПИСТОЛЕТ', dmg:32, cd:0.30,  ammoCost:1, color:'#d4913f' },
    smg:     { name:'ПП',       dmg:16, cd:0.075, ammoCost:1, auto:true, color:'#8fb87a' },
    shotgun: { name:'ДРОБОВИК', dmg:20, cd:0.85,  ammoCost:1, color:'#c08858' },
    rifle:   { name:'ВИНТОВКА', dmg:65, cd:0.8,   ammoCost:1, color:'#a0a8b4' },
    rocket:  { name:'РАКЕТА',   dmg:85, cd:1.6,   ammoCost:1, color:'#c05555' },
    grenade: { name:'ГРАНАТА',  dmg:95, cd:1.4,   ammoCost:1, color:'#c0a355' }
};
export const WEAPON_ORDER = ['knife','pistol','smg','shotgun','rifle','rocket','grenade'];

export const POWERUP_INFO = {
    invisible: { color:'#6b8fc4', icon:'👁', label:'НЕВИДИМОСТЬ' },
    speed:     { color:'#5fa878', icon:'⚡', label:'СКОРОСТЬ' },
    shield:    { color:'#d4913f', icon:'◆', label:'ЩИТ' },
    damage:    { color:'#c05555', icon:'✦', label:'x2 УРОН' },
    ammo:      { color:'#d4913f', icon:'•', label:'ПАТРОНЫ' },
    health:    { color:'#c86060', icon:'✚', label:'АПТЕЧКА' },
    spawn:     { color:'#5fa878', icon:'🛡', label:'ЗАЩИТА' }
};

export const FOG_FADE_TIME = 8;
export const AIM_FIRE_THRESHOLD = 0.72;

export const REVEAL_TIME   = 2.5;
export const REVEAL_RADIUS = 360;