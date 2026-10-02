// Construction du donjon : sol, murs, torches, herses, coffres, pièges et décor.
import * as THREE from 'three';
import { clone as skelClone } from 'three/addons/utils/SkeletonUtils.js';
import { TILE, WALL_H, MAP_W, MAP_H, ROOMS, GATES } from './data.js';
import { floorTextures, wallTextures, flameTexture, glowTexture } from './textures.js';

const LIGHT_POOL = 12;
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export const tileCenter = t => (t + 0.5) * TILE;
export const toTile = v => Math.floor(v / TILE);

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.assets = game.assets;
    this.grid = new Uint8Array(MAP_W * MAP_H);
    this.gateGrid = new Int8Array(MAP_W * MAP_H);
    this.zone = new Uint8Array(MAP_W * MAP_H);
    this.explored = new Uint8Array(MAP_W * MAP_H);
    this.dist = new Int16Array(MAP_W * MAP_H);
    this.flowKey = -1;
    this.obstacles = [];
    this.walls = [];
    this.torches = [];
    this.gates = [];
    this.chests = [];
    this.spikes = [];
    this.scrolls = [];
    this.fadeables = [];
    this.flames = [];
    this.lightTimer = 0;
    this.time = 0;
    this.flameTex = flameTexture();
    this.glowTex = glowTexture();
  }

  idx(tx, ty) { return ty * MAP_W + tx; }
  inside(tx, ty) { return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H; }
  isFloor(tx, ty) { return this.inside(tx, ty) && this.grid[this.idx(tx, ty)] === 1; }
  walkable(tx, ty) {
    if (!this.isFloor(tx, ty)) return false;
    const g = this.gateGrid[this.idx(tx, ty)];
    return !g || this.gates[g - 1].open;
  }
  walkableAt(x, z) { return this.walkable(toTile(x), toTile(z)); }
  zoneAt(x, z) {
    const tx = toTile(x), ty = toTile(z);
    return this.inside(tx, ty) ? this.zone[this.idx(tx, ty)] : 0;
  }

  build() {
    for (const [x, y, w, h] of ROOMS)
      for (let j = y; j < y + h; j++)
        for (let i = x; i < x + w; i++) this.grid[this.idx(i, j)] = 1;
    for (const g of GATES) for (const [x, y] of g.tiles) this.gateGrid[this.idx(x, y)] = g.id;
    this.computeZones();
    this.buildFloor();
    this.buildWalls();
    this.buildTorches();
    this.buildGates();
    this.lights = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const l = new THREE.PointLight(0xff8c42, 0, 20, 1.7);
      l.position.set(0, -50, 0);
      this.scene.add(l);
      this.lights.push(l);
    }
  }

  computeZones() {
    const fill = (sx, sy, z) => {
      const st = [[sx, sy]];
      while (st.length) {
        const [x, y] = st.pop();
        if (!this.isFloor(x, y)) continue;
        const i = this.idx(x, y);
        if (this.zone[i] || this.gateGrid[i]) continue;
        this.zone[i] = z;
        for (const [dx, dy] of DIRS4) st.push([x + dx, y + dy]);
      }
    };
    fill(7, 48, 1);
    for (const g of GATES) {
      for (const [x, y] of g.tiles) this.zone[this.idx(x, y)] = g.id + 1;
      for (const [x, y] of g.tiles)
        for (const [dx, dy] of DIRS4) {
          const nx = x + dx, ny = y + dy;
          if (this.isFloor(nx, ny) && !this.zone[this.idx(nx, ny)] && !this.gateGrid[this.idx(nx, ny)]) fill(nx, ny, g.id + 1);
        }
    }
  }

  buildFloor() {
    const tex = floorTextures(this.game.renderer);
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap, roughness: 0.86, metalness: 0,
      normalScale: new THREE.Vector2(1.3, 1.3),
    });
    const geo = new THREE.PlaneGeometry(TILE, TILE);
    geo.rotateX(-Math.PI / 2);
    const tiles = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (this.isFloor(x, y)) tiles.push([x, y]);
    const mesh = new THREE.InstancedMesh(geo, mat, tiles.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    tiles.forEach(([x, y], i) => {
      m.makeRotationY(((x * 7 + y * 13) % 4) * Math.PI / 2);
      m.setPosition(tileCenter(x), 0, tileCenter(y));
      mesh.setMatrixAt(i, m);
      const v = 0.78 + ((x * 31 + y * 17) % 11) / 30;
      mesh.setColorAt(i, c.setRGB(v, v * 0.97, v * 0.93));
    });
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    // Sol noir sous tout le niveau (évite les trous visibles)
    const under = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * TILE * 2, MAP_H * TILE * 2),
      new THREE.MeshBasicMaterial({ color: 0x000000 }));
    under.rotation.x = -Math.PI / 2;
    under.position.set(MAP_W * TILE / 2, -0.05, MAP_H * TILE / 2);
    this.scene.add(under);
  }

  buildWalls() {
    const tex = wallTextures(this.game.renderer);
    tex.map.repeat.set(1, WALL_H / TILE);
    tex.normalMap.repeat.set(1, WALL_H / TILE);
    const side = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normalMap, roughness: 0.92 });
    const top = new THREE.MeshStandardMaterial({ color: 0x1a1613, roughness: 1 });
    const geo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
    geo.translate(0, WALL_H / 2, 0);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (this.isFloor(x, y)) continue;
        if (DIRS8.some(([dx, dy]) => this.isFloor(x + dx, y + dy))) this.walls.push({ tx: x, ty: y, h: 1 });
      }
    const mesh = new THREE.InstancedMesh(geo, [side, side, top, top, side, side], this.walls.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.wallMesh = mesh;
    this.wallIndex = new Map();
    this.walls.forEach((w, i) => { this.wallIndex.set(this.idx(w.tx, w.ty), i); this.setWallMatrix(i); });
    this.scene.add(mesh);
    this.buildCeiling(tex);
  }

  // Voûte de pierre au-dessus des salles (visible avec la caméra à la troisième personne).
  // Elle ne projette pas d'ombre, pour laisser passer la lumière de la lanterne.
  buildCeiling(tex) {
    const mat = new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap, color: 0x6a625a, roughness: 0.95, side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(TILE, TILE);
    geo.rotateX(Math.PI / 2);
    const tiles = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (this.isFloor(x, y)) tiles.push([x, y]);
    const ceil = new THREE.InstancedMesh(geo, mat, tiles.length);
    const m = new THREE.Matrix4();
    tiles.forEach(([x, y], i) => { m.makeTranslation(tileCenter(x), WALL_H, tileCenter(y)); ceil.setMatrixAt(i, m); });
    ceil.castShadow = false;
    ceil.receiveShadow = false;
    this.scene.add(ceil);
    // Poutres de bois tous les deux carreaux, pour rythmer la voûte
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.9 });
    const beamGeo = new THREE.BoxGeometry(TILE, 0.35, 0.35);
    const beams = [];
    for (let y = 0; y < MAP_H; y += 2) for (let x = 0; x < MAP_W; x++) if (this.isFloor(x, y)) beams.push([x, y]);
    const bm = new THREE.InstancedMesh(beamGeo, beamMat, beams.length);
    beams.forEach(([x, y], i) => { m.makeTranslation(tileCenter(x), WALL_H - 0.18, y * TILE); bm.setMatrixAt(i, m); });
    this.scene.add(bm);
  }

  setWallMatrix(i) {
    const w = this.walls[i];
    const m = new THREE.Matrix4().makeScale(1, w.h, 1);
    m.setPosition(tileCenter(w.tx), 0, tileCenter(w.ty));
    this.wallMesh.setMatrixAt(i, m);
  }

  // Les murs entre la caméra et le héros s'abaissent pour garder la vue dégagée.
  updateWalls(dt, px, pz) {
    const ptx = toTile(px), pty = toTile(pz);
    let dirty = false;
    for (let i = 0; i < this.walls.length; i++) {
      const w = this.walls[i];
      const dy = w.ty - pty, dx = Math.abs(w.tx - ptx);
      const target = dy > 0 && dy <= 7 && dx <= 9 ? 0.08 : 1;
      if (w.h !== target) {
        const step = dt * 4;
        w.h = Math.abs(target - w.h) <= step ? target : w.h + Math.sign(target - w.h) * step;
        this.setWallMatrix(i);
        dirty = true;
      }
    }
    if (dirty) this.wallMesh.instanceMatrix.needsUpdate = true;
  }

  wallLowered(tx, ty) {
    const i = this.wallIndex.get(this.idx(tx, ty));
    return i !== undefined && this.walls[i].h < 0.9;
  }

  // --- torches & flammes ------------------------------------------------
  addFlame(pos, size, intensity, wallTile, color = 0xff8c42) {
    const mat = new THREE.SpriteMaterial({
      map: this.flameTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.set(size * 0.7, size, 1);
    s.renderOrder = 6;
    this.scene.add(s);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: new THREE.Color(color).multiplyScalar(0.6), blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true,
    }));
    glow.position.copy(pos);
    glow.scale.setScalar(size * 2.4);
    this.scene.add(glow);
    // cœur incandescent de la flamme
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xfff1c8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    core.position.copy(pos).y -= size * 0.12;
    core.scale.setScalar(size * 0.55);
    core.renderOrder = 7;
    this.scene.add(core);
    const f = { pos: pos.clone(), sprite: s, glow, core, size, intensity, wallTile, color, phase: Math.random() * 100, visible: true };
    this.flames.push(f);
    return f;
  }

  buildTorches() {
    const torch = this.assets.models.torch.scene;
    const add = (tx, ty, dir) => {
      const t = torch.clone();
      t.scale.setScalar(1.6);
      const cx = tileCenter(tx), cz = tileCenter(ty);
      let x = cx, z = cz, rot = 0, wall;
      if (dir === 'N') { z = cz - TILE / 2 + 0.12; rot = 0; wall = [tx, ty - 1]; }
      if (dir === 'W') { x = cx - TILE / 2 + 0.12; rot = Math.PI / 2; wall = [tx - 1, ty]; }
      if (dir === 'E') { x = cx + TILE / 2 - 0.12; rot = -Math.PI / 2; wall = [tx + 1, ty]; }
      t.position.set(x, 3.0, z);
      t.rotation.y = rot;
      this.scene.add(t);
      const off = new THREE.Vector3(0, 0.62, 0.32).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      const f = this.addFlame(t.position.clone().add(off), 0.75, 22, wall);
      f.model = t;
    };
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        if (!this.isFloor(x, y) || this.gateGrid[this.idx(x, y)]) continue;
        if (!this.isFloor(x, y - 1) && (x * 5 + y) % 3 === 0) add(x, y, 'N');
        else if (!this.isFloor(x - 1, y) && (y * 5 + x) % 4 === 1) add(x, y, 'W');
        else if (!this.isFloor(x + 1, y) && (y * 5 + x) % 4 === 3) add(x, y, 'E');
      }
  }

  updateLights(dt, p) {
    this.time += dt;
    this.lightTimer -= dt;
    for (const f of this.flames) {
      const hidden = f.wallTile && this.wallLowered(f.wallTile[0], f.wallTile[1]);
      const vis = !hidden && !f.off;
      if (vis !== f.visible) {
        f.visible = vis;
        f.sprite.visible = f.glow.visible = f.core.visible = vis;
        if (f.model) f.model.visible = vis;
      }
      if (!vis) continue;
      const dx = f.pos.x - p.x, dz = f.pos.z - p.z;
      if (dx * dx + dz * dz > 900) continue;
      const fl = 0.85 + 0.1 * Math.sin(this.time * 13 + f.phase) + 0.08 * Math.sin(this.time * 31 + f.phase * 2);
      f.sprite.scale.set(f.size * 0.7 * (0.9 + 0.15 * Math.sin(this.time * 17 + f.phase)), f.size * fl * 1.1, 1);
      f.flicker = fl;
      f.core.scale.setScalar(f.size * 0.55 * (0.85 + 0.25 * fl));
      f.glow.material.opacity = 0.75 + 0.25 * fl;
      if (Math.random() < dt * 3 * f.size) {
        this.game.particles.emit(f.pos.x, f.pos.y + 0.2, f.pos.z, {
          vel: [0, 1.5, 0], spread: 0.6, color: [1, 0.5, 0.15], size: 0.18, life: 0.9, gravity: -0.5,
        });
      }
    }
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.25;
      const cand = this.flames.filter(f => f.visible).map(f => [f, (f.pos.x - p.x) ** 2 + (f.pos.z - p.z) ** 2]);
      cand.sort((a, b) => a[1] - b[1]);
      this.lights.forEach((l, i) => {
        const c = cand[i];
        l.userData.flame = c ? c[0] : null;
        if (c) { l.position.copy(c[0].pos); l.position.y += 0.2; l.color.set(c[0].color); }
      });
    }
    for (const l of this.lights) {
      const f = l.userData.flame;
      l.intensity = f && f.visible ? f.intensity * (f.flicker || 1) : 0;
    }
  }

  // --- herses -------------------------------------------------------------
  buildGates() {
    for (const g of GATES) {
      const mesh = this.assets.models.gate.scene.clone();
      const xs = g.tiles.map(t => tileCenter(t[0])), zs = g.tiles.map(t => tileCenter(t[1]));
      const cx = xs.reduce((a, b) => a + b) / xs.length, cz = zs.reduce((a, b) => a + b) / zs.length;
      const vertical = g.tiles[0][0] === g.tiles[1][0];
      mesh.scale.set((TILE * 2) / 3.3, WALL_H / 3.2, 1.3);
      mesh.rotation.y = vertical ? Math.PI / 2 : 0;
      mesh.position.set(cx, g.startOpen ? WALL_H - 0.3 : 0, cz);
      mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
      this.scene.add(mesh);
      this.gates.push({ ...g, mesh, x: cx, z: cz, open: !!g.startOpen, anim: 0, target: g.startOpen ? 1 : 0 });
    }
  }

  setGate(id, open) {
    const g = this.gates[id - 1];
    if (g.target === (open ? 1 : 0)) return;
    g.target = open ? 1 : 0;
    if (!open) g.open = false;
    this.flowKey = -1;
    this.game.audio.play('gate');
    this.game.shake(open ? 0.25 : 0.6);
  }

  updateGates(dt) {
    for (const g of this.gates) {
      const prev = g.anim;
      if (g.anim !== g.target) {
        const sp = g.target ? dt / 2.2 : dt / 0.35;
        g.anim = g.target ? Math.min(1, g.anim + sp) : Math.max(0, g.anim - sp);
        if (g.target && g.anim > 0.55 && !g.open) { g.open = true; this.flowKey = -1; }
        if (!g.target && prev > 0 && g.anim === 0) {
          this.game.particles.burst(g.x, 0.3, g.z, 30, { spread: 6, color: [0.5, 0.45, 0.4], size: 0.9, sizeEnd: 1.6, life: 1, alpha: 0.4 });
        }
        if (g.target && Math.random() < 0.5) this.game.particles.emit(g.x + (Math.random() - 0.5) * 6, WALL_H - 0.3, g.z, {
          vel: [0, -2, 0], spread: 1, color: [0.5, 0.45, 0.4], size: 0.5, life: 0.8, alpha: 0.5, gravity: 6,
        });
      }
      const k = g.target ? 1 - Math.pow(1 - g.anim, 2) : g.anim;
      g.mesh.position.y = k * (WALL_H - 0.3);
    }
  }

  // --- décor & objets -----------------------------------------------------
  placeModel(name, x, z, scale = 1, rot = 0) {
    const m = skelClone(this.assets.models[name].scene);
    m.position.set(x, 0, z);
    m.scale.setScalar(scale);
    m.rotation.y = rot;
    m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(m);
    return m;
  }

  // Direction (dx, dz) vers une case de sol ouverte, de préférence vers la caméra.
  openFacing(tx, ty) {
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (this.isFloor(tx + dx, ty + dy)) return [dx, dy];
    return [0, 1];
  }

  addProp(type, x, y, opts = {}) {
    const wx = (x + 0.5) * TILE, wz = (y + 0.5) * TILE;
    const tx = Math.floor(x), ty = Math.floor(y);
    const rnd = ((tx * 928371 + ty * 12377) % 1000) / 1000;
    switch (type) {
      case 'pillar': {
        const m = this.placeModel('pillar', wx, wz, 1.5);
        this.makeFadeable(m, wx, wz);
        this.obstacles.push({ x: wx, z: wz, r: 0.95 });
        break;
      }
      case 'barrel': this.placeModel('barrel', wx, wz, 1.35, rnd * 6); this.obstacles.push({ x: wx, z: wz, r: 0.55 }); break;
      case 'crate': this.placeModel('crate', wx, wz, 1.4, rnd * 0.6); this.obstacles.push({ x: wx, z: wz, r: 0.6 }); break;
      case 'bones': this.placeModel('bones', wx + (rnd - 0.5) * 1.5, wz + (rnd - 0.5), 1.5, rnd * 6); break;
      case 'rubble': this.placeModel('rubble', wx, wz, 1.6, rnd * 6); break;
      case 'candles': {
        this.placeModel('candles', wx, wz, 1.6, rnd * 6);
        this.addFlame(new THREE.Vector3(wx, 0.75, wz), 0.35, 8, null, 0xffb060);
        break;
      }
      case 'brazier': {
        this.placeModel('brazier', wx, wz, 1.3);
        this.addFlame(new THREE.Vector3(wx, 1.75, wz), 1.6, 45, null, 0xff7a2a);
        this.obstacles.push({ x: wx, z: wz, r: 0.75 });
        break;
      }
      case 'banner': {
        const m = this.placeModel('banner', wx, wz - TILE / 2 + 0.15, 1.2);
        m.position.y = 0.2;
        break;
      }
      case 'throne': {
        this.placeModel('throne', wx, wz, 1.6, Math.PI);
        this.obstacles.push({ x: wx, z: wz, r: 1.6 });
        break;
      }
      case 'cage': {
        this.cage = this.placeModel('cage', wx, wz, 1.1);
        this.cage.userData.base = { x: wx, z: wz };
        this.cageObstacle = { x: wx, z: wz, r: 1.45 };
        this.obstacles.push(this.cageObstacle);
        break;
      }
      case 'spikes': {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 0.92, TILE * 0.92),
          new THREE.MeshStandardMaterial({ color: 0x1b1a1a, roughness: 0.6, metalness: 0.6 }));
        plate.rotation.x = -Math.PI / 2;
        plate.position.set(wx, 0.02, wz);
        plate.receiveShadow = true;
        this.scene.add(plate);
        const m = this.placeModel('spikes', wx, wz, 1);
        m.scale.set(TILE / 2.1, 1.3, TILE / 2.1);
        m.position.y = -0.8;
        this.spikes.push({ m, x: wx, z: wz, phase: (tx + ty) * 0.7, up: false });
        break;
      }
      case 'chest': {
        const [dx, dy] = this.openFacing(tx, ty);
        const m = this.placeModel('chest', wx, wz, 1.5, Math.atan2(dx, dy));
        const lid = m.getObjectByName('lid');
        const chest = { m, lid, x: wx, z: wz, loot: opts.loot || [], opened: false, anim: 0, legendary: !!opts.legendary, front: [dx, dy] };
        if (chest.legendary) {
          chest.glow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.glowTex, color: 0xffa040, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
          }));
          chest.glow.position.set(wx, 1.0, wz);
          chest.glow.scale.setScalar(4);
          this.scene.add(chest.glow);
        }
        this.chests.push(chest);
        this.obstacles.push({ x: wx, z: wz, r: 0.85 });
        break;
      }
      case 'scroll': {
        const g = new THREE.Group();
        const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.8, 10),
          new THREE.MeshStandardMaterial({ color: 0xe8d6a8, roughness: 0.8, emissive: 0x332811 }));
        paper.rotation.z = Math.PI / 2;
        const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.12, 10),
          new THREE.MeshStandardMaterial({ color: 0x8a1010, roughness: 0.6 }));
        ribbon.rotation.z = Math.PI / 2;
        g.add(paper, ribbon);
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: this.glowTex, color: 0xffe0a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6,
        }));
        glow.scale.setScalar(2.2);
        g.add(glow);
        g.position.set(wx, 0.6, wz);
        this.scene.add(g);
        this.scrolls.push({ g, x: wx, z: wz, id: opts.id, read: false });
        break;
      }
    }
  }

  makeFadeable(m, x, z) {
    const mats = [];
    m.traverse(o => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true;
        mats.push(o.material);
      }
    });
    this.fadeables.push({ m, x, z, mats, o: 1 });
  }

  updateProps(dt, p, cam) {
    for (const f of this.fadeables) {
      // un pilier devient transparent s'il se trouve entre la caméra et le héros
      let target = 1;
      if (cam) {
        const sx = cam.x - p.x, sz = cam.z - p.z, len2 = sx * sx + sz * sz || 1;
        const t = Math.max(0, Math.min(1, ((f.x - p.x) * sx + (f.z - p.z) * sz) / len2));
        const d = Math.hypot(p.x + sx * t - f.x, p.z + sz * t - f.z);
        if (t > 0.05 && d < 1.6) target = 0.18;
      }
      if (f.o !== target) {
        f.o += Math.sign(target - f.o) * dt * 3;
        if (Math.abs(target - f.o) < 0.05) f.o = target;
        for (const m of f.mats) { m.opacity = f.o; m.depthWrite = f.o > 0.95; }
      }
    }
    for (const c of this.chests) {
      if (c.opened && c.anim < 1) {
        c.anim = Math.min(1, c.anim + dt * 1.8);
        const k = 1 - Math.pow(1 - c.anim, 3);
        c.lid.rotation.x = -1.95 * k + Math.sin(c.anim * Math.PI) * 0.1;
      }
      if (c.glow) {
        c.glow.material.opacity = c.opened ? Math.max(0, c.glow.material.opacity - dt) : 0.6 + 0.3 * Math.sin(this.time * 3);
        if (!c.opened && Math.random() < dt * 8)
          this.game.particles.emit(c.x + (Math.random() - 0.5) * 1.5, 0.8, c.z + (Math.random() - 0.5) * 1.5,
            { vel: [0, 1.4, 0], spread: 0.3, color: [1, 0.7, 0.25], size: 0.22, life: 1.2 });
      }
    }
    for (const s of this.scrolls) {
      s.g.position.y = 0.6 + Math.sin(this.time * 2 + s.x) * 0.12;
      s.g.rotation.y += dt * 0.8;
      s.g.children[2].material.opacity = s.read ? 0.15 : 0.6;
    }
    for (const s of this.spikes) {
      const t = (this.time + s.phase) % 2.8;
      const up = t > 1.8 && t < 2.7;
      const target = up ? 0 : t > 1.5 ? -0.55 : -0.8;
      s.m.position.y += (target - s.m.position.y) * Math.min(1, dt * (up ? 30 : 6));
      if (up && !s.up) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < 14) this.game.audio.play('spikes');
      }
      s.up = up && s.m.position.y > -0.25;
    }
  }

  // --- navigation ----------------------------------------------------------
  // Carte de distances (BFS) depuis la case du joueur : les ennemis la suivent.
  updateFlow(px, pz) {
    const ptx = toTile(px), pty = toTile(pz);
    const key = this.idx(ptx, pty);
    if (key === this.flowKey) return;
    this.flowKey = key;
    this.dist.fill(-1);
    if (!this.walkable(ptx, pty)) return;
    const q = [key];
    this.dist[key] = 0;
    let head = 0;
    while (head < q.length) {
      const i = q[head++];
      const d = this.dist[i];
      if (d > 30) continue;
      const x = i % MAP_W, y = (i / MAP_W) | 0;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (!this.walkable(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (this.dist[ni] !== -1) continue;
        this.dist[ni] = d + 1;
        q.push(ni);
      }
    }
  }

  flowDir(x, z, out) {
    const tx = toTile(x), ty = toTile(z);
    if (!this.inside(tx, ty)) return false;
    const cur = this.dist[this.idx(tx, ty)];
    if (cur < 0) return false;
    let best = cur, bx = 0, by = 0;
    for (const [dx, dy] of DIRS8) {
      const nx = tx + dx, ny = ty + dy;
      if (!this.walkable(nx, ny)) continue;
      if (dx && dy && (!this.walkable(tx + dx, ty) || !this.walkable(tx, ty + dy))) continue;
      const d = this.dist[this.idx(nx, ny)];
      if (d >= 0 && d < best) { best = d; bx = dx; by = dy; }
    }
    if (best === cur) return false;
    out.set(tileCenter(tx + bx) - x, 0, tileCenter(ty + by) - z).normalize();
    return true;
  }

  // Collision cercle / murs + obstacles ronds.
  moveCircle(p, r, ignoreObstacles = false) {
    const tx0 = toTile(p.x - r), tx1 = toTile(p.x + r), ty0 = toTile(p.z - r), ty1 = toTile(p.z + r);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.walkable(tx, ty)) continue;
        const minx = tx * TILE, maxx = minx + TILE, minz = ty * TILE, maxz = minz + TILE;
        const cx = Math.max(minx, Math.min(p.x, maxx)), cz = Math.max(minz, Math.min(p.z, maxz));
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 < 1e-6) {
            // Centre à l'intérieur : on repousse vers le côté le plus proche
            const opts = [[p.x - minx, -1, 0], [maxx - p.x, 1, 0], [p.z - minz, 0, -1], [maxz - p.z, 0, 1]];
            opts.sort((a, b) => a[0] - b[0]);
            p.x += opts[0][1] * (opts[0][0] + r);
            p.z += opts[0][2] * (opts[0][0] + r);
          } else {
            const d = Math.sqrt(d2);
            p.x += dx / d * (r - d);
            p.z += dz / d * (r - d);
          }
        }
      }
    if (ignoreObstacles) return;
    for (const o of this.obstacles) {
      const dx = p.x - o.x, dz = p.z - o.z;
      const d = Math.hypot(dx, dz), m = r + o.r;
      if (d < m && d > 1e-4) { p.x += dx / d * (m - d); p.z += dz / d * (m - d); }
    }
  }

  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.7);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (!this.walkableAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  reveal(px, pz) {
    const tx = toTile(px), ty = toTile(pz);
    const R = 6;
    for (let y = ty - R; y <= ty + R; y++)
      for (let x = tx - R; x <= tx + R; x++)
        if (this.inside(x, y) && (x - tx) ** 2 + (y - ty) ** 2 <= R * R) this.explored[this.idx(x, y)] = 1;
  }
}
