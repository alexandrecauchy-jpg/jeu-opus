// Données du jeu : armes, ennemis, carte du donjon et histoire.

export const TILE = 4;          // taille d'une case en unités 3D
export const WALL_H = 6;

export const RARITY = {
  commune: { label: 'Commune', color: '#c9c9c9' },
  rare: { label: 'Rare', color: '#4da3ff' },
  epique: { label: 'Épique', color: '#c06bff' },
  legendaire: { label: 'Légendaire', color: '#ff9d2e' },
};

// dmg : dégâts, speed : vitesse d'animation, range : portée, arc : angle de frappe (degrés)
// blunt : bonus contre les squelettes en armure, burn : brûlure
export const WEAPONS = {
  rusty:  { name: 'Épée rouillée',     model: 'w_rusty',  rarity: 'commune',    dmg: 12, speed: 1.0,  range: 3.2, arc: 110, knock: 3 },
  knight: { name: 'Épée du chevalier', model: 'w_knight', rarity: 'rare',       dmg: 20, speed: 1.1,  range: 3.5, arc: 115, knock: 3.5 },
  mace:   { name: "Masse d'armes",     model: 'w_mace',   rarity: 'rare',       dmg: 24, speed: 0.95, range: 3.2, arc: 110, knock: 5, blunt: true },
  axe:    { name: 'Hache de guerre',   model: 'w_axe',    rarity: 'epique',     dmg: 34, speed: 0.8,  range: 3.8, arc: 160, knock: 5 },
  spear:  { name: "Lance d'argent",    model: 'w_spear',  rarity: 'epique',     dmg: 26, speed: 1.15, range: 4.9, arc: 60,  knock: 4 },
  hammer: { name: 'Marteau runique',   model: 'w_hammer', rarity: 'epique',     dmg: 44, speed: 0.65, range: 3.9, arc: 150, knock: 9, blunt: true, shock: true },
  flame:  { name: 'Aube Ardente',      model: 'w_flame',  rarity: 'legendaire', dmg: 42, speed: 1.15, range: 4.0, arc: 140, knock: 5, burn: true },
};
export const WEAPON_ORDER = ['rusty', 'knight', 'mace', 'axe', 'spear', 'hammer', 'flame'];

export const ENEMIES = {
  warrior:  { hp: 50,   dmg: 10, speed: 3.1, range: 2.7, scale: 1.35, weapon: 'w_rusty', gold: [2, 6] },
  archer:   { hp: 34,   dmg: 9,  speed: 3.33, range: 13.0,  scale: 1.28, weapon: 'a_bow', gold: [2, 5], ranged: true },
  knight:   { hp: 120,   dmg: 15, speed: 2.64, range: 2.9, scale: 1.49, weapon: 'w_rusty', shield: true, helmet: true, armored: true, gold: [5, 10] },
  champion: { hp: 520,  dmg: 22, speed: 2.99, range: 4.2, scale: 1.96, weapon: 'w_axe', helmet: true, armored: true, elite: true, gold: [40, 60] },
  boss:     { hp: 1600, dmg: 26, speed: 2.76, range: 5.7, scale: 2.7, weapon: 'w_boss', crown: true, elite: true, boss: true, gold: [0, 0] },
};

// --- Carte -----------------------------------------------------------------
// Rectangles de sol (x, y, largeur, hauteur) en cases.
export const MAP_W = 64, MAP_H = 60;
export const ROOMS = [
  // Zone 1 — Les Caves
  [4, 44, 8, 7], [12, 46, 10, 2], [22, 41, 10, 10], [26, 34, 2, 7],
  // Zone 2 — La Crypte
  [14, 22, 20, 12], [12, 27, 2, 2], [4, 24, 8, 8], [7, 32, 2, 3], [4, 35, 7, 6], [23, 16, 2, 6],
  // Zone 3 — L'Ossuaire
  [16, 4, 16, 12], [13, 7, 3, 2], [4, 4, 9, 9], [32, 9, 8, 2],
  // Zone 4 — Les Salles du Roi
  [40, 4, 16, 12], [56, 6, 1, 2], [57, 4, 6, 6], [47, 16, 2, 6], [42, 22, 13, 9], [47, 31, 2, 6],
  // Zone 5 — Le Trône
  [44, 37, 8, 6], [47, 43, 2, 2], [39, 45, 21, 13],
];

// Herses : franchies dans l'ordre. cond : 'clear' (zone nettoyée), 'key:xxx', 'boss'
export const GATES = [
  { id: 1, tiles: [[26, 38], [27, 38]], cond: 'clear' },
  { id: 2, tiles: [[23, 18], [24, 18]], cond: 'key:bone' },
  { id: 3, tiles: [[36, 9], [36, 10]], cond: 'clear' },
  { id: 4, tiles: [[47, 33], [48, 33]], cond: 'key:king' },
  { id: 5, tiles: [[47, 44], [48, 44]], cond: 'boss', startOpen: true },
];

export const PLAYER_START = [7.5, 48.5];

// Entités : [type, x, y, options]
export const ENTITIES = [
  // ---- Zone 1
  ['scroll', 5, 45, { id: 'note1' }],
  ['potion', 10, 49],
  ['barrel', 4, 50], ['barrel', 5, 50], ['crate', 11, 44], ['crate', 11, 45],
  ['warrior', 16, 46], ['warrior', 20, 47],
  ['warrior', 25, 44], ['warrior', 28, 43], ['warrior', 27, 48], ['warrior', 30, 45],
  ['chest', 30, 49, { loot: ['weapon:knight', 'gold:15'] }],
  ['pillar', 24, 42], ['pillar', 29, 42], ['bones', 23, 49], ['bones', 26, 46], ['brazier', 23, 41],
  ['candles', 31, 41], ['rubble', 13, 47], ['rubble', 22, 50],
  // ---- Zone 2
  ['pillar', 17, 25], ['pillar', 21, 25], ['pillar', 26, 25], ['pillar', 30, 25],
  ['pillar', 17, 30], ['pillar', 21, 30], ['pillar', 26, 30], ['pillar', 30, 30],
  ['brazier', 23, 28], ['brazier', 24, 28],
  ['warrior', 16, 27], ['warrior', 20, 32], ['warrior', 31, 23], ['warrior', 28, 28], ['warrior', 19, 23],
  ['archer', 18, 23], ['archer', 32, 32], ['archer', 25, 22],
  ['candles', 14, 22], ['candles', 33, 22], ['bones', 15, 33], ['bones', 32, 27], ['rubble', 27, 33],
  ['knight', 8, 28], ['warrior', 6, 30], ['warrior', 10, 25],
  ['chest', 5, 25, { loot: ['key:bone', 'potion', 'gold:20'] }],
  ['scroll', 10, 30, { id: 'note2' }], ['bones', 4, 31], ['candles', 11, 24],
  ['spikes', 7, 33], ['spikes', 8, 33],
  ['archer', 9, 36], ['warrior', 5, 39],
  ['chest', 5, 37, { loot: ['weapon:mace', 'potion', 'gold:10'] }],
  ['barrel', 10, 40], ['crate', 4, 40],
  // ---- Zone 3
  ['riser', 19, 7], ['riser', 22, 12], ['riser', 26, 6], ['riser', 29, 10], ['riser', 20, 10],
  ['riser', 27, 13], ['riser', 24, 8], ['riser', 30, 6], ['riserArcher', 17, 5], ['riserArcher', 31, 14],
  ['bones', 18, 6], ['bones', 21, 9], ['bones', 25, 11], ['bones', 28, 7], ['bones', 30, 12], ['bones', 17, 13],
  ['bones', 23, 5], ['bones', 26, 14], ['candles', 16, 4], ['candles', 31, 4], ['candles', 16, 15],
  ['pillar', 20, 7], ['pillar', 27, 9],
  ['spikes', 13, 7], ['spikes', 14, 8], ['spikes', 15, 7],
  ['archer', 6, 11], ['archer', 11, 11], ['warrior', 8, 6], ['knight', 9, 9],
  ['chest', 5, 5, { loot: ['weapon:axe', 'gold:25'] }],
  ['chest', 12, 4, { loot: ['heart', 'potion'] }],
  ['scroll', 4, 12, { id: 'note3' }], ['bones', 7, 4], ['brazier', 8, 12],
  // ---- Zone 4
  ['pillar', 43, 7], ['pillar', 47, 7], ['pillar', 51, 7], ['pillar', 43, 12], ['pillar', 47, 12], ['pillar', 51, 12],
  ['knight', 45, 9], ['knight', 50, 10], ['archer', 54, 5], ['archer', 54, 14], ['archer', 41, 14],
  ['warrior', 48, 5], ['warrior', 44, 13], ['warrior', 53, 9],
  ['banner', 45, 4], ['banner', 49, 4], ['banner', 53, 4], ['candles', 40, 4],
  ['chest', 61, 5, { loot: ['weapon:spear', 'gold:30'] }],
  ['chest', 61, 8, { loot: ['heart', 'potion', 'potion'] }],
  ['warrior', 59, 7], ['spikes', 56, 6], ['spikes', 56, 7],
  ['champion', 48, 25], ['knight', 44, 28], ['knight', 52, 28],
  ['chest', 53, 23, { loot: ['weapon:hammer', 'gold:30'] }],
  ['brazier', 43, 23], ['brazier', 53, 29], ['bones', 46, 29], ['bones', 50, 23], ['rubble', 44, 25],
  // ---- Zone 5
  ['chest', 47, 37, { loot: ['weapon:flame', 'heart'], legendary: true }],
  ['potion', 45, 41], ['potion', 50, 41], ['scroll', 51, 38, { id: 'note4' }],
  ['brazier', 44, 37], ['brazier', 51, 37], ['candles', 44, 42], ['candles', 51, 42],
  ['pillar', 42, 48], ['pillar', 56, 48], ['pillar', 42, 54], ['pillar', 56, 54],
  ['brazier', 40, 46], ['brazier', 58, 46], ['brazier', 40, 56], ['brazier', 58, 56],
  ['throne', 47.5, 56], ['cage', 53.5, 55.5], ['banner', 44, 45], ['banner', 52, 45],
  ['bones', 45, 50], ['bones', 54, 51], ['bones', 49, 53],
  ['boss', 47.5, 50],
];

// Déclencheurs d'histoire (zone atteinte pour la première fois)
export const ZONE_INFO = {
  1: { name: 'Les Caves', objective: 'Explorez les caves et éliminez les squelettes' },
  2: { name: 'La Crypte', objective: "Trouvez la Clé d'os cachée dans la crypte" },
  3: { name: "L'Ossuaire", objective: 'Survivez aux morts de l’ossuaire' },
  4: { name: 'Les Salles du Roi', objective: 'Terrassez le Champion et prenez la Clé du Roi' },
  5: { name: 'Le Trône des Os', objective: 'Affrontez Morvath et libérez la princesse' },
};

export const STORY = {
  intro: [
    { who: '', text: "Royaume d'Aubeclair. Depuis trois nuits, la lune saigne." },
    { who: '', text: "Morvath, l'ancien mage du roi banni pour nécromancie, a enlevé la princesse Elara et l'a emmenée au plus profond du Donjon des Os." },
    { who: '', text: "À la prochaine lune rouge, il versera le sang royal pour devenir immortel." },
    { who: '', text: "Vous êtes Sire Aldric, dernier chevalier de la Garde de l'Aube. Seul. Armé d'une vieille épée rouillée." },
    { who: 'Aldric', text: "Tenez bon, Princesse. J'arrive." },
  ],
  zone2: [
    { who: 'Voix lointaine', text: "Un chevalier ? Ha ! Mes enfants vont jouer avec tes os…" },
    { who: 'Aldric', text: "Morvath… Cette herse est verrouillée. La clé doit être quelque part dans la crypte." },
  ],
  zone3: [
    { who: 'Aldric', text: "L'ossuaire… Des milliers d'os. Et certains… bougent." },
  ],
  zone4: [
    { who: 'Elara', text: "À l'aide ! Il y a quelqu'un ?!" },
    { who: 'Aldric', text: "Princesse ! Je suis là ! Tenez bon !" },
  ],
  champion: [
    { who: 'Champion squelette', text: "Nul… ne passe. Le Roi… l'a ordonné." },
  ],
  kingKey: [
    { who: 'Aldric', text: "La Clé du Roi. La salle du trône est juste après cette herse." },
  ],
  zone5: [
    { who: 'Aldric', text: "Un autel… et un coffre scellé d'or. Je sens une chaleur étrange à l'intérieur." },
  ],
  flame: [
    { who: 'Aldric', text: "L'Aube Ardente… la lame des anciens rois. Avec elle, les morts brûleront." },
  ],
  boss: [
    { who: 'Morvath', text: "Sire Aldric. Tu arrives juste à temps pour voir la lune rouge se lever." },
    { who: 'Elara', text: "Aldric ! Attention, il peut relever les morts !" },
    { who: 'Morvath', text: "Viens donc. Ta place est dans ma garde éternelle !" },
  ],
  bossPhase2: [
    { who: 'Morvath', text: "ASSEZ ! Goûte à la colère du tombeau !" },
  ],
  bossDeath: [
    { who: 'Morvath', text: "Impossible… la lumière… elle me… brûle…" },
  ],
  ending: [
    { who: 'Elara', text: "Aldric ! Tu es venu… Je savais que tu viendrais." },
    { who: 'Aldric', text: "Le Donjon des Os est tombé, Princesse. Rentrons. Le royaume vous attend." },
    { who: 'Elara', text: "Alors rentrons ensemble. Et que l'aube se lève enfin sur Aubeclair." },
  ],
  death: "Vous êtes tombé…",
};

export const NOTES = {
  note1: { title: 'Journal du garde Bertin', text: "Jour 3. Les morts se relèvent dans les caves. Frappez-les fort (clic gauche) et ne restez jamais immobile : une roulade (Espace ou clic droit) vous sauvera la vie. Les potions rouges se boivent avec F." },
  note2: { title: 'Page arrachée', text: "Les archers squelettes tirent là où vous vous trouvez. Roulez sur le côté au dernier moment. Et fouillez les coffres : nos anciens frères d'armes y ont caché leurs armes." },
  note3: { title: 'Gravure dans la pierre', text: "Le fer des chevaliers squelettes dévie les lames. Une arme contondante — masse ou marteau — brise leur garde." },
  note4: { title: "Autel de l'Aube", text: "« Lorsque les ténèbres prendront la fille du roi, que la lame de l'Aube soit tirée de ce coffre. Le feu purifie ce que la mort a souillé. »" },
};
