// Butin au sol : pièces, potions, cœurs, clés et armes (avec faisceau de rareté).
import * as THREE from 'three';
import { WEAPONS, RARITY } from './data.js';

function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0.9)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

const KEY_NAMES = { bone: "Clé d'os", king: 'Clé du Roi' };

export class Loot {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.beamTex = beamTexture();
    this.beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 7, 12, 1, true);
    this.beamGeo.translate(0, 3.5, 0);
  }

  spawn(type, x, z, opts = {}) {
    const A = this.game.assets.models;
    const g = new THREE.Group();
    let mesh, rest = 0.5, scale = 1;
    switch (type) {
      case 'coin': mesh = A.coin.scene.clone(); scale = 2.2; rest = 0.35; break;
      case 'potion': mesh = A.potion.scene.clone(); scale = 1.7; rest = 0.25; break;
      case 'heart': mesh = A.heart.scene.clone(); scale = 2.0; rest = 0.3; break;
      case 'key': mesh = A.key.scene.clone(); scale = 1.8; rest = 0.6; break;
      case 'weapon': mesh = A[WEAPONS[opts.weapon].model].scene.clone(); scale = 1.1; rest = 0.5; break;
    }
    mesh.scale.setScalar(scale);
    mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.add(mesh);
    let color = 0xffd060;
    if (type === 'weapon') color = new THREE.Color(RARITY[WEAPONS[opts.weapon].rarity].color);
    if (type === 'potion') color = 0xff3040;
    if (type === 'heart') color = 0xff60c0;
    if (type === 'weapon' || type === 'key' || type === 'heart') {
      const beam = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({
        map: this.beamTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      beam.position.y = -rest;
      g.add(beam);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.game.world.glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      opacity: type === 'coin' ? 0.35 : 0.7,
    }));
    glow.scale.setScalar(type === 'coin' ? 1.0 : 2.4);
    g.add(glow);
    g.position.set(x, 1.2, z);
    this.game.scene.add(g);
    const a = Math.random() * Math.PI * 2, p = opts.pop ?? 3;
    const it = {
      type, g, mesh, rest, value: opts.value || 0, weapon: opts.weapon, key: opts.key,
      pos: g.position, vel: new THREE.Vector3(Math.cos(a) * p * (opts.dir ? 0.4 : 1) + (opts.dir?.[0] || 0) * p,
        5 + Math.random() * 2, Math.sin(a) * p * (opts.dir ? 0.4 : 1) + (opts.dir?.[1] || 0) * p),
      age: 0, phase: Math.random() * 10,
    };
    this.items.push(it);
    return it;
  }

  dropFromEnemy(e) {
    const { x, z } = e.pos;
    const [g0, g1] = e.cfg.gold;
    const gold = Math.round(g0 + Math.random() * (g1 - g0));
    const n = Math.min(8, Math.ceil(gold / 4));
    for (let i = 0; i < n && gold > 0; i++) this.spawn('coin', x, z, { value: Math.ceil(gold / n) });
    if (e.summoned) return;
    if (Math.random() < (e.kind === 'knight' ? 0.3 : 0.14)) this.spawn('potion', x, z);
    const chance = e.kind === 'champion' ? 1 : e.kind === 'knight' ? 0.25 : 0.07;
    if (Math.random() < chance) this.spawn('weapon', x, z, { weapon: this.randomWeapon(e.zone) });
  }

  randomWeapon(zone) {
    const pool = zone <= 2 ? ['rusty', 'knight', 'knight', 'mace'] : zone <= 3 ? ['knight', 'mace', 'axe', 'spear'] : ['mace', 'axe', 'spear', 'hammer'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  spawnFromList(list, x, z, dir) {
    const g = this.game;
    list.forEach((entry, i) => {
      g.later(0.25 + i * 0.22, () => {
        const [t, arg] = entry.split(':');
        if (t === 'gold') {
          const v = parseInt(arg, 10), n = Math.ceil(v / 5);
          for (let k = 0; k < n; k++) this.spawn('coin', x, z, { value: 5, dir, pop: 3.5 });
        } else if (t === 'weapon') this.spawn('weapon', x, z, { weapon: arg, dir, pop: 2.5 });
        else if (t === 'key') this.spawn('key', x, z, { key: arg, dir, pop: 2.5 });
        else this.spawn(t, x, z, { dir, pop: 2.5 });
      });
    });
  }

  update(dt) {
    const g = this.game, p = g.player;
    for (const it of this.items) {
      it.age += dt;
      const dx = p.pos.x - it.pos.x, dz = p.pos.z - it.pos.z, d = Math.hypot(dx, dz);
      const auto = it.type === 'coin' || it.type === 'heart' || it.type === 'key' || (it.type === 'potion' && p.potions < 5);
      if (auto && it.age > 0.6 && p.alive && d < (it.type === 'coin' ? 4.5 : 2.6)) {
        // aimantation vers le joueur
        const k = Math.min(1, dt * 12);
        it.pos.x += dx * k; it.pos.z += dz * k;
        it.pos.y += (1.0 - it.pos.y) * k;
        if (d < 0.9) { this.collect(it); continue; }
      } else if (it.vel) {
        it.vel.y -= 20 * dt;
        it.pos.addScaledVector(it.vel, dt);
        if (!g.world.walkableAt(it.pos.x, it.pos.z)) { it.pos.x -= it.vel.x * dt; it.pos.z -= it.vel.z * dt; it.vel.x *= -0.4; it.vel.z *= -0.4; }
        if (it.pos.y <= it.rest) {
          it.pos.y = it.rest;
          if (Math.abs(it.vel.y) > 2.5) { it.vel.y *= -0.35; it.vel.x *= 0.5; it.vel.z *= 0.5; }
          else it.vel = null;
        }
      } else {
        it.pos.y = it.rest + Math.sin(g.time * 2.5 + it.phase) * 0.12;
      }
      it.mesh.rotation.y += dt * (it.type === 'coin' ? 4 : 1.5);
    }
    this.items = this.items.filter(it => !it.gone);
  }

  collect(it) {
    const g = this.game, p = g.player;
    it.gone = true;
    g.scene.remove(it.g);
    switch (it.type) {
      case 'coin':
        p.gold += it.value; g.stats.gold += it.value;
        g.audio.play('coin');
        g.particles.burst(p.pos.x, 1.2, p.pos.z, 4, { spread: 2, color: [1, 0.8, 0.3], size: 0.2, life: 0.3 });
        break;
      case 'potion':
        p.potions++;
        g.audio.play('pickup');
        g.ui.toast('Potion de soin ramassée (F pour boire)', 'heal');
        break;
      case 'heart':
        p.maxHp += 25; p.hp = p.maxHp;
        g.audio.play('heart');
        g.ui.toast('Fiole de vie : +25 points de vie maximum !', 'heart');
        p.heal(0);
        break;
      case 'key':
        p.keys.add(it.key);
        g.audio.play('key');
        g.ui.toast(`${KEY_NAMES[it.key]} obtenue !`, 'gold');
        if (it.key === 'king') g.story('kingKey');
        break;
      case 'weapon': this.takeWeapon(it.weapon); break;
    }
    g.ui.refresh();
  }

  takeWeapon(id) {
    const g = this.game, p = g.player, w = WEAPONS[id];
    const r = RARITY[w.rarity];
    if (p.weapons.includes(id)) {
      p.levels[id] = (p.levels[id] || 0) + 1;
      g.ui.toast(`${w.name} améliorée : niveau +${p.levels[id]} (+15 % de dégâts)`, 'gold');
      g.audio.play('pickup');
    } else {
      p.weapons.push(id);
      p.levels[id] = 0;
      g.stats.weapons++;
      p.equip(id);
      g.ui.toast(`<b style="color:${r.color}">${w.name}</b> — ${r.label} — dégâts ${w.dmg}`, 'loot');
      g.audio.play(w.rarity === 'legendaire' ? 'legendary' : 'pickup');
      if (id === 'flame') g.story('flame');
    }
    g.particles.burst(p.pos.x, 1.2, p.pos.z, 30, { spread: 5, vel: [0, 2, 0], color: new THREE.Color(r.color).toArray(), size: 0.3, life: 0.7 });
  }

  nearestWeapon(pos, maxD) {
    let best = null, bd = maxD;
    for (const it of this.items) {
      if (it.type !== 'weapon' || it.age < 0.5) continue;
      const d = Math.hypot(pos.x - it.pos.x, pos.z - it.pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  clear() {
    for (const it of this.items) this.game.scene.remove(it.g);
    this.items = [];
  }
}
