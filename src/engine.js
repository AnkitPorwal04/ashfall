export const TAU = Math.PI * 2;
export const RUN_LENGTH = 300;
export const CHARACTERS = {
  warden: { name: 'The Warden', hp: 110, speed: 175, weapon: 'bolt', color: '#d8ae70', damage: 1.1 },
  witch: { name: 'The Hexbinder', hp: 85, speed: 172, weapon: 'orbit', color: '#9fcbb2', damage: 1.2 },
  rogue: { name: 'The Revenant', hp: 90, speed: 205, weapon: 'blade', color: '#a6c6d8', damage: 1 },
};
export const UPGRADES = {
  bolt: { name: 'Ember Bolt', icon: '✦', type: 'WEAPON', max: 5, description: 'Homing embers seek the nearest enemy. More bolts. Less mercy.', pair: 'might', evolution: 'HELLFIRE', color: '#efb96a' },
  orbit: { name: 'Grave Orbit', icon: '☽', type: 'WEAPON', max: 5, description: 'Spectral moons circle you, cutting through everything they touch.', pair: 'magnet', evolution: 'ECLIPSE', color: '#a1d6bc' },
  blade: { name: 'Reaping Edge', icon: '⟡', type: 'WEAPON', max: 5, description: 'Piercing blades spiral outward through the approaching horde.', pair: 'haste', evolution: 'DEATH SPIRAL', color: '#d9d5ad' },
  nova: { name: 'Hollow Bell', icon: '◎', type: 'WEAPON', max: 5, description: 'A resonant pulse damages and pushes back enemies around you.', pair: 'vitality', evolution: 'REQUIEM', color: '#b8cbdb' },
  lightning: { name: 'Storm Oath', icon: 'ϟ', type: 'WEAPON', max: 5, description: 'Call down lightning on nearby enemies. Every rank adds strikes.', pair: 'speed', evolution: 'TEMPEST', color: '#becded' },
  might: { name: 'Blood Sigil', icon: '⟁', type: 'PASSIVE', max: 3, description: '+20% damage to every weapon. Power has a familiar price.', pair: 'bolt' },
  haste: { name: 'Broken Hourglass', icon: '⋈', type: 'PASSIVE', max: 3, description: 'Weapons recover 12% faster. The dead cannot keep up.', pair: 'blade' },
  magnet: { name: 'Soul Lantern', icon: '♧', type: 'PASSIVE', max: 3, description: '+45 soul collection radius. Let the lost come to you.', pair: 'orbit' },
  vitality: { name: 'Hollow Heart', icon: '♡', type: 'PASSIVE', max: 3, description: '+25 maximum health. Restore 35 health right now.', pair: 'nova' },
  speed: { name: 'Pilgrim Boots', icon: '⌁', type: 'PASSIVE', max: 3, description: '+12% movement speed and a shorter Ash Step cooldown.', pair: 'lightning' },
  feast: { name: 'Last Supper', icon: '✚', type: 'RECOVERY', max: Infinity, description: 'Restore 45 health. Sometimes survival is enough.' },
};

export function seededRandom(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Arena {
  constructor(character = 'warden', seed = Date.now()) {
    this.random = seededRandom(seed);
    this.character = CHARACTERS[character] ? character : 'warden';
    const hero = CHARACTERS[this.character];
    this.player = { x: 0, y: 0, hp: hero.hp, maxHp: hero.hp, speed: hero.speed, radius: 12, invulnerable: 0, dash: 0, dashCooldown: 0, facing: 1, dx: 1, dy: 0 };
    this.state = 'playing'; this.time = 0; this.kills = 0; this.level = 1; this.xp = 0; this.nextXp = 9;
    this.ranks = { [hero.weapon]: 1 }; this.evolved = new Set(); this.cooldowns = {};
    this.enemies = []; this.projectiles = []; this.gems = []; this.effects = []; this.numbers = [];
    this.events = []; this.choices = []; this.rerolls = 2; this.spawnTimer = 0; this.eliteAt = 35;
    this.bossSpawned = false; this.bossDead = false; this.enemyId = 0; this.orbitTick = 0; this.grid = new Map();
    this.viewRadius = 700; this.damageDealt = 0; this.wave = 0;
  }

  emit(type, message) { this.events.push({ type, message }); }
  get damage() { return CHARACTERS[this.character].damage * (1 + (this.ranks.might || 0) * .2); }
  get pickupRadius() { return 78 + (this.ranks.magnet || 0) * 45; }
  get orbitRadius() { return 64 + (this.ranks.orbit || 0) * 8; }
  get orbitCount() { return this.ranks.orbit ? 1 + this.ranks.orbit + (this.evolved.has('orbit') ? 3 : 0) : 0; }

  spawn(kind) {
    if (this.enemies.length >= 260 && kind !== 'boss') return;
    const angle = this.random() * TAU;
    const radius = Math.max(480, this.viewRadius) + this.random() * 100;
    const scale = 1 + this.time / 110;
    const config = {
      ghoul: [15, 45, 12, 9, 1], bat: [8, 86, 9, 6, 1], skeleton: [30, 56, 13, 12, 2],
      brute: [100, 31, 22, 18, 5], elite: [220, 43, 25, 20, 22], boss: [4800, 48, 42, 26, 90],
    }[kind];
    const hp = kind === 'boss' ? config[0] : config[0] * scale;
    const enemy = { id: ++this.enemyId, kind, x: this.player.x + Math.cos(angle) * radius, y: this.player.y + Math.sin(angle) * radius, hp, maxHp: hp, speed: config[1] + Math.min(24, this.time / 15), radius: config[2], damage: config[3], xp: config[4], hit: 0, phase: this.random() * TAU, attack: 3 };
    this.enemies.push(enemy); return enemy;
  }

  dash() {
    const p = this.player;
    if (this.state !== 'playing' || p.dashCooldown > 0) return false;
    p.dash = .23; p.invulnerable = .45; p.dashCooldown = 4.5 - (this.ranks.speed || 0) * .5;
    this.effects.push({ type: 'ring', x: p.x, y: p.y, radius: 60, life: .35, maxLife: .35, color: '#dcd2ac' });
    this.emit('dash'); return true;
  }

  pause() { if (this.state === 'playing') this.state = 'paused'; }
  resume() { if (this.state === 'paused') this.state = 'playing'; }

  offer() {
    const keys = Object.keys(UPGRADES).filter(key => (this.ranks[key] || 0) < UPGRADES[key].max && (key !== 'feast' || this.player.hp < this.player.maxHp));
    for (let i = keys.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [keys[i], keys[j]] = [keys[j], keys[i]]; }
    this.choices = keys.slice(0, 3);
    if (!this.choices.length) this.choices = ['feast'];
  }

  checkLevel() {
    if (this.state !== 'playing' || this.xp < this.nextXp) return;
    this.xp -= this.nextXp; this.level++; this.nextXp = Math.floor(9 + this.level * 4 + this.level ** 1.35);
    this.state = 'upgrade'; this.offer(); this.emit('level');
  }

  reroll() {
    if (this.state !== 'upgrade' || this.rerolls <= 0) return false;
    this.rerolls--; this.offer(); return true;
  }

  choose(key) {
    if (this.state !== 'upgrade' || !this.choices.includes(key)) return false;
    if (key === 'feast') this.player.hp = Math.min(this.player.maxHp, this.player.hp + 45);
    else {
      this.ranks[key] = (this.ranks[key] || 0) + 1;
      if (key === 'vitality') { this.player.maxHp += 25; this.player.hp = Math.min(this.player.maxHp, this.player.hp + 35); }
    }
    for (const [weapon, data] of Object.entries(UPGRADES)) {
      if (data.type === 'WEAPON' && this.ranks[weapon] === 5 && this.ranks[data.pair] >= 3 && !this.evolved.has(weapon)) {
        this.evolved.add(weapon); this.emit('evolve', data.evolution);
      }
    }
    this.state = 'playing'; this.choices = []; this.checkLevel(); return true;
  }

  hit(enemy, amount, knockback = 0) {
    if (enemy.hp <= 0) return;
    enemy.hp -= amount; enemy.hit = .12; this.damageDealt += amount;
    if (this.numbers.length < 65) this.numbers.push({ x: enemy.x + (this.random() - .5) * 15, y: enemy.y - enemy.radius, value: Math.ceil(amount), life: .65 });
    if (knockback && enemy.kind !== 'boss') { const d = Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) || 1; enemy.x += (enemy.x - this.player.x) / d * knockback; enemy.y += (enemy.y - this.player.y) / d * knockback; }
    if (enemy.hp <= 0) {
      this.kills++;
      this.addGem(enemy.x, enemy.y, enemy.xp);
      this.effects.push({ type: 'burst', x: enemy.x, y: enemy.y, radius: enemy.radius, life: .3, maxLife: .3, color: enemy.kind === 'boss' ? '#ecd2a0' : '#91a579' });
      if (enemy.kind === 'elite') { this.gems.push({ x: enemy.x + 12, y: enemy.y, value: 0, heal: true }); this.emit('elite', 'A fallen guardian. A stolen moment.'); }
      else if (this.random() < .015) this.gems.push({ x: enemy.x, y: enemy.y, value: 0, heal: true });
      if (enemy.kind === 'boss') { this.bossDead = true; this.emit('boss-dead', 'THE SOVEREIGN FALLS'); }
    }
  }

  addGem(x, y, value) {
    // Merge old souls at the cap so long runs stay bounded without losing XP.
    if (this.gems.length >= 450) { const target = this.gems.find(g => !g.heal); if (target) { target.value += value; return; } }
    this.gems.push({ x, y, value, heal: false });
  }

  rebuildGrid() {
    this.grid.clear();
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const key = `${Math.floor(e.x / 90)},${Math.floor(e.y / 90)}`;
      const bucket = this.grid.get(key);
      if (bucket) bucket.push(e); else this.grid.set(key, [e]);
    }
  }

  nearby(x, y, radius) {
    const out = [];
    for (let gx = Math.floor((x - radius) / 90); gx <= Math.floor((x + radius) / 90); gx++) {
      for (let gy = Math.floor((y - radius) / 90); gy <= Math.floor((y + radius) / 90); gy++) {
        const bucket = this.grid.get(`${gx},${gy}`); if (bucket) out.push(...bucket);
      }
    }
    return out;
  }

  fireWeapons(dt) {
    const p = this.player;
    const haste = 1 - (this.ranks.haste || 0) * .12;
    const targets = this.enemies.filter(e => e.hp > 0 && distance2(e, p) < 800 ** 2).sort((a, b) => distance2(a, p) - distance2(b, p));
    for (const key of ['bolt', 'blade', 'nova', 'lightning']) {
      const rank = this.ranks[key]; if (!rank) continue;
      this.cooldowns[key] = (this.cooldowns[key] || 0) - dt;
      if (this.cooldowns[key] > 0 || !targets.length) continue;
      const evolved = this.evolved.has(key);
      if (key === 'bolt') {
        this.cooldowns[key] = Math.max(.22, .9 - rank * .06) * haste;
        for (let i = 0; i < Math.ceil(rank / 2) + (evolved ? 3 : 0); i++) {
          const target = targets[i % targets.length];
          const angle = Math.atan2(target.y - p.y, target.x - p.x) + (i - 1) * .08;
          this.projectiles.push({ x: p.x, y: p.y - 8, vx: Math.cos(angle) * 390, vy: Math.sin(angle) * 390, radius: evolved ? 7 : 4, damage: (17 + rank * 6) * this.damage * (evolved ? 1.7 : 1), life: 2.3, type: 'bolt', target, hits: new Set(), pierce: evolved ? 3 : 1 });
        }
        this.emit('shoot');
      }
      if (key === 'blade') {
        this.cooldowns[key] = 1.65 * haste;
        const count = 3 + rank + (evolved ? 6 : 0);
        const aim = Math.atan2(targets[0].y - p.y, targets[0].x - p.x);
        for (let i = 0; i < count; i++) {
          const angle = aim + i / count * TAU;
          this.projectiles.push({ x: p.x, y: p.y, vx: Math.cos(angle) * 230, vy: Math.sin(angle) * 230, radius: 11, damage: (22 + rank * 7) * this.damage, life: 2.8, type: 'blade', hits: new Set(), pierce: 100 });
        }
        this.emit('blade');
      }
      if (key === 'nova') {
        this.cooldowns[key] = (evolved ? 1.7 : 3.4) * haste;
        const radius = 90 + rank * 22 + (evolved ? 90 : 0);
        for (const enemy of targets) if (distance2(enemy, p) < (radius + enemy.radius) ** 2) this.hit(enemy, (24 + rank * 10) * this.damage, 45);
        this.effects.push({ type: 'ring', x: p.x, y: p.y, radius, life: .6, maxLife: .6, color: '#b8cbdb' }); this.emit('nova');
      }
      if (key === 'lightning') {
        this.cooldowns[key] = 2.2 * haste;
        for (let i = 0; i < Math.min(targets.length, rank + (evolved ? 7 : 1)); i++) {
          const enemy = targets[i];
          this.hit(enemy, (45 + rank * 15) * this.damage * (evolved ? 1.7 : 1));
          this.effects.push({ type: 'lightning', x: enemy.x, y: enemy.y, radius: 25, life: .3, maxLife: .3, color: '#c2d6ee' });
        }
        this.emit('lightning');
      }
    }
    this.orbitTick -= dt;
    if (this.ranks.orbit && this.orbitTick <= 0) {
      this.orbitTick = .2;
      for (let i = 0; i < this.orbitCount; i++) {
        const angle = this.time * 2.4 + i / this.orbitCount * TAU;
        const x = p.x + Math.cos(angle) * this.orbitRadius, y = p.y + Math.sin(angle) * this.orbitRadius;
        for (const enemy of this.nearby(x, y, 60)) if ((enemy.x - x) ** 2 + (enemy.y - y) ** 2 < (enemy.radius + 21) ** 2) this.hit(enemy, (12 + this.ranks.orbit * 6) * this.damage * (this.evolved.has('orbit') ? 2 : 1), 7);
      }
    }
  }

  update(dt, input = { x: 0, y: 0 }) {
    if (this.state !== 'playing') return;
    dt = clamp(dt, 0, .05); this.time += dt;
    const p = this.player;
    p.invulnerable = Math.max(0, p.invulnerable - dt); p.dashCooldown = Math.max(0, p.dashCooldown - dt); p.dash = Math.max(0, p.dash - dt);
    p.hp = Math.min(p.maxHp, p.hp + .35 * dt);
    const length = Math.hypot(input.x, input.y);
    if (length) { p.dx = input.x / length; p.dy = input.y / length; if (Math.abs(input.x) > .1) p.facing = input.x > 0 ? 1 : -1; }
    const speed = p.speed * (1 + (this.ranks.speed || 0) * .12) * (p.dash > 0 ? 4 : 1);
    if (length || p.dash > 0) { p.x += p.dx * speed * dt; p.y += p.dy * speed * dt; }
    if (p.dash > 0 && this.random() < .5) this.effects.push({ type: 'ghost', x: p.x, y: p.y, radius: 16, life: .25, maxLife: .25, color: CHARACTERS[this.character].color });
    const wave = Math.floor(this.time / 60);
    if (wave > this.wave) { this.wave = wave; this.emit('wave', ['','THE GRAVES ARE OPEN','THE HOLLOW HUNGERS','NO ROAD LEADS HOME','THE PALE SOVEREIGN'][Math.min(wave, 4)]); }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(.13, .8 - this.time / 480);
      const count = 1 + Math.floor(this.time / 70);
      for (let i = 0; i < count; i++) {
        const roll = this.random();
        this.spawn(this.time > 100 && roll < .12 ? 'brute' : this.time > 45 && roll < .42 ? 'skeleton' : roll > .77 ? 'bat' : 'ghoul');
      }
    }
    if (this.time >= this.eliteAt) { this.spawn('elite'); this.eliteAt += 40; this.emit('warning', 'A GRAVEKEEPER APPROACHES'); }
    if (this.time >= 240 && !this.bossSpawned) { this.spawn('boss'); this.bossSpawned = true; this.emit('boss', 'THE PALE SOVEREIGN'); }
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      enemy.hit = Math.max(0, enemy.hit - dt);
      let dx = p.x - enemy.x, dy = p.y - enemy.y, d = Math.hypot(dx, dy) || 1;
      if (d > this.viewRadius + 650 && enemy.kind !== 'boss') {
        const angle = this.random() * TAU;
        enemy.x = p.x + Math.cos(angle) * (this.viewRadius + 90); enemy.y = p.y + Math.sin(angle) * (this.viewRadius + 90);
        dx = p.x - enemy.x; dy = p.y - enemy.y; d = Math.hypot(dx, dy) || 1;
      }
      const sway = enemy.kind === 'bat' ? Math.sin(this.time * 6 + enemy.phase) * 24 : 0;
      enemy.x += (dx / d * enemy.speed - dy / d * sway) * dt;
      enemy.y += (dy / d * enemy.speed + dx / d * sway) * dt;
      if (enemy.kind === 'boss') {
        enemy.attack -= dt;
        if (enemy.attack <= 0) {
          enemy.attack = 3.8;
          this.effects.push({ type: 'danger', x: p.x, y: p.y, radius: 100, life: 1.2, maxLife: 1.2, triggered: false, color: '#bd6156' });
        }
      }
      if (d < p.radius + enemy.radius && p.invulnerable <= 0) { this.hurt(enemy.damage); }
    }
    this.rebuildGrid(); this.fireWeapons(dt);
    for (const shot of this.projectiles) {
      shot.life -= dt;
      if (shot.type === 'bolt' && shot.target?.hp > 0) {
        const angle = Math.atan2(shot.target.y - shot.y, shot.target.x - shot.x);
        shot.vx += (Math.cos(angle) * 390 - shot.vx) * Math.min(1, dt * 7); shot.vy += (Math.sin(angle) * 390 - shot.vy) * Math.min(1, dt * 7);
      }
      shot.x += shot.vx * dt; shot.y += shot.vy * dt;
      for (const enemy of this.nearby(shot.x, shot.y, 65)) {
        if (enemy.hp <= 0 || shot.hits.has(enemy.id)) continue;
        if (distance2(enemy, shot) < (enemy.radius + shot.radius) ** 2) {
          this.hit(enemy, shot.damage, 8); shot.hits.add(enemy.id); shot.pierce--;
          if (shot.pierce <= 0) { shot.life = 0; break; }
        }
      }
    }
    this.projectiles = this.projectiles.filter(s => s.life > 0);
    this.enemies = this.enemies.filter(e => e.hp > 0);
    for (const gem of this.gems) {
      const d = Math.hypot(gem.x - p.x, gem.y - p.y);
      if (d < this.pickupRadius || gem.magnetized) {
        gem.magnetized = true;
        const speed = Math.min(d, (240 + (this.pickupRadius - Math.min(d, this.pickupRadius)) * 4) * dt);
        gem.x += (p.x - gem.x) / (d || 1) * speed; gem.y += (p.y - gem.y) / (d || 1) * speed;
      }
      if (d < 19) {
        if (gem.heal) { p.hp = Math.min(p.maxHp, p.hp + 25); this.emit('heal'); }
        else { this.xp += gem.value; this.emit('pickup'); }
        gem.collected = true;
      }
    }
    this.gems = this.gems.filter(g => !g.collected);
    for (const effect of this.effects) {
      effect.life -= dt;
      if (effect.type === 'danger' && effect.life <= 0 && !effect.triggered) {
        effect.triggered = true;
        if (distance2(effect, p) < effect.radius ** 2 && p.invulnerable <= 0) this.hurt(30);
        this.emit('impact');
      }
    }
    this.effects = this.effects.filter(e => e.life > 0).slice(-180);
    for (const n of this.numbers) { n.life -= dt; n.y -= dt * 25; }
    this.numbers = this.numbers.filter(n => n.life > 0);
    if (p.hp <= 0) { this.state = 'dead'; this.emit('end'); return; }
    if (this.time >= RUN_LENGTH && this.bossDead) { this.state = 'won'; this.emit('end'); return; }
    this.checkLevel();
  }

  hurt(amount) {
    this.player.hp = Math.max(0, this.player.hp - amount); this.player.invulnerable = .7;
    this.emit('hurt');
  }
}
