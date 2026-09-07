import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, CHARACTERS, UPGRADES, seededRandom } from '../src/engine.js';

test('seeded random produces reproducible, bounded values', () => {
  const a = seededRandom(91), b = seededRandom(91);
  for (let i = 0; i < 100; i++) { const n = a(); assert.equal(n, b()); assert.ok(n >= 0 && n < 1); }
});
test('each character has its own starting weapon and stats', () => {
  for (const [key, hero] of Object.entries(CHARACTERS)) {
    const g = new Arena(key, 1); assert.equal(g.ranks[hero.weapon], 1); assert.equal(g.player.hp, hero.hp); assert.equal(g.player.speed, hero.speed);
  }
});
test('diagonal movement is normalized and pause freezes the simulation', () => {
  const g = new Arena('warden', 1); g.update(.05, { x: 1, y: 1 });
  assert.ok(Math.abs(Math.hypot(g.player.x, g.player.y) - g.player.speed * .05) < .001);
  g.pause(); const before = JSON.stringify(g); g.update(.05, { x: 1, y: 1 }); assert.equal(JSON.stringify(g), before);
  g.resume(); assert.equal(g.state, 'playing');
});
test('dash has invulnerability, a cooldown, and cannot be repeated immediately', () => {
  const g = new Arena(); assert.equal(g.dash(), true); assert.equal(g.dash(), false); assert.ok(g.player.invulnerable > 0);
  g.update(.05, { x: 1, y: 0 }); assert.ok(g.player.x > 30); g.pause(); assert.equal(g.dash(), false);
});
test('kill creates XP and collecting it opens valid upgrade choices', () => {
  const g = new Arena('warden', 2); const e = g.spawn('elite'); e.x = 0; e.y = 0;
  g.hit(e, 9999); assert.equal(g.kills, 1); assert.ok(g.gems.some(gem => gem.value === 22));
  g.update(.016); assert.equal(g.state, 'upgrade'); assert.equal(g.level, 2); assert.equal(g.choices.length, 3);
  assert.equal(g.choose('not-an-upgrade'), false); const choice = g.choices[0]; assert.equal(g.choose(choice), true);
});
test('banked XP cannot skip choices and maximum rank upgrades are excluded', () => {
  const g = new Arena('warden', 2); g.xp = 10000; g.ranks.bolt = 5; g.checkLevel();
  assert.ok(!g.choices.includes('bolt')); assert.equal(g.level, 2); g.choose(g.choices[0]); assert.equal(g.level, 3); assert.equal(g.state, 'upgrade');
});
test('rerolls are limited and only work in the upgrade state', () => {
  const g = new Arena(); assert.equal(g.reroll(), false); g.xp = 10; g.checkLevel();
  assert.equal(g.reroll(), true); assert.equal(g.reroll(), true); assert.equal(g.reroll(), false); assert.equal(g.rerolls, 0);
});
test('weapon evolution requires its max-rank paired passive', () => {
  for (const [key, data] of Object.entries(UPGRADES).filter(([, d]) => d.type === 'WEAPON')) {
    const g = new Arena(); g.ranks[key] = 5; g.ranks[data.pair] = 2; g.state = 'upgrade'; g.choices = [data.pair];
    g.choose(data.pair); assert.ok(g.evolved.has(key)); assert.ok(g.events.some(e => e.type === 'evolve'));
  }
});
test('all weapons can damage enemies', () => {
  for (const key of ['bolt', 'blade', 'nova', 'lightning', 'orbit']) {
    const g = new Arena('warden', 13); g.ranks = { [key]: 5 }; const e = g.spawn('brute');
    e.x = key === 'orbit' ? g.orbitRadius : 40; e.y = 0; e.hp = 10000; e.maxHp = 10000; e.speed = 0;
    for (let i = 0; i < 60; i++) g.update(1 / 60);
    assert.ok(e.hp < 10000, `${key} must deal damage`);
  }
});
test('contact damage has an invulnerability window and death is terminal', () => {
  const g = new Arena(); const e = g.spawn('ghoul'); e.x = 0; e.y = 0; e.hp = 9999;
  g.update(.016); const hp = g.player.hp; g.update(.016); assert.ok(g.player.hp >= hp);
  g.player.invulnerable = 0; g.player.hp = 1; g.update(.016); assert.equal(g.state, 'dead');
  const t = g.time; g.update(.05); assert.equal(g.time, t);
});
test('boss spawns once and victory requires dawn plus boss kill', () => {
  const g = new Arena(); g.time = 239.99; g.update(.02);
  let boss = g.enemies.find(e => e.kind === 'boss'); assert.ok(boss); g.update(.02); assert.equal(g.enemies.filter(e => e.kind === 'boss').length, 1);
  g.time = 301; g.update(.02); assert.notEqual(g.state, 'won');
  g.hit(boss, 999999); g.update(.02); assert.equal(g.state, 'won'); assert.equal(g.bossDead, true);
});
test('XP merging conserves value at the pickup cap', () => {
  const g = new Arena(); for (let i = 0; i < 1000; i++) g.addGem(i * 10, 0, 3);
  assert.equal(g.gems.length, 450); assert.equal(g.gems.reduce((n, gem) => n + gem.value, 0), 3000);
});
test('a piercing projectile damages the same enemy only once', () => {
  const g = new Arena(); g.ranks = {}; g.spawnTimer = 999;
  const enemy = g.spawn('brute'); enemy.x = 100; enemy.y = 0; enemy.speed = 0;
  const hp = enemy.hp;
  g.projectiles.push({ type: 'blade', x: 100, y: 0, vx: 0, vy: 0, radius: 50, damage: 10, pierce: 10, life: 2, hits: new Set() });
  for (let i = 0; i < 10; i++) g.update(.05);
  assert.equal(enemy.hp, hp - 10);
});
test('boss danger zones allow escape and only damage after the warning', () => {
  for (const escape of [false, true]) {
    const g = new Arena(); g.ranks = {}; g.spawnTimer = 999;
    const boss = g.spawn('boss'); boss.x = 400; boss.y = 0; boss.speed = 0; boss.attack = 0;
    g.update(.05); assert.ok(g.effects.some(e => e.type === 'danger')); assert.equal(g.player.hp, g.player.maxHp);
    if (escape) g.player.x = -200;
    for (let i = 0; i < 25; i++) g.update(.05);
    assert.equal(g.player.hp < g.player.maxHp, !escape);
  }
});
test('all three characters can win a normal-health seeded run', () => {
  const priority = ['orbit', 'bolt', 'nova', 'might', 'magnet', 'blade', 'haste', 'lightning', 'vitality', 'speed', 'feast'];
  for (const character of Object.keys(CHARACTERS)) {
    const g = new Arena(character, 42); g.viewRadius = 700;
    for (let i = 0; i < 20000 && !['dead', 'won'].includes(g.state); i++) {
      if (g.state === 'upgrade') g.choose([...g.choices].sort((a, b) => priority.indexOf(a) - priority.indexOf(b))[0]);
      const p = g.player;
      const gem = g.gems.filter(gem => !gem.heal || p.hp < p.maxHp * .7).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      let x = gem ? gem.x - p.x : Math.cos(g.time), y = gem ? gem.y - p.y : Math.sin(g.time);
      const danger = g.enemies.filter(e => Math.hypot(e.x - p.x, e.y - p.y) < 65);
      if (danger.length) {
        x = 0; y = 0;
        for (const e of danger) { const d = Math.hypot(p.x - e.x, p.y - e.y) || 1; x += (p.x - e.x) / d; y += (p.y - e.y) / d; }
        g.dash();
      }
      g.update(.025, { x, y }); g.events.length = 0;
    }
    assert.equal(g.state, 'won', `${character} should survive a complete run`);
  }
});
test('a full simulated run remains finite and bounded under a heavy load', () => {
  const g = new Arena('witch', 71); g.player.hp = 1e8; g.player.maxHp = 1e8;
  for (const key of Object.keys(UPGRADES)) if (key !== 'feast') g.ranks[key] = UPGRADES[key].max;
  for (let i = 0; i < 6600; i++) {
    if (g.state === 'upgrade') g.choose(g.choices[0]);
    g.update(.05, { x: Math.cos(i / 400), y: Math.sin(i / 400) });
    g.events.length = 0;
    assert.ok(Number.isFinite(g.player.hp)); assert.ok(g.enemies.length <= 261); assert.ok(g.projectiles.length < 500);
  }
  assert.ok(g.kills > 100); assert.ok(g.time >= 240); assert.ok(g.bossSpawned);
});
