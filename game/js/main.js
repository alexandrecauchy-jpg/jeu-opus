// Le Donjon des Os — boucle principale du jeu.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TILE, ENTITIES, PLAYER_START, WEAPONS, WEAPON_ORDER, STORY, NOTES, ZONE_INFO } from './data.js';
import { World, toTile } from './world.js';
import { Player, Enemy, Boss, Projectile, Rig } from './actors.js';
import { Particles, Debris, Rings, FloatText } from './fx.js';
import { Loot } from './loot.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';

const ASSETS = [
  'hero', 'skeleton', 'princess', 'w_rusty', 'w_knight', 'w_mace', 'w_axe', 'w_spear', 'w_hammer', 'w_flame', 'w_boss',
  'a_shield', 'a_bow', 'a_helmet', 'a_crown', 'a_arrow', 'chest', 'gate', 'cage', 'torch', 'pillar', 'barrel', 'crate',
  'bones', 'throne', 'coin', 'potion', 'heart', 'key', 'banner', 'brazier', 'candles', 'rubble', 'spikes',
];
const $ = id => document.getElementById(id);
const _v = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Entrées clavier / souris (event.code : fonctionne en QWERTY et AZERTY)
// ---------------------------------------------------------------------------
class Input {
  constructor(game) {
    this.game = game;
    this.keys = new Set();
    this.mouse = new THREE.Vector2();
    this.attackHeld = false;
    this.flags = {};
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
    this.dir = new THREE.Vector3();
    this.mouseSeen = false;
    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.game.onKey(e.code, e);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.attackHeld = false; });
    const cv = game.renderer.domElement;
    addEventListener('mousemove', e => {
      this.mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.mouseSeen = true;
    });
    cv.addEventListener('mousedown', e => {
      this.game.audio.resume();
      if (e.button === 0) this.attackHeld = true;
      if (e.button === 2) this.flags.roll = true;
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.attackHeld = false; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => this.game.cycleWeapon(Math.sign(e.deltaY)), { passive: true });
  }

  moveDir() {
    const k = this.keys;
    let x = 0, z = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) z -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    return this.dir.set(x, 0, z).normalize();
  }

  aimYaw(from) {
    if (!this.mouseSeen) return null;
    this.ray.setFromCamera(this.mouse, this.game.camera);
    const hit = this.ray.ray.intersectPlane(this.plane, _v);
    if (!hit) return null;
    return Math.atan2(hit.x - from.x, hit.z - from.z);
  }

  consume(f) { const v = !!this.flags[f]; this.flags[f] = false; return v; }
  consumeRoll() { return this.consume('roll'); }
  consumeDrink() { return this.consume('drink'); }
  consumeInteract() { return this.consume('interact'); }
}

// ---------------------------------------------------------------------------
class Game {
  constructor() {
    this.state = 'loading';
    this.time = 0;
    this.tasks = [];
    this.shakeAmt = 0;
    this.hitstop = 0;
    this.timeScale = 1;
  }

  async init() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    $('game').appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x030305);
    this.scene.fog = new THREE.FogExp2(0x050408, 0.016);
    this.camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.5, 200);
    this.camOffset = new THREE.Vector3(0, 14, 10.5);
    this.camTarget = new THREE.Vector3();

    this.scene.add(new THREE.AmbientLight(0x6a78b0, 0.55));
    this.scene.add(new THREE.HemisphereLight(0x8a96c8, 0x2a1a10, 0.6));
    const spot = this.spot = new THREE.SpotLight(0xffe2b8, 190, 45, 0.85, 0.8, 1.5);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.camera.near = 3;
    spot.shadow.camera.far = 40;
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.04;
    this.scene.add(spot, spot.target);

    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      r.setSize(innerWidth, innerHeight);
      this.composer.setSize(innerWidth, innerHeight);
      this.particles.mat.uniforms.uScale.value = innerHeight * 0.9;
    });

    // Chargement des modèles Blender
    const loader = new GLTFLoader();
    this.assets = { models: {} };
    let done = 0;
    await Promise.all(ASSETS.map(n => loader.loadAsync(`assets/${n}.glb`).then(g => {
      this.assets.models[n] = g;
      done++;
      $('load-fill').style.width = (100 * done / ASSETS.length) + '%';
    })));

    this.audio = new Audio();
    this.particles = new Particles(this.scene, 4000, true);
    this.particles.mat.uniforms.uScale.value = innerHeight * 0.9;
    this.rings = new Rings(this.scene);
    this.floatText = new FloatText(this.camera);
    this.world = new World(this);
    this.world.build();
    const boneMat = this.assets.models.bones.scene.getObjectByProperty('type', 'Mesh').material;
    this.debris = new Debris(this.scene, boneMat);
    this.loot = new Loot(this);
    this.ui = new UI(this);
    this.input = new Input(this);
    this.player = new Player(this);
    this.enemies = [];
    this.projectiles = [];
    this.spawns = [];
    for (const [type, x, y, opts] of ENTITIES) {
      const wx = (x + 0.5) * TILE, wz = (y + 0.5) * TILE;
      if (['warrior', 'archer', 'knight', 'champion', 'riser', 'riserArcher', 'boss'].includes(type)) this.spawns.push([type, wx, wz]);
      else this.world.addProp(type, x, y, opts);
    }
    this.chestsTotal = this.world.chests.length;
    // Princesse dans sa cage
    this.princess = new Rig(this.assets.models.princess, false);
    const cb = this.world.cage.userData.base;
    this.princess.root.position.set(cb.x, 0, cb.z);
    this.princess.root.rotation.y = Math.PI * 0.85;
    this.princess.root.scale.setScalar(1.4);
    this.princess.play('Idle', { fade: 0 });
    this.scene.add(this.princess.root);

    this.setupMenus();
    this.state = 'title';
    this.ui.show('loading', false);
    this.ui.show('title-screen');
    // Caméra de présentation pour l'écran titre
    this.player.spawnAt((PLAYER_START[0]) * TILE, PLAYER_START[1] * TILE);
    this.renderer.compile(this.scene, this.camera);
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setupMenus() {
    $('btn-start').onclick = () => this.newGame();
    $('btn-resume').onclick = () => this.togglePause(false);
    $('btn-restart').onclick = () => { this.togglePause(false); this.newGame(); };
    $('btn-respawn').onclick = () => this.respawn();
    $('btn-again').onclick = () => { this.ui.show('victory-screen', false); this.newGame(); };
    $('volume').oninput = e => this.audio.setVolume(e.target.value / 100);
    const advance = () => { if (this.ui.advance) this.ui.advance(); };
    $('dialog').onclick = advance;
    $('note').onclick = advance;
  }

  // -------------------------------------------------------------------------
  newGame() {
    this.audio.init();
    this.audio.resume();
    this.ui.show('title-screen', false);
    this.ui.show('hud');
    // Réinitialise le monde
    for (const e of this.enemies) e.dispose();
    for (const p of this.projectiles) p.dispose();
    this.enemies = [];
    this.projectiles = [];
    this.loot.clear();
    this.tasks = [];
    for (const [type, x, z] of this.spawns) {
      if (type === 'boss') this.boss = this.spawnEnemy('boss', x, z);
      else if (type === 'riser') this.spawnEnemy('warrior', x, z, { dormant: true });
      else if (type === 'riserArcher') this.spawnEnemy('archer', x, z, { dormant: true });
      else this.spawnEnemy(type, x, z);
    }
    for (const c of this.world.chests) { c.opened = false; c.anim = 0; c.lid.rotation.x = 0; if (c.glow) c.glow.material.opacity = 1; }
    for (const s of this.world.scrolls) s.read = false;
    for (const g of this.world.gates) { g.open = !!g.startOpen; g.target = g.anim = g.startOpen ? 1 : 0; }
    this.world.flowKey = -1;
    this.world.explored.fill(0);
    const cage = this.world.cage;
    cage.position.y = 0;
    if (!this.world.obstacles.includes(this.world.cageObstacle)) this.world.obstacles.push(this.world.cageObstacle);
    const cb = cage.userData.base;
    this.princess.root.position.set(cb.x, 0, cb.z);
    this.princess.root.rotation.y = Math.PI * 0.85;
    this.princess.play('Idle', { fade: 0 });

    this.player.reset();
    this.player.spawnAt(PLAYER_START[0] * TILE, PLAYER_START[1] * TILE);
    this.player.yaw = Math.PI;
    this.checkpoint = { x: this.player.pos.x, z: this.player.pos.z };
    this.maxZone = 1;
    this.zoneAwake = {};
    this.bossStarted = false;
    this.bossIntroSeen = false;
    this.ended = false;
    this.championSeen = false;
    this.stats = { time: 0, kills: 0, chests: 0, chestsTotal: this.chestsTotal, gold: 0, deaths: 0, weapons: 1, damageTaken: 0 };
    this.timeScale = 1;
    this.camOffset.set(0, 14, 10.5);
    this.camGoal = 0;
    this.camFocus = null;
    this.ui.bossBar(false);
    this.ui.refresh();
    this.state = 'play';
    this.audio.startMusic('ambient');
    this.cutscene(async () => {
      await this.ui.dialog(STORY.intro);
      this.ui.zoneTitle(ZONE_INFO[1].name);
      this.updateObjective();
    });
  }

  spawnEnemy(kind, x, z, opts) {
    const e = kind === 'boss' ? new Boss(this, x, z) : new Enemy(this, kind, x, z, opts);
    e.wakeDelay = 2 + Math.random() * 10;
    this.enemies.push(e);
    return e;
  }

  spawnProjectile(kind, pos, dir, dmg, speed) {
    this.projectiles.push(new Projectile(this, kind, pos, dir, dmg, speed));
  }

  later(delay, fn) { this.tasks.push({ t: delay, fn }); }

  // Met le monde en pause pendant une scène (dialogue). Les scènes s'enchaînent sans se chevaucher.
  cutscene(fn) {
    this.cutChain = (this.cutChain || Promise.resolve()).then(async () => {
      this.state = 'dialog';
      this.input.attackHeld = false;
      await fn();
      if (this.state === 'dialog') this.state = 'play';
    }).catch(err => console.error(err));
    return this.cutChain;
  }

  story(key) { this.cutscene(() => this.ui.dialog(STORY[key])); }

  shake(a) { this.shakeAmt = Math.min(1.2, this.shakeAmt + a); }

  // -------------------------------------------------------------------------
  onKey(code, e) {
    if (this.state === 'dialog' || this.state === 'note') {
      if (['KeyE', 'Enter', 'Space', 'Escape'].includes(code)) { e.preventDefault(); if (this.ui.advance) this.ui.advance(); }
      return;
    }
    if (this.state === 'title' && (code === 'Enter' || code === 'Space')) { this.newGame(); return; }
    if (code === 'Escape' || code === 'KeyP') {
      if (this.state === 'play' || this.state === 'pause') this.togglePause(this.state === 'play');
      return;
    }
    if (this.state !== 'play') return;
    if (code === 'Space') { e.preventDefault(); this.input.flags.roll = true; }
    if (code === 'KeyF' || code === 'KeyR') this.input.flags.drink = true;
    if (code === 'KeyE') this.interact();
    if (code === 'KeyM') this.ui.show('minimap-wrap', $('minimap-wrap').classList.contains('hidden'));
    if (code.startsWith('Digit')) {
      const n = parseInt(code.slice(5), 10) - 1;
      const list = WEAPON_ORDER.filter(id => this.player.weapons.includes(id));
      if (list[n]) this.switchWeapon(list[n]);
    }
    if (code === 'Tab') { e.preventDefault(); this.cycleWeapon(1); }
  }

  togglePause(on) {
    this.state = on ? 'pause' : 'play';
    this.ui.show('pause-menu', on);
    this.input.attackHeld = false;
  }

  switchWeapon(id) {
    const p = this.player;
    if (p.weapon === id || p.state === 'attack') return;
    p.equip(id);
    this.audio.play('ui');
    this.ui.refresh();
  }

  cycleWeapon(dir) {
    if (this.state !== 'play') return;
    const list = WEAPON_ORDER.filter(id => this.player.weapons.includes(id));
    const i = list.indexOf(this.player.weapon);
    this.switchWeapon(list[(i + dir + list.length) % list.length]);
  }

  // Objet interactif le plus proche
  findInteractable() {
    const p = this.player.pos;
    let best = null, bd = 3.6;
    for (const c of this.world.chests) {
      if (c.opened) continue;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < bd) { bd = d; best = { kind: 'chest', obj: c, text: c.legendary ? '<kbd>E</kbd> Ouvrir le coffre sacré' : '<kbd>E</kbd> Ouvrir le coffre' }; }
    }
    for (const s of this.world.scrolls) {
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < bd) { bd = d; best = { kind: 'scroll', obj: s, text: '<kbd>E</kbd> Lire' }; }
    }
    const w = this.loot.nearestWeapon(p, Math.min(bd, 3.2));
    if (w) {
      const W = WEAPONS[w.weapon];
      const owned = this.player.weapons.includes(w.weapon);
      best = { kind: 'weapon', obj: w, text: `<kbd>E</kbd> ${owned ? 'Améliorer' : 'Ramasser'} <b class="r-${W.rarity}">${W.name}</b>` };
    }
    return best;
  }

  interact() {
    const it = this.findInteractable();
    if (!it || !this.player.alive || this.player.busy) return;
    if (it.kind === 'chest') this.openChest(it.obj);
    if (it.kind === 'weapon') this.loot.collect(it.obj);
    if (it.kind === 'scroll') {
      it.obj.read = true;
      this.audio.play('page');
      const n = NOTES[it.obj.id];
      this.state = 'note';
      this.ui.note(n.title, n.text).then(() => { this.state = 'play'; });
    }
  }

  openChest(c) {
    c.opened = true;
    this.stats.chests++;
    this.audio.play(c.legendary ? 'legendary' : 'chest');
    this.particles.burst(c.x, 1.2, c.z, c.legendary ? 80 : 40, {
      spread: 4, vel: [0, 4, 0], color: c.legendary ? [1, 0.6, 0.2] : [1, 0.85, 0.4], size: 0.3, life: 1.1, gravity: 3,
    });
    const fx = c.x + c.front[0] * 1.6, fz = c.z + c.front[1] * 1.6;
    this.loot.spawnFromList(c.loot, fx, fz, c.front);
    this.shake(0.1);
  }

  // Coup du joueur : touche les ennemis dans l'arc de l'arme
  playerStrike(combo) {
    const p = this.player, w = WEAPONS[p.weapon];
    const lv = p.levels[p.weapon] || 0;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let hits = 0;
    for (const e of this.enemies) {
      if (!e.targetable) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > w.range + e.radius) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1))));
      if (d > e.radius + 0.6 && ang > (w.arc * Math.PI / 360)) continue;
      const crit = Math.random() < 0.12;
      let dmg = w.dmg * (1 + 0.15 * lv) * (combo % 3 === 2 ? 1.4 : 1) * (crit ? 1.8 : 1) * (0.9 + Math.random() * 0.2);
      e.takeDamage(dmg, { from: p.pos, blunt: w.blunt, knock: w.knock, crit, stun: w.shock && Math.random() < 0.5 });
      if (w.burn && e.alive) e.burn = 3;
      hits++;
    }
    const tipX = p.pos.x + fx * w.range * 0.8, tipZ = p.pos.z + fz * w.range * 0.8;
    if (w.shock) {
      this.rings.add(tipX, tipZ, { r0: 0.3, r1: 3.2, dur: 0.4, color: 0x40c8ff });
      this.particles.burst(tipX, 0.2, tipZ, 20, { spread: 7, vel: [0, 1, 0], color: [0.3, 0.8, 1], size: 0.35, life: 0.5, drag: 4 });
      this.shake(0.3);
    }
    if (w.burn) this.particles.burst(tipX, 1, tipZ, 25, { spread: 5, vel: [0, 2.5, 0], color: [1, 0.45, 0.1], size: 0.45, life: 0.5 });
    if (hits) {
      this.hitstop = 0.055;
      this.shake(0.12 + hits * 0.05);
    }
  }

  onEnemyKilled(e) {
    this.stats.kills++;
    this.loot.dropFromEnemy(e);
    if (e.kind === 'champion') {
      this.loot.spawn('key', e.pos.x, e.pos.z, { key: 'king' });
      this.ui.toast('Le Champion squelette est vaincu !', 'gold');
    }
    if (e.cfg.boss) this.onBossDeath();
    this.updateObjective();
  }

  onBossPhase2() {
    this.story('bossPhase2');
    this.bloom.strength = 1.0;
  }

  onBossDeath() {
    this.ended = true;
    this.timeScale = 0.25;
    this.audio.stopMusic();
    this.ui.bossBar(false);
    const b = this.boss;
    for (let i = 0; i < 6; i++) this.later(i * 0.15, () => {
      this.particles.burst(b.pos.x, 2 + Math.random() * 2, b.pos.z, 60, { spread: 12, vel: [0, 3, 0], color: [1, 0.35, 0.1], size: 0.6, life: 1.2 });
      this.debris.spawn(b.pos.x, 2, b.pos.z, 10, 1.6);
      this.shake(0.4);
    });
    for (const e of this.enemies) if (e !== b && e.alive && e.targetable) e.die({});
    this.later(0.9, async () => {
      this.timeScale = 1;
      await this.cutscene(() => this.ui.dialog(STORY.bossDeath));
      this.world.setGate(5, true);
      this.releasePrincess();
    });
  }

  releasePrincess() {
    this.audio.play('gate');
    this.cageLift = 0;
    this.world.obstacles = this.world.obstacles.filter(o => o !== this.world.cageObstacle);
    this.player.state = 'cutscene';
    this.player.rig.play('Idle');
    this.princessWalk = true;
    this.audio.startMusic('ambient');
  }

  updateEnding(dt) {
    const cage = this.world.cage;
    if (this.cageLift !== undefined && this.cageLift < 1) {
      this.cageLift = Math.min(1, this.cageLift + dt / 2.5);
      cage.position.y = this.cageLift * this.cageLift * 9;
      return;
    }
    if (!this.princessWalk) return;
    const pr = this.princess.root, p = this.player;
    const dx = p.pos.x - pr.position.x, dz = p.pos.z - pr.position.z, d = Math.hypot(dx, dz);
    pr.rotation.y = Math.atan2(dx, dz);
    p.yaw = Math.atan2(-dx, -dz);
    if (d > 2.6) {
      this.princess.play('Walk', { speed: 2 });
      pr.position.x += dx / d * dt * 5.5;
      pr.position.z += dz / d * dt * 5.5;
    } else {
      this.princessWalk = false;
      this.princess.play('Idle');
      this.camFocus = { x: (p.pos.x + pr.position.x) / 2, z: (p.pos.z + pr.position.z) / 2 - 2.5 };
      this.cutscene(async () => {
        await this.ui.dialog(STORY.ending);
        this.player.state = 'victory';
        this.player.rig.play('Victory', { fade: 0.3 });
        this.princess.play('Cheer', { fade: 0.3 });
        this.audio.play('victory');
        this.camGoal = 1;
        for (let i = 0; i < 12; i++) this.later(i * 0.25, () => {
          const a = Math.random() * 6.28;
          this.particles.burst(p.pos.x + Math.cos(a) * 3, 3 + Math.random() * 2, p.pos.z + Math.sin(a) * 3, 40,
            { spread: 6, vel: [0, 1, 0], color: [[1, 0.8, 0.3], [0.5, 0.8, 1], [1, 0.5, 0.8]][i % 3], size: 0.35, life: 1.4, gravity: 2 });
        });
        this.later(4.5, () => { this.state = 'victory'; this.ui.show('hud', false); this.ui.victory(this.stats); });
      });
    }
  }

  onPlayerDeath() {
    this.stats.deaths++;
    this.input.attackHeld = false;
    this.later(2.2, () => {
      this.state = 'dead';
      this.ui.show('death-screen');
    });
  }

  respawn() {
    this.ui.show('death-screen', false);
    const p = this.player;
    p.hp = p.maxHp;
    p.potions = Math.max(p.potions, 1);
    p.iframes = 1.5;
    p.spawnAt(this.checkpoint.x, this.checkpoint.z);
    for (const pr of this.projectiles) pr.dispose();
    this.projectiles = [];
    for (const e of this.enemies) {
      if (e.summoned) { e.state = 'dead'; e.removeMe = true; continue; }
      if (e.alive) e.resetToSpawn();
    }
    if (this.bossStarted && this.boss.alive) {
      const b = this.boss;
      b.hp = b.maxHp; b.phase = 1; b.enraged = false; b.summons = [0.75, 0.5, 0.25]; b.volleyCd = 4;
      b.resetToSpawn();
      b.state = 'sleep';
      b.yaw = Math.PI;
      this.bossStarted = false;
      this.world.setGate(5, true);
      this.ui.bossBar(false);
      this.bloom.strength = 0.75;
      this.audio.startMusic('ambient');
    }
    this.state = 'play';
    this.ui.refresh();
  }

  updateObjective() {
    const z = Math.min(this.maxZone, 5);
    let txt = ZONE_INFO[z].objective;
    const gate = this.world.gates[z - 1];
    if (gate && !gate.open && gate.cond === 'clear') {
      const n = this.enemies.filter(e => e.alive && e.zone === z && !e.summoned).length;
      if (n > 0) txt += ` <span class="count">(${n} restant${n > 1 ? 's' : ''})</span>`;
    }
    if (this.maxZone >= 6) txt = this.boss.alive ? 'Vainquez Morvath, le Roi-Squelette !' : 'Libérez la princesse Elara';
    this.ui.objective(txt);
  }

  // Zones, herses, déclencheurs d'histoire
  updateProgress() {
    const p = this.player;
    const z = this.world.zoneAt(p.pos.x, p.pos.z);
    if (z > this.maxZone && z <= 5) {
      this.maxZone = z;
      this.checkpoint = { x: p.pos.x, z: p.pos.z };
      this.ui.zoneTitle(ZONE_INFO[z].name);
      this.ui.toast('Point de passage atteint', 'heal');
      const key = 'zone' + z;
      if (STORY[key]) this.story(key);
      this.updateObjective();
    }
    // Arène du boss
    if (z === 6 && !this.bossStarted && toTile(p.pos.z) >= 47 && p.alive) {
      this.bossStarted = true;
      this.maxZone = 6;
      this.world.setGate(5, false);
      this.audio.startMusic('boss');
      this.ui.zoneTitle(ZONE_INFO[5].name);
      this.updateObjective();
      this.camFocus = { x: (p.pos.x + this.boss.pos.x) / 2, z: (p.pos.z + this.boss.pos.z) / 2 };
      this.cutscene(async () => {
        await this.ui.dialog(this.bossIntroSeen ? [{ who: 'Morvath', text: 'Encore toi ? Tes os rejoindront les autres !' }] : STORY.boss);
        this.bossIntroSeen = true;
        this.camFocus = null;
        this.boss.wake();
        this.ui.bossBar(true, 1, 'Morvath, le Roi-Squelette');
      });
    }
    // Champion
    if (!this.championSeen) {
      const ch = this.enemies.find(e => e.kind === 'champion');
      if (ch && ch.alive && ch.state === 'chase') { this.championSeen = true; this.story('champion'); }
    }
    // Herses
    for (const g of this.world.gates) {
      if (g.target) continue;
      const d = Math.hypot(p.pos.x - g.x, p.pos.z - g.z);
      if (g.cond === 'clear') {
        const left = this.enemies.some(e => e.alive && e.zone === g.id && !e.summoned);
        if (!left) {
          this.world.setGate(g.id, true);
          this.ui.toast('Un grondement… une herse s’ouvre !', 'gold');
          this.updateObjective();
        }
      } else if (g.cond.startsWith('key:')) {
        const k = g.cond.slice(4);
        if (p.keys.has(k) && d < 13) {
          p.keys.delete(k);
          this.world.setGate(g.id, true);
          this.ui.toast('La clé tourne dans la serrure…', 'gold');
          this.ui.refresh();
        }
      }
    }
  }

  gateHint() {
    const p = this.player.pos;
    for (const g of this.world.gates) {
      if (g.target || g.cond === 'boss') continue;
      if (Math.hypot(p.x - g.x, p.z - g.z) > 7) continue;
      if (g.cond === 'clear') {
        const n = this.enemies.filter(e => e.alive && e.zone === g.id && !e.summoned).length;
        return `Herse fermée — éliminez les squelettes de la zone (${n} restant${n > 1 ? 's' : ''})`;
      }
      return g.cond === 'key:bone' ? "Herse verrouillée — il faut la <b>Clé d'os</b>" : 'Herse verrouillée — il faut la <b>Clé du Roi</b>';
    }
    return null;
  }

  // -------------------------------------------------------------------------
  frame() {
    let dt = Math.min(0.05, this.clock.getDelta());
    const playing = this.state === 'play';
    if (playing) {
      this.stats.time += dt;
      if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.08; }
      dt *= this.timeScale;
      this.update(dt);
    } else if (this.state === 'title') {
      this.titleCam(dt);
    } else if (this.state === 'dialog' || this.state === 'victory') {
      // Les animations continuent pendant les dialogues (le monde est figé)
      this.time += dt;
      this.player.rig.update(dt);
      this.princess.update(dt);
      if (this.boss) this.boss.rig.update(dt);
      this.world.updateLights(dt, this.player.pos);
      this.particles.update(dt);
      if (this.state === 'victory') this.updateTasks(dt);
    }
    this.updateCamera(dt);
    this.composer.render();
  }

  updateTasks(dt) {
    for (const t of this.tasks) { t.t -= dt; }
    const due = this.tasks.filter(t => t.t <= 0);
    this.tasks = this.tasks.filter(t => t.t > 0);
    due.forEach(t => t.fn());
  }

  update(dt) {
    this.time += dt;
    const p = this.player;
    this.updateTasks(dt);
    p.update(dt);
    this.world.updateFlow(p.pos.x, p.pos.z);
    for (const e of this.enemies) e.update(dt);
    for (const e of this.enemies) if (e.removeMe) e.dispose();
    this.enemies = this.enemies.filter(e => !e.removeMe);
    this.projectiles = this.projectiles.filter(pr => { const keep = pr.update(dt); if (!keep) pr.dispose(); return keep; });
    this.loot.update(dt);
    this.world.updateGates(dt);
    this.world.updateWalls(dt, p.pos.x, p.pos.z);
    this.world.updateLights(dt, p.pos);
    this.world.updateProps(dt, p.pos);
    this.world.reveal(p.pos.x, p.pos.z);
    this.particles.update(dt);
    this.debris.update(dt);
    this.rings.update(dt);
    this.princess.update(dt);
    // Pièges à pointes
    for (const s of this.world.spikes)
      if (s.up && Math.abs(p.pos.x - s.x) < TILE / 2 && Math.abs(p.pos.z - s.z) < TILE / 2) p.hurt(12, null);
    if (this.ended) this.updateEnding(dt);
    else this.updateProgress();
    // Interface
    if (this.boss && this.bossStarted && this.boss.alive) this.ui.bossBar(true, this.boss.hp / this.boss.maxHp);
    const it = p.alive && !this.ended ? this.findInteractable() : null;
    this.ui.prompt(it ? it.text : this.gateHint());
    this.ui.updateEnemyBars(this.enemies, this.camera);
    this.ui.drawMinimap(dt);
    this.ui.lowHealth(p.alive && p.hp / p.maxHp < 0.3);
    this.uiTimer = (this.uiTimer || 0) - dt;
    if (this.uiTimer <= 0) { this.uiTimer = 0.1; this.ui.refresh(); }
  }

  updateCamera(dt) {
    const p = this.player.pos;
    if (this.camGoal) this.camOffset.lerp(_v.set(0, 6, 8), Math.min(1, dt * 1.2));
    const f = this.camFocus || p;
    if (this.state !== 'title') this.camTarget.lerp(_v.set(f.x, 0.8, f.z + 3), Math.min(1, dt * (this.camFocus ? 2.5 : 8)));
    this.camera.position.copy(this.camTarget).add(this.camOffset);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    const s = this.shakeAmt * this.shakeAmt * 0.6;
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    this.camera.lookAt(this.camTarget.x, this.camTarget.y + (this.camGoal ? 1 : 0), this.camTarget.z);
    const c = this.camTarget;
    this.spot.position.set(c.x + 1.5, 13, c.z + 5);
    this.spot.target.position.set(c.x, 0, c.z);
  }

  titleCam(dt) {
    this.time += dt;
    const t = this.time * 0.1;
    const cx = 27 * TILE, cz = 28 * TILE;
    this.camTarget.set(cx + Math.sin(t) * 10, 0.8, cz + Math.cos(t * 0.7) * 6);
    this.world.updateLights(dt, this.camTarget);
    this.particles.update(dt);
    this.camOffset.set(Math.sin(t) * 8, 15, 12);
  }
}

const game = new Game();
window.game = game;
game.init().catch(err => {
  console.error(err);
  $('load-text').textContent = 'Erreur de chargement : ' + err.message + ' (lancez le jeu via un serveur web local, voir README)';
});
