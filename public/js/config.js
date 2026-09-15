export const TILE = 20;
export const MAP_W = 90, MAP_H = 60;

export const WEAPONS = {
    knife:   { name:'НОЖ',      melee:true, cd:0.4, ammoCost:0, color:'#e0d0ff' },
    pistol:  { name:'ПИСТОЛЕТ', dmg:32, cd:0.30,  ammoCost:1, color:'#ffd060' },
    smg:     { name:'ПП',       dmg:16, cd:0.075, ammoCost:1, auto:true, color:'#7effb0' },
    shotgun: { name:'ДРОБОВИК', dmg:20, cd:0.85,  ammoCost:1, color:'#ffa040' },
    rifle:   { name:'ВИНТОВКА', dmg:65, cd:0.8,   ammoCost:1, color:'#c080ff' },
    rocket:  { name:'РАКЕТА',   dmg:85, cd:1.6,   ammoCost:1, color:'#ff6060' },
    grenade: { name:'ГРАНАТА',  dmg:95, cd:1.4,   ammoCost:1, color:'#ffe040' }
};
export const WEAPON_ORDER = ['knife','pistol','smg','shotgun','rifle','rocket','grenade'];

export const POWERUP_INFO = {
    invisible: { color:'#8ac0ff', icon:'👁', label:'НЕВИДИМОСТЬ' },
    speed:     { color:'#7effb0', icon:'⚡', label:'СКОРОСТЬ' },
    shield:    { color:'#ffd060', icon:'◆', label:'ЩИТ' },
    damage:    { color:'#ff6060', icon:'✦', label:'x2 УРОН' },
    ammo:      { color:'#ffd060', icon:'•', label:'ПАТРОНЫ' },
    health:    { color:'#ff6080', icon:'✚', label:'АПТЕЧКА' },
    spawn:     { color:'#7effb0', icon:'🛡', label:'ЗАЩИТА' }
};

export const FOG_FADE_TIME = 8;