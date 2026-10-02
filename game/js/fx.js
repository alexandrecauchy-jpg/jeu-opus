// Effets visuels : particules, éclats d'os, ondes de choc, chiffres de dégâts.
import * as THREE from 'three';
import { glowTexture, ringTexture } from './textures.js';

const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
}`;

export class Particles {
  constructor(scene, max = 3000, additive = true) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTexture() }, uScale: { value: 400 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(x, y, z, o = {}) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const sp = o.spread ?? 1;
    const v = o.vel || [0, 0, 0];
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = v[0] + (Math.random() - 0.5) * sp;
    this.vel[i * 3 + 1] = v[1] + (Math.random() - 0.5) * sp;
    this.vel[i * 3 + 2] = v[2] + (Math.random() - 0.5) * sp;
    const c = o.color || [1, 0.6, 0.2];
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    const life = (o.life ?? 0.8) * (0.7 + Math.random() * 0.6);
    this.life[i] = this.maxLife[i] = life;
    this.s0[i] = o.size ?? 0.5; this.s1[i] = o.sizeEnd ?? 0;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.a0[i] = o.alpha ?? 1;
  }

  burst(x, y, z, n, o) { for (let k = 0; k < n; k++) this.emit(x, y, z, o); }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const last = --this.count;
        if (i !== last) this.copy(last, i);
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.03) { this.pos[i * 3 + 1] = 0.03; this.vel[i * 3 + 1] *= -0.3; }
      const t = 1 - this.life[i] / this.maxLife[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.a0[i] * Math.min(1, (1 - t) * 2.5);
      i++;
    }
    this.geo.setDrawRange(0, this.count);
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[k].needsUpdate = true;
  }

  copy(a, b) {
    for (let k = 0; k < 3; k++) {
      this.pos[b * 3 + k] = this.pos[a * 3 + k];
      this.vel[b * 3 + k] = this.vel[a * 3 + k];
      this.col[b * 3 + k] = this.col[a * 3 + k];
    }
    this.life[b] = this.life[a]; this.maxLife[b] = this.maxLife[a];
    this.s0[b] = this.s0[a]; this.s1[b] = this.s1[a];
    this.grav[b] = this.grav[a]; this.drag[b] = this.drag[a];
    this.a0[b] = this.a0[a]; this.size[b] = this.size[a]; this.alpha[b] = this.alpha[a];
  }
}

// Éclats d'os physiques quand un squelette se brise.
export class Debris {
  constructor(scene, material, max = 220) {
    const geo = new THREE.CylinderGeometry(0.035, 0.035, 0.32, 5);
    this.mesh = new THREE.InstancedMesh(geo, material, max);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.items = [];
    this.max = max;
    this.dummy = new THREE.Object3D();
    scene.add(this.mesh);
  }

  spawn(x, y, z, n, power = 1) {
    for (let k = 0; k < n; k++) {
      if (this.items.length >= this.max) this.items.shift();
      this.items.push({
        p: new THREE.Vector3(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 1.2, z + (Math.random() - 0.5) * 0.6),
        v: new THREE.Vector3((Math.random() - 0.5) * 7 * power, 3 + Math.random() * 5 * power, (Math.random() - 0.5) * 7 * power),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        w: new THREE.Vector3((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15),
        life: 3.5 + Math.random() * 2, s: 0.6 + Math.random() * 1.0,
      });
    }
  }

  update(dt) {
    const d = this.dummy;
    let n = 0;
    this.items = this.items.filter(it => (it.life -= dt) > 0);
    for (const it of this.items) {
      if (it.p.y > 0.04 || it.v.y > 0) {
        it.v.y -= 22 * dt;
        it.p.addScaledVector(it.v, dt);
        it.r.x += it.w.x * dt; it.r.y += it.w.y * dt; it.r.z += it.w.z * dt;
        if (it.p.y < 0.04) {
          it.p.y = 0.04;
          it.v.y *= -0.35; it.v.x *= 0.6; it.v.z *= 0.6; it.w.multiplyScalar(0.5);
          if (Math.abs(it.v.y) < 0.6) { it.v.set(0, 0, 0); it.r.x = Math.PI / 2; }
        }
      }
      d.position.copy(it.p);
      d.rotation.copy(it.r);
      d.scale.setScalar(it.s * Math.min(1, it.life));
      d.updateMatrix();
      this.mesh.setMatrixAt(n++, d.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Anneaux au sol : ondes de choc et zones de danger
export class Rings {
  constructor(scene) {
    this.scene = scene;
    this.tex = ringTexture();
    this.items = [];
    this.geo = new THREE.PlaneGeometry(2, 2);
    this.geo.rotateX(-Math.PI / 2);
  }

  add(x, z, o) {
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex, color: o.color ?? 0xffaa55, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 1,
    });
    const m = new THREE.Mesh(this.geo, mat);
    m.position.set(x, 0.06 + this.items.length * 0.001, z);
    m.renderOrder = 4;
    this.scene.add(m);
    const it = { m, t: 0, dur: o.dur ?? 0.5, r0: o.r0 ?? 0.2, r1: o.r1 ?? 4, mode: o.mode ?? 'wave', follow: o.follow };
    this.items.push(it);
    this.applyScale(it, 0);
    return it;
  }

  applyScale(it, k) {
    const r = it.mode === 'warn' ? it.r1 : it.r0 + (it.r1 - it.r0) * (1 - Math.pow(1 - k, 2));
    it.m.scale.set(r, 1, r);
  }

  update(dt) {
    for (const it of this.items) {
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      this.applyScale(it, k);
      if (it.follow) it.m.position.set(it.follow.x, it.m.position.y, it.follow.z);
      it.m.material.opacity = it.mode === 'warn' ? 0.35 + 0.65 * k * (0.6 + 0.4 * Math.sin(it.t * 30)) : 1 - k;
    }
    this.items = this.items.filter(it => {
      if (it.t < it.dur) return true;
      this.scene.remove(it.m);
      it.m.material.dispose();
      return false;
    });
  }
}

// Chiffres de dégâts et textes flottants (DOM)
export class FloatText {
  constructor(camera) {
    this.camera = camera;
    this.layer = document.getElementById('float-layer');
    this.v = new THREE.Vector3();
  }

  show(pos, text, cls = '') {
    this.v.copy(pos).project(this.camera);
    if (this.v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'float-text ' + cls;
    el.textContent = text;
    el.style.left = ((this.v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 30) + 'px';
    el.style.top = ((-this.v.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    this.layer.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }
}
