// Le Donjon des Os — boucle principale du jeu.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TILE, WALL_H, ENTITIES, PLAYER_START, WEAPONS, WEAPON_ORDER, STORY, NOTES, ZONE_INFO } from './data.js';
import { World, toTile } from './world.js';
import { Player, Enemy, Boss, Projectile, Rig } from './actors.js';
import { Particles, Debris, Rings, FloatText } from './fx.js';
import { Loot } from './loot.js';
import { boneTextures } from './textures.js';
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
    this.attackHeld = false;
    this.flags = {};
    this.dir = new THREE.Vector3();
    this.locked = false;
    this.lookX = 0;          // mouvement souris accumulé (caméra)
    this.lookY = 0;
    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.game.onKey(e.code, e);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.attackHeld = false; this.blockMouse = false; });
    const cv = this.cv = game.renderer.domElement;
    // Caméra à la souris : le curseur est capturé au clic (pointer lock).
    addEventListener('mousemove', e => {
      if (this.locked) { this.lookX += e.movementX; this.lookY += e.movementY; }
      else if (this.dragging) { this.lookX += e.movementX; this.lookY += e.movementY; }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === cv;
      if (!this.locked && this.game.state === 'play') { this.unlockAt = performance.now(); this.game.togglePause(true); }
    });
    cv.addEventListener('mousedown', e => {
      const g = this.game;
      g.audio.resume();
      if (g.state === 'dialog' || g.state === 'note') { if (g.ui.advance) g.ui.advance(); return; }
      if (g.state !== 'play') return;
      if (!this.locked) {
        this.requestLock();
        // Sans pointer lock (navigateur qui le refuse) : glisser pour tourner la caméra
        if (e.button === 0) this.dragging = true;
      }
      if (e.button === 0) this.attackHeld = true;
      if (e.button === 2) this.blockMouse = true;
    });
    addEventListener('mouseup', e => {
      if (e.button === 0) { this.attackHeld = false; this.dragging = false; }
      if (e.button === 2) this.blockMouse = false;
    });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => this.game.cycleWeapon(Math.sign(e.deltaY)), { passive: true });
  }

  requestLock() {
    try {
      const p = this.cv.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (err) { /* pointer lock indisponible : la caméra suit le héros */ }
  }

  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  consumeLook() {
    const r = [this.lookX, this.lookY];
    this.lookX = this.lookY = 0;
    return r;
  }

  // Direction de déplacement dans le monde, relative à l'orientation de la caméra.
  moveDir() {
    const k = this.keys;
    let x = 0, z = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) z += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (!x && !z) return this.dir.set(0, 0, 0);
    const a = this.game.camYaw;
    const fx = Math.sin(a), fz = Math.cos(a);     // avant
    const rx = -Math.cos(a), rz = Math.sin(a);    // droite
    return this.dir.set(fx * z + rx * x, 0, fz * z + rz * x).normalize();
  }

  // Bouclier levé : clic droit maintenu ou Maj
  get blockHeld() { return this.blockMouse || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }

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
    r.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    $('game').appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x030305);
    this.scene.fog = new THREE.FogExp2(0x050408, 0.016);
    // Caméra à la troisième personne, derrière le héros
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 160);
    this.camYaw = Math.PI;       // direction regardée (0 = +z)
    this.camPitch = 0.28;        // inclinaison vers le bas (radians)
    this.camDist = 5.6;          // distance voulue derrière le héros
    this.camCurDist = 5.6;
    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3();

    this.scene.add(new THREE.AmbientLight(0x6a78b0, 0.32));
    this.scene.add(new THREE.HemisphereLight(0x8a96c8, 0x2a1a10, 0.45));
    // Reflets doux sur le métal (armures, armes) grâce à une carte d'environnement
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.22;
    // Lanterne du héros : éclaire devant lui et projette les ombres
    const spot = this.spot = new THREE.SpotLight(0xffd9a8, 75, 40, 0.95, 0.85, 1.6);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.camera.near = 1;
    spot.shadow.camera.far = 40;
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.04;
    spot.shadow.radius = 3;
    this.scene.add(spot, spot.target);

    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Occlusion ambiante : ombres de contact dans les coins, au pied des murs et des personnages
    this.ao = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
    this.ao.output = GTAOPass.OUTPUT.Default;
    this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.5, scale: 1.2, samples: 12 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    // Les effets lumineux (flammes, halos, particules, faisceaux) ne doivent pas assombrir le décor :
    // sans cela, l'occlusion les traite comme des objets pleins et dessine des halos noirs autour des lumières.
    // (la liste est reconstruite 4 fois par seconde seulement, pour la fluidité)
    let aoList = [], aoListAge = 99;
    const aoHidden = [];
    this.ao.overrideVisibility = () => {
      if ((aoListAge += 1) > 15) {
        aoListAge = 0;
        aoList = [];
        this.scene.traverse(o => {
          const m = o.material;
          if (o.isPoints || o.isLine || o.isSprite || (m && !Array.isArray(m) && m.transparent && !m.depthWrite)) aoList.push(o);
        });
      }
      aoHidden.length = 0;
      for (const o of aoList) if (o.visible) { o.visible = false; aoHidden.push(o); }
    };
    this.ao.restoreVisibility = () => { for (const o of aoHidden) o.visible = true; };
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.65, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.fpsAvg = 60;
    this.slowTime = 0;

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
    // Version « fichier unique » : les .glb sont intégrés en base64 dans la page (aucun téléchargement)
    const embedded = window.__EMBEDDED_ASSETS;
    const load = n => {
      if (!embedded) return loader.loadAsync(`assets/${n}.glb`);
      const bin = atob(embedded[n]);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return loader.parseAsync(buf.buffer, '');
    };
    await Promise.all(ASSETS.map(n => load(n).then(g => {
      this.assets.models[n] = g;
      done++;
      $('load-fill').style.width = (100 * done / ASSETS.length) + '%';
    })));

    // Texture d'os réaliste sur les squelettes et les ossements du décor
    const bt = boneTextures(r);
    for (const n of ['skeleton', 'bones']) this.assets.models[n].scene.traverse(o => {
      if (o.isMesh && o.material.name === 'Os') {
        Object.assign(o.material, { map: bt.map, normalMap: bt.normalMap, roughness: 0.62 });
        o.material.color.setRGB(0.78, 0.74, 0.66);
        o.material.normalScale.set(0.7, 0.7);
        o.material.needsUpdate = true;
      }
    });

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
    this.camYaw = Math.PI;
    this.camPitch = 0.28;
    this.camCurDist = this.camDist;
    this.camTarget.set(this.player.pos.x, 2.35, this.player.pos.z);
    this.camGoal = 0;
    this.camFocus = null;
    this.input.requestLock();
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
      // Échap libère déjà la souris (et met en pause) : on évite de basculer deux fois
      if (performance.now() - (this.input.unlockAt || 0) < 400) return;
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
    if (on) this.input.releaseLock(); else this.input.requestLock();
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
        this.later(4.5, () => { this.state = 'victory'; this.input.releaseLock(); this.ui.show('hud', false); this.ui.victory(this.stats); });
      });
    }
  }

  onPlayerDeath() {
    this.stats.deaths++;
    this.input.attackHeld = false;
    this.later(2.2, () => {
      this.state = 'dead';
      this.input.releaseLock();
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
    this.input.requestLock();
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
      this.camFocus = { x: this.boss.pos.x, z: this.boss.pos.z };
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
    const rawDt = this.clock.getDelta();
    this.watchPerformance(rawDt);
    let dt = Math.min(0.05, rawDt);
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
    this.world.updateLights(dt, p.pos);
    this.world.updateProps(dt, p.pos, this.camPos);
    this.updateDust(dt);
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

  // Direction d'une attaque : touche de direction tenue, sinon l'ennemi le plus proche
  // (de tous les côtés), sinon devant la caméra. Petite aide à la visée vers les ennemis.
  attackYaw() {
    const p = this.player, w = WEAPONS[p.weapon], mv = this.input.moveDir();
    const base = mv.lengthSq() > 0 ? Math.atan2(mv.x, mv.z) : null;
    let best = null, bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.targetable) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > w.range + e.radius + 2.5) continue;
      const a = Math.atan2(dx, dz);
      let score = d;
      if (base !== null) {
        const da = Math.abs(Math.atan2(Math.sin(a - base), Math.cos(a - base)));
        if (da > 1.2) continue;
        score += da * 3;
      }
      if (score < bestScore) { bestScore = score; best = a; }
    }
    return best ?? base ?? this.camYaw;
  }

  // Caméra à la troisième personne : derrière l'épaule du héros, ne traverse jamais les murs.
  updateCamera(dt) {
    if (this.state === 'title') return;
    const p = this.player;
    const playing = this.state === 'play';
    const [lx, ly] = this.input.consumeLook();
    if (playing && !this.camGoal && !this.camFocus) {
      this.camYaw -= lx * 0.0024;
      this.camPitch = Math.max(-0.12, Math.min(0.85, this.camPitch + ly * 0.002));
    }
    let wantDist = this.camDist, wantPitch = null;
    const turnTowards = (yaw, speed) => {
      const d = Math.atan2(Math.sin(yaw - this.camYaw), Math.cos(yaw - this.camYaw));
      this.camYaw += d * Math.min(1, dt * speed);
    };
    if (this.camGoal) {
      turnTowards(p.yaw + Math.PI, 1.5);       // fin : on regarde le héros de face
      wantDist = 4.2; wantPitch = 0.1;
    } else if (this.camFocus) {
      turnTowards(Math.atan2(this.camFocus.x - p.pos.x, this.camFocus.z - p.pos.z), 2.5);
      wantPitch = 0.22;
    }
    if (wantPitch !== null) this.camPitch += (wantPitch - this.camPitch) * Math.min(1, dt * 2);

    // Point pivot (au-dessus de l'épaule droite), lissé pour éviter les à-coups
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const rx = -fz, rz = fx;
    const shoulder = this.camGoal ? 0 : 0.55;
    _v.set(p.pos.x + rx * shoulder, 2.35, p.pos.z + rz * shoulder);
    this.camTarget.lerp(_v, Math.min(1, dt * 14));
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    // Collision avec les murs : on avance le long du rayon pivot → caméra
    let allowed = wantDist;
    for (let d = 0.3; d <= wantDist + 0.35; d += 0.2) {
      const x = this.camTarget.x - fx * cp * d, y = this.camTarget.y + sp * d, z = this.camTarget.z - fz * cp * d;
      if (!this.world.walkableAt(x, z) || y > WALL_H - 0.3) { allowed = Math.max(0.6, d - 0.45); break; }
    }
    if (allowed < this.camCurDist) this.camCurDist = allowed;
    else this.camCurDist += (allowed - this.camCurDist) * Math.min(1, dt * 3);
    const d = this.camCurDist;
    this.camPos.set(this.camTarget.x - fx * cp * d, this.camTarget.y + sp * d, this.camTarget.z - fz * cp * d);
    this.camera.position.copy(this.camPos);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    const s = this.shakeAmt * this.shakeAmt * 0.25;
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    this.camera.lookAt(this.camPos.x + fx * cp, this.camPos.y - sp + (this.camGoal ? 0.15 : 0), this.camPos.z + fz * cp);
    // Lanterne : derrière et au-dessus du héros, éclaire la direction regardée
    this.spot.position.set(p.pos.x + fx * 2.5, 10, p.pos.z + fz * 2.5);
    this.spot.target.position.set(p.pos.x + fx * 9, 0, p.pos.z + fz * 9);
  }

  // Écran titre : lent travelling circulaire dans la grande salle de la crypte
  titleCam(dt) {
    this.time += dt;
    const t = this.time * 0.08;
    const cx = 24 * TILE, cz = 25 * TILE;
    this.camera.position.set(cx + Math.sin(t) * 6, 3.8, 32.5 * TILE);
    this.camera.lookAt(cx + Math.sin(t * 0.7) * 4, 1.8, cz);
    this.world.updateLights(dt, this.camera.position);
    this.spot.position.set(cx, 9, cz);
    this.spot.target.position.set(cx, 0, cz);
    this.particles.update(dt);
  }

  // Surveille la fluidité : si l'image ralentit, on désactive les effets les plus lourds.
  watchPerformance(rawDt) {
    if (rawDt <= 0) return;
    this.fpsAvg += (1 / rawDt - this.fpsAvg) * 0.05;
    if (this.fpsAvg < 38) this.slowTime += rawDt; else this.slowTime = Math.max(0, this.slowTime - rawDt);
    if (this.slowTime > 4) {
      this.slowTime = 0;
      if (this.ao.enabled) this.ao.enabled = false;
      else if (this.renderer.getPixelRatio() > 1) { this.renderer.setPixelRatio(1); this.composer.setPixelRatio(1); this.composer.setSize(innerWidth, innerHeight); }
    }
  }

  // Poussière en suspension autour du héros (ambiance)
  updateDust(dt) {
    const p = this.player.pos;
    this.dustAcc = (this.dustAcc || 0) + dt * 14;
    while (this.dustAcc > 1) {
      this.dustAcc--;
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 9;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (!this.world.walkableAt(x, z)) continue;
      this.particles.emit(x, 0.4 + Math.random() * 4, z, {
        vel: [(Math.random() - 0.5) * 0.25, 0.05, (Math.random() - 0.5) * 0.25], spread: 0.05,
        color: [1, 0.85, 0.6], size: 0.07, sizeEnd: 0.07, life: 4.5, alpha: 0.35,
      });
    }
  }
}

const game = new Game();
window.game = game;
game.init().catch(err => {
  console.error(err);
  $('load-text').textContent = 'Erreur de chargement : ' + err.message + ' (lancez le jeu via un serveur web local, voir README)';
});
