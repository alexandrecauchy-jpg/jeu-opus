// Interface : barre de vie, armes, dialogues, notes, mini-carte, écrans.
import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER, RARITY, MAP_W, MAP_H, TILE } from './data.js';

const $ = id => document.getElementById(id);
const _v = new THREE.Vector3();

export class UI {
  constructor(game) {
    this.game = game;
    this.mini = $('minimap').getContext('2d');
    this.bars = [];
    this.dialogQueue = null;
    this.miniTimer = 0;
  }

  show(id, on = true) { $(id).classList.toggle('hidden', !on); }

  refresh() {
    const p = this.game.player;
    // On ne touche au DOM que si quelque chose a changé (évite des recalculs de mise en page)
    const key = [Math.ceil(p.hp), p.maxHp, p.potions, p.gold, [...p.keys].join(), p.weapons.join(), p.weapon,
      JSON.stringify(p.levels)].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    $('hp-fill').style.width = (100 * p.hp / p.maxHp) + '%';
    $('hp-text').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    $('hp-bar').style.width = (180 + p.maxHp * 1.2) + 'px';
    $('potions').textContent = p.potions;
    $('gold').textContent = p.gold;
    const keys = [];
    if (p.keys.has('bone')) keys.push("🗝️ Clé d'os");
    if (p.keys.has('king')) keys.push('👑 Clé du Roi');
    $('keys').textContent = keys.join('  ');
    const list = WEAPON_ORDER.filter(id => p.weapons.includes(id));
    $('weapons').innerHTML = list.map((id, i) => {
      const w = WEAPONS[id], r = RARITY[w.rarity], lv = p.levels[id] || 0;
      return `<div class="wslot ${id === p.weapon ? 'active' : ''}" style="--rc:${r.color}">
        <span class="wkey">${i + 1}</span><span class="wname">${w.name}${lv ? ' +' + lv : ''}</span>
        <span class="wstat">${r.label} · ${Math.round(w.dmg * (1 + 0.15 * lv))} dgt</span></div>`;
    }).join('');
  }

  objective(text) { if (text !== this.lastObjective) { this.lastObjective = text; $('objective').innerHTML = text; } }

  zoneTitle(name) {
    const el = $('zone-title');
    el.textContent = name;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  toast(html, cls = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.innerHTML = html;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3800);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }

  prompt(text) {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    const el = $('prompt');
    if (!text) { el.classList.add('hidden'); return; }
    el.innerHTML = text;
    el.classList.remove('hidden');
  }

  hurtFlash() {
    const el = $('hurt');
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  lowHealth(on) { if (on !== this.lastLow) { this.lastLow = on; $('lowhp').classList.toggle('on', on); } }

  bossBar(show, ratio = 1, name = '') {
    this.show('boss-bar', show);
    if (name) $('boss-name').textContent = name;
    $('boss-fill').style.width = Math.max(0, ratio * 100) + '%';
  }

  // Dialogue avec effet machine à écrire. Retourne une promesse.
  dialog(lines) {
    return new Promise(resolve => {
      const box = $('dialog');
      let i = -1, typing = null, full = '';
      const next = () => {
        if (typing) { clearInterval(typing); typing = null; $('dialog-text').textContent = full; return; }
        i++;
        if (i >= lines.length) {
          box.classList.add('hidden');
          this.advance = null;
          resolve();
          return;
        }
        const l = lines[i];
        $('dialog-who').textContent = l.who;
        $('dialog-who').className = 'who-' + (l.who || 'narrator').toLowerCase().replace(/[^a-z]/g, '');
        $('dialog-portrait').className = 'portrait p-' + (l.who || 'narrateur').toLowerCase().replace(/[^a-z]/g, '');
        full = l.text;
        let k = 0;
        $('dialog-text').textContent = '';
        typing = setInterval(() => {
          k += 2;
          $('dialog-text').textContent = full.slice(0, k);
          if (k >= full.length) { clearInterval(typing); typing = null; }
        }, 22);
        this.game.audio.play('ui');
      };
      box.classList.remove('hidden');
      this.advance = next;
      next();
    });
  }

  note(title, text) {
    return new Promise(resolve => {
      $('note-title').textContent = title;
      $('note-text').textContent = text;
      this.show('note');
      this.advance = () => { this.show('note', false); this.advance = null; resolve(); };
    });
  }

  // Barres de vie au-dessus des ennemis blessés
  updateEnemyBars(enemies, camera) {
    let n = 0;
    const layer = $('bars-layer');
    for (const e of enemies) {
      if (!e.targetable || e.hp >= e.maxHp || e.cfg.boss) continue;
      _v.copy(e.pos).setY(2.3 * e.scale + 0.3).project(camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) continue;
      let el = this.bars[n];
      if (!el) {
        el = document.createElement('div');
        el.className = 'ebar';
        el.innerHTML = '<div></div>';
        layer.appendChild(el);
        this.bars.push(el);
      }
      el.style.display = 'block';
      el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth - 30}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px)`;
      el.firstChild.style.width = (100 * e.hp / e.maxHp) + '%';
      el.classList.toggle('elite', !!e.cfg.elite);
      n++;
    }
    for (let i = n; i < this.bars.length; i++) this.bars[i].style.display = 'none';
  }

  drawMinimap(dt) {
    this.miniTimer -= dt;
    if (this.miniTimer > 0) return;
    this.miniTimer = 0.15;
    const g = this.game, w = g.world, ctx = this.mini;
    const S = 3;
    ctx.clearRect(0, 0, MAP_W * S, MAP_H * S);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++) {
        const i = w.idx(x, y);
        if (!w.explored[i] || !w.grid[i]) continue;
        ctx.fillStyle = w.gateGrid[i] ? (w.gates[w.gateGrid[i] - 1].open ? '#6b5a3c' : '#c0392b') : '#5b5149';
        ctx.fillRect(x * S, y * S, S, S);
      }
    const dot = (wx, wz, c, r = 2) => {
      const tx = Math.floor(wx / TILE), ty = Math.floor(wz / TILE);
      if (!w.explored[w.idx(tx, ty)]) return;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(wx / TILE * S, wz / TILE * S, r, 0, 7); ctx.fill();
    };
    for (const c of w.chests) if (!c.opened) dot(c.x, c.z, '#ffcc33', 2.5);
    for (const s of w.scrolls) if (!s.read) dot(s.x, s.z, '#f3e2b3', 2);
    for (const e of g.enemies) if (e.targetable) dot(e.pos.x, e.pos.z, e.cfg.boss ? '#ff2020' : '#e05050', e.cfg.elite ? 3 : 1.6);
    const p = g.player;
    ctx.save();
    ctx.translate(p.pos.x / TILE * S, p.pos.z / TILE * S);
    ctx.rotate(-p.yaw);
    ctx.fillStyle = '#7fd4ff';
    ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(3.5, -3); ctx.lineTo(-3.5, -3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  victory(stats) {
    const t = Math.floor(stats.time);
    const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
    $('stats').innerHTML = `
      <div><span>Temps</span><b>${mm} min ${ss} s</b></div>
      <div><span>Squelettes détruits</span><b>${stats.kills}</b></div>
      <div><span>Coffres ouverts</span><b>${stats.chests} / ${stats.chestsTotal}</b></div>
      <div><span>Armes trouvées</span><b>${stats.weapons} / 7</b></div>
      <div><span>Or ramassé</span><b>${stats.gold}</b></div>
      <div><span>Chutes</span><b>${stats.deaths}</b></div>`;
    this.show('victory-screen');
  }
}
