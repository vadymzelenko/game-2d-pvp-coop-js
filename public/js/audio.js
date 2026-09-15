let actx = null;

export function initAudio() {
    if (actx) return;
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
}

export function blip(freq, dur, vol, type) {
    if (!actx) return;
    const o = actx.createOscillator();
    o.type = type || 'square';
    o.frequency.value = freq;
    const g = actx.createGain();
    const t = actx.currentTime;
    g.gain.setValueAtTime(vol || 0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.08));
    o.connect(g);
    g.connect(actx.destination);
    o.start(t);
    o.stop(t + (dur || 0.08) + 0.02);
}

document.addEventListener('click', () => {
    initAudio();
    if (actx && actx.state === 'suspended') actx.resume();
}, { once: true });