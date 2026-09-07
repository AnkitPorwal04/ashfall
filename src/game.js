import { Arena, CHARACTERS, UPGRADES, TAU, seededRandom } from './engine.js';

const $ = id => document.getElementById(id);
const canvas = $('arena'), ctx = canvas.getContext('2d', { alpha: false });
let width = innerWidth, height = innerHeight, dpr = 1, scale = 1;
let game = null, selected = 'warden', previous = performance.now(), visualTime = 0, hudTick = 0;
let lastState = 'menu', announcementTime = 0, shake = 0, audio = null, muted = true, lastSound = 0;
const keys = new Set(), touch = { x: 0, y: 0 }, camera = { x: 0, y: 0 };
let joystickPointer = null;
const sprites = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const timeText = seconds => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

function resize() {
  width = innerWidth; height = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  scale = width < 600 ? .8 : 1.15;
  if (game) game.viewRadius = Math.hypot(width, height) / (2 * scale) + 35;
}
addEventListener('resize', resize); resize();

function readBest() {
  try { const record = JSON.parse(localStorage.getItem('ashfall-best') || 'null'); return record && Number.isFinite(record.kills) && Number.isFinite(record.time) ? record : null; } catch { return null; }
}
function showBest() { const best = readBest(); $('best').textContent = best ? `${timeText(best.time)} / ${best.kills.toLocaleString()} SOULS` : 'NO VIGILS RECORDED'; }
showBest();

function tone(freq, duration = .08, type = 'sine', volume = .03, end = freq / 2) {
  if (muted || !audio) return;
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type = type; oscillator.frequency.setValueAtTime(freq, audio.currentTime); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), audio.currentTime + duration);
  gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
  oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + duration);
}
function initAudio() {
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume().catch(() => {}); } catch { muted = true; }
}
$('sound').onclick = () => { muted = !muted; if (!muted) initAudio(); $('sound').innerHTML = `♪ <span>${muted ? 'OFF' : 'ON'}</span>`; $('sound').setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound'); tone(440, .12); };
$('fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { announce('Fullscreen is not available in this browser.'); } };

for (const button of document.querySelectorAll('[data-character]')) button.onclick = () => {
  selected = button.dataset.character;
  for (const b of document.querySelectorAll('[data-character]')) { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); }
};

function clearInput() { keys.clear(); touch.x = 0; touch.y = 0; joystickPointer = null; $('joystick').firstElementChild.style.transform = ''; }
function start() {
  game = new Arena(selected); camera.x = 0; camera.y = 0; clearInput(); resize();
  for (let i = 0; i < 15; i++) {
    const e = game.spawn(i % 4 === 0 ? 'bat' : 'ghoul');
    const angle = i / 15 * TAU; e.x = Math.cos(angle) * (350 + i * 20); e.y = Math.sin(angle) * (350 + i * 20);
  }
  document.body.classList.add('playing'); $('menu').hidden = true; $('hud').hidden = false;
  $('end').hidden = true; $('pause-screen').hidden = true; $('upgrade').hidden = true;
  $('hero-name').textContent = CHARACTERS[selected].name.toUpperCase();
  lastState = 'playing'; hudTick = 0; initAudio(); updateHud(); announce('KEEP YOUR LIGHT ALIVE');
  document.activeElement?.blur();
}
$('start').onclick = start; $('retry').onclick = start;
$('back').onclick = () => { game = null; lastState = 'menu'; document.body.classList.remove('playing'); $('menu').hidden = false; $('end').hidden = true; $('hud').hidden = true; showBest(); $('start').focus(); };
function pause() { if (game?.state === 'playing') { game.pause(); clearInput(); updateHud(); syncState(); } }
function resume() { game?.resume(); clearInput(); syncState(); }
$('pause').onclick = pause; $('resume').onclick = resume;
$('abandon').onclick = () => { if (game) { game.state = 'dead'; syncState(); } };
$('touch-dash').onclick = () => game?.dash();
$('reroll').onclick = () => { if (game?.reroll()) showChoices(); };

addEventListener('keydown', event => {
  if (!game) return;
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
  if (!event.repeat && (key === 'escape' || key === 'p')) { if (game.state === 'paused') resume(); else pause(); return; }
  if (game.state === 'upgrade' && ['1', '2', '3'].includes(key)) { selectUpgrade(Number(key) - 1); return; }
  if (game.state === 'playing') { keys.add(key); if (key === ' ' && !event.repeat) game.dash(); }
  // Keep keyboard focus within the active modal.
  if (key === 'tab') {
    const modal = document.querySelector('.overlay:not([hidden])');
    if (!modal) return;
    const buttons = [...modal.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { clearInput(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); pause(); } });
const joystick = $('joystick');
joystick.addEventListener('pointerdown', e => { if (joystickPointer !== null) return; joystickPointer = e.pointerId; joystick.setPointerCapture(e.pointerId); moveJoystick(e); });
joystick.addEventListener('pointermove', e => { if (joystickPointer === e.pointerId) moveJoystick(e); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) joystick.addEventListener(name, e => { if (joystickPointer === e.pointerId) clearInput(); });
function moveJoystick(e) {
  const rect = joystick.getBoundingClientRect(); let x = e.clientX - rect.left - rect.width / 2, y = e.clientY - rect.top - rect.height / 2;
  const distance = Math.hypot(x, y); if (distance > 34) { x = x / distance * 34; y = y / distance * 34; }
  touch.x = x / 34; touch.y = y / 34; joystick.firstElementChild.style.transform = `translate(${x}px, ${y}px)`;
}

function announce(message) { $('announcement').textContent = message; $('announcement').classList.add('show'); announcementTime = 3.5; }
function selectUpgrade(index) { const key = game?.choices[index]; if (key && game.choose(key)) { tone(660, .2, 'sine', .06, 1100); clearInput(); showChoices(); syncState(); updateHud(); } }
function showChoices() {
  $('choices').replaceChildren();
  if (!game || game.state !== 'upgrade') return;
  for (const [index, key] of game.choices.entries()) {
    const data = UPGRADES[key], rank = game.ranks[key] || 0, button = document.createElement('button');
    button.className = 'choice';
    button.innerHTML = `<span class="choice-top"><span>${data.type} ${rank ? '/ RANK ' + (rank + 1) : '/ NEW'}</span><span>0${index + 1}</span></span><span class="choice-icon">${data.icon}</span><strong>${data.name}</strong><p>${data.description}</p>${data.pair ? `<span class="synergy">${data.type === 'WEAPON' ? 'EVOLVES WITH' : 'EMPOWERS'} ${UPGRADES[data.pair].name.toUpperCase()}</span>` : ''}`;
    button.onclick = () => selectUpgrade(index); $('choices').append(button);
  }
  $('reroll').disabled = game.rerolls <= 0; $('reroll').innerHTML = `↻ REROLL <span>${game.rerolls} LEFT</span>`;
  $('choices').firstElementChild?.focus();
}
function syncState() {
  if (!game || game.state === lastState) return;
  lastState = game.state;
  $('upgrade').hidden = game.state !== 'upgrade'; $('pause-screen').hidden = game.state !== 'paused';
  if (game.state === 'upgrade') { clearInput(); showChoices(); }
  if (game.state === 'paused') $('resume').focus();
  if (game.state === 'won' || game.state === 'dead') {
    clearInput(); $('end').hidden = false;
    const won = game.state === 'won';
    $('end-title').innerHTML = won ? 'The night ends.<br><em>You do not.</em>' : 'Not every light<br><em>sees the dawn.</em>';
    $('end-eyebrow').textContent = won ? 'DAWN BELONGS TO THE LIVING' : 'THE HOLLOW REMEMBERS';
    $('end-copy').textContent = won ? 'The Sovereign is ash. The hollow is quiet. For now.' : 'But for a moment, yours burned beautifully.';
    $('end-stats').innerHTML = `<div><strong>${timeText(game.time)}</strong><small>SURVIVED</small></div><div><strong>${game.kills.toLocaleString()}</strong><small>SOULS RELEASED</small></div><div><strong>${game.level}</strong><small>LEVEL REACHED</small></div>`;
    const best = readBest();
    if (!best || game.kills > best.kills || (game.kills === best.kills && game.time > best.time)) { try { localStorage.setItem('ashfall-best', JSON.stringify({ time: game.time, kills: game.kills })); } catch { /* Storage can be unavailable in private browsing. */ } }
    $('retry').focus(); tone(won ? 600 : 140, 1, 'triangle', .08, won ? 900 : 35);
  }
}

function updateHud() {
  if (!game) return;
  $('level').textContent = `LV. ${String(game.level).padStart(2, '0')}`; $('xp-fill').style.width = `${Math.min(100, game.xp / game.nextXp * 100)}%`;
  $('health-text').textContent = `${Math.ceil(game.player.hp)} / ${game.player.maxHp}`; $('health-fill').style.width = `${game.player.hp / game.player.maxHp * 100}%`;
  $('clock').textContent = timeText(game.time); $('kills').textContent = game.kills.toLocaleString();
  $('phase').textContent = game.time >= 300 && !game.bossDead ? 'DEFEAT THE SOVEREIGN' : ['THE HOLLOW STIRS', 'THE GRAVES ARE OPEN', 'THE HOLLOW HUNGERS', 'THE LAST VIGIL', 'DAWN IS COMING'][Math.min(4, Math.floor(game.time / 60))];
  $('dash-status').textContent = game.player.dashCooldown > 0 ? `${game.player.dashCooldown.toFixed(1)}s` : 'READY';
  $('touch-dash').style.opacity = game.player.dashCooldown > 0 ? '.45' : '1';
  const weaponKeys = Object.keys(game.ranks).filter(k => UPGRADES[k].type === 'WEAPON');
  const signature = weaponKeys.map(k => `${k}:${game.ranks[k]}:${game.evolved.has(k)}`).join(',');
  if ($('weapons').dataset.signature !== signature) {
    $('weapons').dataset.signature = signature;
    $('weapons').innerHTML = weaponKeys.map(k => `<div class="weapon-slot ${game.evolved.has(k) ? 'evolved' : ''}" title="${game.evolved.has(k) ? UPGRADES[k].evolution : UPGRADES[k].name} - Rank ${game.ranks[k]}"><span>${UPGRADES[k].icon}</span><small>${game.evolved.has(k) ? '★' : game.ranks[k]}</small></div>`).join('') + '<div class="weapon-slot empty">·</div>'.repeat(5 - weaponKeys.length);
  }
  const boss = game.enemies.find(e => e.kind === 'boss'); $('boss-bar').hidden = !boss;
  if (boss) { $('boss-fill').style.width = `${boss.hp / boss.maxHp * 100}%`; $('boss-health').textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`; }
}

const palettes = {
  warden: { a: '#262626', b: '#5d5045', c: '#baa47f', d: '#d5bd9a', e: '#883d36', f: '#bb6150', g: '#f8d290', h: '#384342' },
  witch: { a: '#151e23', b: '#344341', c: '#6b9c81', d: '#b0c7ad', e: '#354d46', f: '#527b64', g: '#bbefcd', h: '#282e39' },
  rogue: { a: '#171e25', b: '#344854', c: '#8ca1b1', d: '#cbd5c5', e: '#334859', f: '#527287', g: '#deebd7', h: '#222f33' },
  ghoul: { a: '#18241d', b: '#3d4e36', c: '#6a7852', d: '#8d906c', e: '#263c2c', f: '#536048', g: '#d1c28a', h: '#1d2a20' },
  skeleton: { a: '#242b24', b: '#727563', c: '#b1b29b', d: '#d5d0b2', e: '#34392f', f: '#858875', g: '#e3aa67', h: '#33392e' },
  elite: { a: '#24251f', b: '#565340', c: '#92906b', d: '#bcbc8f', e: '#534131', f: '#806742', g: '#f2b95f', h: '#343c2b' },
  brute: { a: '#202920', b: '#47523d', c: '#788064', d: '#9b9c77', e: '#4c392c', f: '#6d5140', g: '#cfb077', h: '#2d392b' },
  boss: { a: '#101b1c', b: '#2b3834', c: '#788c7a', d: '#d5dcc5', e: '#233a33', f: '#3d594b', g: '#d9f6cf', h: '#1c2d27' },
};
const heroPattern = [
  '      aaaa      ', '     abccba     ', '     bddddb     ', '     bdadab     ', '      dddd      ', '    eeccccee    ', '   effeeefffe   ', '  eeffeceeffee  ', '  deffeceeffed  ', '  daffeceeffad  ', '   aeeeheeea    ', '   abbhhbba     ', '   abbhhbba     ', '   abh  hba     ', '   abh  hba     ', '  aahh  hhaa    ',
];
const enemyPattern = [
  '      aaaa      ', '     abccba     ', '    abddddba    ', '    acgaagca    ', '     cdbbdc     ', '      bddb      ', '    abccccba    ', '   abccbbccba   ', '  abcbbccbbcba  ', '  dcb bccb bcd  ', '  db  bccb  bd  ', '      beeb      ', '     bbeebb     ', '     bc  cb     ', '    abc  cba    ', '    ahh  hha    ',
];
const bossPattern = [
  '   g   gg   g   ', '   bg bggb gb   ', '    bcddddcb    ', '     daddad     ', '     daddad     ', '      dddd      ', '    bbddddbb    ', '   bcceeecccb   ', '  bcceeeecccb   ', ' bccceeecccccb  ', ' bccceeecccccb  ', ' accceeeccccca  ', '  bcceeeecccb   ', '  bcceeeecccb   ', '  bcceeeecccb   ', ' bccceeeeccccb  ', ' bcccceeeccccb  ', 'acccceeeeccccca ', ' abcccbbcccba   ',
];
function sprite(kind, frame = 0) {
  const key = `${kind}:${frame}`; if (sprites.has(key)) return sprites.get(key);
  const image = document.createElement('canvas'); image.width = 48; image.height = 60; const c = image.getContext('2d');
  const palette = palettes[kind] || palettes.ghoul; const pattern = kind === 'boss' ? bossPattern : CHARACTERS[kind] ? heroPattern : enemyPattern;
  for (let y = 0; y < pattern.length; y++) for (let x = 0; x < pattern[y].length; x++) {
    const color = palette[pattern[y][x]]; if (!color) continue;
    const offset = y > 11 && kind !== 'boss' ? (x < 8 ? frame : -frame) : 0;
    c.fillStyle = color; c.fillRect(x * 3, y * 3 + offset, 3, 3);
  }
  sprites.set(key, image); return image;
}

function ellipse(x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); }
function line(x1, y1, x2, y2, color, thickness = 1) { ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function glow(x, y, radius, color) { const g = ctx.createRadialGradient(x, y, 0, x, y, radius); g.addColorStop(0, color); g.addColorStop(1, 'transparent'); ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2); }
function hash(x, y) { return seededRandom(Math.imul(x, 374761393) ^ Math.imul(y, 668265263))(); }

function ground() {
  const left = camera.x - width / scale / 2 - 120, right = camera.x + width / scale / 2 + 120;
  const top = camera.y - height / scale / 2 - 160, bottom = camera.y + height / scale / 2 + 160;
  ctx.fillStyle = '#18251e'; ctx.fillRect(left, top, right - left, bottom - top);
  // Deterministic world cells keep scenery stable as the camera follows the player.
  for (let gx = Math.floor(left / 96); gx <= Math.ceil(right / 96); gx++) for (let gy = Math.floor(top / 96); gy <= Math.ceil(bottom / 96); gy++) {
    const r = hash(gx, gy), x = gx * 96, y = gy * 96;
    ctx.fillStyle = r > .6 ? '#1d2a21' : '#1a271f'; ctx.fillRect(x + 1, y + 1, 94, 94);
    for (let i = 0; i < 7; i++) {
      const a = hash(gx * 11 + i, gy * 7), b = hash(gx * 13, gy * 19 + i);
      ctx.fillStyle = i % 2 ? '#2b39275c' : '#0f1e1666'; ctx.fillRect(x + a * 92, y + b * 92, 2 + a * 12, 2);
      if (a > .55) { line(x + a * 92, y + b * 92, x + a * 92 - 3, y + b * 92 - 5, '#35452c80'); line(x + a * 92, y + b * 92, x + a * 92 + 3, y + b * 92 - 7, '#35452c80'); }
    }
    if (Math.abs(gy) <= 1 || Math.abs(gx) <= 1) {
      ctx.fillStyle = '#293129'; ctx.fillRect(x + 4, y + 4, 86, 87);
      ctx.fillStyle = '#32392e'; ctx.fillRect(x + 6, y + 6, 40, 38); ctx.fillRect(x + 49, y + 48, 40, 41);
      ctx.strokeStyle = '#17251d'; ctx.lineWidth = 2; ctx.strokeRect(x + 4, y + 4, 86, 87);
      line(x + 48, y + 4, x + 44, y + 91, '#19291f'); line(x + 4, y + 45, x + 91, y + 47, '#19291f');
      if (r > .5) { line(x + 14, y + 9, x + 29, y + 25, '#19271e'); line(x + 29, y + 25, x + 26, y + 45, '#19271e'); }
    }
  }
  ctx.strokeStyle = '#62714a45'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 182, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 172, 0, TAU); ctx.stroke();
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; line(Math.cos(a) * 152, Math.sin(a) * 152, Math.cos(a) * 165, Math.sin(a) * 165, '#84916255', 3); }
  ctx.save(); ctx.translate(0, 0); ctx.rotate(Math.PI / 4); ctx.strokeStyle = '#69784d44'; ctx.strokeRect(-66, -66, 132, 132); ctx.strokeRect(-50, -50, 100, 100); ctx.restore();
}

function decorations() {
  const left = Math.floor((camera.x - width / scale / 2 - 120) / 230), right = Math.ceil((camera.x + width / scale / 2 + 120) / 230);
  const top = Math.floor((camera.y - height / scale / 2 - 140) / 230), bottom = Math.ceil((camera.y + height / scale / 2 + 140) / 230);
  for (let gy = top; gy <= bottom; gy++) for (let gx = left; gx <= right; gx++) {
    const r = hash(gx + 140, gy - 400); const x = gx * 230 + r * 95, y = gy * 230 + hash(gx, gy + 333) * 100;
    if (Math.abs(x) < 180 || Math.abs(y) < 170) continue;
    ellipse(x + 10, y + 6, 29, 10, '#060f0b60');
    if (r < .62) {
      const tall = r < .22; const h = tall ? 43 : 30;
      ctx.fillStyle = '#152018'; ctx.fillRect(x - 14, y - h + 3, 29, h + 5);
      ctx.fillStyle = '#465140'; ctx.fillRect(x - 12, y - h, 23, h); ctx.fillStyle = '#58604a'; ctx.fillRect(x - 9, y - h - 3, 16, 4);
      ctx.fillStyle = '#343e30'; ctx.fillRect(x + 6, y - h, 5, h); ctx.fillRect(x - 16, y, 33, 7);
      line(x - 3, y - h + 8, x - 3, y - 9, '#87907770', 2); line(x - 8, y - h + 14, x + 2, y - h + 14, '#87907770', 2);
      ctx.fillStyle = '#283e25'; ctx.fillRect(x - 17, y + 3, 13, 4); ctx.fillRect(x + 2, y - 2, 10, 3);
    } else if (r < .83) {
      ctx.fillStyle = '#2d382d'; ctx.beginPath(); ctx.moveTo(x - 22, y); ctx.lineTo(x - 16, y - 14); ctx.lineTo(x + 5, y - 23); ctx.lineTo(x + 23, y - 6); ctx.lineTo(x + 19, y + 8); ctx.closePath(); ctx.fill();
      line(x - 16, y - 14, x + 5, y - 23, '#526045', 2); line(x + 5, y - 23, x + 13, y - 7, '#415039', 2);
    } else {
      ctx.strokeStyle = '#111e17'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y - 61); ctx.lineTo(x + 10, y - 103); ctx.stroke();
      line(x - 3, y - 40, x - 31, y - 71, '#111e17', 5); line(x - 31, y - 71, x - 37, y - 99, '#111e17', 3); line(x + 1, y - 70, x + 30, y - 86, '#111e17', 5); line(x + 30, y - 86, x + 45, y - 118, '#111e17', 3); line(x - 27, y - 68, x - 51, y - 77, '#111e17', 3);
      line(x - 2, y - 5, x - 6, y - 45, '#40503970', 2);
    }
  }
  for (const [x, y] of [[-210,-190],[210,-190],[-210,190],[210,190],[-640,20],[640,20]]) {
    glow(x, y - 27, 135, '#c68b3530'); ellipse(x, y + 4, 13, 6, '#060e0a88');
    ctx.fillStyle = '#48513d'; ctx.fillRect(x - 8, y - 23, 16, 26); ctx.fillStyle = '#727053'; ctx.fillRect(x - 11, y - 26, 22, 5);
    const flicker = Math.sin(visualTime * 9 + x) * 2;
    ctx.fillStyle = '#c78243'; ctx.beginPath(); ctx.moveTo(x - 7, y - 28); ctx.lineTo(x - 4, y - 40 + flicker); ctx.lineTo(x, y - 48 - flicker); ctx.lineTo(x + 7, y - 32); ctx.closePath(); ctx.fill();
    ellipse(x, y - 31, 4, 7 + flicker, '#ecd397');
  }
}

function drawEntity(entity, kind, isPlayer = false) {
  const x = Math.round(entity.x), y = Math.round(entity.y);
  if (Math.abs(x - camera.x) > width / scale / 2 + 90 || Math.abs(y - camera.y) > height / scale / 2 + 90) return;
  const size = kind === 'boss' ? 2.2 : kind === 'brute' ? 1.5 : kind === 'elite' ? 1.45 : isPlayer ? 1 : .9;
  ellipse(x, y + 8, 15 * size, 6 * size, '#060e0ba0');
  if (isPlayer) {
    glow(x, y - 6, 85, '#c5cc7d18');
    ctx.strokeStyle = entity.dash > 0 ? '#e5d6a4' : '#c9bf8660'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y + 6, 21, 10, 0, 0, TAU); ctx.stroke();
  }
  const bob = Math.sin(visualTime * 9 + (entity.phase || 0)) * (isPlayer ? 1 : 2);
  ctx.save();
  if ((isPlayer && entity.invulnerable > 0 && Math.floor(visualTime * 16) % 2 === 0) || entity.hit > 0) ctx.globalAlpha = .55;
  if (kind === 'bat') {
    const wing = Math.sin(visualTime * 16 + entity.phase) * 7;
    ctx.fillStyle = '#666456'; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x - 22, y - 16 - wing); ctx.lineTo(x - 16, y + 1); ctx.lineTo(x - 8, y - 4); ctx.lineTo(x, y + 4); ctx.lineTo(x + 9, y - 4); ctx.lineTo(x + 17, y + 1); ctx.lineTo(x + 23, y - 16 - wing); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#242d24'; ctx.fillRect(x - 4, y - 11, 8, 14); ctx.fillStyle = '#ddb078'; ctx.fillRect(x - 3, y - 8, 2, 2); ctx.fillRect(x + 1, y - 8, 2, 2);
  } else {
    ctx.imageSmoothingEnabled = false;
    const frame = Math.sin(visualTime * 10 + (entity.phase || 0)) > 0 ? 2 : -2;
    ctx.drawImage(sprite(kind, frame), x - 24 * size, y - 44 * size + bob, 48 * size, 60 * size);
    if (isPlayer) {
      const sx = x + entity.facing * 18;
      line(sx, y + 3, sx, y - 29, '#8c7951', 3); ellipse(sx, y - 30, 4, 6, CHARACTERS[kind].color); glow(sx, y - 30, 24, '#e4bd6755');
    }
  }
  ctx.restore();
  if (kind === 'elite' || kind === 'brute') { ctx.fillStyle = '#161b14'; ctx.fillRect(x - 20, y - 65 * size, 40, 3); ctx.fillStyle = '#ae9564'; ctx.fillRect(x - 20, y - 65 * size, 40 * Math.max(0, entity.hp / entity.maxHp), 3); }
}

function drawGame() {
  const g = game;
  for (const gem of g.gems) {
    if (Math.abs(gem.x - camera.x) > width / scale / 2 + 20 || Math.abs(gem.y - camera.y) > height / scale / 2 + 20) continue;
    if (gem.heal) { ctx.fillStyle = '#bc8a60'; ctx.fillRect(gem.x - 5, gem.y - 4, 10, 9); ctx.fillStyle = '#dec6a0'; ctx.fillRect(gem.x - 2, gem.y - 6, 4, 3); ctx.fillRect(gem.x - 3, gem.y - 1, 6, 2); }
    else {
      const size = gem.value > 10 ? 7 : gem.value > 2 ? 5 : 3;
      ctx.fillStyle = gem.value > 10 ? '#d2b57533' : '#77c6b025'; ctx.fillRect(gem.x - size - 3, gem.y - size - 3, size * 2 + 6, size * 2 + 6);
      ctx.save(); ctx.translate(gem.x, gem.y + Math.sin(visualTime * 3 + gem.x) * 1.5); ctx.rotate(Math.PI / 4); ctx.fillStyle = gem.value > 10 ? '#dec587' : '#8bcebb'; ctx.fillRect(-size / 2, -size / 2, size, size); ctx.restore();
    }
  }
  for (const effect of g.effects) {
    const progress = 1 - effect.life / effect.maxLife;
    ctx.save(); ctx.globalAlpha = 1 - progress;
    if (effect.type === 'ring') {
      const radius = effect.radius * (1 - (1 - progress) ** 3);
      ctx.strokeStyle = effect.color; ctx.lineWidth = 3 * (1 - progress) + 1; ctx.beginPath(); ctx.arc(effect.x, effect.y, radius, 0, TAU); ctx.stroke();
      ctx.globalAlpha *= .08; ctx.fillStyle = effect.color; ctx.fill();
    } else if (effect.type === 'danger') {
      ctx.globalAlpha = .35 + progress * .4; ctx.strokeStyle = '#d67459'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius, 0, TAU); ctx.stroke();
      ctx.globalAlpha = .12 + progress * .2; ctx.fillStyle = '#c14932'; ctx.beginPath(); ctx.arc(effect.x, effect.y, effect.radius * progress, 0, TAU); ctx.fill();
    } else if (effect.type === 'lightning') {
      const x = effect.x, y = effect.y; ctx.strokeStyle = effect.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x - 22, y - 280); ctx.lineTo(x + 13, y - 177); ctx.lineTo(x - 15, y - 157); ctx.lineTo(x + 9, y - 74); ctx.lineTo(x - 8, y - 58); ctx.lineTo(x, y); ctx.stroke(); glow(x, y, 55, '#b7d3ff55');
    } else if (effect.type === 'ghost') { ellipse(effect.x, effect.y - 15, 10, 19, effect.color); }
    else {
      ctx.fillStyle = effect.color;
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; const d = effect.radius * progress * 1.8; ctx.fillRect(effect.x + Math.cos(a) * d, effect.y + Math.sin(a) * d, 3, 3); }
    }
    ctx.restore();
  }
  const entities = [...g.enemies, { ...g.player, kind: g.character, player: true }].sort((a, b) => a.y - b.y);
  for (const entity of entities) drawEntity(entity, entity.kind, entity.player);
  for (let i = 0; i < g.orbitCount; i++) {
    const a = g.time * 2.4 + i / g.orbitCount * TAU, x = g.player.x + Math.cos(a) * g.orbitRadius, y = g.player.y + Math.sin(a) * g.orbitRadius;
    ctx.strokeStyle = '#a4d9c925'; ctx.lineWidth = 13; ctx.beginPath(); ctx.arc(g.player.x, g.player.y, g.orbitRadius, a - .6, a); ctx.stroke();
    glow(x, y, 28, '#89d4b333'); ctx.fillStyle = '#b9e4d1'; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill(); ctx.fillStyle = '#273e30'; ctx.beginPath(); ctx.arc(x + 4, y - 3, 7, 0, TAU); ctx.fill();
  }
  for (const s of g.projectiles) {
    if (s.type === 'bolt') {
      const angle = Math.atan2(s.vy, s.vx); line(s.x, s.y, s.x - Math.cos(angle) * 20, s.y - Math.sin(angle) * 20, '#d9a45b66', s.radius * 1.5);
      ellipse(s.x, s.y, s.radius + 3, s.radius + 3, '#e7b15c33'); ellipse(s.x, s.y, s.radius, s.radius, '#f9d78c');
    } else {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(visualTime * 10); ctx.fillStyle = '#ccd8b8'; ctx.beginPath(); ctx.moveTo(-13, -2); ctx.lineTo(4, -9); ctx.lineTo(13, 2); ctx.lineTo(-4, 9); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#5d7155'; ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    }
  }
  ctx.textAlign = 'center'; ctx.font = 'bold 12px monospace';
  for (const n of g.numbers) { ctx.globalAlpha = Math.min(1, n.life * 3); ctx.fillStyle = '#08110a'; ctx.fillText(n.value, n.x + 1, n.y + 1); ctx.fillStyle = n.value >= 80 ? '#f4d197' : '#e7e3b8'; ctx.fillText(n.value, n.x, n.y); }
  ctx.globalAlpha = 1;
}

function render(dt) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#15231c'; ctx.fillRect(0, 0, width, height);
  if (game) { const follow = 1 - Math.exp(-dt * 9); camera.x += (game.player.x - camera.x) * follow; camera.y += (game.player.y - camera.y) * follow; }
  else { camera.x = -80 + Math.sin(visualTime * .07) * 70; camera.y = -80 + Math.cos(visualTime * .08) * 40; }
  ctx.save(); ctx.translate(width / 2 + (reducedMotion ? 0 : Math.sin(visualTime * 110) * shake), height / 2 + 30); ctx.scale(scale, scale); ctx.translate(-camera.x, -camera.y);
  ground(); decorations();
  if (game) drawGame();
  else {
    for (let i = 0; i < 18; i++) { const a = i / 18 * TAU + .1; drawEntity({ x: Math.cos(a) * (280 + i * 13), y: Math.sin(a) * (250 + i * 10), phase: i }, i % 5 === 0 ? 'skeleton' : 'ghoul'); }
    drawEntity({ x: 120, y: 10, facing: 1 }, selected, true); glow(120, 0, 160, '#b8b37519');
  }
  ctx.restore();
  // Ash, rather than a flat overlay, gives the arena depth without external assets.
  for (let i = 0; i < 45; i++) {
    const x = ((i * 137.3 + visualTime * (5 + i % 4)) % (width + 30)) - 15;
    const y = ((i * 89.7 - visualTime * (9 + i % 3)) % (height + 30) + height + 30) % (height + 30) - 15;
    ctx.fillStyle = i % 5 ? '#c4c79e28' : '#e9c08577'; ctx.fillRect(x, y, i % 3 ? 1 : 2, 2);
  }
  if (game && game.player.hp < game.player.maxHp * .3) {
    const g = ctx.createRadialGradient(width / 2, height / 2, height / 3, width / 2, height / 2, width * .7); g.addColorStop(0, 'transparent'); g.addColorStop(1, '#b2262440'); ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
  }
}

function frame(now) {
  const dt = Math.min(.05, (now - previous) / 1000); previous = now;
  if (!game || game.state === 'playing') visualTime += dt;
  if (game) {
    const x = touch.x || ((keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0));
    const y = touch.y || ((keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0));
    game.update(dt, { x, y });
    for (const event of game.events.splice(0)) {
      if (event.message) announce(event.message);
      if (event.type === 'hurt') { shake = 5; tone(110, .18, 'sawtooth', .04, 40); }
      if (event.type === 'level') tone(520, .4, 'sine', .07, 1200);
      if (event.type === 'evolve') { tone(330, .9, 'triangle', .08, 1200); shake = 4; }
      if (event.type === 'dash') tone(200, .16, 'triangle', .035, 700);
      if (now - lastSound > 80) {
        if (event.type === 'shoot') { tone(460, .06, 'triangle', .015, 220); lastSound = now; }
        if (event.type === 'pickup') { tone(850, .07, 'sine', .015, 1100); lastSound = now; }
        if (event.type === 'lightning') { tone(90, .2, 'sawtooth', .025, 35); lastSound = now; }
        if (event.type === 'nova') { tone(150, .4, 'sine', .045, 45); lastSound = now; }
      }
    }
    syncState(); hudTick -= dt; if (hudTick <= 0) { updateHud(); hudTick = .1; }
  }
  announcementTime -= dt; if (announcementTime <= 0) $('announcement').classList.remove('show');
  shake = Math.max(0, shake - dt * 20); render(dt); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
