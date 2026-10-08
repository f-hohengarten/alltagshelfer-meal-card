// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  { v: 'pasta',       l: 'Pasta',       bg: 'rgba(6,49,67,0.8)',    tc: '#5AC8F5' },
  { v: 'salat',       l: 'Salate',      bg: 'rgba(9,79,20,0.8)',    tc: '#32D74B' },
  { v: 'fleisch',     l: 'Fleisch',     bg: 'rgba(59,38,5,0.8)',    tc: '#FF9F0A' },
  { v: 'vegetarisch', l: 'Vegetarisch', bg: 'rgba(9,64,17,0.8)',    tc: '#32D74B' },
  { v: 'suppe',       l: 'Suppen',      bg: 'rgba(9,76,53,0.8)',    tc: '#6adc91' },
  { v: 'snack',       l: 'Snacks',      bg: 'rgba(80,68,8,0.85)',   tc: '#e6c400' },
  { v: 'dessert',     l: 'Desserts',    bg: 'rgba(52,12,72,0.8)',   tc: '#BF5AF2' },
  { v: 'sonstiges',   l: 'Sonstiges',   bg: 'rgba(60,60,60,0.85)',  tc: '#c8c8c8' },
];

const CONFIG_ITEM_MARKER = '__alh_config__';

// Pantry staples are pre-deselected when ingredients go to the shopping list
const DEFAULT_PANTRY = ['Salz', 'Pfeffer', 'Salz & Pfeffer', 'Olivenöl', 'Öl', 'Sonnenblumenöl', 'Rapsöl', 'Zucker', 'Wasser'];

function isPantry(name, pantry) {
  const n = String(name ?? '').toLowerCase().trim();
  return (pantry || []).some(p => {
    const t = String(p).toLowerCase().trim();
    return t && (n === t || n.startsWith(t + ' '));
  });
}

const CAT_PALETTE = [
  { bg: 'rgba(6,49,67,0.8)',   tc: '#5AC8F5' },
  { bg: 'rgba(9,79,20,0.8)',   tc: '#32D74B' },
  { bg: 'rgba(59,38,5,0.8)',   tc: '#FF9F0A' },
  { bg: 'rgba(9,76,53,0.8)',   tc: '#6adc91' },
  { bg: 'rgba(80,68,8,0.85)',  tc: '#e6c400' },
  { bg: 'rgba(52,12,72,0.8)',  tc: '#BF5AF2' },
  { bg: 'rgba(67,10,10,0.8)',  tc: '#FF453A' },
  { bg: 'rgba(0,55,55,0.8)',   tc: '#5AC8FA' },
  { bg: 'rgba(30,30,60,0.8)',  tc: '#7D7AFF' },
  { bg: 'rgba(50,20,0,0.8)',   tc: '#FFB340' },
];

const UNITS = ['g', 'kg', 'ml', 'l', 'Stk', 'Zehe', 'EL', 'TL', 'Prise', 'Bund', 'Pkg'];

const NUTRI_RULES = {
  A: ['salat', 'spinat', 'brokkoli', 'karotte', 'tomate', 'gurke', 'paprika', 'zucchini',
      'apfel', 'beere', 'linse', 'bohne', 'kichererbse', 'erbse', 'lauch', 'sellerie',
      'feldsalat', 'rucola', 'avocado', 'kürbis', 'aubergine', 'zwiebel', 'knoblauch'],
  B: ['hühnchen', 'hähnchen', 'putenbrust', 'fisch', 'lachs', 'thunfisch', 'forelle',
      'vollkorn', 'haferflocken', 'joghurt', 'quark', 'hüttenkäse', 'skyr', 'tofu', 'tempeh'],
  C: ['kartoffel', 'nudel', 'pasta', 'reis', 'brot', 'käse', 'ei', 'mehl', 'mais',
      'kichererbsen', 'linsen', 'couscous', 'quinoa', 'pizza'],
  D: ['hackfleisch', 'rinderhack', 'schweinefleisch', 'wurst', 'sahne', 'butter',
      'schlagsahne', 'frischkäse', 'mayonnaise', 'crème fraîche', 'speck', 'salami'],
  E: ['zucker', 'nutella', 'schokolade', 'pommes', 'chips', 'gummibärchen',
      'tiefkühlpizza', 'fastfood', 'frittiert', 'ketchup', 'softdrink'],
};

const SLOTS = [
  { v: 'fruehstueck', l: 'Frühstück', icon: '🌅' },
  { v: 'mittag',      l: 'Mittagessen', icon: '☀️' },
  { v: 'abendessen',  l: 'Abendessen', icon: '🌙' },
];

const DAY_NAMES_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY_NAMES_LONG  = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTH_NAMES     = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

// ─── Client-side recipe extraction (fallback for bot-protected sites) ─────────

function findRecipeInObj(o, depth) {
  if (depth > 12 || !o || typeof o !== 'object') return null;
  if (Array.isArray(o)) {
    for (const i of o) { const r = findRecipeInObj(i, depth + 1); if (r) return r; }
    return null;
  }
  if (String(o['@type'] || '').includes('Recipe')) return o;
  // Recurse into common wrapper properties (e.g. REWE uses Webpage > mainEntity > Recipe)
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage']) {
    if (o[key]) { const r = findRecipeInObj(o[key], depth + 1); if (r) return r; }
  }
  return null;
}

function extractJsonLdFromHtml(html) {
  const candidates = [];
  let m;
  // 1. Standard application/ld+json blocks
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = re.exec(html)) !== null) {
    try { const r = findRecipeInObj(JSON.parse(m[1].trim()), 0); if (r) candidates.push(r); } catch (e) {}
  }
  // 2. Next.js __NEXT_DATA__
  const nd = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nd) {
    try { const r = findRecipeInObj(JSON.parse(nd[1].trim()), 0); if (r) candidates.push(r); } catch (e) {}
  }
  // 3. application/json blocks
  const re2 = /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = re2.exec(html)) !== null) {
    try { const r = findRecipeInObj(JSON.parse(m[1].trim()), 0); if (r) candidates.push(r); } catch (e) {}
  }
  if (!candidates.length) return null;
  // Prefer the most complete candidate (has both name and ingredients)
  return candidates.find(r => r.name && r.recipeIngredient?.length) || candidates[0];
}

function parseIngredientJs(raw) {
  raw = String(raw || '').replace(/<[^>]+>/g, '').trim();
  const unitMap = { stk:'Stk',stück:'Stk',zehe:'Zehe',bund:'Bund',pkg:'Pkg',prise:'Prise',el:'EL',tl:'TL',tbsp:'EL',tsp:'TL',cup:'Stk',cups:'Stk' };
  const units = 'g|kg|ml|l|L|EL|TL|Stk|Stück|Zehe|Bund|Pkg|Prise|cl|dl|oz|lb|cup|cups|tbsp|tsp';
  let m = raw.match(new RegExp(`^([\\d,./½¼¾⅓⅔]+)\\s*(${units})\\.?\\s+(.+)$`, 'i'));
  if (m) return { name: m[3].trim(), amount: m[1], unit: unitMap[m[2].toLowerCase()] || m[2] };
  m = raw.match(/^([\d,./½¼¾⅓⅔]+)\s+(.+)$/);
  if (m) return { name: m[2].trim(), amount: m[1], unit: 'Stk' };
  return { name: raw, amount: '', unit: 'Stk' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function x(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Scales an ingredient amount and formats it German-style ("1½", "0,3", "138")
function fmtAmount(amount, scale = 1) {
  const raw = String(amount ?? '').trim();
  if (!raw) return '';
  const n = parseFloat(raw.replace(',', '.'));
  if (isNaN(n)) return raw;
  const v = n * scale;
  if (v >= 10) return String(Math.round(v));
  const whole = Math.floor(v);
  const frac  = v - whole;
  const FRACS = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];
  const hit = FRACS.find(([f]) => Math.abs(frac - f) < 0.02);
  if (hit) return `${whole || ''}${hit[1]}`;
  return String(Math.round(v * 10) / 10).replace('.', ',');
}

// Splits a recipe note into intro text, numbered steps ("1. …") and trailing text
function splitNote(note) {
  const out = { intro: [], steps: [], outro: [] };
  for (const line of String(note ?? '').split('\n')) {
    const t = line.trim();
    if (!t || /^zubereitung:?$/i.test(t)) continue;
    const m = t.match(/^(\d+)[.)]\s+(.+)$/);
    if (m) out.steps.push(m[2]);
    else (out.steps.length ? out.outro : out.intro).push(t);
  }
  return out;
}

// Inverse of splitNote for the form: numbered steps first, free notes below
function joinNote(steps, note) {
  const parts = [];
  if (steps.length) parts.push(steps.map((t, i) => `${i + 1}. ${t}`).join('\n'));
  if (String(note ?? '').trim()) parts.push(String(note).trim());
  return parts.join('\n\n');
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function getMondayOfWeek(date, offset = 0) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff + offset * 7);
  d.setHours(12, 0, 0, 0);
  return d;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function fmtDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr + 'T12:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

function parseRecipeMeta(desc) {
  const str = String(desc ?? '');
  // Extract data URL stored separately (avoids ; conflict in header)
  const imgBlockMatch = str.match(/\n\[IMG\](data:[^\n]*)/);
  const cleanStr = imgBlockMatch ? str.slice(0, str.lastIndexOf('\n[IMG]')) : str;
  const mHead = cleanStr.match(/^\[ALH ([^\]]*)\]/);
  const meta  = { cat: 'sonstiges', cats: ['sonstiges'], score: '', srv: 4, time: 0, fav: false, src: '', note: '', img: '', ingredients: [] };
  if (imgBlockMatch) meta.img = imgBlockMatch[1];
  if (mHead) {
    mHead[1].split(';').forEach(p => {
      const i = p.indexOf(':');
      if (i > 0) meta[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    });
    meta.srv = parseInt(meta.srv) || 4;
    // cat holds one or more comma-separated category values ("salat,keine-zeit")
    meta.cats = String(meta.cat || '').split(',').map(c => c.trim()).filter(Boolean);
    if (!meta.cats.length) meta.cats = ['sonstiges'];
    meta.cat = meta.cats[0];
    meta.time = parseInt(meta.time) || 0;
    meta.fav  = meta.fav === '1' || meta.fav === true;
    try { meta.src = decodeURIComponent(meta.src || ''); } catch (e) { meta.src = ''; }
    const rest = cleanStr.slice(mHead[0].length).trim();
    const pipeIdx = rest.indexOf('|');
    if (pipeIdx >= 0) {
      meta.note = rest.slice(0, pipeIdx).trim();
      const ingStr = rest.slice(pipeIdx + 1);
      meta.ingredients = ingStr ? ingStr.split(',').map(s => {
        const parts = s.split(':');
        return { name: parts[0] || '', amount: parts[1] || '', unit: parts[2] || '' };
      }).filter(i => i.name) : [];
    } else {
      meta.note = rest;
    }
  } else {
    meta.note = cleanStr;
  }
  return meta;
}

function encodeRecipeMeta({ cats, cat, score, srv, time, fav, src, note, ingredients, img }) {
  const catList = (cats && cats.length) ? cats : [cat || 'sonstiges'];
  const parts = [`cat:${catList.join(',')}`, `srv:${srv || 4}`];
  if (score) parts.push(`score:${score}`);
  if (parseInt(time)) parts.push(`time:${parseInt(time)}`);
  if (fav) parts.push('fav:1');
  if (src) parts.push(`src:${encodeURIComponent(src)}`);
  // Only HTTP/HTTPS URLs go into the header; data URLs use the [IMG] block below
  if (img && !img.startsWith('data:')) parts.push(`img:${img}`);
  const head = `[ALH ${parts.join(';')}]`;
  const clean = v => String(v ?? '').replace(/[,:]/g, ' ').trim();
  const ingStr = (ingredients || [])
    .filter(i => i.name)
    .map(i => `${clean(i.name)}:${String(i.amount ?? '').replace(',', '.').replace(/[,:]/g, '').trim()}:${clean(i.unit)}`)
    .join(',');
  const noteStr = (note || '').replace(/\|/g, '/').trim();
  let result;
  if (ingStr) result = `${head} ${noteStr}|${ingStr}`;
  else if (noteStr) result = `${head} ${noteStr}`;
  else result = head;
  // Append data URL as separate block to avoid ; conflicts in header parsing
  if (img && img.startsWith('data:')) result += `\n[IMG]${img}`;
  return result;
}

function parsePlanMeta(desc) {
  const str = String(desc ?? '');
  const m = str.match(/^\[ALH ([^\]]*)\]/);
  const meta = { recipe_id: '', srv: 4, slot: 'mittag' };
  if (m) {
    m[1].split(';').forEach(p => {
      const i = p.indexOf(':');
      if (i > 0) meta[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    });
    meta.srv = parseInt(meta.srv) || 4;
    if (!SLOTS.find(s => s.v === meta.slot)) meta.slot = 'mittag';
  }
  return meta;
}

function encodePlanMeta({ recipe_id, srv, slot }) {
  const parts = [`recipe_id:${recipe_id}`, `srv:${srv || 4}`];
  if (slot && slot !== 'mittag') parts.push(`slot:${slot}`);
  return `[ALH ${parts.join(';')}]`;
}

function suggestNutriScore(ingredients) {
  if (!ingredients || !ingredients.length) return null;
  const scores = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const ing of ingredients) {
    const nameLower = String(ing.name ?? '').toLowerCase();
    for (const [score, keywords] of Object.entries(NUTRI_RULES)) {
      if (keywords.some(kw => nameLower.includes(kw))) {
        scores[score]++;
        break;
      }
    }
  }
  if (scores.E >= 2) return 'E';
  if (scores.E >= 1) return 'D';
  if (scores.D >= 2) return 'D';
  if (scores.D >= 1 && scores.C >= 1) return 'C';
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : null;
}

function nutriColor(score) {
  return { A: '#038141', B: '#85BB2F', C: '#FECB02', D: '#EE8100', E: '#E63312' }[score] || '';
}

function nutriTextColor(score) {
  return score === 'C' ? '#000' : '#fff';
}

// ─── Component ────────────────────────────────────────────────────────────────

class AlhMealCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    // Permanent delegated handler — survives every innerHTML re-render.
    // querySelector-based per-element bindings in _bind() are racy when async
    // fetches trigger re-renders between the button appearing and the user's click.
    this.shadowRoot.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="parse-paste"]');
      if (btn) this._handleParsePaste();
    });

    this._recipes  = [];
    this._plan     = [];
    this._config   = { recipe_entity: '', plan_entity: '', shopping_entity: '', title: 'Mahlzeitenplaner' };
    this._hass     = null;
    this._unsubFns = [];
    this._onViewportChange = () => {
      if (this._overlayRaf) return;
      this._overlayRaf = requestAnimationFrame(() => {
        this._overlayRaf = null;
        this._positionOverlay();
      });
    };

    this._view          = localStorage.getItem('alh-meal-view') || 'woche';
    this._weekOffset    = 0;
    this._catFilters    = [];   // categories, AND-combined
    this._favFilter     = false;
    this._timeFilter    = 0;    // max minutes, 0 = off
    this._sort          = localStorage.getItem('alh-meal-sort') || 'new';
    this._addMenuOpen   = false;
    this._cookMode      = false;
    this._cookDone      = new Set(); // 'i:<idx>' / 's:<idx>' checked off in cook mode
    this._wakeLock      = null;
    this._detailShop    = '';   // '' | 'busy' | 'done'
    this._shopError     = '';   // shown under the shopping buttons
    this._shopPick      = null; // Set of ingredient indices while choosing what goes on the list
    this._settings      = this._loadSettings();
    this._searchQuery   = '';

    this._activePanel   = null; // 'recipe-form' | 'plan-form' | null
    this._recipeForm    = this._blankRecipeForm();
    this._planForm      = this._blankPlanForm();

    this._shopPlanUids  = new Set();
    this._shopDeselected = new Set(); // key: `${planUid}::${ingName}::${ingUnit}`
    this._shopServings  = {};
    this._shopSuccess   = false;

    this._nutriSuggestion = null;
    this._importLoading   = false;
    this._importResult    = null;
    this._importPasteMode = false;
    this._importPasteHtml = '';
    this._planSearch      = '';
    this._dragPlanUid     = null;
    this._recipeDetail    = null; // uid of recipe shown in detail overlay
    this._detailPlanUid   = null; // plan uid if detail opened from week view
    this._detailSrv       = null; // servings chosen in detail view (scales ingredients)
    this._detailChanging  = false;
    this._detailChangeSearch = '';
    this._jsonImportMode  = false;
    this._jsonImportText  = '';
    this._jsonImportError = '';
    this._jsonImportCount = 0;

    this._categories      = this._loadCategories();
    this._configItem      = null;
    this._catMgmtNewLabel = '';
  }

  _blankRecipeForm() {
    return {
      open: false, uid: null,
      title: '', cats: [], score: '', srv: 4, time: '', fav: false, src: '', note: '', img: '',
      ingredients: [], steps: [],
      _ingName: '', _ingAmount: '', _ingUnit: 'g', _ingEditIdx: null,
      _importUrl: '',
    };
  }

  _blankPlanForm() {
    return { open: false, dayIso: '', recipeUid: '', srv: 4, slot: 'mittag' };
  }

  _loadCategories() {
    try {
      const stored = localStorage.getItem('alh-meal-categories');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [...DEFAULT_CATEGORIES];
  }

  _loadSettings() {
    const base = { shopping_entity: '', pantry: [...DEFAULT_PANTRY] };
    try {
      const stored = JSON.parse(localStorage.getItem('alh-meal-settings') || 'null');
      if (stored && typeof stored === 'object') return { ...base, ...stored };
    } catch (e) {}
    return base;
  }

  // Shopping list chosen in the settings wins over the YAML option
  _shoppingEntity() {
    return this._settings.shopping_entity || this._config.shopping_entity || '';
  }

  _saveCategories() { this._saveConfig(); }

  _saveConfig() {
    localStorage.setItem('alh-meal-categories', JSON.stringify(this._categories));
    localStorage.setItem('alh-meal-settings', JSON.stringify(this._settings));
    const desc = JSON.stringify({ categories: this._categories, settings: this._settings });
    if (this._configItem) {
      this._svc(this._config.recipe_entity, 'update_item', {
        item: this._configItem.uid,
        description: desc,
      }).catch(e => console.error('[alh-meal-card] saveConfig:', e));
    } else {
      this._svc(this._config.recipe_entity, 'add_item', {
        item: CONFIG_ITEM_MARKER,
        description: desc,
      }).catch(e => console.error('[alh-meal-card] saveConfig:', e));
    }
  }

  _catLabels(meta) {
    return meta.cats.map(v => this._categories.find(c => c.v === v)?.l ?? v).join(' · ');
  }

  _catBadgeStyle(catV) {
    const cat = this._categories.find(c => c.v === catV);
    if (cat) return `background:${cat.bg};color:${cat.tc}`;
    return 'background:rgba(60,60,60,0.85);color:#c8c8c8';
  }

  _addCategory() {
    const labelEl = this.shadowRoot.querySelector('.cat-add__label');
    const label = (labelEl?.value ?? this._catMgmtNewLabel).trim();
    if (!label) return;
    const v = label.toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!v) return;
    if (this._categories.some(c => c.v === v)) {
      if (labelEl) { labelEl.focus(); labelEl.style.borderColor = 'var(--error-color,#f44336)'; }
      return;
    }
    const usedBgs = new Set(this._categories.map(c => c.bg));
    const color = CAT_PALETTE.find(p => !usedBgs.has(p.bg)) || CAT_PALETTE[this._categories.length % CAT_PALETTE.length];
    this._categories.push({ v, l: label, bg: color.bg, tc: color.tc });
    this._saveCategories();
    this._catMgmtNewLabel = '';
    this._activePanel = 'manage-cats';
    this._render();
  }

  static getStubConfig() {
    return {
      recipe_entity:   'todo.alh_rezepte',
      plan_entity:     'todo.alh_mahlzeitenplan',
      shopping_entity: 'todo.einkaufsliste',
      title:           'Mahlzeitenplaner',
    };
  }

  setConfig(config) {
    if (!config.recipe_entity) throw new Error('recipe_entity ist erforderlich');
    if (!config.plan_entity)   throw new Error('plan_entity ist erforderlich');
    this._config = { title: 'Mahlzeitenplaner', shopping_entity: '', ...config };
    if (this._hass) this._subscribe();
    this._render();
  }

  set hass(hass) {
    if (this._hass && this._importLoading) {
      const resultEntity = hass.states['sensor.alh_recipe_import_result'];
      const prev = this._hass.states['sensor.alh_recipe_import_result'];
      if (resultEntity && (!prev || resultEntity.state !== prev.state)) {
        const jsonStr = resultEntity.attributes?.result ?? resultEntity.state;
        this._handleImportResult(jsonStr);
      }
    }
    const first = !this._hass;
    this._hass = hass;
    if (first && this._config.recipe_entity) this._subscribe();
  }

  connectedCallback() {
    window.addEventListener('scroll', this._onViewportChange, true);
    window.addEventListener('resize', this._onViewportChange);
    window.visualViewport?.addEventListener('resize', this._onViewportChange);
    if (this._hass && this._config.recipe_entity && this._unsubFns.length === 0) {
      this._subscribe();
    }
  }

  disconnectedCallback() {
    window.removeEventListener('scroll', this._onViewportChange, true);
    window.removeEventListener('resize', this._onViewportChange);
    window.visualViewport?.removeEventListener('resize', this._onViewportChange);
    this._setScrollLock(false);
    this._unsubFns.forEach(fn => fn());
    this._unsubFns = [];
  }

  getCardSize() { return 6; }

  async _subscribe() {
    this._unsubFns.forEach(fn => fn());
    this._unsubFns = [];
    await Promise.all([this._fetchRecipes(), this._fetchPlan()]);
    try {
      const unsub = await this._hass.connection.subscribeEvents((event) => {
        const eid = event.data.entity_id;
        if (eid === this._config.recipe_entity) this._fetchRecipes();
        if (eid === this._config.plan_entity)   this._fetchPlan();
      }, 'state_changed');
      this._unsubFns.push(unsub);
    } catch (e) {
      console.warn('[alh-meal-card] subscribeEvents fehlgeschlagen', e);
    }
  }

  async _fetchRecipes() {
    try {
      const result = await this._hass.callService(
        'todo', 'get_items',
        { status: ['needs_action', 'completed'] },
        { entity_id: this._config.recipe_entity },
        false, true
      );
      const allItems = result.response?.[this._config.recipe_entity]?.items ?? [];
      this._applyConfigItem(allItems);
      this._recipes = allItems.filter(r => r.summary !== CONFIG_ITEM_MARKER);
    } catch (e) {
      console.error('[alh-meal-card] fetchRecipes:', e);
      const fallback = this._hass.states[this._config.recipe_entity]?.attributes?.items ?? [];
      this._recipes = fallback.filter(r => r.summary !== CONFIG_ITEM_MARKER);
    }
    this._render();
  }

  _applyConfigItem(allItems) {
    const item = allItems.find(r => r.summary === CONFIG_ITEM_MARKER);
    this._configItem = item || null;
    if (!item) return;
    try {
      const cfg = JSON.parse(item.description || '{}');
      if (Array.isArray(cfg.categories) && cfg.categories.length > 0) {
        this._categories = cfg.categories;
        localStorage.setItem('alh-meal-categories', JSON.stringify(this._categories));
      }
      if (cfg.settings && typeof cfg.settings === 'object') {
        this._settings = { ...this._loadSettings(), ...cfg.settings };
        localStorage.setItem('alh-meal-settings', JSON.stringify(this._settings));
      }
    } catch (e) {}
  }

  async _fetchPlan() {
    try {
      const result = await this._hass.callService(
        'todo', 'get_items',
        { status: ['needs_action', 'completed'] },
        { entity_id: this._config.plan_entity },
        false, true
      );
      this._plan = result.response?.[this._config.plan_entity]?.items ?? [];
    } catch (e) {
      console.error('[alh-meal-card] fetchPlan:', e);
      this._plan = this._hass.states[this._config.plan_entity]?.attributes?.items ?? [];
    }
    this._render();
  }

  _svc(entity_id, service, data) {
    return this._hass.callService('todo', service, data, { entity_id });
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  _render() {
    // Preserve live input values before innerHTML wipe
    const searchEl = this.shadowRoot.querySelector('.search__input');
    if (searchEl) this._searchQuery = searchEl.value;

    const ingNameEl   = this.shadowRoot.querySelector('.ing-add__name');
    const ingAmtEl    = this.shadowRoot.querySelector('.ing-add__amount');
    const ingUnitEl   = this.shadowRoot.querySelector('.ing-add__unit');
    if (ingNameEl)   this._recipeForm._ingName   = ingNameEl.value;
    if (ingAmtEl)    this._recipeForm._ingAmount  = ingAmtEl.value;
    if (ingUnitEl)   this._recipeForm._ingUnit    = ingUnitEl.value;

    const noteEl    = this.shadowRoot.querySelector('.form__note');
    if (noteEl)      this._recipeForm.note  = noteEl.value;

    const urlEl     = this.shadowRoot.querySelector('.import__url');
    if (urlEl)       this._recipeForm._importUrl = urlEl.value;

    const imgUrlEl  = this.shadowRoot.querySelector('.form__img-url');
    if (imgUrlEl && imgUrlEl.value) this._recipeForm.img = imgUrlEl.value;

    const planDayEl = this.shadowRoot.querySelector('.plan-form__date');
    if (planDayEl)   this._planForm.dayIso = planDayEl.value;

    if (this._activePanel === 'recipe-form') {
      const f = this._recipeForm;
      const titleEl = this.shadowRoot.querySelector('.form__title-input');
      const timeEl  = this.shadowRoot.querySelector('.form__time');
      const srcEl   = this.shadowRoot.querySelector('.form__src');
      if (titleEl) f.title = titleEl.value;
      if (timeEl)  f.time  = timeEl.value;
      if (srcEl)   f.src   = srcEl.value;
      this.shadowRoot.querySelectorAll('.step-input').forEach(el => { f.steps[Number(el.dataset.idx)] = el.value; });
    }

    // Keep scroll position + skip entry animations when an open overlay re-renders
    const overlayKey = `${this._recipeDetail || ''}|${this._activePanel || ''}`;
    const sameOverlay = overlayKey !== '|' && overlayKey === this._prevOverlayKey;
    const scrollEl  = this.shadowRoot.querySelector('.detail-scroll, .form-modal');
    const scrollTop = sameOverlay && scrollEl ? scrollEl.scrollTop : 0;
    this._prevOverlayKey = overlayKey;

    this.shadowRoot.innerHTML = `
      <style>${this._css()}</style>
      <div class="card${sameOverlay ? ' no-anim' : ''}">
        ${this._renderHeader()}
        ${this._renderViewTabs()}
        ${this._view === 'woche'   ? this._renderWoche()   : ''}
        ${this._view === 'rezepte' ? this._renderRezepte() : ''}
        ${this._view === 'einkauf' ? this._renderEinkauf() : ''}
        ${this._recipeDetail ? this._renderRecipeDetailOverlay() : ''}
        ${this._activePanel === 'recipe-form'  ? this._renderRecipeForm()  : ''}
        ${this._activePanel === 'plan-form'    ? this._renderPlanForm()    : ''}
        ${this._activePanel === 'json-import'  ? this._renderJsonImport()  : ''}
        ${this._activePanel === 'manage-cats'  ? this._renderManageCats()  : ''}
        ${this._activePanel === 'settings'     ? this._renderSettings()    : ''}
      </div>
    `;
    this._bind();
    this._restoreFocus();
    this._positionOverlay();
    if (scrollTop) {
      const el = this.shadowRoot.querySelector('.detail-scroll, .form-modal');
      if (el) el.scrollTop = scrollTop;
    }
  }

  // Overlays are position:absolute relative to the card (position:fixed is
  // clipped by HA's contain context). On tall cards (mobile) the card is much
  // higher than the viewport, so we pad the overlay to the visible slice of
  // the card — the modal is then centered on screen instead of mid-card.
  _positionOverlay() {
    const overlay = this.shadowRoot.querySelector('.form-overlay, .detail-backdrop');
    const card    = this.shadowRoot.querySelector('.card');
    this._setScrollLock(!!overlay);
    if (!overlay || !card) return;
    // Wheel/touch on the dimmed backdrop must not reach the page (iOS ignores
    // overflow:hidden); scrolling inside the modal itself stays allowed.
    const block = (e) => { if (!e.target.closest('.detail-scroll, .form-modal')) e.preventDefault(); };
    overlay.addEventListener('wheel', block, { passive: false });
    overlay.addEventListener('touchmove', block, { passive: false });
    const r     = card.getBoundingClientRect();
    const viewH = window.visualViewport?.height ?? window.innerHeight;
    const top    = Math.max(0, -r.top);
    const bottom = Math.max(0, r.bottom - viewH);
    if (top + bottom >= r.height) return;
    overlay.style.paddingTop    = `${top + 16}px`;
    overlay.style.paddingBottom = `${bottom + 16}px`;
  }

  // Freezes every scrollable ancestor (across shadow roots) while a popup is
  // open, so the recipe grid behind it can't be scrolled.
  _setScrollLock(on) {
    if (on && !this._scrollLocks) {
      const locks = [];
      const lock = (el) => {
        if (!el || locks.some(l => l.el === el)) return;
        locks.push({ el, overflow: el.style.overflow });
        el.style.overflow = 'hidden';
      };
      lock(document.scrollingElement || document.documentElement);
      lock(document.body);
      for (let n = this.parentNode || this.getRootNode().host; n && n !== document; n = n.parentNode || n.host) {
        if (n.nodeType !== 1) continue;
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) lock(n);
      }
      this._scrollLocks = locks;
    } else if (!on && this._scrollLocks) {
      this._scrollLocks.forEach(({ el, overflow }) => { el.style.overflow = overflow; });
      this._scrollLocks = null;
    }
  }

  _renderHeader() {
    const canAdd = this._view === 'rezepte';
    return `
      <div class="header">
        <div class="header__left">
          <div class="header__icon">
            <svg viewBox="0 0 24 24"><path d="M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-6.09-15.03-6.09-15.03 0h15.03zM1.02 17h15v2h-15z"/></svg>
          </div>
          <span class="header__title">${x(this._config.title)}</span>
        </div>
        <div class="header__right">
          <button class="icon-btn header__settings" data-action="open-settings" aria-label="Einstellungen" title="Einstellungen">
            <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.22-.07.47.12.61l2.03 1.58c-.05.3-.07.63-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
          </button>
          ${canAdd ? `
            <div class="add-menu-wrap">
              <button class="add-btn" data-action="toggle-add-menu" aria-label="Hinzufügen" aria-haspopup="menu" aria-expanded="${this._addMenuOpen}">
                <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              </button>
              ${this._addMenuOpen ? `
                <div class="add-menu" role="menu">
                  <button class="add-menu__item" data-action="open-create-recipe" role="menuitem"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>Neues Rezept</button>
                  <button class="add-menu__item" data-action="open-json-import" role="menuitem"><svg viewBox="0 0 24 24"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>Aus JSON importieren</button>
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  _renderViewTabs() {
    const tabs = [
      { v: 'woche',   l: 'Woche' },
      { v: 'rezepte', l: 'Rezepte' },
      { v: 'einkauf', l: 'Einkauf' },
    ];
    return `
      <div class="view-tabs">
        ${tabs.map(t => `
          <button class="view-tab${this._view === t.v ? ' view-tab--active' : ''}" data-view="${t.v}">${t.l}</button>
        `).join('')}
      </div>
    `;
  }

  // ─── Woche View ─────────────────────────────────────────────────────────────

  _renderWoche() {
    const monday   = getMondayOfWeek(new Date(), this._weekOffset);
    const today    = isoToday();
    const monthStr = MONTH_NAMES[monday.getMonth()];
    const yearStr  = monday.getFullYear();
    const days     = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i); return isoDate(d);
    });
    const DAY_COLS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const weekPlan = this._plan.filter(p => days.includes(p.due) && p.status !== 'completed');

    const mealCell = (iso, slot) => {
      const meals = weekPlan.filter(p => {
        const m = parsePlanMeta(p.description);
        return p.due === iso && m.slot === slot;
      });
      const isToday = iso === today;
      return `
        <div class="week-cell${isToday ? ' week-cell--today' : ''}"
          data-drop-iso="${x(iso)}" data-drop-slot="${x(slot)}">
          ${meals.map(p => {
            const meta   = parsePlanMeta(p.description);
            const recipe = this._recipes.find(r => r.uid === meta.recipe_id);
            const rmeta  = recipe ? parseRecipeMeta(recipe.description) : {};
            return `
              <div class="meal-entry" draggable="true" data-plan-uid="${x(p.uid)}"
                data-action="open-detail-from-plan" data-recipe-uid="${x(meta.recipe_id)}"
                data-iso="${x(iso)}" data-slot="${x(slot)}">
                ${rmeta.img ? `<img class="meal-entry__img" src="${x(rmeta.img)}" alt=""
                  loading="lazy" draggable="false" onerror="this.style.display='none'" />` : ''}
                <div class="meal-entry__body">
                  <div class="meal-entry__title">${x(p.summary)}</div>
                  <div class="meal-entry__meta">
                    ${rmeta.score ? `<span class="nutri-badge" style="background:${nutriColor(rmeta.score)};color:${nutriTextColor(rmeta.score)}">${rmeta.score}</span>` : ''}
                    <span class="meal-entry__srv">${meta.srv} Pers.</span>
                  </div>
                </div>
                <button class="meal-entry__del" data-action="del-plan" data-plan-uid="${x(p.uid)}" aria-label="Entfernen">
                  <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
              </div>`;
          }).join('')}
          <button class="week-cell__add" data-action="open-plan-form"
            data-iso="${x(iso)}" data-slot="${x(slot)}" aria-label="Hinzufügen">+</button>
        </div>`;
    };

    return `
      <div class="woche">
        <div class="woche__nav">
          <button class="icon-btn" data-action="week-prev" aria-label="Vorherige Woche">
            <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
          </button>
          <span class="woche__month">${monthStr} ${yearStr}</span>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            ${this._weekOffset !== 0 ? `<button class="btn btn--ghost btn--sm" data-action="week-today">Heute</button>` : ''}
            <button class="btn btn--ghost btn--sm" data-action="copy-week"
              title="Alle Mahlzeiten dieser Woche in die nächste Woche kopieren">
              <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
              Woche kopieren
            </button>
            <button class="icon-btn" data-action="week-next" aria-label="Nächste Woche">
              <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
          </div>
        </div>

        <div class="week-table">
          <!-- Header row: corner + 7 day labels -->
          <div class="week-table__corner"></div>
          ${days.map((iso, idx) => {
            const isToday   = iso === today;
            const isWeekend = idx >= 5;
            const dayNum    = new Date(iso + 'T12:00:00').getDate();
            return `
              <div class="week-table__day-header${isToday ? ' week-table__day-header--today' : ''}${isWeekend ? ' week-table__day-header--weekend' : ''}">
                <span class="wth-name">${DAY_COLS[idx]}</span>
                <span class="wth-num${isToday ? ' wth-num--today' : ''}">${dayNum}</span>
              </div>`;
          }).join('')}

          <!-- 3 slot rows -->
          ${SLOTS.map(slot => `
            <div class="week-table__slot-label">
              <span class="slot-icon">${slot.icon}</span>
              <span class="slot-text">${slot.l}</span>
            </div>
            ${days.map(iso => mealCell(iso, slot.v)).join('')}
          `).join('')}
        </div>

        ${weekPlan.length > 0 ? `
          <div class="woche__shop-bar">
            <span class="woche__shop-label">${weekPlan.length} Mahlzeit${weekPlan.length !== 1 ? 'en' : ''} diese Woche</span>
            <button class="btn btn--primary btn--sm" data-action="goto-einkauf-week">
              <svg viewBox="0 0 24 24"><path d="M17.21 9l-4.38-6.56c-.19-.28-.51-.42-.83-.42-.32 0-.64.14-.83.43L6.79 9H2c-.55 0-1 .45-1 1 0 .09.01.18.04.27l2.54 9.27c.23.84 1 1.46 1.92 1.46h13c.92 0 1.69-.62 1.93-1.46l2.54-9.27L23 10c0-.55-.45-1-1-1h-4.79zM9 9l3-4.4L15 9H9zm3 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
              Einkaufsliste erstellen
            </button>
          </div>
        ` : `
          <div class="empty">Noch keine Mahlzeiten geplant — tippe auf + in einer Zelle.</div>
        `}
      </div>
    `;
  }

  _copyWeek() {
    const monday = getMondayOfWeek(new Date(), this._weekOffset);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i); return isoDate(d);
    });
    const weekPlan = this._plan.filter(p => days.includes(p.due) && p.status !== 'completed');
    if (!weekPlan.length) return;
    for (const p of weekPlan) {
      const d = new Date(p.due + 'T12:00:00');
      d.setDate(d.getDate() + 7);
      this._svc(this._config.plan_entity, 'add_item', {
        item:        p.summary,
        due_date:    isoDate(d),
        description: p.description,
      });
    }
  }

  // ─── Rezepte View ────────────────────────────────────────────────────────────

  _renderRezepte() {
    const filtered   = this._filteredRecipes();
    const total      = this._recipes.filter(r => r.status !== 'completed').length;
    const anyFilter  = this._catFilters.length || this._favFilter || this._timeFilter || this._searchQuery.trim();
    const SORTS = [['new', 'Neueste zuerst'], ['az', 'A–Z'], ['time', 'Schnellste zuerst']];
    return `
      <div class="rezepte">
        <div class="search-row">
          <svg class="search__icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
          <input class="search__input" type="search" placeholder="Rezept oder Zutat suchen" value="${x(this._searchQuery)}" autocomplete="off" />
          ${this._searchQuery ? `<button class="search__clear" data-action="clear-search" aria-label="Suche leeren"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>` : ''}
        </div>
        <div class="cat-filters">
          <button class="cat-pill${!anyFilter || (!this._catFilters.length && !this._favFilter && !this._timeFilter) ? ' cat-pill--active' : ''}" data-filter="all">Alle</button>
          <button class="cat-pill${this._favFilter ? ' cat-pill--active' : ''}" data-filter="fav" aria-pressed="${this._favFilter}"><svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg> Favoriten</button>
          <button class="cat-pill${this._timeFilter ? ' cat-pill--active' : ''}" data-filter="time" aria-pressed="${!!this._timeFilter}"><svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg> bis 30 Min</button>
          <span class="cat-filters__sep"></span>
          ${this._categories.map(c => {
            const on = this._catFilters.includes(c.v);
            return `<button class="cat-pill${on ? ' cat-pill--active' : ''}" data-filter-cat="${c.v}" aria-pressed="${on}">${x(c.l)}</button>`;
          }).join('')}
          <button class="cat-filters__manage" data-action="open-manage-cats"
            aria-label="Kategorien verwalten" title="Kategorien verwalten">
            <svg viewBox="0 0 24 24"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>
          </button>
        </div>
        <div class="rezepte__bar">
          <span class="rezepte__count">
            ${filtered.length === total ? `${total} Rezepte` : `${filtered.length} von ${total} Rezepten`}
          </span>
          <select class="rezepte__sort" aria-label="Sortierung">
            ${SORTS.map(([v, l]) => `<option value="${v}"${this._sort === v ? ' selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        ${filtered.length === 0 ? `
          <div class="empty">
            ${anyFilter ? 'Keine Rezepte passen zu deiner Auswahl.' : 'Noch keine Rezepte.'}
            ${anyFilter ? '<br><button class="btn btn--ghost btn--sm empty__btn" data-filter="reset">Filter zurücksetzen</button>' : ''}
          </div>
        ` : `
          <div class="recipe-grid">
            ${filtered.map(r => this._renderRecipeCard(r)).join('')}
          </div>
        `}
      </div>
    `;
  }

  _filteredRecipes() {
    let items = this._recipes
      .filter(r => r.status !== 'completed')
      .map((r, i) => ({ r, i, m: parseRecipeMeta(r.description) }));
    if (this._catFilters.length) items = items.filter(({ m }) => this._catFilters.every(c => m.cats.includes(c)));
    if (this._favFilter)  items = items.filter(({ m }) => m.fav);
    if (this._timeFilter) items = items.filter(({ m }) => m.time && m.time <= this._timeFilter);
    const q = this._searchQuery.trim().toLowerCase();
    if (q) {
      items = items.filter(({ r, m }) =>
        r.summary.toLowerCase().includes(q) || m.ingredients.some(i => i.name.toLowerCase().includes(q)));
    }
    if (this._sort === 'az') items.sort((a, b) => a.r.summary.localeCompare(b.r.summary, 'de'));
    else if (this._sort === 'time') items.sort((a, b) => (a.m.time || 9999) - (b.m.time || 9999));
    else items.sort((a, b) => b.i - a.i); // newest first = reverse insertion order
    return items.map(o => o.r);
  }

  _renderRecipeCard(recipe) {
    const meta  = parseRecipeMeta(recipe.description);
    const score = meta.score;
    return `
      <article class="recipe-card" data-action="open-detail" data-recipe-uid="${x(recipe.uid)}">
        <div class="recipe-card__media">
          ${meta.img ? `
            <img class="recipe-card__img" src="${x(meta.img)}" alt="" loading="lazy" onerror="this.remove()" />
          ` : `<svg class="recipe-card__ph" viewBox="0 0 24 24"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>`}
          ${score ? `<span class="nutri-badge recipe-card__score" style="background:${nutriColor(score)};color:${nutriTextColor(score)}" title="Nutri-Score ${score}">${score}</span>` : ''}
          <button class="recipe-card__fav${meta.fav ? ' is-on' : ''}" data-action="toggle-fav" data-recipe-uid="${x(recipe.uid)}"
            aria-pressed="${meta.fav}" aria-label="Favorit" title="${meta.fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}">
            ${meta.fav ? '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>'}
          </button>
          <button class="recipe-card__plan" data-action="plan-recipe" data-recipe-uid="${x(recipe.uid)}" aria-label="Einplanen" title="Einplanen">
            <svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm-8-8h2v2.5h2.5v2H13V19h-2v-2.5H8.5v-2H11V12z"/></svg>
          </button>
        </div>
        <div class="recipe-card__title">${x(recipe.summary)}</div>
        <div class="recipe-card__meta">${meta.time ? `${meta.time} Min · ` : ''}${x(this._catLabels(meta))}</div>
      </article>
    `;
  }

  // ─── Einkauf View ────────────────────────────────────────────────────────────

  _renderEinkauf() {
    const today    = isoToday();
    const monday   = getMondayOfWeek(new Date(), this._weekOffset);
    const days     = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return isoDate(d);
    });
    // Only today + future — past meals are irrelevant for shopping
    const weekPlan = this._plan.filter(p => days.includes(p.due) && p.due >= today && p.status !== 'completed');
    const futurePlan = this._plan.filter(p => p.due && p.due >= today && !days.includes(p.due) && p.status !== 'completed').slice(0, 14);
    const allPlan = [...weekPlan, ...futurePlan];

    const shopList = this._buildShoppingList();
    const hasShop  = this._shopPlanUids.size > 0;

    return `
      <div class="einkauf">
        ${allPlan.length === 0 ? `
          <div class="empty">Keine Mahlzeiten geplant.<br>Plane zuerst Mahlzeiten in der Wochenansicht.</div>
        ` : `
          <div class="einkauf__section-label">Mahlzeiten auswählen</div>
          <div class="plan-select-list">
            ${allPlan.map(p => {
              const checked = this._shopPlanUids.has(p.uid);
              const meta    = parsePlanMeta(p.description);
              const srv     = this._shopServings[p.uid] ?? meta.srv;
              return `
                <div class="plan-select-item${checked ? ' plan-select-item--on' : ''}" data-plan-uid="${x(p.uid)}">
                  <label class="plan-select-item__left">
                    <input type="checkbox" class="plan-check" data-plan-uid="${x(p.uid)}"${checked ? ' checked' : ''} />
                    <div>
                      <div class="plan-select-item__title">${x(p.summary)}</div>
                      <div class="plan-select-item__date">${fmtDate(p.due)}</div>
                    </div>
                  </label>
                  ${checked ? `
                    <div class="srv-stepper srv-stepper--sm">
                      <button class="srv-btn" data-action="shop-srv-minus" data-plan-uid="${x(p.uid)}">−</button>
                      <span class="srv-val">${srv} Pers.</span>
                      <button class="srv-btn" data-action="shop-srv-plus" data-plan-uid="${x(p.uid)}">+</button>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `}

        ${hasShop ? `
          <div class="einkauf__section-label" style="margin-top:16px">Zutaten (${shopList.length})</div>
          ${shopList.length === 0 ? `
            <div class="empty">Keine Zutaten hinterlegt.<br>Füge Zutaten zu den Rezepten hinzu.</div>
          ` : `
            <ul class="shop-ing-list">
              ${shopList.map(ing => {
                const key     = `${ing.planUid}::${ing.name}::${ing.unit}`;
                const checked = !this._shopDeselected.has(key);
                return `
                  <li class="shop-ing-item">
                    <label class="shop-ing-item__left">
                      <input type="checkbox" class="shop-ing-check"
                        data-key="${x(key)}"
                        ${checked ? 'checked' : ''} />
                      <span class="shop-ing-item__label${!checked ? ' shop-ing-item--off' : ''}">
                        ${x(ing.label)}
                      </span>
                    </label>
                  </li>
                `;
              }).join('')}
            </ul>
            ${this._shoppingEntity() ? `
              <div class="einkauf__actions">
                ${this._shopSuccess ? `
                  <div class="shop-success">
                    <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    Zur Einkaufsliste hinzugefügt!
                  </div>
                ` : `
                  <button class="btn btn--primary" data-action="send-shopping"${this._shopBusy ? ' disabled' : ''}>
                    <svg viewBox="0 0 24 24"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
                    ${this._shopBusy ? 'Wird hinzugefügt…' : 'Zur Einkaufsliste hinzufügen'}
                  </button>
                `}
              </div>
              ${this._shopError ? `<div class="shop-error">${x(this._shopError)}</div>` : ''}
            ` : `
              <div class="shop-hint">Keine Einkaufsliste gewählt. <button class="btn btn--text" data-action="open-settings">In den Einstellungen festlegen</button></div>
            `}
          `}
        ` : ''}
      </div>
    `;
  }

  // ─── Recipe Detail Overlay ───────────────────────────────────────────────────

  _renderRecipeDetailOverlay() {
    const recipe = this._recipes.find(r => r.uid === this._recipeDetail);
    if (!recipe) return '';
    const meta     = parseRecipeMeta(recipe.description);
    const planItem = this._detailPlanUid ? this._plan.find(p => p.uid === this._detailPlanUid) : null;
    const srv      = this._detailSrv ?? (planItem ? parsePlanMeta(planItem.description).srv : meta.srv);
    const scale    = srv / (meta.srv || 1);
    const note     = splitNote(meta.note);
    const cook     = this._cookMode;
    const done     = this._cookDone;
    const curStep  = cook ? note.steps.findIndex((_, i) => !done.has(`s:${i}`)) : -1;
    const pick     = cook ? null : this._shopPick;
    return `
      <div class="detail-backdrop" data-action="close-detail">
        <div class="detail-modal" role="dialog" aria-label="${x(recipe.summary)}">
          <button class="detail-close" data-action="close-detail" aria-label="Schließen">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
          <div class="detail-scroll">
            ${meta.img ? `
              <div class="detail-img-wrap">
                <img class="detail-img" src="${x(meta.img)}" alt="" draggable="false"
                  onerror="this.closest('.detail-img-wrap').style.display='none'" />
              </div>
            ` : ''}

            <div class="detail-body${meta.img ? '' : ' detail-body--no-img'}">
              <div class="detail-eyebrow">${x(this._catLabels(meta))}</div>
              <h2 class="detail-title">${x(recipe.summary)}</h2>
              <div class="detail-facts">
                ${meta.score ? `
                  <span class="detail-fact">
                    <span class="nutri-badge" style="background:${nutriColor(meta.score)};color:${nutriTextColor(meta.score)}">${meta.score}</span>
                    Nutri-Score
                  </span>` : ''}
                ${meta.time ? `<span class="detail-fact"><svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>${meta.time} Min</span>` : ''}
                ${meta.ingredients.length ? `<span class="detail-fact">${meta.ingredients.length} Zutaten</span>` : ''}
                ${note.steps.length ? `<span class="detail-fact">${note.steps.length} Schritte</span>` : ''}
              </div>

              ${note.intro.map(t => `<p class="detail-text">${x(t)}</p>`).join('')}

              ${meta.ingredients.length > 0 ? `
                <section class="detail-section">
                  <div class="detail-section__head">
                    <h3 class="detail-h3">Zutaten</h3>
                    <div class="detail-srv">
                      <button class="detail-srv__btn" data-action="detail-srv-minus" data-srv="${srv}" aria-label="Weniger Portionen"${srv <= 1 ? ' disabled' : ''}>−</button>
                      <span class="detail-srv__val">${srv} ${srv === 1 ? 'Portion' : 'Portionen'}</span>
                      <button class="detail-srv__btn" data-action="detail-srv-plus" data-srv="${srv}" aria-label="Mehr Portionen">+</button>
                    </div>
                  </div>
                  ${pick ? `
                    <div class="pick-head">
                      <span>Was soll auf die Einkaufsliste?</span>
                      <button class="btn btn--text btn--sm" data-action="pick-all">${pick.size === meta.ingredients.length ? 'Keine' : 'Alle'}</button>
                    </div>
                  ` : ''}
                  <ul class="detail-ing-list${cook ? ' is-cook' : ''}${pick ? ' is-pick' : ''}">
                    ${meta.ingredients.map((ing, i) => {
                      const amt = fmtAmount(ing.amount, scale);
                      const isDone = cook && done.has(`i:${i}`);
                      const on = pick && pick.has(i);
                      const attrs = cook ? ` data-cook="i:${i}" role="checkbox" aria-checked="${isDone}"`
                        : pick ? ` data-pick="${i}" role="checkbox" aria-checked="${on}"` : '';
                      return `
                        <li class="detail-ing-item${isDone ? ' is-done' : ''}${on ? ' is-on' : ''}"${attrs}>
                          ${pick ? `<span class="pick-box">${on ? '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}</span>` : ''}
                          <span class="detail-ing-amount">${amt ? `${x(amt)} ${x(ing.unit)}` : ''}</span>
                          <span class="detail-ing-name">${x(ing.name)}</span>
                        </li>`;
                    }).join('')}
                  </ul>
                  ${!cook && pick ? `
                    <div class="pick-actions">
                      <button class="btn btn--ghost" data-action="pick-cancel">Abbrechen</button>
                      <button class="btn btn--primary" data-action="pick-confirm" data-srv="${srv}"${pick.size ? '' : ' disabled'}>
                        <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>Hinzufügen (${pick.size})
                      </button>
                    </div>
                    ${this._shopError ? `<div class="shop-error">${x(this._shopError)}</div>` : ''}
                  ` : !cook && !this._shoppingEntity() ? `
                    <div class="shop-hint">Keine Einkaufsliste gewählt. <button class="btn btn--text" data-action="open-settings">In den Einstellungen festlegen</button></div>
                  ` : !cook ? `
                    <button class="btn btn--ghost detail-shop-btn" data-action="detail-to-shop" data-srv="${srv}"${this._detailShop === 'busy' || this._detailShop === 'done' ? ' disabled' : ''}>
                      <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
                      ${this._detailShop === 'done' ? 'Auf der Einkaufsliste' : this._detailShop === 'busy' ? 'Wird hinzugefügt…' : `Zutaten für ${srv} ${srv === 1 ? 'Portion' : 'Portionen'} auf die Einkaufsliste`}
                    </button>
                    ${this._shopError ? `<div class="shop-error">${x(this._shopError)}</div>` : ''}
                  ` : ''}
                </section>
              ` : ''}

              ${note.steps.length ? `
                <section class="detail-section">
                  <div class="detail-section__head">
                    <h3 class="detail-h3">Zubereitung</h3>
                    ${cook ? '' : `<button class="btn btn--ghost btn--sm" data-action="cook-start"><svg viewBox="0 0 24 24"><path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/></svg>Kochmodus</button>`}
                  </div>
                  <ol class="detail-steps${cook ? ' is-cook' : ''}">
                    ${note.steps.map((t, i) => {
                      const isDone = cook && done.has(`s:${i}`);
                      return `
                        <li class="detail-step${isDone ? ' is-done' : ''}${i === curStep ? ' is-current' : ''}"${cook ? ` data-cook="s:${i}" role="checkbox" aria-checked="${isDone}"` : ''}>
                          <span class="detail-step__num">${isDone ? '✓' : i + 1}</span>
                          <p class="detail-step__text">${x(t)}</p>
                        </li>`;
                    }).join('')}
                  </ol>
                </section>
              ` : ''}

              ${note.outro.length || meta.src ? `
                <div class="detail-outro">
                  ${note.outro.map(t => `<p class="detail-text detail-text--muted">${x(t)}</p>`).join('')}
                  ${/^https?:\/\//.test(meta.src) ? `
                    <a class="detail-src" href="${x(meta.src)}" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>Original ansehen</a>
                  ` : ''}
                </div>
              ` : ''}

              ${this._detailChanging ? `
                <div class="detail-change-wrap">
                  <h3 class="detail-h3">Anderes Rezept wählen</h3>
                  <div class="plan-recipe-search-wrap">
                    <input class="detail-change-search form__input" type="search"
                      placeholder="Rezept suchen…" value="${x(this._detailChangeSearch)}" autocomplete="off" />
                    ${(() => {
                      const q = this._detailChangeSearch.toLowerCase();
                      if (!q) return '';
                      const results = this._recipes
                        .filter(r => r.status !== 'completed' && r.uid !== recipe.uid && r.summary.toLowerCase().includes(q))
                        .slice(0, 6);
                      if (!results.length) return '<div class="plan-recipe-dropdown"><div class="plan-recipe-option plan-recipe-option--empty">Keine Ergebnisse</div></div>';
                      return `<div class="plan-recipe-dropdown">
                        ${results.map(r => {
                          const m = parseRecipeMeta(r.description);
                          const catL = this._catLabels(m);
                          return `<div class="detail-change-option plan-recipe-option" data-recipe-uid="${x(r.uid)}">
                            <span class="plan-recipe-option__title">${x(r.summary)}</span>
                            <span class="plan-recipe-option__meta">${x(catL)} · ${m.srv} Pers.</span>
                          </div>`;
                        }).join('')}
                      </div>`;
                    })()}
                  </div>
                  <div class="detail-actions">
                    <button class="btn btn--ghost" data-action="toggle-detail-change">Abbrechen</button>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>

          ${this._detailChanging ? '' : cook ? `
            <div class="detail-footer">
              <span class="detail-footer__info">
                ${note.steps.filter((_, i) => done.has(`s:${i}`)).length} von ${note.steps.length} Schritten
                ${this._wakeLock ? '<span class="detail-footer__sub">Bildschirm bleibt an</span>' : ''}
              </span>
              <button class="btn btn--primary detail-footer__main" data-action="cook-stop">Fertig</button>
            </div>
          ` : `
            <div class="detail-footer">
              ${this._detailPlanUid ? `
                <button class="btn btn--text btn--text-danger" data-action="remove-from-plan">Aus Plan entfernen</button>
              ` : `
                <button class="icon-btn icon-btn--lg" data-action="delete-recipe-direct" data-recipe-uid="${x(recipe.uid)}" data-recipe-title="${x(recipe.summary)}" aria-label="Rezept löschen" title="Rezept löschen">
                  <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                </button>
              `}
              <button class="icon-btn icon-btn--lg" data-action="edit-recipe" data-recipe-uid="${x(recipe.uid)}" aria-label="Bearbeiten" title="Bearbeiten">
                <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              </button>
              <button class="icon-btn icon-btn--lg detail-fav${meta.fav ? ' is-on' : ''}" data-action="toggle-fav" data-recipe-uid="${x(recipe.uid)}" aria-pressed="${meta.fav}" aria-label="Favorit" title="${meta.fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}">
                ${meta.fav ? '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>'}
              </button>
              ${this._detailPlanUid ? `
                <button class="btn btn--primary detail-footer__main" data-action="toggle-detail-change">Gericht ändern</button>
              ` : `
                <button class="btn btn--primary detail-footer__main" data-action="plan-recipe" data-recipe-uid="${x(recipe.uid)}">Einplanen</button>
              `}
            </div>
          `}
        </div>
      </div>
    `;
  }

  _buildShoppingList() {
    const agg = new Map(); // key: `${name_lower}::${unit}` → { name, amount, unit, planUid }
    for (const planUid of this._shopPlanUids) {
      const planItem = this._plan.find(p => p.uid === planUid);
      if (!planItem) continue;
      const { recipe_id, srv: planSrv } = parsePlanMeta(planItem.description);
      const recipe = this._recipes.find(r => r.uid === recipe_id);
      if (!recipe) continue;
      const { srv: recipeSrv, ingredients } = parseRecipeMeta(recipe.description);
      const overrideSrv = this._shopServings[planUid] ?? planSrv ?? recipeSrv ?? 1;
      const scale = overrideSrv / (recipeSrv || 1);
      for (const ing of ingredients) {
        const key = `${planUid}::${ing.name}::${ing.unit}`;
        if (this._shopDeselected.has(key)) continue;
        const aggKey = `${ing.name.toLowerCase()}::${ing.unit}`;
        const scaled = parseFloat(ing.amount || 0) * scale;
        if (agg.has(aggKey)) {
          agg.get(aggKey).amount += scaled;
          // keep planUid for deselection tracking (use first occurrence)
        } else {
          agg.set(aggKey, { name: ing.name, amount: scaled, unit: ing.unit, planUid });
        }
      }
    }
    return Array.from(agg.values()).map(ing => {
      const amt = Math.round(ing.amount * 10) / 10;
      const qty = amt > 0 ? `${fmtAmount(amt)} ${ing.unit}`.trim() : '';
      return { ...ing, amount: amt, qty, label: [qty, ing.name].filter(Boolean).join(' ') };
    });
  }

  // ─── Recipe Form ─────────────────────────────────────────────────────────────

  _renderRecipeForm() {
    const f     = this._recipeForm;
    const isEdit = !!f.uid;
    this._nutriSuggestion = suggestNutriScore(f.ingredients);

    return `
      <div class="form-overlay" data-close-panel="recipe-form">
      <div class="form-modal">
        <div class="panel__header">
          <span>${isEdit ? 'Rezept bearbeiten' : 'Neues Rezept'}</span>
          <button class="icon-btn" data-action="cancel-recipe" aria-label="Schließen">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        ${!isEdit ? `
          <div class="import-row">
            <input class="import__url form__input" type="url" placeholder="Rezept-URL (Chefkoch, Allrecipes, …)"
              value="${x(f._importUrl)}" />
            <button class="btn btn--ghost btn--sm${this._importLoading ? ' btn--loading' : ''}" data-action="import-url"
              ${this._importLoading ? 'disabled' : ''}>
              ${this._importLoading ? '…' : 'Importieren'}
            </button>
          </div>
          ${this._importResult?.error ? `
            <div class="import-error">${x(this._importResult.error)}</div>
            <div class="import-paste-hint">
              Diese Website lässt keinen automatischen Import zu.
              <button class="btn btn--ghost btn--sm" data-action="toggle-paste-mode">
                ${this._importPasteMode ? 'Abbrechen' : 'Quelltext einfügen ▸'}
              </button>
            </div>
            ${this._importPasteMode ? `
              <div class="import-paste-wrap">
                <p class="import-paste-instructions">
                  1. Öffne die Rezept-URL in Chrome/Safari &nbsp;→&nbsp;
                  2. <strong>Rechtsklick → Seitenquelltext anzeigen</strong> (oder <code>Strg+U</code>) &nbsp;→&nbsp;
                  3. Alles kopieren (<code>Strg+A</code>, <code>Strg+C</code>) &nbsp;→&nbsp;
                  4. Hier einfügen:
                </p>
                <textarea class="import-paste-textarea" rows="4"
                  placeholder="&lt;!DOCTYPE html&gt;…">${x(this._importPasteHtml)}</textarea>
                <button class="btn btn--primary btn--sm" data-action="parse-paste" style="margin-top:6px">
                  Rezept aus Quelltext lesen
                </button>
              </div>
            ` : ''}
          ` : ''}
          ${this._importResult?.title ? `<div class="import-hint">✓ Importiert: ${x(this._importResult.title)}</div>` : ''}
          <div class="panel__divider"><span>oder manuell</span></div>
        ` : ''}

        <input class="form__title-input form__input" type="text" placeholder="Rezepttitel *"
          value="${x(f.title)}" autocomplete="off" />

        <div class="form__section-label">Kategorien <span class="form__hint">Mehrfachauswahl</span></div>
        <div class="picker picker--grid">
          ${this._categories.map(c => {
            const on = f.cats.includes(c.v);
            return `<button class="pill${on ? ' pill--on' : ''}" data-cat="${c.v}" aria-pressed="${on}">
              ${on ? '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}${x(c.l)}
            </button>`;
          }).join('')}
        </div>

        <div class="form__section-label">Nutri-Score</div>
        ${this._nutriSuggestion && this._nutriSuggestion !== f.score ? `
          <div class="nutri-hint">
            Vorschlag:
            <span class="nutri-badge" style="background:${nutriColor(this._nutriSuggestion)};color:${nutriTextColor(this._nutriSuggestion)}">${this._nutriSuggestion}</span>
            <button class="btn btn--ghost btn--sm" data-action="accept-nutri" data-score="${this._nutriSuggestion}">Übernehmen</button>
          </div>
        ` : ''}
        <div class="picker picker--grid">
          ${'ABCDE'.split('').map(s => `
            <button class="pill nutri-pill nutri-pill--${s}${f.score === s ? ' pill--on' : ''}" data-score="${s}">${s}</button>
          `).join('')}
          <button class="pill${f.score === '' ? ' pill--on' : ''}" data-score="">Keine</button>
        </div>

        <div class="form__row">
          <div>
            <div class="form__section-label">Portionen</div>
            <div class="srv-stepper">
              <button class="srv-btn" data-action="recipe-srv-minus">−</button>
              <span class="srv-val">${f.srv}</span>
              <button class="srv-btn" data-action="recipe-srv-plus">+</button>
            </div>
          </div>
          <div>
            <div class="form__section-label">Zeit</div>
            <label class="form__time-wrap">
              <input class="form__time form__input form__input--sm" type="number" inputmode="numeric" min="0" step="5"
                placeholder="–" value="${x(f.time)}" />
              <span>Min.</span>
            </label>
          </div>
        </div>

        <div class="form__section-label">Zutaten</div>
        ${f.ingredients.length > 0 ? `
          <ul class="ing-list">
            ${f.ingredients.map((ing, idx) => `
              <li class="ing-item${f._ingEditIdx === idx ? ' ing-item--editing' : ''}">
                <span class="ing-item__text">${x(ing.amount)} ${x(ing.unit)} ${x(ing.name)}</span>
                <button class="icon-btn icon-btn--sm" data-action="edit-ing" data-idx="${idx}" aria-label="Bearbeiten"><svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
                <button class="icon-btn icon-btn--sm" data-action="del-ing" data-idx="${idx}" aria-label="Entfernen"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
              </li>
            `).join('')}
          </ul>
        ` : ''}
        <div class="ing-add-row">
          <input class="ing-add__name form__input form__input--sm" type="text" placeholder="Zutat" value="${x(f._ingName)}" autocomplete="off" />
          <input class="ing-add__amount form__input form__input--sm" type="text" inputmode="decimal" placeholder="Menge" value="${x(f._ingAmount)}" />
          <input class="ing-add__unit form__input form__input--sm" type="text" list="alh-units" placeholder="Einheit" value="${x(f._ingUnit)}" autocomplete="off" />
          <datalist id="alh-units">${UNITS.map(u => `<option value="${u}"></option>`).join('')}</datalist>
          ${f._ingEditIdx !== null ? `
            <button class="btn btn--primary btn--sm" data-action="add-ing">Übernehmen</button>
            <button class="btn btn--text btn--sm" data-action="cancel-edit-ing">Abbrechen</button>
          ` : `<button class="btn btn--ghost btn--sm" data-action="add-ing" aria-label="Zutat hinzufügen">+</button>`}
        </div>

        <div class="form__section-label">Zubereitung</div>
        ${f.steps.length ? `
          <ol class="step-list">
            ${f.steps.map((t, idx) => `
              <li class="step-edit">
                <span class="step-edit__num">${idx + 1}</span>
                <textarea class="step-input" data-idx="${idx}" rows="3" placeholder="Schritt beschreiben…">${x(t)}</textarea>
                <button class="icon-btn icon-btn--sm" data-action="del-step" data-idx="${idx}" aria-label="Schritt entfernen"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
              </li>
            `).join('')}
          </ol>
        ` : ''}
        <button class="btn btn--ghost btn--sm" data-action="add-step">+ Schritt hinzufügen</button>

        <div class="form__section-label">Notizen</div>
        <textarea class="form__note" placeholder="Tipps, Varianten, Nährwerte…" rows="2">${x(f.note)}</textarea>

        <div class="form__section-label">Quelle</div>
        <input class="form__src form__input form__input--sm" type="url" placeholder="Link zum Originalrezept" value="${x(f.src)}" />

        <div class="form__section-label">Bild</div>
        ${f.img ? `
          <div class="img-preview-wrap">
            <img class="img-preview" src="${x(f.img)}" alt=""
              onerror="this.closest('.img-preview-wrap').querySelector('.img-preview-error').style.display='block';this.style.display='none'" />
            <div class="img-preview-error" style="display:none;font-size:12px;color:var(--error-color,#f44336)">Bild konnte nicht geladen werden.</div>
            <button class="btn btn--ghost btn--sm" data-action="remove-img" style="margin-top:6px">Entfernen</button>
          </div>
        ` : ''}
        <div class="img-input-row">
          <input class="form__img-url form__input form__input--sm"
            type="url" placeholder="Bild-URL einfügen…"
            value="${x(f.img && !f.img.startsWith('data:') ? f.img : '')}" />
          <label class="btn btn--ghost btn--sm img-upload-label" title="Eigenes Bild hochladen">
            <svg viewBox="0 0 24 24"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
            Hochladen
            <input type="file" accept="image/*" class="img-file-input" style="display:none" />
          </label>
        </div>

        <div class="form__actions">
          ${isEdit ? `<button class="btn btn--danger" data-action="delete-recipe">Löschen</button>` : ''}
          <button class="btn btn--ghost" data-action="cancel-recipe">Abbrechen</button>
          <button class="btn btn--primary" data-action="submit-recipe">${isEdit ? 'Speichern' : 'Anlegen'}</button>
        </div>
      </div>
      </div>
    `;
  }

  // ─── Plan Form ───────────────────────────────────────────────────────────────

  _renderPlanForm() {
    const f       = this._planForm;
    const recipes = this._recipes.filter(r => r.status !== 'completed');
    return `
      <div class="form-overlay" data-close-panel="plan-form">
      <div class="form-modal">
        <div class="panel__header">
          <span>Mahlzeit einplanen</span>
          <button class="icon-btn" data-action="cancel-plan" aria-label="Schließen">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="form__section-label">Tag</div>
        <input class="plan-form__date form__input" type="date" value="${x(f.dayIso)}" min="${isoToday()}" />

        <div class="form__section-label">Rezept</div>
        ${recipes.length === 0 ? `
          <div class="empty">Noch keine Rezepte. Lege zuerst ein Rezept an.</div>
        ` : (() => {
          const selected = recipes.find(r => r.uid === f.recipeUid);
          const results  = this._planSearch
            ? recipes.filter(r => r.summary.toLowerCase().includes(this._planSearch.toLowerCase())).slice(0, 6)
            : [];
          if (selected) return `
            <div class="plan-recipe-selected">
              <span class="plan-recipe-selected__name">${x(selected.summary)}</span>
              <button class="icon-btn icon-btn--sm" data-action="clear-plan-recipe" aria-label="Rezept ändern">
                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>`;
          return `
            <div class="plan-recipe-search-wrap">
              <input class="plan-recipe-search form__input" type="search"
                placeholder="Rezept suchen…" value="${x(this._planSearch)}" autocomplete="off" />
              ${results.length > 0 ? `
                <div class="plan-recipe-dropdown">
                  ${results.map(r => {
                    const m = parseRecipeMeta(r.description);
                    const catL = this._catLabels(m);
                    return `<div class="plan-recipe-option" data-recipe-uid="${x(r.uid)}">
                      <span class="plan-recipe-option__title">${x(r.summary)}</span>
                      <span class="plan-recipe-option__meta">${x(catL)} · ${m.srv} Pers.</span>
                    </div>`;
                  }).join('')}
                </div>
              ` : (this._planSearch && results.length === 0 ? `
                <div class="plan-recipe-dropdown"><div class="plan-recipe-option plan-recipe-option--empty">Keine Rezepte gefunden</div></div>
              ` : '')}
            </div>`;
        })()}

        <div class="form__section-label">Mahlzeit</div>
        <div class="picker--grid">
          ${SLOTS.map(s => `
            <button class="pill${f.slot === s.v ? ' pill--on' : ''}" data-plan-slot="${x(s.v)}">
              ${s.icon} ${s.l}
            </button>`).join('')}
        </div>

        <div class="form__section-label">Portionen</div>
        <div class="srv-stepper">
          <button class="srv-btn" data-action="plan-srv-minus">−</button>
          <span class="srv-val">${f.srv}</span>
          <button class="srv-btn" data-action="plan-srv-plus">+</button>
        </div>

        <div class="form__actions">
          <button class="btn btn--ghost" data-action="cancel-plan">Abbrechen</button>
          <button class="btn btn--primary" data-action="submit-plan">Einplanen</button>
        </div>
      </div>
      </div>
    `;
  }

  // ─── JSON Import Panel ───────────────────────────────────────────────────────

  _renderJsonImport() {
    const exampleJson = JSON.stringify([
      {
        title: 'Spaghetti Bolognese',
        cats: ['pasta', 'fleisch'],
        score: 'C',
        srv: 4,
        time: 45,
        steps: ['Zwiebel und Knoblauch anbraten.', 'Hack dazugeben und krümelig braten.', 'Tomaten zugeben, 30 Min. köcheln.'],
        note: 'Klassiker mit Hackfleisch-Tomaten-Sauce',
        src: 'https://example.com/bolognese',
        img: '',
        ingredients: [
          { name: 'Spaghetti', amount: '400', unit: 'g' },
          { name: 'Rinderhack', amount: '500', unit: 'g' },
          { name: 'Tomaten (passiert)', amount: '400', unit: 'g' },
        ],
      },
    ], null, 2);

    return `
      <div class="form-overlay" data-close-panel="json-import">
      <div class="form-modal">
        <div class="panel__header">
          <span>Rezepte per JSON importieren</span>
          <button class="icon-btn" data-action="cancel-json-import" aria-label="Schließen">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <p class="import-paste-instructions">
          Füge ein JSON-Array mit Rezepten ein. Jedes Rezept braucht mindestens <code>title</code>.
          Erlaubte Kategorien: <code>${this._categories.map(c => c.v).join(', ')}</code>.
        </p>

        <div class="form__section-label">JSON</div>
        <textarea class="json-import__textarea" rows="10"
          placeholder='${x(exampleJson)}'>${x(this._jsonImportText)}</textarea>

        ${this._jsonImportError ? `
          <div class="import-error">${x(this._jsonImportError)}</div>
        ` : ''}
        ${this._jsonImportCount > 0 ? `
          <div class="import-hint">✓ ${this._jsonImportCount} Rezept${this._jsonImportCount !== 1 ? 'e' : ''} erfolgreich importiert!</div>
        ` : ''}

        <details class="json-import__example">
          <summary>Beispiel-Format anzeigen</summary>
          <pre class="json-import__pre">${x(exampleJson)}</pre>
        </details>

        <div class="form__actions">
          <button class="btn btn--ghost" data-action="cancel-json-import">Abbrechen</button>
          <button class="btn btn--primary" data-action="submit-json-import">
            <svg viewBox="0 0 24 24"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
            Importieren
          </button>
        </div>
      </div>
      </div>
    `;
  }

  // ─── Settings Panel ──────────────────────────────────────────────────────────

  _renderSettings() {
    const current = this._shoppingEntity();
    const skip = new Set([this._config.recipe_entity, this._config.plan_entity]);
    const lists = Object.keys(this._hass?.states || {})
      .filter(id => id.startsWith('todo.') && !skip.has(id))
      .map(id => ({ id, name: this._hass.states[id].attributes?.friendly_name || id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (current && !lists.some(l => l.id === current)) lists.unshift({ id: current, name: 'Nicht gefunden' });
    return `
      <div class="form-overlay" data-close-panel="settings">
      <div class="form-modal">
        <div class="panel__header">
          <span>Einstellungen</span>
          <button class="icon-btn" data-action="cancel-settings" aria-label="Schließen">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="form__section-label">Einkaufsliste</div>
        <select class="settings__shop form__select form__select--full">
          <option value=""${current ? '' : ' selected'}>– keine –</option>
          ${lists.map(l => `<option value="${x(l.id)}"${l.id === current ? ' selected' : ''}>${x(l.name)} (${x(l.id)})</option>`).join('')}
        </select>
        <p class="settings__hint">Hierhin gehen Zutaten aus dem Einkauf-Tab und aus den Rezepten. Listen mit Beschreibungsfeld (z. B. Bring!) bekommen die Menge als Beschreibung.</p>

        <div class="form__section-label">Vorräte</div>
        <textarea class="settings__pantry form__note" rows="3" placeholder="Salz, Pfeffer, Olivenöl …">${x(this._settings.pantry.join(', '))}</textarea>
        <p class="settings__hint">Diese Zutaten sind beim Hinzufügen zur Einkaufsliste abgewählt – du kannst sie jederzeit wieder anhaken. Mit Komma trennen.</p>

        <div class="form__section-label">Kategorien</div>
        <button class="btn btn--ghost btn--sm" data-action="open-manage-cats">Kategorien verwalten</button>

        <div class="form__actions">
          <button class="btn btn--ghost" data-action="cancel-settings">Abbrechen</button>
          <button class="btn btn--primary" data-action="save-settings">Speichern</button>
        </div>
      </div>
      </div>
    `;
  }

  // ─── Manage Categories Panel ─────────────────────────────────────────────────

  _renderManageCats() {
    const recipeCounts = {};
    for (const r of this._recipes) {
      if (r.status === 'completed') continue;
      const meta = parseRecipeMeta(r.description);
      meta.cats.forEach(c => { recipeCounts[c] = (recipeCounts[c] || 0) + 1; });
    }
    return `
      <div class="form-overlay" data-close-panel="manage-cats">
      <div class="form-modal">
        <div class="panel__header">
          <span>Kategorien verwalten</span>
          <button class="icon-btn" data-action="cancel-manage-cats" aria-label="Schließen">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        <div class="cat-manage-list">
          ${this._categories.map(c => {
            const count = recipeCounts[c.v] || 0;
            const isFixed = c.v === 'sonstiges';
            return `
              <div class="cat-manage-item">
                <span class="cat-manage-dot" style="background:${c.tc}"></span>
                <span class="cat-manage-label">${x(c.l)}</span>
                ${count > 0 ? `<span class="cat-manage-count">${count} Rezept${count !== 1 ? 'e' : ''}</span>` : ''}
                ${isFixed
                  ? `<span class="cat-manage-fixed">Standard</span>`
                  : `<button class="icon-btn icon-btn--sm" data-action="delete-cat" data-cat-v="${x(c.v)}"
                      aria-label="Löschen" title="${count > 0 ? `${count} Rezept${count !== 1 ? 'e' : ''} nutzen diese Kategorie` : 'Kategorie löschen'}" style="margin-left:auto">
                      <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    </button>`
                }
              </div>
            `;
          }).join('')}
        </div>

        <div class="form__section-label" style="margin-top:16px">Neue Kategorie</div>
        <div class="cat-add-row">
          <input class="cat-add__label form__input form__input--sm" type="text"
            placeholder="Name der Kategorie" value="${x(this._catMgmtNewLabel)}" autocomplete="off" />
          <button class="btn btn--primary btn--sm" data-action="add-cat">Hinzufügen</button>
        </div>

        <div class="form__actions">
          <button class="btn btn--ghost" data-action="cancel-manage-cats">Schließen</button>
        </div>
      </div>
      </div>
    `;
  }

  // ─── Paste Handler ───────────────────────────────────────────────────────────

  _handleParsePaste() {
    const pasteEl = this.shadowRoot.querySelector('.import-paste-textarea');
    const html = (pasteEl?.value || this._importPasteHtml || '').trim();

    console.log('[alh-meal-card] parsePaste fired, html length:', html.length);

    if (!html) {
      console.warn('[alh-meal-card] parsePaste: textarea is empty');
      this._importResult = { error: 'Textarea leer — bitte erst Quelltext einfügen.' };
      this._render();
      return;
    }

    const ldMatches   = (html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>/gi) || []).length;
    const ndMatch     = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>/i.test(html);
    const jsonMatches = (html.match(/<script[^>]+type=["']application\/json["'][^>]*>/gi) || []).length;
    console.log('[alh-meal-card] parsePaste script blocks — ld+json:', ldMatches, '__NEXT_DATA__:', ndMatch, 'application/json:', jsonMatches);

    const recipe = extractJsonLdFromHtml(html);
    console.log('[alh-meal-card] parsePaste recipe found:', !!recipe, recipe?.name);
    if (recipe) console.log('[alh-meal-card] recipe keys:', Object.keys(recipe).join(', '));
    if (recipe) console.log('[alh-meal-card] recipe preview:', JSON.stringify(recipe).slice(0, 600));

    if (!recipe) {
      this._importResult = { error: 'Kein Rezept im Quelltext gefunden.' };
      this._importPasteMode = false;
      this._importPasteHtml = '';
      this._render();
      return;
    }

    const title = String(recipe.name || '').replace(/<[^>]+>/g, '').trim();
    if (title) this._recipeForm.title = title;
    const rawIngs = recipe.recipeIngredient || [];
    if (rawIngs.length) {
      this._recipeForm.ingredients = rawIngs
        .map(i => parseIngredientJs(String(i)))
        .filter(i => i.name);
    }
    const srvRaw = Array.isArray(recipe.recipeYield) ? recipe.recipeYield[0] : recipe.recipeYield;
    const srvM = String(srvRaw || '').match(/\d+/);
    if (srvM) this._recipeForm.srv = parseInt(srvM[0]) || 4;
    let img = recipe.image || '';
    if (Array.isArray(img)) img = img[0] || '';
    if (img && typeof img === 'object') img = img.url || '';
    if (img) this._recipeForm.img = String(img).split('?')[0];
    this._importResult = { title };
    this._importPasteMode = false;
    this._importPasteHtml = '';
    this._render();
  }

  // ─── Event Binding ───────────────────────────────────────────────────────────

  _bind() {
    const root = this.shadowRoot;

    // Tab navigation
    root.querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', () => {
        this._view = el.dataset.view;
        localStorage.setItem('alh-meal-view', this._view);
        this._activePanel = null;
        this._render();
      });
    });

    // Header "+" menu
    const addMenuBtn = root.querySelector('[data-action="toggle-add-menu"]');
    if (addMenuBtn) addMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._addMenuOpen = !this._addMenuOpen;
      this._render();
    });
    if (this._addMenuOpen) {
      root.querySelector('.card')?.addEventListener('click', (e) => {
        if (e.target.closest('.add-menu-wrap')) return;
        this._addMenuOpen = false;
        this._render();
      });
    }
    const addBtn = root.querySelector('[data-action="open-create-recipe"]');
    if (addBtn) addBtn.addEventListener('click', () => { this._addMenuOpen = false; this._openCreateRecipe(); });

    // Recipe browser filters (chips combine; "Alle"/reset clears everything)
    root.querySelectorAll('[data-filter]').forEach(el => {
      el.addEventListener('click', () => {
        const f = el.dataset.filter;
        if (f === 'fav') this._favFilter = !this._favFilter;
        else if (f === 'time') this._timeFilter = this._timeFilter ? 0 : 30;
        else {
          this._catFilters = []; this._favFilter = false; this._timeFilter = 0;
          if (f === 'reset') this._clearSearchInput();
        }
        this._render();
      });
    });
    root.querySelectorAll('[data-filter-cat]').forEach(el => {
      el.addEventListener('click', () => {
        const v = el.dataset.filterCat;
        this._catFilters = this._catFilters.includes(v)
          ? this._catFilters.filter(c => c !== v)
          : [...this._catFilters, v];
        this._render();
      });
    });
    const sortEl = root.querySelector('.rezepte__sort');
    if (sortEl) sortEl.addEventListener('change', () => {
      this._sort = sortEl.value;
      localStorage.setItem('alh-meal-sort', this._sort);
      this._render();
    });
    const clearSearch = root.querySelector('[data-action="clear-search"]');
    if (clearSearch) clearSearch.addEventListener('click', () => {
      this._clearSearchInput();
      this._render();
      this.shadowRoot.querySelector('.search__input')?.focus();
    });

    // Favorites (card heart + detail footer)
    root.querySelectorAll('[data-action="toggle-fav"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const recipe = this._recipes.find(r => r.uid === el.dataset.recipeUid);
        if (!recipe) return;
        this._updateRecipeMeta(recipe.uid, { fav: !parseRecipeMeta(recipe.description).fav });
      });
    });

    // Detail: shopping list + cook mode
    const detailShop = root.querySelector('[data-action="detail-to-shop"]');
    if (detailShop) detailShop.addEventListener('click', () => {
      const recipe = this._recipes.find(r => r.uid === this._recipeDetail);
      if (!recipe) return;
      this._shopError = this._shoppingConfigError();
      if (!this._shopError) {
        const ings = parseRecipeMeta(recipe.description).ingredients;
        this._shopPick = new Set(ings.map((_, i) => i).filter(i => !isPantry(ings[i].name, this._settings.pantry)));
      }
      this._render();
    });
    const cookStart = root.querySelector('[data-action="cook-start"]');
    if (cookStart) cookStart.addEventListener('click', async () => {
      this._cookMode = true;
      this._cookDone = new Set();
      this._render();
      await this._setWakeLock(true);
      this._render();
    });
    const cookStop = root.querySelector('[data-action="cook-stop"]');
    if (cookStop) cookStop.addEventListener('click', () => {
      this._cookMode = false;
      this._setWakeLock(false);
      this._render();
    });
    root.querySelectorAll('[data-cook]').forEach(el => {
      el.addEventListener('click', () => {
        const k = el.dataset.cook;
        if (this._cookDone.has(k)) this._cookDone.delete(k); else this._cookDone.add(k);
        this._render();
      });
    });

    // Recipe form: edit ingredient / steps
    root.querySelectorAll('[data-action="edit-ing"]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.idx);
        const ing = this._recipeForm.ingredients[idx];
        if (!ing) return;
        this._setIngInputs(ing.name, ing.amount, ing.unit, idx);
        this._render();
        this.shadowRoot.querySelector('.ing-add__name')?.focus();
      });
    });
    const cancelEditIng = root.querySelector('[data-action="cancel-edit-ing"]');
    if (cancelEditIng) cancelEditIng.addEventListener('click', () => {
      this._setIngInputs('', '', this._recipeForm._ingUnit);
      this._render();
    });
    const addStep = root.querySelector('[data-action="add-step"]');
    if (addStep) addStep.addEventListener('click', () => {
      this._recipeForm.steps.push('');
      this._render();
      const inputs = this.shadowRoot.querySelectorAll('.step-input');
      inputs[inputs.length - 1]?.focus();
    });
    root.querySelectorAll('[data-action="del-step"]').forEach(el => {
      el.addEventListener('click', () => {
        this._recipeForm.steps.splice(Number(el.dataset.idx), 1);
        this._render();
      });
    });

    // Week navigation
    const weekPrev = root.querySelector('[data-action="week-prev"]');
    if (weekPrev) weekPrev.addEventListener('click', () => { this._weekOffset--; this._render(); });

    const weekNext = root.querySelector('[data-action="week-next"]');
    if (weekNext) weekNext.addEventListener('click', () => { this._weekOffset++; this._render(); });

    const weekToday = root.querySelector('[data-action="week-today"]');
    if (weekToday) weekToday.addEventListener('click', () => { this._weekOffset = 0; this._render(); });

    // Goto einkauf from week view
    const gotoShop = root.querySelector('[data-action="goto-einkauf-week"]');
    if (gotoShop) gotoShop.addEventListener('click', () => {
      const monday = getMondayOfWeek(new Date(), this._weekOffset);
      const days   = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return isoDate(d);
      });
      const weekPlan = this._plan.filter(p => days.includes(p.due) && p.status !== 'completed');
      this._shopPlanUids = new Set(weekPlan.map(p => p.uid));
      this._view = 'einkauf';
      localStorage.setItem('alh-meal-view', 'einkauf');
      this._activePanel = null;
      this._render();
    });

    // Copy week
    const copyWeekBtn = root.querySelector('[data-action="copy-week"]');
    if (copyWeekBtn) copyWeekBtn.addEventListener('click', () => this._copyWeek());

    // Drag and drop for meal entries
    root.querySelectorAll('.meal-entry[draggable]').forEach(el => {
      el.addEventListener('dragstart', e => {
        const uid = el.dataset.planUid;
        this._dragPlanUid = uid;
        e.dataTransfer.setData('text/plain', uid);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => { el.style.opacity = '0.4'; }, 0);
      });
      el.addEventListener('dragend', () => { el.style.opacity = ''; this._dragPlanUid = null; });
    });
    root.querySelectorAll('.week-cell').forEach(cell => {
      cell.addEventListener('dragover', e => {
        // Always preventDefault so browser allows drop; validate in drop handler
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('week-cell--drag-over');
      });
      cell.addEventListener('dragleave', e => {
        // Only remove highlight when leaving the cell itself, not a child
        if (!cell.contains(e.relatedTarget)) cell.classList.remove('week-cell--drag-over');
      });
      cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('week-cell--drag-over');
        const uid  = e.dataTransfer.getData('text/plain') || this._dragPlanUid;
        const iso  = cell.dataset.dropIso;
        const slot = cell.dataset.dropSlot;
        if (!uid || !iso || !slot) return;
        const planIdx = this._plan.findIndex(p => p.uid === uid);
        if (planIdx < 0) return;
        const planItem = this._plan[planIdx];
        const meta    = parsePlanMeta(planItem.description);
        const newDesc = encodePlanMeta({ recipe_id: meta.recipe_id, srv: meta.srv, slot });
        // Optimistic update: reflect change immediately without waiting for HA round-trip
        this._plan[planIdx] = { ...planItem, due: iso, description: newDesc };
        this._dragPlanUid = null;
        this._render();
        this._svc(this._config.plan_entity, 'update_item', {
          item: uid, due_date: iso, description: newDesc,
        });
      });
    });

    // Slot picker in plan form
    root.querySelectorAll('[data-plan-slot]').forEach(el => {
      el.addEventListener('click', () => {
        this._planForm.slot = el.dataset.planSlot;
        this._render();
      });
    });

    // Open plan form from week cell "+"
    root.querySelectorAll('[data-action="open-plan-form"]').forEach(el => {
      el.addEventListener('click', () => {
        const iso  = el.dataset.iso;
        const slot = el.dataset.slot || 'mittag';
        this._openPlanForm(iso, '', slot);
      });
    });

    // Delete plan entry
    root.querySelectorAll('[data-action="del-plan"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deletePlanEntry(el.dataset.planUid);
      });
    });

    // Recipe detail overlay — open from recipe cards view
    root.querySelectorAll('[data-action="open-detail"]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="edit-recipe"],[data-action="plan-recipe"],[data-action="delete-recipe-direct"],[data-action="toggle-fav"]')) return;
        this._resetDetailState();
        this._recipeDetail = el.dataset.recipeUid;
        this._detailPlanUid = null;
        this._detailSrv = null;
        this._detailChanging = false;
        this._detailChangeSearch = '';
        this._render();
      });
    });

    // Recipe detail overlay — open from week view (single click on meal entry)
    root.querySelectorAll('[data-action="open-detail-from-plan"]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="del-plan"]')) return;
        const recipeUid = el.dataset.recipeUid;
        if (!recipeUid) return;
        this._resetDetailState();
        this._recipeDetail = recipeUid;
        this._detailPlanUid = el.dataset.planUid;
        this._detailSrv = null;
        this._detailChanging = false;
        this._detailChangeSearch = '';
        this._render();
      });
    });

    root.querySelectorAll('[data-action="close-detail"]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target !== el && !el.classList.contains('detail-close')) return;
        this._resetDetailState();
        this._recipeDetail = null;
        this._detailPlanUid = null;
        this._detailSrv = null;
        this._detailChanging = false;
        this._detailChangeSearch = '';
        this._render();
      });
    });

    root.querySelectorAll('[data-action="detail-srv-minus"],[data-action="detail-srv-plus"]').forEach(el => {
      el.addEventListener('click', () => {
        const cur = Number(el.dataset.srv) || 1;
        const next = el.dataset.action === 'detail-srv-plus' ? cur + 1 : cur - 1;
        this._detailSrv = Math.max(1, Math.min(20, next));
        this._render();
      });
    });

    // Remove plan entry from calendar detail view
    const removeFromPlanBtn = root.querySelector('[data-action="remove-from-plan"]');
    if (removeFromPlanBtn) removeFromPlanBtn.addEventListener('click', () => {
      const uid = this._detailPlanUid;
      this._recipeDetail = null;
      this._detailPlanUid = null;
      this._detailChanging = false;
      if (uid) {
        this._svc(this._config.plan_entity, 'remove_item', { item: uid });
        this._shopPlanUids.delete(uid);
        delete this._shopServings[uid];
      }
      this._render();
    });

    // Form overlay backdrop click-to-close
    root.querySelectorAll('.form-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target !== overlay) return;
        const panel = overlay.dataset.closePanel;
        this._activePanel = null;
        if (panel === 'recipe-form') { this._recipeForm = this._blankRecipeForm(); this._importResult = null; }
        else if (panel === 'plan-form') { this._planForm = this._blankPlanForm(); this._planSearch = ''; }
        else if (panel === 'json-import') { this._jsonImportText = ''; this._jsonImportError = ''; this._jsonImportCount = 0; }
        else if (panel === 'manage-cats') { this._catMgmtNewLabel = ''; }
        this._render();
      });
    });

    // Toggle change-recipe mode in detail overlay
    const toggleChange = root.querySelector('[data-action="toggle-detail-change"]');
    if (toggleChange) toggleChange.addEventListener('click', () => {
      this._detailChanging = !this._detailChanging;
      this._detailChangeSearch = '';
      this._render();
      if (this._detailChanging) {
        setTimeout(() => {
          const el = this.shadowRoot.querySelector('.detail-change-search');
          if (el) el.focus();
        }, 0);
      }
    });

    // Search input in change-recipe mode
    const changeSearchEl = root.querySelector('.detail-change-search');
    if (changeSearchEl) {
      changeSearchEl.addEventListener('input', () => {
        this._detailChangeSearch = changeSearchEl.value;
        this._render();
        setTimeout(() => {
          const el = this.shadowRoot.querySelector('.detail-change-search');
          if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
        }, 0);
      });
    }

    // Select replacement recipe in change mode
    root.querySelectorAll('.detail-change-option').forEach(el => {
      el.addEventListener('click', () => {
        const newRecipeUid = el.dataset.recipeUid;
        const planUid = this._detailPlanUid;
        if (!newRecipeUid || !planUid) return;
        const newRecipe = this._recipes.find(r => r.uid === newRecipeUid);
        const planItem  = this._plan.find(p => p.uid === planUid);
        if (!newRecipe || !planItem) return;
        const oldMeta = parsePlanMeta(planItem.description);
        const newDesc = encodePlanMeta({ recipe_id: newRecipeUid, srv: oldMeta.srv, slot: oldMeta.slot });
        const planIdx = this._plan.findIndex(p => p.uid === planUid);
        this._plan[planIdx] = { ...planItem, summary: newRecipe.summary, description: newDesc };
        this._recipeDetail = newRecipeUid;
        this._detailPlanUid = planUid;
        this._detailChanging = false;
        this._detailChangeSearch = '';
        this._render();
        this._svc(this._config.plan_entity, 'update_item', {
          item: planUid, rename: newRecipe.summary, description: newDesc,
        });
      });
    });

    // Edit recipe
    root.querySelectorAll('[data-action="edit-recipe"]').forEach(el => {
      el.addEventListener('click', () => {
        this._recipeDetail = null;
        this._openEditRecipe(el.dataset.recipeUid);
      });
    });

    // Plan recipe from recipe card
    root.querySelectorAll('[data-action="plan-recipe"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const srv = this._recipeDetail ? this._detailSrv : null;
        this._resetDetailState();
        this._recipeDetail = null;
        this._detailSrv    = null;
        this._openPlanForm('', el.dataset.recipeUid, 'mittag', srv);
      });
    });

    // Delete recipe directly (with confirmation)
    root.querySelectorAll('[data-action="delete-recipe-direct"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this._confirmDeleteRecipe(el.dataset.recipeUid)) return;
        this._resetDetailState();
        this._deleteRecipe(el.dataset.recipeUid);
      });
    });

    // Image URL input
    const imgUrlEl = root.querySelector('.form__img-url');
    if (imgUrlEl) imgUrlEl.addEventListener('input', () => {
      this._recipeForm.img = imgUrlEl.value.trim();
      this._render();
    });

    // Image file upload
    const imgFileEl = root.querySelector('.img-file-input');
    if (imgFileEl) imgFileEl.addEventListener('change', () => {
      const file = imgFileEl.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const raw = new Image();
        raw.onload = () => {
          const maxW = 800, maxH = 600;
          let w = raw.width, h = raw.height;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(raw, 0, 0, w, h);
          this._recipeForm.img = canvas.toDataURL('image/jpeg', 0.78);
          this._render();
        };
        raw.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    // Remove image
    const removeImgBtn = root.querySelector('[data-action="remove-img"]');
    if (removeImgBtn) removeImgBtn.addEventListener('click', () => {
      this._recipeForm.img = '';
      this._render();
    });

    // Category filter
    root.querySelectorAll('[data-cat]').forEach(el => {
      el.addEventListener('click', () => {
        if (this._activePanel === 'recipe-form') {
          const v = el.dataset.cat;
          let cats = this._recipeForm.cats.includes(v)
            ? this._recipeForm.cats.filter(c => c !== v)
            : [...this._recipeForm.cats, v];
          // "Sonstiges" is only a fallback — drop it once a real category is picked
          if (v !== 'sonstiges' && cats.length > 1) cats = cats.filter(c => c !== 'sonstiges');
          this._recipeForm.cats = cats;
        }
        this._render();
      });
    });

    // Search input
    const searchEl = root.querySelector('.search__input');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        this._searchQuery = searchEl.value;
        this._render();
        setTimeout(() => {
          const el = this.shadowRoot.querySelector('.search__input');
          if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
        }, 0);
      });
    }

    // Einkauf: plan checkboxes
    root.querySelectorAll('.plan-check').forEach(el => {
      el.addEventListener('change', () => {
        const uid = el.dataset.planUid;
        if (el.checked) {
          this._shopPlanUids.add(uid);
          const p    = this._plan.find(p => p.uid === uid);
          const meta = p ? parsePlanMeta(p.description) : {};
          this._shopServings[uid] = meta.srv ?? 4;
          const recipe = this._recipes.find(r => r.uid === meta.recipe_id);
          if (recipe) {
            for (const ing of parseRecipeMeta(recipe.description).ingredients) {
              if (isPantry(ing.name, this._settings.pantry)) this._shopDeselected.add(`${uid}::${ing.name}::${ing.unit}`);
            }
          }
        } else {
          this._shopPlanUids.delete(uid);
          delete this._shopServings[uid];
        }
        this._render();
      });
    });

    // Einkauf: ingredient checkboxes
    root.querySelectorAll('.shop-ing-check').forEach(el => {
      el.addEventListener('change', () => {
        const key = el.dataset.key;
        if (el.checked) this._shopDeselected.delete(key);
        else            this._shopDeselected.add(key);
        this._render();
      });
    });

    // Einkauf: shopping servings
    root.querySelectorAll('[data-action="shop-srv-minus"]').forEach(el => {
      el.addEventListener('click', () => {
        const uid = el.dataset.planUid;
        this._shopServings[uid] = Math.max(1, (this._shopServings[uid] ?? 4) - 1);
        this._render();
      });
    });
    root.querySelectorAll('[data-action="shop-srv-plus"]').forEach(el => {
      el.addEventListener('click', () => {
        const uid = el.dataset.planUid;
        this._shopServings[uid] = Math.min(20, (this._shopServings[uid] ?? 4) + 1);
        this._render();
      });
    });

    // Send to shopping list
    const sendBtn = root.querySelector('[data-action="send-shopping"]');
    if (sendBtn) sendBtn.addEventListener('click', () => this._sendToShopping());

    // ── Recipe form events ──

    // Nutri-score pills
    root.querySelectorAll('[data-score]').forEach(el => {
      el.addEventListener('click', () => {
        this._recipeForm.score = el.dataset.score;
        this._render();
      });
    });

    // Accept nutri suggestion
    const acceptNutri = root.querySelector('[data-action="accept-nutri"]');
    if (acceptNutri) acceptNutri.addEventListener('click', () => {
      this._recipeForm.score = acceptNutri.dataset.score;
      this._render();
    });

    // Recipe servings stepper
    const srvMinus = root.querySelector('[data-action="recipe-srv-minus"]');
    if (srvMinus) srvMinus.addEventListener('click', () => {
      this._recipeForm.srv = Math.max(1, this._recipeForm.srv - 1);
      this._render();
    });
    const srvPlus = root.querySelector('[data-action="recipe-srv-plus"]');
    if (srvPlus) srvPlus.addEventListener('click', () => {
      this._recipeForm.srv = Math.min(20, this._recipeForm.srv + 1);
      this._render();
    });

    // Add ingredient
    const addIngBtn = root.querySelector('[data-action="add-ing"]');
    if (addIngBtn) addIngBtn.addEventListener('click', () => this._addIngredient());

    // Ingredient input: Enter key
    const ingNameEl = root.querySelector('.ing-add__name');
    if (ingNameEl) ingNameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._addIngredient(); }
    });

    // Delete ingredient
    root.querySelectorAll('[data-action="del-ing"]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        this._recipeForm.ingredients.splice(idx, 1);
        if (this._recipeForm._ingEditIdx !== null) this._setIngInputs('', '', this._recipeForm._ingUnit);
        this._render();
      });
    });

    // Recipe form actions
    const submitRecipe = root.querySelector('[data-action="submit-recipe"]');
    if (submitRecipe) submitRecipe.addEventListener('click', () => this._submitRecipe());

    root.querySelectorAll('[data-action="cancel-recipe"]').forEach(el => {
      el.addEventListener('click', () => {
        this._activePanel = null;
        this._recipeForm  = this._blankRecipeForm();
        this._render();
      });
    });

    const deleteRecipe = root.querySelector('[data-action="delete-recipe"]');
    if (deleteRecipe) deleteRecipe.addEventListener('click', () => {
      if (this._confirmDeleteRecipe(this._recipeForm.uid)) this._deleteRecipe(this._recipeForm.uid);
    });

    const importBtn = root.querySelector('[data-action="import-url"]');
    if (importBtn) importBtn.addEventListener('click', () => this._importUrl());

    const togglePaste = root.querySelector('[data-action="toggle-paste-mode"]');
    if (togglePaste) togglePaste.addEventListener('click', () => {
      this._importPasteMode = !this._importPasteMode;
      this._importPasteHtml = '';
      this._render();
    });

    // Store paste content in state on every input — avoids DOM-read timing issues
    const pasteArea = root.querySelector('.import-paste-textarea');
    if (pasteArea) pasteArea.addEventListener('input', () => {
      this._importPasteHtml = pasteArea.value;
      console.log('[alh-meal-card] paste textarea input, length:', pasteArea.value.length);
    });

    // parse-paste is handled by the permanent delegated listener in the constructor

    const titleInput = root.querySelector('.form__title-input');
    if (titleInput) titleInput.addEventListener('input', () => {
      this._recipeForm.title = titleInput.value;
    });
    if (titleInput) titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._submitRecipe(); }
      if (e.key === 'Escape') {
        this._activePanel = null;
        this._recipeForm  = this._blankRecipeForm();
        this._render();
      }
    });

    // ── Plan form events ──

    const planSearchEl = root.querySelector('.plan-recipe-search');
    if (planSearchEl) {
      planSearchEl.addEventListener('input', () => {
        this._planSearch = planSearchEl.value;
        this._updatePlanSearchDropdown();
      });
    }

    root.querySelectorAll('.plan-recipe-option').forEach(el => {
      el.addEventListener('click', () => {
        const uid = el.dataset.recipeUid;
        if (!uid) return;
        this._planForm.recipeUid = uid;
        const recipe = this._recipes.find(r => r.uid === uid);
        if (recipe) this._planForm.srv = parseRecipeMeta(recipe.description).srv || 4;
        this._planSearch = '';
        this._render();
      });
    });

    const clearPlanRecipe = root.querySelector('[data-action="clear-plan-recipe"]');
    if (clearPlanRecipe) clearPlanRecipe.addEventListener('click', () => {
      this._planForm.recipeUid = '';
      this._planSearch = '';
      this._render();
      setTimeout(() => { const el = this.shadowRoot.querySelector('.plan-recipe-search'); if (el) el.focus(); }, 0);
    });

    const planSrvMinus = root.querySelector('[data-action="plan-srv-minus"]');
    if (planSrvMinus) planSrvMinus.addEventListener('click', () => {
      this._planForm.srv = Math.max(1, this._planForm.srv - 1);
      this._render();
    });
    const planSrvPlus = root.querySelector('[data-action="plan-srv-plus"]');
    if (planSrvPlus) planSrvPlus.addEventListener('click', () => {
      this._planForm.srv = Math.min(20, this._planForm.srv + 1);
      this._render();
    });

    const submitPlan = root.querySelector('[data-action="submit-plan"]');
    if (submitPlan) submitPlan.addEventListener('click', () => this._submitPlan());

    root.querySelectorAll('[data-action="cancel-plan"]').forEach(el => {
      el.addEventListener('click', () => {
        this._activePanel = null;
        this._planForm    = this._blankPlanForm();
        this._planSearch  = '';
        this._render();
      });
    });

    // ── JSON Import events ──

    const openJsonImport = root.querySelector('[data-action="open-json-import"]');
    if (openJsonImport) openJsonImport.addEventListener('click', () => {
      this._addMenuOpen     = false;
      this._jsonImportText  = '';
      this._jsonImportError = '';
      this._jsonImportCount = 0;
      this._activePanel     = 'json-import';
      this._render();
    });

    const cancelJsonImport = root.querySelector('[data-action="cancel-json-import"]');
    if (cancelJsonImport) cancelJsonImport.addEventListener('click', () => {
      this._activePanel     = null;
      this._jsonImportText  = '';
      this._jsonImportError = '';
      this._jsonImportCount = 0;
      this._render();
    });

    const jsonTextarea = root.querySelector('.json-import__textarea');
    if (jsonTextarea) jsonTextarea.addEventListener('input', () => {
      this._jsonImportText = jsonTextarea.value;
    });

    const submitJsonImport = root.querySelector('[data-action="submit-json-import"]');
    if (submitJsonImport) submitJsonImport.addEventListener('click', () => this._submitJsonImport());

    // ── Manage categories ──

    root.querySelectorAll('[data-action="open-manage-cats"]').forEach(el => el.addEventListener('click', () => {
      this._catMgmtNewLabel = '';
      this._activePanel = 'manage-cats';
      this._render();
    }));

    // ── Settings ──
    root.querySelectorAll('[data-action="open-settings"]').forEach(el => el.addEventListener('click', () => {
      this._addMenuOpen = false;
      this._resetDetailState();
      this._recipeDetail = null;
      this._activePanel = 'settings';
      this._render();
    }));
    root.querySelectorAll('[data-action="cancel-settings"]').forEach(el => el.addEventListener('click', () => {
      this._activePanel = null;
      this._render();
    }));
    const saveSettings = root.querySelector('[data-action="save-settings"]');
    if (saveSettings) saveSettings.addEventListener('click', () => {
      const shop   = root.querySelector('.settings__shop')?.value ?? '';
      const pantry = (root.querySelector('.settings__pantry')?.value ?? '')
        .split(/[,\n]/).map(t => t.trim()).filter(Boolean);
      this._settings = { ...this._settings, shopping_entity: shop, pantry };
      this._saveConfig();
      this._shopError = '';
      this._activePanel = null;
      this._render();
    });

    // ── Detail: choose ingredients for the shopping list ──
    root.querySelectorAll('[data-pick]').forEach(el => el.addEventListener('click', () => {
      const i = Number(el.dataset.pick);
      if (this._shopPick.has(i)) this._shopPick.delete(i); else this._shopPick.add(i);
      this._render();
    }));
    const pickAll = root.querySelector('[data-action="pick-all"]');
    if (pickAll) pickAll.addEventListener('click', () => {
      const recipe = this._recipes.find(r => r.uid === this._recipeDetail);
      const n = recipe ? parseRecipeMeta(recipe.description).ingredients.length : 0;
      this._shopPick = this._shopPick.size === n ? new Set() : new Set(Array.from({ length: n }, (_, i) => i));
      this._render();
    });
    const pickCancel = root.querySelector('[data-action="pick-cancel"]');
    if (pickCancel) pickCancel.addEventListener('click', () => { this._shopPick = null; this._shopError = ''; this._render(); });
    const pickConfirm = root.querySelector('[data-action="pick-confirm"]');
    if (pickConfirm) pickConfirm.addEventListener('click', () => {
      this._sendRecipeToShopping(this._recipeDetail, Number(pickConfirm.dataset.srv) || 1, this._shopPick);
    });

    root.querySelectorAll('[data-action="cancel-manage-cats"]').forEach(el => {
      el.addEventListener('click', () => {
        this._activePanel = null;
        this._catMgmtNewLabel = '';
        this._render();
      });
    });

    root.querySelectorAll('[data-action="delete-cat"]').forEach(el => {
      el.addEventListener('click', () => {
        const v = el.dataset.catV;
        if (!v || v === 'sonstiges') return;
        const cat = this._categories.find(c => c.v === v);
        if (!cat) return;
        const count = this._recipes.filter(r => r.status !== 'completed' && parseRecipeMeta(r.description).cats.includes(v)).length;
        const msg = count > 0
          ? `„${cat.l}" wirklich löschen?\n${count} Rezept${count !== 1 ? 'e' : ''} ${count !== 1 ? 'nutzen' : 'nutzt'} diese Kategorie (die Rezepte bleiben erhalten, zeigen dann den Rohwert als Label).`
          : `„${cat.l}" wirklich löschen?`;
        if (!confirm(msg)) return;
        this._catFilters = this._catFilters.filter(c => c !== v);
        this._categories = this._categories.filter(c => c.v !== v);
        this._saveCategories();
        this._catMgmtNewLabel = '';
        this._activePanel = 'manage-cats';
        this._render();
      });
    });

    const catAddLabelEl = root.querySelector('.cat-add__label');
    if (catAddLabelEl) {
      catAddLabelEl.addEventListener('input', () => { this._catMgmtNewLabel = catAddLabelEl.value; });
      catAddLabelEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this._addCategory(); } });
    }

    const addCatBtn = root.querySelector('[data-action="add-cat"]');
    if (addCatBtn) addCatBtn.addEventListener('click', () => this._addCategory());
  }

  _updatePlanSearchDropdown() {
    const wrap = this.shadowRoot.querySelector('.plan-recipe-search-wrap');
    if (!wrap) return;
    let dropdown = wrap.querySelector('.plan-recipe-dropdown');
    const q = this._planSearch.toLowerCase();
    const results = q
      ? this._recipes.filter(r => r.status !== 'completed' && r.summary.toLowerCase().includes(q)).slice(0, 6)
      : [];
    if (!results.length) {
      if (dropdown) dropdown.remove();
      if (q) {
        const empty = document.createElement('div');
        empty.className = 'plan-recipe-dropdown';
        empty.innerHTML = '<div class="plan-recipe-option plan-recipe-option--empty">Keine Rezepte gefunden</div>';
        wrap.appendChild(empty);
      }
      return;
    }
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'plan-recipe-dropdown';
      wrap.appendChild(dropdown);
    }
    dropdown.innerHTML = results.map(r => {
      const m = parseRecipeMeta(r.description);
      const catL = this._catLabels(m);
      return `<div class="plan-recipe-option" data-recipe-uid="${x(r.uid)}">
        <span class="plan-recipe-option__title">${x(r.summary)}</span>
        <span class="plan-recipe-option__meta">${x(catL)} · ${m.srv} Pers.</span>
      </div>`;
    }).join('');
    dropdown.querySelectorAll('.plan-recipe-option').forEach(el => {
      el.addEventListener('click', () => {
        const uid = el.dataset.recipeUid;
        if (!uid) return;
        this._planForm.recipeUid = uid;
        const recipe = this._recipes.find(r => r.uid === uid);
        if (recipe) this._planForm.srv = parseRecipeMeta(recipe.description).srv || 4;
        this._planSearch = '';
        this._render();
      });
    });
  }

  _restoreFocus() {
    // Re-focus title input when recipe form is open
    if (this._activePanel === 'recipe-form') {
      const inp = this.shadowRoot.querySelector('.form__title-input');
      if (inp && !inp.value) inp.focus();
    }
    if (this._activePanel === 'plan-form') {
      const searchEl = this.shadowRoot.querySelector('.plan-recipe-search');
      if (searchEl && !this._planForm.recipeUid) searchEl.focus();
    }
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────

  _openCreateRecipe() {
    this._recipeForm      = this._blankRecipeForm();
    this._importResult    = null;
    this._importPasteMode = false;
    this._importPasteHtml = '';
    this._activePanel     = 'recipe-form';
    this._render();
  }

  _openEditRecipe(uid) {
    const recipe = this._recipes.find(r => r.uid === uid);
    if (!recipe) return;
    const meta = parseRecipeMeta(recipe.description);
    const note = splitNote(meta.note);
    this._recipeForm = {
      open: true, uid,
      title: recipe.summary,
      cats:  [...meta.cats],
      score: meta.score || '',
      srv:   meta.srv || 4,
      time:  meta.time || '',
      fav:   meta.fav,
      src:   meta.src || '',
      note:  [...note.intro, ...note.outro].join('\n'),
      steps: [...note.steps],
      img:   meta.img || '',
      ingredients: [...meta.ingredients],
      _ingName: '', _ingAmount: '', _ingUnit: 'g', _ingEditIdx: null,
    };
    this._activePanel = 'recipe-form';
    this._render();
  }

  _openPlanForm(dayIso, recipeUid = '', slot = 'mittag', srvOverride = null) {
    let srv = 4;
    if (srvOverride) srv = srvOverride;
    else if (recipeUid) {
      const r = this._recipes.find(r => r.uid === recipeUid);
      if (r) srv = parseRecipeMeta(r.description).srv || 4;
    }
    this._planForm    = { open: true, dayIso: dayIso || isoToday(), recipeUid, srv, slot };
    this._planSearch  = '';
    this._activePanel = 'plan-form';
    this._render();
  }

  // _render() re-reads the add-row inputs, so state and DOM are set together
  _setIngInputs(name, amount, unit, editIdx = null) {
    Object.assign(this._recipeForm, { _ingName: name, _ingAmount: amount, _ingUnit: unit, _ingEditIdx: editIdx });
    const set = (sel, v) => { const el = this.shadowRoot.querySelector(sel); if (el) el.value = v; };
    set('.ing-add__name', name);
    set('.ing-add__amount', amount);
    set('.ing-add__unit', unit);
  }

  _addIngredient() {
    const nameEl = this.shadowRoot.querySelector('.ing-add__name');
    const amtEl  = this.shadowRoot.querySelector('.ing-add__amount');
    const unitEl = this.shadowRoot.querySelector('.ing-add__unit');
    const f      = this._recipeForm;
    const name   = (nameEl?.value ?? f._ingName).trim();
    if (!name) return;
    const ing = {
      name,
      amount: (amtEl?.value ?? f._ingAmount).trim().replace(',', '.'),
      unit:   (unitEl?.value ?? f._ingUnit).trim(),
    };
    if (f._ingEditIdx !== null && f.ingredients[f._ingEditIdx]) f.ingredients[f._ingEditIdx] = ing;
    else f.ingredients.push(ing);
    this._setIngInputs('', '', ing.unit);
    this._render();
    // Focus back on name input
    setTimeout(() => {
      const el = this.shadowRoot.querySelector('.ing-add__name');
      if (el) el.focus();
    }, 30);
  }

  _submitRecipe() {
    const titleEl = this.shadowRoot.querySelector('.form__title-input');
    const noteEl  = this.shadowRoot.querySelector('.form__note');
    const title   = (titleEl?.value ?? this._recipeForm.title).trim();
    if (!title) {
      if (titleEl) { titleEl.focus(); titleEl.style.borderColor = 'var(--error-color, #f44336)'; }
      return;
    }
    if (noteEl) this._recipeForm.note = noteEl.value;

    const f       = this._recipeForm;
    const stepEls = [...this.shadowRoot.querySelectorAll('.step-input')];
    const steps   = (stepEls.length ? stepEls.map(el => el.value) : f.steps)
      .map(t => String(t).replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
    const time    = this.shadowRoot.querySelector('.form__time')?.value ?? f.time;
    const src     = (this.shadowRoot.querySelector('.form__src')?.value ?? f.src).trim();
    const { uid, score, srv, fav, ingredients, img } = f;
    const cats = f.cats.length ? f.cats : ['sonstiges'];
    const note = joinNote(steps, f.note);
    const desc = encodeRecipeMeta({ cats, score, srv, time, fav, src, note, ingredients, img });

    if (uid) {
      this._svc(this._config.recipe_entity, 'update_item', { item: uid, rename: title, description: desc });
    } else {
      this._svc(this._config.recipe_entity, 'add_item', { item: title, description: desc });
    }

    this._activePanel  = null;
    this._recipeForm   = this._blankRecipeForm();
    this._importResult = null;
    this._render();
  }

  _confirmDeleteRecipe(uid) {
    const recipe = this._recipes.find(r => r.uid === uid);
    if (!recipe) return false;
    const planned = this._plan.filter(p => p.status !== 'completed' && parsePlanMeta(p.description).recipe_id === uid).length;
    const extra = planned
      ? `\n\n${planned} geplante Mahlzeit${planned !== 1 ? 'en werden' : ' wird'} ebenfalls aus dem Wochenplan entfernt.`
      : '';
    return confirm(`„${recipe.summary}" wirklich löschen?${extra}`);
  }

  // Re-encodes a recipe with changed meta fields (keeps image, notes, ingredients)
  _updateRecipeMeta(uid, patch) {
    const recipe = this._recipes.find(r => r.uid === uid);
    if (!recipe) return;
    const desc = encodeRecipeMeta({ ...parseRecipeMeta(recipe.description), ...patch });
    recipe.description = desc; // optimistic, the subscription refetch confirms it
    this._render();
    this._svc(this._config.recipe_entity, 'update_item', { item: uid, description: desc })
      .catch(e => console.error('[alh-meal-card] updateRecipe:', e));
  }

  async _sendRecipeToShopping(uid, srv, indices = null) {
    const entity = this._shoppingEntity();
    const recipe = this._recipes.find(r => r.uid === uid);
    if (!entity || !recipe || this._detailShop === 'busy' || this._detailShop === 'done') return;
    this._shopError = this._shoppingConfigError();
    if (this._shopError) { this._render(); return; }
    const meta  = parseRecipeMeta(recipe.description);
    const scale = srv / (meta.srv || 1);
    this._detailShop = 'busy';
    this._render();
    try {
      const chosen = indices ? meta.ingredients.filter((_, i) => indices.has(i)) : meta.ingredients;
      await this._addToShopping(chosen.map(ing => {
        const amt = fmtAmount(ing.amount, scale);
        return { name: ing.name, qty: amt ? `${amt} ${ing.unit}`.trim() : '' };
      }));
      this._detailShop = 'done';
      this._shopPick = null;
    } catch (e) {
      console.error('[alh-meal-card] sendRecipeToShopping:', e);
      this._detailShop = '';
      this._shopError = `Hinzufügen fehlgeschlagen: ${e?.message || e}`;
    }
    this._render();
  }

  // _render() re-reads the live input, so the field itself must be emptied too
  _clearSearchInput() {
    this._searchQuery = '';
    const el = this.shadowRoot.querySelector('.search__input');
    if (el) el.value = '';
  }

  _resetDetailState() {
    if (this._cookMode) this._setWakeLock(false);
    this._cookMode   = false;
    this._cookDone   = new Set();
    this._detailShop = '';
    this._shopError  = '';
    this._shopPick   = null;
  }

  // Keeps the screen on in cook mode (needs HTTPS; silently skipped otherwise)
  async _setWakeLock(on) {
    try {
      if (on && !this._wakeLock && navigator.wakeLock) {
        this._wakeLock = await navigator.wakeLock.request('screen');
        this._wakeLock.addEventListener('release', () => { this._wakeLock = null; });
      } else if (!on && this._wakeLock) {
        await this._wakeLock.release();
        this._wakeLock = null;
      }
    } catch (e) {
      this._wakeLock = null;
    }
  }

  _deleteRecipe(uid) {
    if (!uid) return;
    this._svc(this._config.recipe_entity, 'remove_item', { item: uid });
    // Remove plan entries referencing this recipe
    this._plan
      .filter(p => parsePlanMeta(p.description).recipe_id === uid)
      .forEach(p => this._svc(this._config.plan_entity, 'remove_item', { item: p.uid }));
    this._activePanel  = null;
    this._recipeForm   = this._blankRecipeForm();
    this._recipeDetail = null;
    this._render();
  }

  async _submitJsonImport() {
    const textareaEl = this.shadowRoot.querySelector('.json-import__textarea');
    const raw = (textareaEl?.value ?? this._jsonImportText).trim();
    if (!raw) {
      this._jsonImportError = 'Bitte JSON einfügen.';
      this._render();
      return;
    }

    let recipes;
    try {
      const parsed = JSON.parse(raw);
      recipes = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      this._jsonImportError = `Ungültiges JSON: ${e.message}`;
      this._render();
      return;
    }

    const validCats = this._categories.map(c => c.v);
    let count = 0;
    const errors = [];

    for (const [i, r] of recipes.entries()) {
      const title = String(r.title ?? '').trim();
      if (!title) { errors.push(`Eintrag ${i + 1}: "title" fehlt.`); continue; }

      const rawCats = Array.isArray(r.cats) ? r.cats : String(r.cat ?? '').split(',');
      const cats    = rawCats.map(c => String(c).trim()).filter(c => validCats.includes(c));
      if (!cats.length) cats.push('sonstiges');
      const score = 'ABCDE'.includes(String(r.score ?? '').toUpperCase())
        ? String(r.score).toUpperCase() : '';
      const srv   = parseInt(r.srv) || 4;
      const steps = Array.isArray(r.steps) ? r.steps.map(t => String(t).replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean) : [];
      const note  = joinNote(steps, String(r.note ?? ''));
      const img   = String(r.img ?? '').trim();
      const time  = parseInt(r.time) || 0;
      const fav   = !!r.fav;
      const src   = String(r.src ?? '').trim();

      const ingredients = Array.isArray(r.ingredients)
        ? r.ingredients.map(ing => ({
            name:   String(ing.name ?? '').trim(),
            amount: String(ing.amount ?? ''),
            unit:   String(ing.unit ?? 'Stk'),
          })).filter(ing => ing.name)
        : [];

      const desc = encodeRecipeMeta({ cats, score, srv, time, fav, src, note, ingredients, img });
      await this._svc(this._config.recipe_entity, 'add_item', { item: title, description: desc });
      count++;
    }

    this._jsonImportCount = count;
    this._jsonImportError = errors.length ? errors.join(' ') : '';
    this._jsonImportText  = '';
    if (!errors.length) {
      setTimeout(() => {
        this._activePanel     = null;
        this._jsonImportCount = 0;
        this._render();
      }, 2000);
    }
    this._render();
  }

  _submitPlan() {
    const dayEl    = this.shadowRoot.querySelector('.plan-form__date');
    const dayIso   = (dayEl?.value ?? this._planForm.dayIso).trim();
    const recipeUid = this._planForm.recipeUid.trim();

    if (!dayIso || !recipeUid) return;
    const recipe = this._recipes.find(r => r.uid === recipeUid);
    if (!recipe) return;

    this._svc(this._config.plan_entity, 'add_item', {
      item:        recipe.summary,
      due_date:    dayIso,
      description: encodePlanMeta({ recipe_id: recipeUid, srv: this._planForm.srv, slot: this._planForm.slot }),
    });

    this._activePanel = null;
    this._planForm    = this._blankPlanForm();
    this._render();
  }

  _deletePlanEntry(uid) {
    if (!uid) return;
    this._svc(this._config.plan_entity, 'remove_item', { item: uid });
    this._shopPlanUids.delete(uid);
    delete this._shopServings[uid];
    this._render();
  }

  _shoppingConfigError() {
    const e = this._shoppingEntity();
    if (!e) return 'Keine Einkaufsliste gewählt – bitte in den Einstellungen (Zahnrad oben) festlegen.';
    if (!this._hass?.states?.[e]) {
      const lists = Object.keys(this._hass?.states || {}).filter(id => id.startsWith('todo.')).join(', ');
      return `Einkaufsliste „${e}“ gibt es nicht. Bitte in den Einstellungen (Zahnrad oben) eine andere Liste wählen. Vorhandene Listen: ${lists}`;
    }
    return '';
  }

  // Lists that support descriptions (e.g. Bring!) get the amount as description,
  // so "Perl-Couscous" stays the item name and "275 g" becomes the specification.
  async _addToShopping(items) {
    const entity = this._shoppingEntity();
    const SET_DESCRIPTION = 64;
    const withDesc = ((this._hass.states[entity]?.attributes?.supported_features ?? 0) & SET_DESCRIPTION) !== 0;
    for (const { name, qty } of items) {
      const data = withDesc && qty ? { item: name, description: qty } : { item: [qty, name].filter(Boolean).join(' ') };
      await this._svc(entity, 'add_item', data);
    }
  }

  async _sendToShopping() {
    const entity = this._shoppingEntity();
    if (!entity) return;
    const items = this._buildShoppingList().filter(ing => {
      const key = `${ing.planUid}::${ing.name}::${ing.unit}`;
      return !this._shopDeselected.has(key);
    });
    if (!items.length || this._shopBusy) return;
    this._shopError = this._shoppingConfigError();
    if (this._shopError) { this._render(); return; }
    this._shopBusy = true;
    this._render();
    try {
      await this._addToShopping(items.map(i => ({ name: i.name, qty: i.qty })));
      this._shopSuccess = true;
    } catch (e) {
      console.error('[alh-meal-card] sendToShopping:', e);
      this._shopError = `Hinzufügen fehlgeschlagen: ${e?.message || e}`;
    }
    this._shopBusy = false;
    this._render();
    setTimeout(() => { this._shopSuccess = false; this._render(); }, 3000);
  }

  async _importUrl() {
    const urlEl = this.shadowRoot.querySelector('.import__url');
    const url   = (urlEl?.value ?? this._recipeForm._importUrl).trim();
    if (!url) return;
    this._recipeForm._importUrl = url;
    this._importLoading  = true;
    this._importResult   = null;
    this._render();
    try {
      // URL direkt per REST API schreiben – kein Entity-Setup erforderlich
      await this._hass.callApi('POST', 'states/sensor.alh_recipe_import_url', {
        state: url, attributes: {},
      });
      // Shell-Script ohne Parameter aufrufen
      await this._hass.callService('shell_command', 'alh_recipe_import', {});
      setTimeout(() => {
        if (this._importLoading) { this._importLoading = false; this._render(); }
      }, 15000);
    } catch (e) {
      console.error('[alh-meal-card] import error', e);
      this._importLoading = false;
      this._render();
    }
  }

  _handleImportResult(jsonStr) {
    this._importLoading = false;
    try {
      const data = JSON.parse(jsonStr);
      this._importResult = data;
      if (data.title) this._recipeForm.title = data.title;
      if (Array.isArray(data.ingredients)) {
        this._recipeForm.ingredients = data.ingredients.map(i => ({
          name: i.name ?? String(i), amount: i.amount ?? '', unit: i.unit ?? 'Stk',
        })).filter(i => i.name);
      }
      if (data.servings) this._recipeForm.srv = parseInt(data.servings) || 4;
      if (data.img) this._recipeForm.img = data.img;
    } catch (e) {
      this._importResult = { error: 'Antwort konnte nicht gelesen werden.' };
    }
    this._render();
  }

  // ─── CSS ─────────────────────────────────────────────────────────────────────

  _css() {
    return `
      :host { display: block; height: 100%; }

      .card {
        background: var(--ha-card-background, var(--card-background-color, #1c1c1e));
        border-radius: var(--ha-card-border-radius, 26px);
        border: 1px solid rgba(128,128,128,0.12);
        box-shadow: var(--ha-card-box-shadow, 0 12px 20px rgba(0,0,0,0.28));
        overflow: hidden;
        font-family: var(--primary-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
        height: 100%; display: flex; flex-direction: column;
        position: relative;
        --alh-bg:     var(--ha-card-background, var(--card-background-color, #1c1c1e));
        --alh-text:   var(--primary-text-color, #e8e8e8);
        --alh-muted:  var(--secondary-text-color, #9a9a9a);
        --alh-fill:   rgba(128,128,128,0.12);
        --alh-fill-2: rgba(128,128,128,0.2);
        --alh-line:   rgba(128,128,128,0.16);
        --alh-accent: var(--primary-color, #0A84FF);
      }

      /* ── Header ── */
      .header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 14px 10px;
      }
      .header__left  { display: flex; align-items: center; gap: 10px; }
      .header__right { display: flex; align-items: center; gap: 6px; }

      .header__icon {
        width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
        background: rgba(var(--rgb-primary-color, 10,132,255), 0.15);
        display: flex; align-items: center; justify-content: center;
      }
      .header__icon svg { width: 17px; height: 17px; fill: var(--primary-color, #0A84FF); }
      .header__title {
        font-size: 15px; font-weight: 600;
        color: var(--primary-text-color, currentColor);
      }

      /* ── Buttons ── */
      .icon-btn {
        width: 30px; height: 30px; border-radius: 8px;
        background: rgba(128,128,128,0.1); border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center; padding: 0;
        transition: background 0.15s; flex-shrink: 0;
      }
      .icon-btn svg { width: 16px; height: 16px; fill: var(--secondary-text-color, currentColor); opacity: 0.7; }
      .icon-btn:hover { background: rgba(var(--rgb-primary-color,10,132,255), 0.12); }
      .icon-btn:hover svg { opacity: 0.85; }
      .icon-btn--sm { width: 24px; height: 24px; border-radius: 6px; }
      .icon-btn--sm svg { width: 14px; height: 14px; }

      .add-btn {
        width: 30px; height: 30px; border-radius: 8px;
        background: var(--primary-color, #0A84FF); border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center; padding: 0;
        transition: opacity 0.15s;
      }
      .add-btn:hover { opacity: 0.82; }
      .add-btn svg { width: 17px; height: 17px; fill: #fff; }

      .btn {
        padding: 9px 16px; border-radius: 10px;
        font-size: 14px; font-weight: 600; font-family: inherit; line-height: 1.2;
        cursor: pointer; border: none; transition: background 0.15s, opacity 0.15s;
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      }
      .btn--primary { background: var(--alh-accent); color: #fff; }
      .btn--primary:hover { opacity: 0.88; }
      .btn--ghost { background: var(--alh-fill); color: var(--alh-text); }
      .btn--ghost:hover { background: var(--alh-fill-2); }
      .btn--danger { background: rgba(244,67,54,0.1); color: var(--error-color,#f44336); margin-right: auto; border: none; }
      .btn--danger:hover { background: rgba(244,67,54,0.2); }
      .btn--text { background: none; padding-left: 4px; padding-right: 4px; color: var(--alh-muted); }
      .btn--text:hover { color: var(--alh-text); }
      .btn--text-danger { color: var(--error-color,#f44336); }
      .btn--text-danger:hover { color: var(--error-color,#f44336); opacity: 0.8; }
      .btn--sm { padding: 6px 11px; font-size: 13px; border-radius: 8px; }
      .btn--loading { opacity: 0.5; pointer-events: none; }
      .btn svg { width: 15px; height: 15px; fill: currentColor; }
      .icon-btn--lg { width: 40px; height: 40px; border-radius: 10px; background: var(--alh-fill); }
      .icon-btn--lg svg { width: 18px; height: 18px; }

      /* ── View Tabs (segmented control) ── */
      .view-tabs {
        display: flex; gap: 2px; margin: 0 14px 14px; padding: 3px;
        background: var(--alh-fill); border-radius: 11px; width: fit-content;
      }
      .view-tab {
        padding: 6px 18px; border-radius: 8px; border: none; background: transparent;
        font-size: 14px; font-weight: 500; font-family: inherit;
        color: var(--alh-muted); cursor: pointer; transition: background 0.15s, color 0.15s;
      }
      .view-tab:hover { color: var(--alh-text); }
      .view-tab--active { background: var(--alh-bg); color: var(--alh-text); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.25); }

      /* ── Empty ── */
      .empty {
        padding: 28px 20px; text-align: center; font-size: 13px; line-height: 1.6;
        color: var(--secondary-text-color, currentColor); opacity: 0.5;
      }

      /* ── Nutri Badge ── */
      .nutri-badge {
        display: inline-flex; align-items: center; justify-content: center;
        width: 20px; height: 20px; border-radius: 50%;
        font-size: 10px; font-weight: 800; flex-shrink: 0;
      }

      /* ── Category Badge ── */
      .cat-badge {
        font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 4px; flex-shrink: 0;
      }
      .cat-badge--pasta       { background: rgba(6,49,67,0.8);   color: #5AC8F5; }
      .cat-badge--salat       { background: rgba(9, 79, 20, 0.8);    color: #32D74B; }
      .cat-badge--fleisch     { background: rgba(59,38,5,0.8);   color: #FF9F0A; }
      .cat-badge--vegetarisch { background: rgba(9,64,17,0.8);    color: #32D74B; }
      .cat-badge--suppe       { background: rgba(9,76,53,0.8);  color: #6adc91; }
      .cat-badge--snack       { background: rgba(80, 68, 8, 0.85);    color: #e6c400; }
      .cat-badge--dessert     { background: rgba(52, 12, 72, 0.8);   color: #BF5AF2; }
      .cat-badge--sonstiges   { background: rgba(60, 60, 60, 0.85);  color: #c8c8c8; }

      /* ── Woche View ── */
      .woche { padding: 0 12px 12px; flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
      .woche__nav {
        display: flex; align-items: center; justify-content: space-between;
        padding: 2px 0 12px; flex-wrap: wrap; gap: 8px;
      }
      .woche__month { font-size: 16px; font-weight: 700; color: var(--primary-text-color,currentColor); }

      /* Week table: 8-column grid (slot label + 7 days) */
      .week-table {
        display: grid;
        grid-template-columns: 72px repeat(7, minmax(0, 1fr));
        grid-template-rows: auto repeat(3, 1fr);
        gap: 3px;
        overflow: auto;
        flex: 1; min-height: 0;
      }

      .week-table__corner { /* empty top-left cell */ }

      .week-table__day-header {
        text-align: center; padding: 8px 4px 6px;
        border-radius: 10px 10px 0 0;
        background: rgba(128,128,128,0.05);
        border: 1px solid transparent;
        display: flex; flex-direction: column; align-items: center; gap: 4px;
      }
      .week-table__day-header--today {
        background: rgba(var(--rgb-primary-color,10,132,255),0.08);
        border-color: var(--primary-color,#0A84FF);
      }
      .week-table__day-header--weekend { background: rgba(128,128,128,0.07); }
      .wth-name { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--secondary-text-color,currentColor); opacity: 0.75; }
      .wth-num { font-size: 16px; font-weight: 600; color: var(--primary-text-color,currentColor); line-height: 1; }
      .wth-num--today {
        background: var(--primary-color,#0A84FF); color: #fff;
        border-radius: 50%; width: 28px; height: 28px;
        display: flex; align-items: center; justify-content: center;
        font-size: 14px; font-weight: 700;
      }

      .week-table__slot-label {
        display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
        padding: 10px 4px 4px; gap: 3px;
      }
      .slot-icon { font-size: 16px; }
      .slot-text { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--secondary-text-color,currentColor); opacity: 0.7; text-align: center; }

      .week-cell {
        min-height: 60px; padding: 4px; border-radius: 8px;
        background: rgba(128,128,128,0.04);
        border: 2px solid transparent;
        display: flex; flex-direction: column; gap: 4px;
        transition: border-color 0.15s, background 0.15s;
      }
      .week-cell--today { background: rgba(var(--rgb-primary-color,10,132,255),0.04); }
      .week-cell--drag-over {
        border-color: var(--primary-color,#0A84FF);
        background: rgba(var(--rgb-primary-color,10,132,255),0.12);
      }

      .meal-entry {
        background: rgba(var(--rgb-primary-color,10,132,255),0.1);
        border-radius: 8px; overflow: hidden; cursor: grab; position: relative;
        transition: box-shadow 0.15s;
        flex: 1; display: flex; flex-direction: column; min-height: 0;
      }
      .meal-entry:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.25); }
      .meal-entry:active { cursor: grabbing; }
      .meal-entry__img { width: 100%; flex: 1; min-height: 40px; object-fit: cover; display: block; pointer-events: none; }
      .meal-entry__body { padding: 5px 6px; pointer-events: none; flex-shrink: 0; }
      .meal-entry__title {
        font-size: 12px; font-weight: 600; line-height: 1.3;
        color: var(--primary-text-color,currentColor);
        overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      }
      .meal-entry__meta { display: flex; gap: 4px; align-items: center; margin-top: 3px; flex-wrap: wrap; }
      .meal-entry__srv { font-size: 11px; color: var(--secondary-text-color,currentColor); opacity: 0.6; }
      .meal-entry__del {
        position: absolute; top: 3px; right: 3px;
        width: 18px; height: 18px; border-radius: 50%;
        background: rgba(0,0,0,0.5); border: none; cursor: pointer; padding: 0;
        display: flex; align-items: center; justify-content: center;
        opacity: 0; transition: opacity 0.15s;
      }
      .meal-entry__del svg { width: 11px; height: 11px; fill: #fff; }
      .meal-entry:hover .meal-entry__del { opacity: 1; }

      .week-cell__add {
        width: 100%; padding: 6px 0; border-radius: 6px; border: none;
        background: transparent; cursor: pointer; font-size: 18px; line-height: 1;
        color: var(--primary-color,#0A84FF);
        opacity: 0.2; transition: opacity 0.15s, background 0.15s;
        margin-top: auto;
      }
      .week-cell__add:hover { opacity: 0.8; background: rgba(var(--rgb-primary-color,10,132,255),0.08); }

      .woche__shop-bar {
        display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;
        margin-top: 12px; padding: 10px 14px;
        background: rgba(128,128,128,0.05); border-radius: 12px;
        border: 1px solid rgba(128,128,128,0.1);
      }
      .woche__shop-label { font-size: 14px; color: var(--secondary-text-color,currentColor); opacity: 0.75; }

      /* ── Rezepte View ── */
      .rezepte { padding: 0 14px 16px; }
      .search-row { position: relative; margin-bottom: 10px; }
      .search__icon {
        position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
        width: 18px; height: 18px; fill: var(--alh-muted); opacity: 0.7; pointer-events: none;
      }
      .search__input {
        width: 100%; box-sizing: border-box;
        background: var(--alh-fill); border: 1px solid transparent; border-radius: 12px;
        padding: 10px 14px 10px 38px; font-size: 15px; font-family: inherit;
        color: var(--alh-text); outline: none; transition: border-color 0.15s;
      }
      .search__input::placeholder { color: var(--alh-muted); opacity: 0.7; }
      .search__input:focus { border-color: var(--alh-line); background: var(--alh-fill-2); }

      .cat-filters {
        display: flex; gap: 6px; overflow-x: auto; margin: 0 -14px; padding: 0 14px;
        scrollbar-width: none;
      }
      .cat-filters::-webkit-scrollbar { display: none; }
      .cat-pill {
        padding: 7px 14px; border-radius: 999px; white-space: nowrap; border: none;
        background: var(--alh-fill); font-size: 13px; font-weight: 500; font-family: inherit;
        color: var(--alh-text); cursor: pointer; transition: background 0.15s;
      }
      .cat-pill:hover { background: var(--alh-fill-2); }
      .cat-pill--active, .cat-pill--active:hover { background: var(--alh-text); color: var(--alh-bg); }
      .cat-pill svg { width: 14px; height: 14px; fill: currentColor; vertical-align: -2px; margin-right: 2px; }
      .cat-filters__sep { flex-shrink: 0; width: 1px; margin: 6px 2px; background: var(--alh-line); }
      .cat-filters__manage {
        flex-shrink: 0; width: 34px; border-radius: 999px; border: none; cursor: pointer;
        background: transparent; display: flex; align-items: center; justify-content: center;
      }
      .cat-filters__manage svg { width: 18px; height: 18px; fill: var(--alh-muted); }
      .cat-filters__manage:hover { background: var(--alh-fill); }

      .rezepte__bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 14px 0 10px; }
      .rezepte__count { font-size: 13px; color: var(--alh-muted); }
      .rezepte__sort {
        background: transparent; border: none; color: var(--alh-muted); font-size: 13px; font-family: inherit;
        cursor: pointer; padding: 4px 0; text-align: right; outline: none; color-scheme: dark light;
      }
      .rezepte__sort:hover { color: var(--alh-text); }
      .search__input::-webkit-search-cancel-button { display: none; }
      .search__clear {
        position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
        width: 30px; height: 30px; border-radius: 50%; border: none; cursor: pointer; padding: 0;
        background: transparent; display: flex; align-items: center; justify-content: center;
      }
      .search__clear svg { width: 16px; height: 16px; fill: var(--alh-muted); }
      .search__clear:hover { background: var(--alh-fill); }
      .empty__btn { margin-top: 10px; }

      .recipe-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(155px, 1fr));
        gap: 18px 12px;
      }

      .recipe-card { display: flex; flex-direction: column; gap: 4px; cursor: pointer; min-width: 0; }
      .recipe-card__media {
        position: relative; aspect-ratio: 4/3; border-radius: 12px; overflow: hidden;
        background: var(--alh-fill); margin-bottom: 6px;
        display: flex; align-items: center; justify-content: center;
      }
      .recipe-card__img {
        position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block;
        transition: transform 0.3s ease;
      }
      .recipe-card:hover .recipe-card__img { transform: scale(1.03); }
      .recipe-card__ph { width: 34px; height: 34px; fill: var(--alh-muted); opacity: 0.35; }
      .recipe-card__score { position: absolute; left: 8px; bottom: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.3); }
      .recipe-card__fav {
        position: absolute; top: 8px; right: 8px;
        width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer; padding: 0;
        background: rgba(0,0,0,0.45); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
      }
      .recipe-card__fav svg { width: 18px; height: 18px; fill: #fff; }
      .recipe-card__fav.is-on svg { fill: #FF453A; }
      .recipe-card__plan {
        position: absolute; bottom: 8px; right: 8px;
        width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer; padding: 0;
        background: rgba(0,0,0,0.45); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
      }
      .recipe-card__plan svg { width: 17px; height: 17px; fill: #fff; }
      .recipe-card__plan:hover { background: var(--alh-accent); }
      .recipe-card__title {
        font-size: 15px; font-weight: 600; line-height: 1.3; color: var(--alh-text);
        overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      }
      .recipe-card__meta {
        font-size: 13px; color: var(--alh-muted);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      /* ── Plan search dropdown ── */
      .plan-recipe-search-wrap { }
      .plan-recipe-dropdown {
        margin-top: 4px;
        background: rgba(40,40,42,0.98);
        border: 1px solid rgba(128,128,128,0.2); border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4); overflow: hidden;
      }
      .plan-recipe-option {
        padding: 10px 14px; cursor: pointer;
        display: flex; flex-direction: column; gap: 2px;
        border-bottom: 1px solid rgba(128,128,128,0.08); transition: background 0.1s;
      }
      .plan-recipe-option:last-child { border-bottom: none; }
      .plan-recipe-option:hover { background: rgba(var(--rgb-primary-color,10,132,255),0.1); }
      .plan-recipe-option__title { font-size: 13px; font-weight: 500; color: var(--primary-text-color,currentColor); }
      .plan-recipe-option__meta { font-size: 11px; color: var(--secondary-text-color,currentColor); opacity: 0.55; }
      .plan-recipe-option--empty { cursor: default; color: var(--secondary-text-color,currentColor); opacity: 0.5; font-size: 13px; }
      .plan-recipe-option--empty:hover { background: transparent; }

      .plan-recipe-selected {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: 10px 14px; border-radius: 10px;
        background: rgba(var(--rgb-primary-color,10,132,255),0.08);
        border: 1px solid rgba(var(--rgb-primary-color,10,132,255),0.25);
      }
      .plan-recipe-selected__name {
        font-size: 14px; font-weight: 500;
        color: var(--primary-text-color,currentColor); flex: 1; min-width: 0;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }

      /* ── Einkauf View ── */
      .einkauf { padding: 0 12px 14px; }
      .einkauf__section-label {
        font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
        color: var(--secondary-text-color, currentColor); opacity: 0.5;
        margin-bottom: 6px;
      }

      .plan-select-list { display: flex; flex-direction: column; gap: 4px; }
      .plan-select-item {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 10px; border-radius: 10px;
        border: 1px solid rgba(128,128,128,0.1);
        background: rgba(128,128,128,0.04); gap: 8px;
      }
      .plan-select-item--on {
        border-color: rgba(var(--rgb-primary-color,10,132,255),0.3);
        background: rgba(var(--rgb-primary-color,10,132,255),0.05);
      }
      .plan-select-item__left { display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1; min-width: 0; }
      .plan-select-item__title {
        font-size: 13px; font-weight: 500;
        color: var(--primary-text-color, currentColor);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .plan-select-item__date {
        font-size: 11px; color: var(--secondary-text-color,currentColor); opacity: 0.55;
      }

      .srv-stepper {
        display: flex; align-items: center; gap: 8px;
        background: rgba(128,128,128,0.08); border-radius: 8px; padding: 4px 8px;
        width: fit-content;
      }
      .srv-stepper--sm { padding: 3px 6px; gap: 6px; }
      .srv-btn {
        width: 20px; height: 20px; border-radius: 4px; border: none;
        background: rgba(128,128,128,0.1); cursor: pointer; font-size: 14px;
        color: var(--primary-text-color, currentColor); font-weight: 600;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
      }
      .srv-btn:hover { background: rgba(var(--rgb-primary-color,10,132,255),0.15); }
      .srv-val { font-size: 12px; font-weight: 600; color: var(--primary-text-color,currentColor); white-space: nowrap; }

      .shop-ing-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
      .shop-ing-item {
        padding: 6px 8px; border-radius: 8px;
        transition: background 0.1s;
      }
      .shop-ing-item:hover { background: rgba(128,128,128,0.05); }
      .shop-ing-item__left { display: flex; align-items: center; gap: 10px; cursor: pointer; }
      .shop-ing-item__label {
        font-size: 13px; color: var(--primary-text-color, currentColor);
      }
      .shop-ing-item--off { opacity: 0.35; text-decoration: line-through; }

      .einkauf__actions { margin-top: 12px; display: flex; justify-content: flex-end; }
      .shop-success {
        display: flex; align-items: center; gap: 6px;
        color: #32D74B; font-size: 13px; font-weight: 600; padding: 8px 0;
      }
      .shop-success svg { width: 18px; height: 18px; fill: #32D74B; }
      .shop-hint { margin-top: 12px; font-size: 13px; color: var(--alh-muted); display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
      .shop-hint .btn--text { color: var(--alh-accent); padding: 0; }
      .settings__hint { margin: 6px 0 0; font-size: 12px; line-height: 1.45; color: var(--alh-muted); }
      .pick-head { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; font-size: 14px; font-weight: 600; color: var(--alh-text); }
      .detail-ing-list.is-pick .detail-ing-item { grid-template-columns: 22px 96px 1fr; cursor: pointer; user-select: none; }
      .detail-ing-list.is-pick .detail-ing-item:not(.is-on) { opacity: 0.45; }
      .pick-box {
        width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--alh-fill-2);
        display: flex; align-items: center; justify-content: center; box-sizing: border-box; align-self: center;
      }
      .is-on .pick-box { background: var(--alh-accent); border-color: var(--alh-accent); }
      .pick-box svg { width: 14px; height: 14px; fill: #fff; }
      .pick-actions { display: flex; gap: 8px; margin-top: 12px; }
      .pick-actions .btn--primary { flex: 1; }
      .pick-actions .btn:disabled { opacity: 0.5; cursor: default; }
      .shop-error {
        margin-top: 8px; font-size: 13px; line-height: 1.4;
        color: var(--error-color, #f44336);
      }

      /* ── Form Modal Overlay ── */
      .form-overlay {
        position: absolute; inset: 0; z-index: 9999;
        background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
        animation: fadeIn 0.18s ease;
        border-radius: inherit;
      }
      .form-modal {
        background: var(--ha-card-background, #1c1c1e);
        border-radius: 20px; overflow-y: auto; overscroll-behavior: contain;
        width: 100%; max-width: 540px; max-height: 100%;
        box-shadow: 0 24px 64px rgba(0,0,0,0.6);
        animation: slideUp 0.22s ease;
        padding: 14px 14px 24px;
        flex-shrink: 0;
      }

      /* ── Panel (shared by recipe-form + plan-form interior) ── */
      .panel__header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 14px;
        font-size: 15px; font-weight: 600;
        color: var(--primary-text-color, currentColor);
      }
      .panel__divider {
        display: flex; align-items: center; gap: 10px;
        margin: 10px 0 8px; font-size: 11px;
        color: var(--secondary-text-color,currentColor); opacity: 0.4;
      }
      .panel__divider::before, .panel__divider::after {
        content: ''; flex: 1; height: 1px; background: rgba(128,128,128,0.2);
      }

      .form__section-label {
        font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
        color: var(--secondary-text-color, currentColor); opacity: 0.5;
        margin: 12px 0 6px;
      }
      .form__section-label:first-of-type { margin-top: 0; }
      .form__hint { text-transform: none; letter-spacing: 0; font-weight: 500; margin-left: 4px; opacity: 0.8; }

      .form__input {
        width: 100%; box-sizing: border-box;
        background: rgba(128,128,128,0.08);
        border: 1px solid rgba(128,128,128,0.15); border-radius: 10px;
        padding: 10px 14px; font-size: 14px; font-family: inherit;
        color: var(--primary-text-color, currentColor); outline: none;
        transition: border-color 0.15s;
      }
      .form__input::placeholder { color: var(--secondary-text-color, currentColor); opacity: 0.4; }
      .form__input:focus { border-color: var(--primary-color, #0A84FF); }
      .form__input--sm { padding: 7px 10px; font-size: 13px; width: auto; }
      .form__title-input { margin-bottom: 4px; }

      .form__select {
        background: rgba(128,128,128,0.08);
        border: 1px solid rgba(128,128,128,0.15); border-radius: 10px;
        padding: 7px 10px; font-size: 13px; font-family: inherit;
        color: var(--primary-text-color, currentColor); outline: none; cursor: pointer;
      }
      .form__select--full { width: 100%; box-sizing: border-box; padding: 10px 14px; font-size: 14px; }

      .form__note, .import-paste-textarea, .step-input {
        width: 100%; box-sizing: border-box;
        background: rgba(128,128,128,0.08);
        border: 1px solid rgba(128,128,128,0.15); border-radius: 10px;
        padding: 10px 14px; font-size: 13px; font-family: inherit; line-height: 1.5;
        color: var(--primary-text-color, currentColor); outline: none; resize: vertical;
        transition: border-color 0.15s;
      }
      .form__note::placeholder, .import-paste-textarea::placeholder, .step-input::placeholder { color: var(--secondary-text-color, currentColor); opacity: 0.4; }
      .form__note:focus, .import-paste-textarea:focus, .step-input:focus { border-color: var(--primary-color, #0A84FF); }

      .form__actions {
        display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; align-items: center;
        position: sticky; bottom: -24px; margin-bottom: -24px; padding: 12px 0 20px;
        background: var(--alh-bg); border-top: 1px solid var(--alh-line);
      }

      /* ── Picker / Pills ── */
      .picker--grid { display: flex; flex-wrap: wrap; gap: 6px; }
      .pill {
        padding: 7px 13px; border-radius: 999px; border: none;
        background: var(--alh-fill); color: var(--alh-text);
        font-size: 13px; font-weight: 500; font-family: inherit;
        cursor: pointer; transition: background 0.15s; white-space: nowrap;
        display: inline-flex; align-items: center; gap: 4px;
      }
      .pill:hover { background: var(--alh-fill-2); }
      .pill svg { width: 14px; height: 14px; fill: currentColor; margin-left: -2px; }
      .pill--on, .pill--on:hover { background: var(--alh-text); color: var(--alh-bg); }

      /* Nutri-Score pills */
      .nutri-pill--A.pill--on { background: #038141; color: #fff; }
      .nutri-pill--B.pill--on { background: #85BB2F; color: #fff; }
      .nutri-pill--C.pill--on { background: #FECB02; color: #1a1a1a; }
      .nutri-pill--D.pill--on { background: #EE8100; color: #fff; }
      .nutri-pill--E.pill--on { background: #E63312; color: #fff; }

      /* ── Ingredient list ── */
      .ing-list { list-style: none; margin: 0 0 6px; padding: 0; display: flex; flex-direction: column; gap: 3px; }
      .ing-item {
        display: flex; align-items: center; justify-content: space-between; gap: 8px;
        padding: 5px 8px; border-radius: 8px; background: rgba(128,128,128,0.05);
      }
      .ing-item__text { font-size: 13px; color: var(--primary-text-color,currentColor); flex: 1; min-width: 0; word-break: break-word; }

      .ing-add-row {
        display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 4px;
      }
      .ing-add__name   { flex: 1; min-width: 90px; }
      .ing-add__amount { width: 70px; flex-shrink: 0; }
      .ing-add__unit   { width: 90px; flex-shrink: 0; }
      .ing-item--editing { outline: 1px solid var(--alh-accent); }

      .form__row { display: flex; gap: 24px; flex-wrap: wrap; }
      .form__time-wrap { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--alh-muted); margin-top: 4px; }
      .form__time { width: 72px; }
      .step-list { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
      .step-edit { display: grid; grid-template-columns: 24px 1fr 24px; gap: 8px; align-items: start; }
      .step-edit__num {
        width: 24px; height: 24px; border-radius: 50%; margin-top: 8px;
        background: var(--alh-fill-2); color: var(--alh-text);
        display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;
      }
      .step-edit .icon-btn { margin-top: 8px; }
      .step-input { field-sizing: content; min-height: 4.5em; resize: none; }
      .form__src { width: 100%; }

      /* Header "+" menu */
      .add-menu-wrap { position: relative; }
      .add-menu {
        position: absolute; right: 0; top: calc(100% + 6px); z-index: 50; min-width: 210px;
        background: var(--alh-bg); border: 1px solid var(--alh-line); border-radius: 12px;
        box-shadow: 0 12px 32px rgba(0,0,0,0.35); padding: 4px; animation: fadeIn 0.12s ease;
      }
      .add-menu__item {
        display: flex; align-items: center; gap: 10px; width: 100%;
        padding: 10px 12px; border: none; border-radius: 8px; background: transparent; cursor: pointer;
        font-size: 14px; font-family: inherit; color: var(--alh-text); text-align: left;
      }
      .add-menu__item:hover { background: var(--alh-fill); }
      .add-menu__item svg { width: 18px; height: 18px; fill: var(--alh-muted); }

      /* ── Servings in recipe form ── */
      .srv-stepper { margin-top: 4px; }

      /* ── Import ── */
      .import-row {
        display: flex; gap: 8px; margin-bottom: 4px; align-items: center;
      }
      .import__url { flex: 1; margin-bottom: 0; }
      .import-hint {
        font-size: 12px; color: #32D74B; padding: 4px 2px; margin-bottom: 2px;
      }
      .import-error {
        font-size: 12px; color: var(--error-color, #f44336); padding: 4px 2px; margin-bottom: 2px;
      }
      .import-paste-hint {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        font-size: 12px; color: var(--secondary-text-color, currentColor); opacity: 0.75;
        margin-bottom: 4px;
      }
      .import-paste-wrap {
        background: rgba(128,128,128,0.06); border-radius: 10px;
        padding: 10px 12px; margin-bottom: 4px;
        display: flex; flex-direction: column; gap: 6px;
      }
      .import-paste-instructions {
        font-size: 12px; line-height: 1.6; margin: 0;
        color: var(--secondary-text-color, currentColor); opacity: 0.8;
      }
      .import-paste-instructions code {
        background: rgba(128,128,128,0.15); border-radius: 4px;
        padding: 1px 5px; font-size: 11px;
      }
      .import-paste-textarea { min-height: 80px; font-size: 11px; font-family: monospace; }

      /* ── Image Upload ── */
      .img-input-row {
        display: flex; gap: 8px; align-items: center; margin-bottom: 8px;
      }
      .img-input-row .form__img-url { flex: 1; }
      .img-upload-label { cursor: pointer; flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px; }
      .img-upload-label svg { width: 14px; height: 14px; fill: currentColor; }
      .img-preview-wrap {
        display: flex; flex-direction: column; align-items: flex-start;
        margin-bottom: 8px;
      }
      .img-preview {
        max-width: 100%; max-height: 160px; border-radius: 8px; object-fit: cover;
        border: 1px solid rgba(128,128,128,0.2);
      }

      /* ── JSON Import ── */
      .json-import__textarea {
        width: 100%; box-sizing: border-box;
        background: rgba(128,128,128,0.07); border: 1px solid rgba(128,128,128,0.2);
        border-radius: 8px; padding: 10px; resize: vertical;
        font-size: 11px; font-family: monospace; line-height: 1.5;
        color: var(--primary-text-color,currentColor);
        min-height: 160px;
      }
      .json-import__textarea:focus { outline: none; border-color: var(--primary-color,#0A84FF); }
      .json-import__example {
        margin-top: 10px; font-size: 12px;
        color: var(--secondary-text-color,currentColor); opacity: 0.7;
      }
      .json-import__example summary { cursor: pointer; padding: 4px 0; }
      .json-import__pre {
        margin: 8px 0 0; padding: 10px;
        background: rgba(128,128,128,0.08); border-radius: 6px;
        font-size: 11px; font-family: monospace; line-height: 1.5;
        overflow-x: auto; white-space: pre;
        color: var(--primary-text-color,currentColor);
      }

      /* ── Nutri hint ── */
      .nutri-hint {
        display: flex; align-items: center; gap: 8px;
        font-size: 12px; color: var(--secondary-text-color,currentColor); opacity: 0.75;
        margin-bottom: 6px;
      }

      /* ── Checkboxes ── */
      input[type="checkbox"] {
        width: 16px; height: 16px; flex-shrink: 0; cursor: pointer;
        accent-color: var(--primary-color, #0A84FF);
      }

      @media (prefers-color-scheme: dark) {
        .form__select, .plan-form__date { color-scheme: dark; }
      }

      /* ── Recipe Detail Overlay ── */
      .detail-backdrop {
        position: absolute; inset: 0; z-index: 9999;
        background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
        animation: fadeIn 0.18s ease;
        border-radius: inherit;
      }
      @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

      .detail-modal {
        background: var(--alh-bg);
        border-radius: 20px; overflow: hidden;
        width: 100%; max-width: 600px; max-height: 100%;
        display: flex; flex-direction: column;
        box-shadow: 0 24px 64px rgba(0,0,0,0.5);
        animation: slideUp 0.2s ease;
        position: relative;
      }
      @keyframes slideUp { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

      .detail-scroll { overflow-y: auto; flex: 1; min-height: 0; overscroll-behavior: contain; }
      .detail-img-wrap { aspect-ratio: 16/9; }
      .detail-img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .detail-close {
        position: absolute; top: 12px; right: 12px; z-index: 2;
        width: 34px; height: 34px; border-radius: 50%; border: none; padding: 0; cursor: pointer;
        background: rgba(0,0,0,0.45); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
      }
      .detail-close svg { width: 18px; height: 18px; fill: #fff; }

      .detail-body { padding: 20px 22px 24px; display: flex; flex-direction: column; }
      .detail-body--no-img { padding-top: 22px; }
      .detail-body--no-img .detail-eyebrow, .detail-body--no-img .detail-title { padding-right: 44px; }
      .detail-eyebrow {
        font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
        color: var(--alh-muted); margin-bottom: 6px;
      }
      .detail-title {
        font-size: 24px; font-weight: 700; line-height: 1.2; margin: 0; letter-spacing: -0.01em;
        color: var(--alh-text);
      }
      .detail-facts {
        display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 12px;
        font-size: 14px; color: var(--alh-muted);
      }
      .detail-fact { display: inline-flex; align-items: center; gap: 6px; }
      .detail-text { font-size: 15px; line-height: 1.55; margin: 14px 0 0; color: var(--alh-text); }
      .detail-text--muted { color: var(--alh-muted); font-size: 14px; margin-top: 6px; }
      .detail-outro { margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--alh-line); }

      .detail-section { margin-top: 26px; }
      .detail-section__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .detail-h3 { font-size: 18px; font-weight: 700; margin: 0; color: var(--alh-text); }
      .detail-srv {
        display: flex; align-items: center; gap: 2px;
        background: var(--alh-fill); border-radius: 999px; padding: 3px;
      }
      .detail-srv__btn {
        width: 30px; height: 30px; border-radius: 50%; border: none; cursor: pointer;
        background: transparent; color: var(--alh-text); font-size: 18px; line-height: 1; font-family: inherit;
      }
      .detail-srv__btn:hover:not(:disabled) { background: var(--alh-fill-2); }
      .detail-srv__btn:disabled { opacity: 0.3; cursor: default; }
      .detail-srv__val { font-size: 14px; font-weight: 600; color: var(--alh-text); min-width: 92px; text-align: center; }

      .detail-ing-list { list-style: none; margin: 10px 0 0; padding: 0; }
      .detail-ing-item {
        display: grid; grid-template-columns: 96px 1fr; gap: 12px; align-items: baseline;
        padding: 10px 0; border-bottom: 1px solid var(--alh-line);
      }
      .detail-ing-item:last-child { border-bottom: none; }
      .detail-ing-amount { font-size: 15px; font-weight: 600; color: var(--alh-text); font-variant-numeric: tabular-nums; }
      .detail-ing-name { font-size: 15px; color: var(--alh-text); }

      .detail-steps { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
      .detail-step { display: grid; grid-template-columns: 28px 1fr; gap: 12px; align-items: start; }
      .detail-step__num {
        width: 28px; height: 28px; border-radius: 50%;
        background: var(--alh-text); color: var(--alh-bg);
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; font-weight: 700;
      }
      .detail-step__text { margin: 3px 0 0; font-size: 15px; line-height: 1.55; color: var(--alh-text); }

      .detail-footer {
        display: flex; align-items: center; gap: 8px; flex-shrink: 0;
        padding: 12px 16px; border-top: 1px solid var(--alh-line); background: var(--alh-bg);
      }
      .detail-footer__main { margin-left: auto; padding-left: 22px; padding-right: 22px; }
      .detail-footer__info { display: flex; flex-direction: column; font-size: 14px; font-weight: 600; color: var(--alh-text); }
      .detail-footer__sub { font-size: 12px; font-weight: 400; color: var(--alh-muted); }
      .detail-fav.is-on svg { fill: #FF453A; opacity: 1; }
      .detail-fact svg { width: 16px; height: 16px; fill: currentColor; }
      .detail-shop-btn { width: 100%; margin-top: 12px; }
      .detail-shop-btn:disabled { opacity: 0.7; cursor: default; }
      .detail-section__head .btn svg { width: 15px; height: 15px; }
      .detail-src {
        display: inline-flex; align-items: center; gap: 6px; margin-top: 10px;
        font-size: 14px; font-weight: 600; color: var(--alh-accent); text-decoration: none;
      }
      .detail-src svg { width: 15px; height: 15px; fill: currentColor; }
      .detail-src:hover { text-decoration: underline; }

      /* Cook mode: tap ingredients/steps to tick them off */
      .is-cook .detail-ing-item, .is-cook .detail-step { cursor: pointer; transition: opacity 0.15s; user-select: none; }
      .is-cook .detail-ing-item.is-done, .is-cook .detail-step.is-done { opacity: 0.35; }
      .is-cook .detail-ing-item.is-done .detail-ing-name, .is-cook .detail-step.is-done .detail-step__text { text-decoration: line-through; }
      .is-cook .detail-step__text { font-size: 17px; }
      .is-cook .detail-step.is-current .detail-step__num { background: var(--alh-accent); color: #fff; }
      .is-cook .detail-step.is-current { background: var(--alh-fill); margin: -10px -12px; padding: 10px 12px; border-radius: 12px; }

      /* No entry animation when an already-open overlay re-renders */
      .card.no-anim .detail-backdrop, .card.no-anim .detail-modal,
      .card.no-anim .form-overlay, .card.no-anim .form-modal { animation: none; }
      .detail-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
      .detail-change-wrap { display: flex; flex-direction: column; gap: 10px; margin-top: 24px; }

      /* ── Manage Categories ── */
      .cat-manage-list { display: flex; flex-direction: column; gap: 4px; }
      .cat-manage-item {
        display: flex; align-items: center; gap: 8px; padding: 9px 10px;
        background: rgba(128,128,128,0.05); border-radius: 10px;
        border: 1px solid rgba(128,128,128,0.1);
      }
      .cat-manage-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
      .cat-manage-label { font-size: 13px; font-weight: 500; color: var(--primary-text-color,currentColor); flex: 1; }
      .cat-manage-count { font-size: 11px; color: var(--secondary-text-color,currentColor); opacity: 0.55; white-space: nowrap; }
      .cat-manage-fixed { font-size: 11px; color: var(--secondary-text-color,currentColor); opacity: 0.35; margin-left: auto; }
      .cat-filters__manage { flex-shrink: 0; }
      .cat-add-row { display: flex; gap: 8px; align-items: center; }
      .cat-add__label { flex: 1; min-width: 0; }
    `;
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

customElements.define('alh-meal-card', AlhMealCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type:        'alh-meal-card',
  name:        'Alltagshelfer Meal Card',
  description: 'Mahlzeitenplaner mit Rezeptverwaltung, Wochenplan und Bring!-Integration.',
});
