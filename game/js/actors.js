// Personnages : héros, squelettes, champion, boss, projectiles.
import * as THREE from 'three';
import { clone as skelClone } from 'three/addons/utils/SkeletonUtils.js';
import { WEAPONS, WEAPON_ORDER, ENEMIES, RARITY } from './data.js';

const V = THREE.Vector3;
const _v = new V(), _v2 = new V(), _q = new THREE.Quaternion();

export const BASIS = {
  // lame (axe +Y du modèle) pointée vers l'avant, tranchant vertical
  blade: new THREE.Matrix4().makeBasis(new V(0, 1, 0), new V(0, 0, 1), new V(1, 0, 0)),
  bow: new THREE.Matrix4().makeBasis(new V(1, 0, 0), new V(0, 0, 1), new V(0, -1, 0)),
  ident: new THREE.Matrix4(),
};

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const turnTo = (cur, target, maxStep) => {
  const d = angleDiff(target, cur);
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
};

// ---------------------------------------------------------------------------
// Rig : modèle animé + mixer + attaches d'armes
// ---------------------------------------------------------------------------
export class Rig {
  constructor(gltf, cloneMaterials = true) {
    this.root = new THREE.Group();
    this.model = skelClone(gltf.scene);
    this.root.add(this.model);
    this.bones = {};
    this.materials = [];
    this.model.traverse(o => {
      if (o.isBone) this.bones[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        if (cloneMaterials) o.material = o.material.clone();
        this.materials.push({ m: o.material, e: o.material.emissive.clone(), ei: o.material.emissiveIntensity });
      }
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = {};
    for (const c of gltf.animations) this.clips[c.name] = c;
    this.actions = {};
    this.current = null;
    this.flashT = 0;
    this.flashDur = 0.15;
    this.flashColor = new THREE.Color();
  }

  duration(name) { return this.clips[name].duration; }

  attach(obj, boneName, basis, offset = new V()) {
    const b = this.bones[boneName];
    this.model.updateMatrixWorld(true);
    const bq = b.getWorldQuaternion(new THREE.Quaternion());
    const dq = new THREE.Quaternion().setFromRotationMatrix(basis);
    obj.quaternion.copy(bq.invert().multiply(dq));
    const wp = b.getWorldPosition(new V()).add(offset);
    b.worldToLocal(wp);
    obj.position.copy(wp);
    const ws = b.getWorldScale(new V());
    obj.scale.multiply(new V(1 / ws.x, 1 / ws.y, 1 / ws.z));
    obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
    b.add(obj);
    return obj;
  }

  play(name, { loop = true, fade = 0.15, speed = 1, restart = false } = {}) {
    let a = this.actions[name];
    if (!a) a = this.actions[name] = this.mixer.clipAction(this.clips[name]);
    a.timeScale = speed;
    if (this.current === a && !restart) return a;
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (this.current && this.current !== a && fade > 0) a.crossFadeFrom(this.current, fade, false);
    else if (this.current && this.current !== a) this.current.stop();
    this.current = a;
    this.currentName = name;
    return a;
  }

  flash(color = 0xffffff, dur = 0.15) {
    this.flashColor.set(color);
    this.flashT = this.flashDur = dur;
  }

  update(dt) {
    this.mixer.update(dt);
    if (this.flashT > 0 || this.flashWas) {
      this.flashT = Math.max(0, this.flashT - dt);
      const k = this.flashT / this.flashDur;
      for (const it of this.materials) {
        it.m.emissive.copy(it.e).lerp(this.flashColor, k);
        it.m.emissiveIntensity = it.ei + (1.6 - it.ei) * k;
      }
      this.flashWas = this.flashT > 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Traînée lumineuse des coups d'arme
// ---------------------------------------------------------------------------
class Trail {
  constructor(scene, n = 14) {
    this.n = n;
    this.samples = [];
    const pos = new Float32Array(n * 2 * 3);
    const alpha = new Float32Array(n * 2);
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA=aAlpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor=vec4(uColor*vA*1.6, vA); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    scene.add(this.mesh);
  }

  push(base, tip, active) {
    if (active) this.samples.unshift([base.clone(), tip.clone()]);
    else this.samples.pop();
    if (this.samples.length > this.n) this.samples.length = this.n;
    const pos = this.geo.attributes.position.array, al = this.geo.attributes.aAlpha.array;
    const m = this.samples.length;
    for (let i = 0; i < this.n; i++) {
      const s = this.samples[Math.min(i, m - 1)];
      if (!s) { al[i * 2] = al[i * 2 + 1] = 0; continue; }
      s[0].toArray(pos, i * 6);
      s[1].toArray(pos, i * 6 + 3);
      const a = i < m ? (1 - i / this.n) * 0.55 : 0;
      al[i * 2] = a * 0.1; al[i * 2 + 1] = a;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.mesh.visible = m > 1;
  }
}

const TIP = { rusty: 0.95, knight: 1.05, mace: 0.8, axe: 0.9, spear: 1.55, hammer: 0.9, flame: 1.2 };

// ---------------------------------------------------------------------------
// Héros
// ---------------------------------------------------------------------------
export class Player {
  constructor(game) {
    this.game = game;
    this.rig = new Rig(game.assets.models.hero, false);
    this.weaponMeshes = {};
    for (const id of WEAPON_ORDER) {
      const w = game.assets.models[WEAPONS[id].model].scene.clone();
      this.rig.attach(w, 'hand_R', BASIS.blade, new V(0, -0.06, 0));
      w.visible = false;
      this.weaponMeshes[id] = w;
    }
    this.rig.root.scale.setScalar(1.55);
    game.scene.add(this.rig.root);
    this.trail = new Trail(game.scene);
    this.radius = 0.75;
    this.pos = new V();
    this.vel = new V();
    this.reset();
  }

  reset() {
    this.maxHp = 100;
    this.hp = 100;
    this.potions = 1;
    this.gold = 0;
    this.weapons = ['rusty'];
    this.levels = { rusty: 0 };
    this.keys = new Set();
    this.equip('rusty');
    this.state = 'move';
    this.t = 0;
    this.iframes = 0;
    this.rollCd = 0;
    this.combo = 0;
    this.yaw = Math.PI;
  }

  equip(id) {
    if (!this.weapons.includes(id)) return;
    for (const k in this.weaponMeshes) this.weaponMeshes[k].visible = k === id;
    this.weapon = id;
    const r = WEAPONS[id].rarity;
    this.trail.mat.uniforms.uColor.value.set(id === 'flame' ? '#ff7a20' : RARITY[r].color);
  }

  spawnAt(x, z) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.state = 'move';
    this.rig.play('Idle', { fade: 0 });
    this.rig.root.position.copy(this.pos);
  }

  get busy() { return this.state !== 'move'; }
  get alive() { return this.state !== 'dead'; }

  startAttack(combo) {
    const w = WEAPONS[this.weapon];
    this.state = 'attack';
    this.t = 0;
    this.combo = combo;
    this.queued = false;
    this.hitDone = false;
    const clip = combo % 2 === 0 ? 'Attack' : 'Attack2';
    const speed = 1.35 * w.speed;
    this.atkDur = this.rig.duration(clip) / speed;
    this.hitT = this.atkDur * (clip === 'Attack' ? 0.46 : 0.42);
    this.rig.play(clip, { loop: false, fade: 0.06, speed, restart: true });
    const aim = this.game.input.aimYaw(this.pos);
    if (aim !== null) this.yaw = aim;
    this.game.audio.play(w.speed < 0.85 ? 'heavySwing' : 'swing');
  }

  startRoll(dir) {
    this.state = 'roll';
    this.t = 0;
    this.rollDir = dir.clone();
    this.yaw = Math.atan2(dir.x, dir.z);
    this.iframes = 0.42;
    this.rollCd = 0.65;
    this.rig.play('Roll', { loop: false, fade: 0.05, speed: 1.25, restart: true });
    this.game.audio.play('roll');
    for (let i = 0; i < 10; i++)
      this.game.particles.emit(this.pos.x, 0.2, this.pos.z, { spread: 2.5, vel: [-dir.x * 2, 0.6, -dir.z * 2], color: [0.45, 0.4, 0.35], size: 0.7, sizeEnd: 1.4, life: 0.6, alpha: 0.35 });
  }

  startDrink() {
    this.state = 'drink';
    this.t = 0;
    this.healed = false;
    this.potions--;
    this.rig.play('Drink', { loop: false, fade: 0.1, speed: 1.2, restart: true });
    this.game.audio.play('potion');
  }

  hurt(dmg, from) {
    if (!this.alive || this.iframes > 0 || this.state === 'cutscene' || this.state === 'victory') return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.iframes = 0.55;
    const g = this.game;
    g.audio.play('hurt');
    g.shake(0.35);
    g.ui.hurtFlash();
    g.stats.damageTaken += dmg;
    g.floatText.show(_v.copy(this.pos).setY(2.4), '-' + Math.round(dmg), 'hurt');
    this.rig.flash(0xff3020, 0.2);
    for (let i = 0; i < 12; i++)
      g.particles.emit(this.pos.x, 1.2, this.pos.z, { spread: 5, vel: [0, 2, 0], color: [0.9, 0.08, 0.05], size: 0.25, life: 0.5, gravity: 9 });
    if (from) {
      _v.set(this.pos.x - from.x, 0, this.pos.z - from.z).normalize();
      this.vel.addScaledVector(_v, 6);
    }
    if (this.hp <= 0) {
      this.state = 'dead';
      this.t = 0;
      this.rig.play('Die', { loop: false, fade: 0.1 });
      g.audio.play('death');
      g.onPlayerDeath();
    } else if (this.state === 'move' || this.state === 'drink') {
      this.state = 'hit';
      this.t = 0;
      this.rig.play('Hit', { loop: false, fade: 0.05, speed: 1.4, restart: true });
    }
    return true;
  }

  heal(n) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    const g = this.game;
    g.floatText.show(_v.copy(this.pos).setY(2.6), '+' + Math.round(this.hp - before), 'heal');
    for (let i = 0; i < 30; i++)
      g.particles.emit(this.pos.x + (Math.random() - 0.5) * 1.2, 0.3 + Math.random() * 1.5, this.pos.z + (Math.random() - 0.5) * 1.2,
        { vel: [0, 2.2, 0], spread: 0.4, color: [0.4, 1, 0.5], size: 0.28, life: 1 });
  }

  update(dt) {
    const g = this.game, inp = g.input, w = WEAPONS[this.weapon];
    this.t += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.rollCd = Math.max(0, this.rollCd - dt);
    const mv = inp.moveDir();
    const speed = 8.8;
    let desired = null;

    switch (this.state) {
      case 'dead':
      case 'cutscene':
      case 'victory':
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 8));
        break;
      case 'roll': {
        const k = Math.min(1, this.t / 0.5);
        this.vel.copy(this.rollDir).multiplyScalar(17.5 * (1 - k * 0.65));
        if (this.t >= 0.5) { this.state = 'move'; }
        break;
      }
      case 'attack': {
        const lunge = this.t < this.atkDur * 0.4 ? 3.2 : 0;
        _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        desired = _v2.copy(_v).multiplyScalar(lunge).addScaledVector(mv, 1.8);
        if (!this.hitDone && this.t >= this.hitT) {
          this.hitDone = true;
          g.playerStrike(this.combo);
        }
        if (inp.attackHeld && this.t > this.atkDur * 0.25) this.queued = true;
        if (inp.consumeRoll() && this.t > this.hitT && this.rollCd <= 0) {
          this.startRoll(mv.lengthSq() > 0 ? mv : _v.clone());
          break;
        }
        if (this.queued && this.t >= this.atkDur * 0.68) this.startAttack(this.combo + 1);
        else if (this.t >= this.atkDur) { this.state = 'move'; this.combo = 0; }
        break;
      }
      case 'drink':
        desired = _v2.copy(mv).multiplyScalar(2);
        if (!this.healed && this.t > 0.4) { this.healed = true; this.heal(45); }
        if (this.t >= 0.7) this.state = 'move';
        break;
      case 'hit':
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 10));
        if (this.t >= 0.28) this.state = 'move';
        break;
      case 'move': {
        desired = _v2.copy(mv).multiplyScalar(speed);
        if (mv.lengthSq() > 0) {
          this.yaw = turnTo(this.yaw, Math.atan2(mv.x, mv.z), dt * 14);
          this.rig.play('Run', { speed: 1.15 });
        } else this.rig.play('Idle', { fade: 0.2 });
        if (inp.consumeRoll() && this.rollCd <= 0) {
          this.startRoll(mv.lengthSq() > 0 ? mv : new V(Math.sin(this.yaw), 0, Math.cos(this.yaw)));
        } else if (inp.attackHeld) this.startAttack(0);
        else if (inp.consumeDrink()) {
          if (this.potions > 0 && this.hp < this.maxHp) this.startDrink();
          else g.ui.toast(this.potions <= 0 ? "Plus de potion !" : 'Santé déjà au maximum', 'warn');
        }
        break;
      }
    }
    if (desired) this.vel.lerp(desired, Math.min(1, dt * 14));
    this.pos.addScaledVector(this.vel, dt);
    g.world.moveCircle(this.pos, this.radius);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    // clignote pendant l'invulnérabilité après un coup
    this.rig.root.visible = !(this.iframes > 0 && this.state !== 'roll' && this.alive && Math.floor(this.iframes * 20) % 2 === 0);
    this.rig.update(dt);

    // traînée de l'arme
    const wm = this.weaponMeshes[this.weapon];
    const swinging = this.state === 'attack' && this.t > this.atkDur * 0.15 && this.t < this.atkDur * 0.7;
    wm.updateWorldMatrix(true, false);
    this.trail.push(_v.set(0, 0.3, 0).applyMatrix4(wm.matrixWorld), _v2.set(0, TIP[this.weapon], 0).applyMatrix4(wm.matrixWorld), swinging);
    if (this.weapon === 'flame' && Math.random() < dt * 30) {
      _v.set(0, 0.3 + Math.random() * 0.9, 0).applyMatrix4(wm.matrixWorld);
      g.particles.emit(_v.x, _v.y, _v.z, { vel: [0, 1.2, 0], spread: 0.4, color: [1, 0.45, 0.1], size: 0.3, life: 0.45 });
    }
  }
}

// ---------------------------------------------------------------------------
// Squelettes
// ---------------------------------------------------------------------------
let ENEMY_ID = 0;

export class Enemy {
  constructor(game, kind, x, z, opts = {}) {
    this.id = ENEMY_ID++;
    this.game = game;
    this.kind = kind;
    this.cfg = ENEMIES[kind];
    const cfg = this.cfg;
    const A = game.assets.models;
    this.rig = new Rig(A.skeleton, true);
    const wpn = A[cfg.weapon].scene.clone();
    if (cfg.weapon === 'a_bow') this.rig.attach(wpn, 'hand_L', BASIS.bow, new V(0, -0.06, 0));
    else this.rig.attach(wpn, 'hand_R', BASIS.blade, new V(0, -0.06, 0));
    if (cfg.shield) this.rig.attach(A.a_shield.scene.clone(), 'forearm_L', BASIS.ident, new V(0.08, -0.12, 0.1));
    if (cfg.helmet) this.rig.attach(A.a_helmet.scene.clone(), 'head', BASIS.ident, new V(0, 0.21, 0));
    if (cfg.crown) this.rig.attach(A.a_crown.scene.clone(), 'head', BASIS.ident, new V(0, 0.33, 0));
    if (cfg.boss || kind === 'champion') {
      const col = cfg.boss ? new THREE.Color(1, 0.12, 0.04) : new THREE.Color(1, 0.55, 0.1);
      for (const it of this.rig.materials) if (it.m.name === 'OeilSpectral') { it.m.emissive.copy(col); it.e.copy(col); it.m.color.copy(col); }
    }
    if (cfg.boss) {
      for (const it of this.rig.materials) if (it.m.name === 'Os') { it.m.color.setRGB(0.55, 0.5, 0.46); }
      this.aura = new THREE.PointLight(0xff2a10, 25, 12, 1.6);
      this.aura.position.set(0, 3.2, 0.5);
      this.rig.root.add(this.aura);
    }
    this.scale = cfg.scale;
    this.rig.root.scale.setScalar(cfg.scale);
    this.radius = 0.5 * cfg.scale + 0.1;
    this.maxHp = this.hp = cfg.hp;
    this.pos = new V(x, 0, z);
    this.vel = new V();
    this.spawn = { x, z };
    this.zone = game.world.zoneAt(x, z);
    this.dormant = !!opts.dormant;
    this.summoned = !!opts.summoned;
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.cd = 0.5 + Math.random();
    this.burn = 0;
    this.stunned = 0;
    this.state = this.dormant ? 'dormant' : 'idle';
    this.t = 0;
    this.rig.root.visible = !this.dormant;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    this.rig.play('Idle', { fade: 0 });
    this.rig.mixer.setTime(Math.random() * 2);
    game.scene.add(this.rig.root);
  }

  get alive() { return this.state !== 'dead'; }
  get targetable() { return this.alive && this.state !== 'dormant' && this.state !== 'rise' && this.state !== 'sleep'; }
  get active() { return this.alive && this.state !== 'dormant' && this.state !== 'sleep' && this.state !== 'idle'; }

  rise() {
    this.state = 'rise';
    this.t = 0;
    this.rig.root.visible = true;
    const dur = this.rig.duration('Rise');
    this.riseDur = dur / 1.1;
    this.rig.play('Rise', { loop: false, fade: 0, speed: 1.1, restart: true });
    const g = this.game;
    if (!g.zoneAwake[this.zone]) g.zoneAwake[this.zone] = g.time;
    g.audio.play('rise');
    _v.set(g.player.pos.x - this.pos.x, 0, g.player.pos.z - this.pos.z);
    this.yaw = Math.atan2(_v.x, _v.z);
    for (let i = 0; i < 25; i++)
      g.particles.emit(this.pos.x, 0.2, this.pos.z, { spread: 4, vel: [0, 1.2, 0], color: [0.4, 0.36, 0.3], size: 0.8, sizeEnd: 1.8, life: 1.2, alpha: 0.4 });
    g.particles.burst(this.pos.x, 0.3, this.pos.z, 15, { spread: 3, vel: [0, 2, 0], color: [0.2, 1, 0.5], size: 0.25, life: 1 });
  }

  aggro() {
    if (this.state !== 'idle') return;
    this.state = 'chase';
    this.t = 0;
    // alerte les alliés proches
    for (const e of this.game.enemies)
      if (e !== this && e.state === 'idle' && e.zone === this.zone && e.pos.distanceTo(this.pos) < 12) e.aggroSoon = 0.2 + Math.random() * 0.4;
  }

  startAttack(name = 'Attack', speed = 1) {
    this.state = 'attack';
    this.move = name;
    this.t = 0;
    this.hitDone = false;
    this.atkDur = this.rig.duration(name) / speed;
    this.hitT = this.atkDur * (name === 'Slam' ? 0.52 : name === 'Shoot' ? 0.68 : name === 'Roar' ? 0.35 : 0.54);
    this.rig.play(name, { loop: false, fade: 0.1, speed, restart: true });
  }

  takeDamage(dmg, opts = {}) {
    if (!this.targetable) return 0;
    const g = this.game;
    let blocked = false;
    if (this.cfg.armored && !opts.blunt && opts.from) {
      _v.set(opts.from.x - this.pos.x, 0, opts.from.z - this.pos.z);
      const front = Math.abs(angleDiff(Math.atan2(_v.x, _v.z), this.yaw)) < Math.PI / 3;
      if (front && this.cfg.shield) { dmg *= 0.35; blocked = true; }
      else if (!this.cfg.shield) dmg *= 0.75;
    }
    if (this.cfg.armored && opts.blunt) dmg *= 1.3;
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    this.aggroSoon = 0;
    if (this.state === 'idle') this.aggro();
    g.floatText.show(_v.copy(this.pos).setY(2.2 * this.scale), (blocked ? '🛡 ' : '') + dmg + (opts.crit ? ' !' : ''),
      blocked ? 'blocked' : opts.crit ? 'crit' : '');
    this.rig.flash(blocked ? 0x88aaff : 0xffffff, 0.14);
    g.audio.play(blocked ? 'clang' : 'hit');
    const hy = 1.3 * this.scale;
    g.particles.burst(this.pos.x, hy, this.pos.z, blocked ? 14 : 10, {
      spread: 6, vel: [0, 2, 0], color: blocked ? [0.7, 0.8, 1] : [1, 0.85, 0.55], size: 0.22, life: 0.35, gravity: 10,
    });
    g.debris.spawn(this.pos.x, hy - 0.6, this.pos.z, blocked ? 0 : 2, 0.6);
    if (this.hp <= 0) { this.die(opts); return dmg; }
    // recul + étourdissement (pas pour les élites)
    if (opts.from) {
      _v.set(this.pos.x - opts.from.x, 0, this.pos.z - opts.from.z).normalize();
      const k = (opts.knock || 3) * (this.cfg.elite ? 0.15 : blocked ? 0.4 : 1);
      this.vel.addScaledVector(_v, k);
    }
    if (!this.cfg.elite && !blocked && this.state !== 'shootRelease') {
      this.state = 'hit';
      this.t = 0;
      this.stagger = opts.stun ? 1.1 : 0.32;
      this.rig.play('Hit', { loop: false, fade: 0.05, speed: 1.3, restart: true });
    }
    return dmg;
  }

  die(opts = {}) {
    const g = this.game;
    this.state = 'dead';
    this.t = 0;
    this.hp = 0;
    this.rig.play('Die', { loop: false, fade: 0.08, speed: 1.1 });
    g.audio.play('bones');
    g.debris.spawn(this.pos.x, 1.0 * this.scale, this.pos.z, Math.round(10 * this.scale), 1.1);
    g.particles.burst(this.pos.x, 1.4 * this.scale, this.pos.z, 25, {
      spread: 5, vel: [0, 2, 0], color: this.cfg.boss ? [1, 0.2, 0.05] : [0.2, 1, 0.55], size: 0.35, life: 0.9,
    });
    if (opts.burn || this.burn > 0)
      g.particles.burst(this.pos.x, 1, this.pos.z, 30, { spread: 4, vel: [0, 3, 0], color: [1, 0.45, 0.1], size: 0.5, life: 0.8 });
    g.onEnemyKilled(this);
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.t += dt;
    this.cd -= dt;
    if (this.state === 'dormant' || this.state === 'sleep') {
      if (this.state === 'dormant') {
        const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
        if ((d < 12 && g.player.alive) || (g.zoneAwake[this.zone] && g.time - g.zoneAwake[this.zone] > this.wakeDelay)) this.rise();
      } else this.rig.update(dt);
      return;
    }
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toYaw = Math.atan2(dx, dz);
    let desired = null;
    // Ennemis lointains et inactifs : ni rendus ni animés (performances)
    const far = dist > 48 && this.state === 'idle';
    this.rig.root.visible = !far;
    if (far) return;

    if (this.burn > 0 && this.alive) {
      this.burn -= dt;
      this.burnTick = (this.burnTick || 0) - dt;
      if (Math.random() < dt * 25)
        g.particles.emit(this.pos.x + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 1.5 * this.scale, this.pos.z + (Math.random() - 0.5) * 0.6,
          { vel: [0, 2, 0], spread: 0.5, color: [1, 0.4, 0.08], size: 0.4, life: 0.5 });
      if (this.burnTick <= 0) {
        this.burnTick = 0.5;
        this.hp -= 4;
        g.floatText.show(_v.copy(this.pos).setY(2.2 * this.scale), '4', 'burn');
        if (this.hp <= 0) { this.die({ burn: true }); }
      }
    }

    switch (this.state) {
      case 'rise':
        if (this.t >= this.riseDur) { this.state = 'chase'; this.t = 0; }
        break;
      case 'idle':
        if (this.aggroSoon > 0) { this.aggroSoon -= dt; if (this.aggroSoon <= 0) this.aggro(); }
        if (p.alive && dist < 13 && g.world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) this.aggro();
        this.rig.play('Idle');
        break;
      case 'hit':
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 8));
        if (this.t >= this.stagger) { this.state = 'chase'; this.t = 0; this.cd = Math.max(this.cd, 0.3); }
        break;
      case 'attack':
        if (this.t < this.hitT * 0.8 && this.move !== 'Shoot') this.yaw = turnTo(this.yaw, toYaw, dt * (this.cfg.elite ? 3.5 : 6));
        if (this.move === 'Shoot') this.yaw = turnTo(this.yaw, toYaw, dt * 8);
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 10));
        if (!this.hitDone && this.t >= this.hitT) { this.hitDone = true; this.strike(dist, toYaw); }
        if (this.t >= this.atkDur) {
          this.state = 'chase';
          this.t = 0;
          this.cd = this.cfg.ranged ? 1.6 + Math.random() * 1.2 : this.cfg.elite ? 0.6 + Math.random() * 0.8 : 0.9 + Math.random() * 0.9;
        }
        break;
      case 'chase': {
        if (!p.alive) { this.state = 'idle'; break; }
        const sees = dist < 22 && g.world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
        if (this.chooseAction(dist, sees)) break;
        let dir = _v2;
        let spd = this.cfg.speed;
        if (this.cfg.ranged && sees && dist < 6.5) {
          dir.set(-dx, 0, -dz).normalize();       // l'archer recule
          spd *= 0.9;
        } else if (this.cfg.ranged && sees && dist < 12) {
          dir.set(-dz, 0, dx).normalize().multiplyScalar(Math.sin(this.id + g.time * 0.7) > 0 ? 0.35 : -0.35);
        } else if (sees && dist < 8) dir.set(dx, 0, dz).normalize();
        else if (!g.world.flowDir(this.pos.x, this.pos.z, dir)) dir.set(dx, 0, dz).normalize();
        // séparation entre ennemis
        for (const o of g.enemies) {
          if (o === this || !o.active) continue;
          const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
          const od = Math.hypot(ox, oz), m = this.radius + o.radius + 0.4;
          if (od < m && od > 1e-3) { dir.x += ox / od * (m - od) * 0.8; dir.z += oz / od * (m - od) * 0.8; }
        }
        const meleeStop = !this.cfg.ranged && dist < this.cfg.range * 0.8 + p.radius;
        if (meleeStop) dir.set(0, 0, 0);
        desired = dir.multiplyScalar(spd * (this.enraged ? 1.3 : 1));
        if (desired.lengthSq() > 0.01) {
          const faceYaw = this.cfg.ranged && sees && dist < 12 ? toYaw : Math.atan2(desired.x, desired.z);
          this.yaw = turnTo(this.yaw, faceYaw, dt * 6);
          this.rig.play('Walk', { speed: spd / 2.2, fade: 0.2 });
        } else {
          this.yaw = turnTo(this.yaw, toYaw, dt * 6);
          this.rig.play('Idle', { fade: 0.2 });
        }
        break;
      }
      case 'dead':
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
        if (this.t > 2.2) this.rig.root.position.y -= dt * 0.8;
        if (this.t > 3.5) this.removeMe = true;
        break;
    }
    if (desired) this.vel.lerp(desired, Math.min(1, dt * 8));
    if (this.state !== 'rise') {
      this.pos.addScaledVector(this.vel, dt);
      g.world.moveCircle(this.pos, this.radius);
    }
    this.rig.root.position.x = this.pos.x;
    this.rig.root.position.z = this.pos.z;
    this.rig.root.rotation.y = this.yaw;
    this.rig.update(dt);
  }

  // Choisit une attaque ; retourne true si une action a démarré.
  chooseAction(dist, sees) {
    if (this.cd > 0 || !sees) return false;
    if (this.cfg.ranged) {
      if (dist < 14) { this.startAttack('Shoot', 1.0); this.game.audio.play('bow'); return true; }
      return false;
    }
    if (this.kind === 'champion') {
      if (dist < 4.8 && Math.random() < 0.6) { this.startAttack('Attack', 0.85); return true; }
      if (dist < 7.5) { this.startAttack('Slam', 0.85); this.warn = this.game.rings.add(this.pos.x, this.pos.z, { mode: 'warn', r1: 6, dur: this.atkDur * 0.52, color: 0xff5020 }); return true; }
      return false;
    }
    if (dist < this.cfg.range + this.game.player.radius + 0.2) {
      this.startAttack('Attack', this.kind === 'knight' ? 0.9 : 1.0);
      return true;
    }
    return false;
  }

  strike(dist, toYaw) {
    const g = this.game, p = g.player;
    if (this.move === 'Shoot') {
      _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const from = new V(this.pos.x + _v.x * 0.8, 1.8, this.pos.z + _v.z * 0.8);
      // vise légèrement devant le joueur
      const tgt = new V(p.pos.x + p.vel.x * 0.25, 1.8, p.pos.z + p.vel.z * 0.25);
      g.spawnProjectile('arrow', from, tgt.sub(from).setY(0).normalize(), this.cfg.dmg, 19);
      g.audio.play('arrow');
      return;
    }
    if (this.move === 'Slam') {
      const R = this.kind === 'champion' ? 6 : 8;
      g.rings.add(this.pos.x, this.pos.z, { r0: 0.5, r1: R + 1, dur: 0.5, color: 0xff7030 });
      g.particles.burst(this.pos.x, 0.3, this.pos.z, 50, { spread: 12, vel: [0, 2, 0], color: [0.5, 0.42, 0.35], size: 1, sizeEnd: 2, life: 0.9, alpha: 0.45, drag: 3 });
      g.debris.spawn(this.pos.x, 0.2, this.pos.z, 8, 1.4);
      g.audio.play('slam');
      g.shake(0.7);
      if (dist < R + p.radius) p.hurt(this.cfg.dmg * 1.15, this.pos);
      return;
    }
    const arc = this.cfg.elite ? Math.PI * 0.8 : Math.PI * 0.6;
    const reach = this.cfg.range + p.radius + 0.35;
    if (dist < reach && Math.abs(angleDiff(toYaw, this.yaw)) < arc) p.hurt(this.cfg.dmg, this.pos);
    g.audio.play(this.cfg.elite ? 'heavySwing' : 'swing');
  }

  dispose() {
    this.game.scene.remove(this.rig.root);
    this.rig.mixer.stopAllAction();
  }

  resetToSpawn() {
    this.pos.set(this.spawn.x, 0, this.spawn.z);
    this.vel.set(0, 0, 0);
    this.state = this.dormant ? 'dormant' : 'idle';
    this.rig.root.visible = !this.dormant;
    this.burn = 0;
    this.aggroSoon = 0;
    this.rig.play('Idle', { fade: 0 });
  }
}

// ---------------------------------------------------------------------------
// Morvath, le Roi-Squelette
// ---------------------------------------------------------------------------
export class Boss extends Enemy {
  constructor(game, x, z) {
    super(game, 'boss', x, z, { yaw: Math.PI });
    this.state = 'sleep';
    this.phase = 1;
    this.summons = [0.75, 0.5, 0.25];
    this.volleyCd = 4;
    this.arena = { x, z };
  }

  get targetable() { return this.alive && this.state !== 'sleep' && this.state !== 'intro'; }

  wake() {
    this.state = 'intro';
    this.t = 0;
    this.startAttack('Roar', 0.8);
    this.state = 'intro';
    this.game.audio.play('roar');
    this.game.shake(0.6);
  }

  update(dt) {
    if (this.state === 'intro') {
      this.t += dt;
      this.rig.update(dt);
      if (this.t > this.atkDur) { this.state = 'chase'; this.t = 0; this.cd = 1; }
      return;
    }
    if (this.alive && this.state !== 'sleep') {
      this.volleyCd -= dt;
      const ratio = this.hp / this.maxHp;
      if (this.phase === 1 && ratio < 0.5 && this.state !== 'attack') {
        this.phase = 2;
        this.enraged = true;
        this.game.onBossPhase2();
        this.startAttack('Roar', 0.9);
        this.game.audio.play('roar');
        this.summonPending = 5;
      } else if (this.summons.length && ratio < this.summons[0] && this.state !== 'attack') {
        this.summons.shift();
        this.startAttack('Roar', 1.0);
        this.game.audio.play('roar');
        this.summonPending = this.phase === 2 ? 4 : 3;
      }
    }
    super.update(dt);
    if (this.aura) this.aura.intensity = 20 + Math.sin(this.game.time * 4) * 8 + (this.enraged ? 15 : 0);
  }

  chooseAction(dist, sees) {
    if (this.cd > 0) return false;
    const sp = this.enraged ? 1.15 : 0.9;
    if (this.phase === 2 && this.volleyCd <= 0 && dist > 5) {
      this.volleyCd = 5 + Math.random() * 2;
      this.startAttack('Shoot', 1.1);
      return true;
    }
    if (dist < 6.2 && Math.random() < 0.6) { this.startAttack('Attack', sp); return true; }
    if (dist < 10.5) {
      this.startAttack('Slam', sp * 0.9);
      this.game.rings.add(this.pos.x, this.pos.z, { mode: 'warn', r1: 8, dur: this.hitT, color: 0xff2a10 });
      return true;
    }
    if (dist > 12 && this.volleyCd <= 0) {
      this.volleyCd = 6;
      this.startAttack('Shoot', 1.0);
      return true;
    }
    return false;
  }

  strike(dist, toYaw) {
    const g = this.game;
    if (this.move === 'Roar') {
      g.shake(0.5);
      g.rings.add(this.pos.x, this.pos.z, { r0: 1, r1: 14, dur: 0.8, color: 0xff3010 });
      const alive = g.enemies.filter(e => e.summoned && e.alive).length;
      const n = Math.min(this.summonPending || 0, 7 - alive);
      this.summonPending = 0;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random();
        const r = 9 + Math.random() * 5;
        let x = this.arena.x + Math.cos(a) * r, z = this.arena.z + Math.sin(a) * r;
        if (!g.world.walkableAt(x, z)) { x = this.arena.x + Math.cos(a) * 5; z = this.arena.z + Math.sin(a) * 5; }
        g.spawnEnemy(i % 3 === 2 && this.phase === 2 ? 'archer' : 'warrior', x, z, { dormant: true, summoned: true }).rise();
      }
      return;
    }
    if (this.move === 'Shoot') {
      const n = this.phase === 2 ? 9 : 7;
      for (let i = 0; i < n; i++) {
        const a = toYaw + (i - (n - 1) / 2) * 0.17;
        const from = new V(this.pos.x + Math.sin(a) * 2, 2.2, this.pos.z + Math.cos(a) * 2);
        g.spawnProjectile('orb', from, new V(Math.sin(a), 0, Math.cos(a)), 13, 10.5);
      }
      g.audio.play('fire');
      return;
    }
    super.strike(dist, toYaw);
  }
}

// ---------------------------------------------------------------------------
// Projectiles (flèches, orbes)
// ---------------------------------------------------------------------------
export class Projectile {
  constructor(game, kind, pos, dir, dmg, speed) {
    this.game = game;
    this.kind = kind;
    this.pos = pos.clone();
    this.dir = dir.clone();
    this.dmg = dmg;
    this.speed = speed;
    this.life = 4;
    if (kind === 'arrow') {
      this.mesh = game.assets.models.a_arrow.scene.clone();
      this.mesh.scale.setScalar(1.3);
      this.mesh.quaternion.setFromUnitVectors(new V(0, 1, 0), dir);
    } else {
      this.mesh = new THREE.Sprite(new THREE.SpriteMaterial({
        map: game.world.glowTex, color: 0xff3018, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      }));
      this.mesh.scale.setScalar(1.4);
    }
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.life -= dt;
    this.pos.addScaledVector(this.dir, this.speed * dt);
    this.mesh.position.copy(this.pos);
    if (this.kind === 'orb' && Math.random() < dt * 40)
      g.particles.emit(this.pos.x, this.pos.y, this.pos.z, { spread: 0.5, color: [1, 0.25, 0.08], size: 0.5, sizeEnd: 0, life: 0.35 });
    if (this.life <= 0) return false;
    if (!g.world.walkableAt(this.pos.x, this.pos.z)) {
      g.particles.burst(this.pos.x, this.pos.y, this.pos.z, 8, { spread: 3, color: this.kind === 'orb' ? [1, 0.3, 0.1] : [0.6, 0.55, 0.5], size: 0.3, life: 0.4 });
      return false;
    }
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    if (d < p.radius + 0.25 && p.alive) {
      if (p.iframes > 0 && p.state === 'roll') return true;   // esquivé !
      if (p.hurt(this.dmg, this.pos)) {
        g.particles.burst(this.pos.x, this.pos.y, this.pos.z, 10, { spread: 4, color: [1, 0.3, 0.1], size: 0.3, life: 0.4 });
        return false;
      }
    }
    return true;
  }

  dispose() {
    this.game.scene.remove(this.mesh);
    if (this.kind === 'orb') this.mesh.material.dispose();
  }
}
