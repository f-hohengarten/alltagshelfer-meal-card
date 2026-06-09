// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { v: 'pasta',       l: 'Pasta' },
  { v: 'salat',       l: 'Salate' },
  { v: 'fleisch',     l: 'Fleisch' },
  { v: 'vegetarisch', l: 'Vegetarisch' },
  { v: 'suppe',       l: 'Suppen' },
  { v: 'snack',       l: 'Snacks' },
  { v: 'dessert',     l: 'Desserts' },
  { v: 'sonstiges',   l: 'Sonstiges' },
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
  const meta  = { cat: 'sonstiges', score: '', srv: 4, note: '', img: '', ingredients: [] };
  if (imgBlockMatch) meta.img = imgBlockMatch[1];
  if (mHead) {
    mHead[1].split(';').forEach(p => {
      const i = p.indexOf(':');
      if (i > 0) meta[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    });
    meta.srv = parseInt(meta.srv) || 4;
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

function encodeRecipeMeta({ cat, score, srv, note, ingredients, img }) {
  const parts = [`cat:${cat || 'sonstiges'}`, `srv:${srv || 4}`];
  if (score) parts.push(`score:${score}`);
  // Only HTTP/HTTPS URLs go into the header; data URLs use the [IMG] block below
  if (img && !img.startsWith('data:')) parts.push(`img:${img}`);
  const head = `[ALH ${parts.join(';')}]`;
  const ingStr = (ingredients || [])
    .filter(i => i.name)
    .map(i => `${i.name}:${i.amount || ''}:${i.unit || ''}`)
    .join(',');
  const noteStr = (note || '').trim();
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

    this._view          = localStorage.getItem('alh-meal-view') || 'woche';
    this._weekOffset    = 0;
    this._catFilter     = 'all';
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
    this._detailChanging  = false;
    this._detailChangeSearch = '';
    this._jsonImportMode  = false;
    this._jsonImportText  = '';
    this._jsonImportError = '';
    this._jsonImportCount = 0;
  }

  _blankRecipeForm() {
    return {
      open: false, uid: null,
      title: '', cat: 'pasta', score: '', srv: 4, note: '', img: '',
      ingredients: [],
      _ingName: '', _ingAmount: '', _ingUnit: 'g',
      _importUrl: '',
    };
  }

  _blankPlanForm() {
    return { open: false, dayIso: '', recipeUid: '', srv: 4, slot: 'mittag' };
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
    if (this._hass && this._config.recipe_entity && this._unsubFns.length === 0) {
      this._subscribe();
    }
  }

  disconnectedCallback() {
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
      this._recipes = result.response?.[this._config.recipe_entity]?.items ?? [];
    } catch (e) {
      console.error('[alh-meal-card] fetchRecipes:', e);
      this._recipes = this._hass.states[this._config.recipe_entity]?.attributes?.items ?? [];
    }
    this._render();
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

    this.shadowRoot.innerHTML = `
      <style>${this._css()}</style>
      <div class="card">
        ${this._renderHeader()}
        ${this._renderViewTabs()}
        ${this._view === 'woche'   ? this._renderWoche()   : ''}
        ${this._view === 'rezepte' ? this._renderRezepte() : ''}
        ${this._view === 'einkauf' ? this._renderEinkauf() : ''}
        ${this._recipeDetail ? this._renderRecipeDetailOverlay() : ''}
        ${this._activePanel === 'recipe-form'  ? this._renderRecipeForm()  : ''}
        ${this._activePanel === 'plan-form'    ? this._renderPlanForm()    : ''}
        ${this._activePanel === 'json-import'  ? this._renderJsonImport()  : ''}
      </div>
    `;
    this._bind();
    this._restoreFocus();
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
          ${canAdd ? `
            <button class="icon-btn" data-action="open-json-import" aria-label="JSON Import" title="Rezepte per JSON importieren">
              <svg viewBox="0 0 24 24"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
            </button>
            <button class="add-btn" data-action="open-create-recipe" aria-label="Rezept anlegen">
              <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </button>
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
    const filtered = this._filteredRecipes();
    return `
      <div class="rezepte">
        <div class="search-row">
          <input class="search__input" type="search" placeholder="Rezept oder Zutat suchen…" value="${x(this._searchQuery)}" autocomplete="off" />
        </div>
        <div class="cat-filters">
          <button class="cat-pill${this._catFilter === 'all' ? ' cat-pill--active' : ''}" data-cat="all">Alle</button>
          ${CATEGORIES.map(c => `
            <button class="cat-pill${this._catFilter === c.v ? ' cat-pill--active' : ''}" data-cat="${c.v}">${c.l}</button>
          `).join('')}
        </div>
        ${filtered.length === 0 ? `
          <div class="empty">Keine Rezepte gefunden.<br>Tippe auf + um ein Rezept anzulegen.</div>
        ` : `
          <div class="recipe-grid">
            ${filtered.map(r => this._renderRecipeCard(r)).join('')}
          </div>
        `}
      </div>
    `;
  }

  _filteredRecipes() {
    let items = this._recipes.filter(r => r.status !== 'completed');
    if (this._catFilter !== 'all') {
      items = items.filter(r => parseRecipeMeta(r.description).cat === this._catFilter);
    }
    if (this._searchQuery.trim()) {
      const q = this._searchQuery.toLowerCase();
      items = items.filter(r => {
        if (r.summary.toLowerCase().includes(q)) return true;
        const meta = parseRecipeMeta(r.description);
        return meta.ingredients.some(i => i.name.toLowerCase().includes(q));
      });
    }
    return items;
  }

  _renderRecipeCard(recipe) {
    const meta     = parseRecipeMeta(recipe.description);
    const score    = meta.score;
    const catLabel = CATEGORIES.find(c => c.v === meta.cat)?.l ?? meta.cat;
    return `
      <div class="recipe-card" data-action="open-detail" data-recipe-uid="${x(recipe.uid)}">
        ${meta.img ? `
          <div class="recipe-card__img-wrap">
            <img class="recipe-card__img" src="${x(meta.img)}" alt="" loading="lazy"
              onerror="this.closest('.recipe-card__img-wrap').style.display='none'" />
            <div class="recipe-card__img-overlay">
              <span class="cat-badge cat-badge--${x(meta.cat)}">${x(catLabel)}</span>
              ${score ? `<span class="nutri-badge" style="background:${nutriColor(score)};color:${nutriTextColor(score)}">${score}</span>` : ''}
            </div>
            <button class="recipe-card__edit icon-btn icon-btn--sm" data-action="edit-recipe" data-recipe-uid="${x(recipe.uid)}" aria-label="Bearbeiten">
              <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="recipe-card__del icon-btn icon-btn--sm" data-action="delete-recipe-direct" data-recipe-uid="${x(recipe.uid)}" data-recipe-title="${x(recipe.summary)}" aria-label="Löschen">
              <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        ` : `
          <div class="recipe-card__top">
            <div class="recipe-card__badges">
              <span class="cat-badge cat-badge--${x(meta.cat)}">${x(catLabel)}</span>
              ${score ? `<span class="nutri-badge" style="background:${nutriColor(score)};color:${nutriTextColor(score)}">${score}</span>` : ''}
            </div>
            <div style="display:flex;gap:4px">
              <button class="icon-btn icon-btn--sm" data-action="delete-recipe-direct" data-recipe-uid="${x(recipe.uid)}" data-recipe-title="${x(recipe.summary)}" aria-label="Löschen">
                <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
              <button class="icon-btn icon-btn--sm" data-action="edit-recipe" data-recipe-uid="${x(recipe.uid)}" aria-label="Bearbeiten">
                <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              </button>
            </div>
          </div>
        `}
        <div class="recipe-card__body">
          <div class="recipe-card__title">${x(recipe.summary)}</div>
          <div class="recipe-card__meta">
            <span class="recipe-card__srv">
              <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
              ${meta.srv} Pers.
            </span>
            ${meta.ingredients.length > 0 ? `<span class="recipe-card__ings">${meta.ingredients.length} Zutaten</span>` : ''}
          </div>
          <div class="recipe-card__actions">
            <button class="btn btn--primary btn--sm" data-action="plan-recipe" data-recipe-uid="${x(recipe.uid)}">
              <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>
              Einplanen
            </button>
          </div>
        </div>
      </div>
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
            ${this._config.shopping_entity ? `
              <div class="einkauf__actions">
                ${this._shopSuccess ? `
                  <div class="shop-success">
                    <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    Zur Einkaufsliste hinzugefügt!
                  </div>
                ` : `
                  <button class="btn btn--primary" data-action="send-shopping">
                    <svg viewBox="0 0 24 24"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
                    Zur Einkaufsliste hinzufügen
                  </button>
                `}
              </div>
            ` : ''}
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
    const catLabel = CATEGORIES.find(c => c.v === meta.cat)?.l ?? meta.cat;
    return `
      <div class="detail-backdrop" data-action="close-detail">
        <div class="detail-modal" role="dialog">
          ${meta.img ? `
            <div class="detail-img-wrap">
              <img class="detail-img" src="${x(meta.img)}" alt="" draggable="false"
                onerror="this.closest('.detail-img-wrap').style.display='none'" />
              <div class="detail-img-overlay">
                <span class="cat-badge cat-badge--${x(meta.cat)}">${x(catLabel)}</span>
                ${meta.score ? `<span class="nutri-badge" style="background:${nutriColor(meta.score)};color:${nutriTextColor(meta.score)}">${meta.score}</span>` : ''}
              </div>
            </div>
          ` : `
            <div class="detail-no-img">
              <span class="cat-badge cat-badge--${x(meta.cat)}">${x(catLabel)}</span>
              ${meta.score ? `<span class="nutri-badge" style="background:${nutriColor(meta.score)};color:${nutriTextColor(meta.score)}">${meta.score}</span>` : ''}
            </div>
          `}

          <button class="detail-close icon-btn" data-action="close-detail" aria-label="Schließen">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>

          <div class="detail-body">
            <h2 class="detail-title">${x(recipe.summary)}</h2>
            <div class="detail-meta-row">
              <span class="detail-meta-item">
                <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                ${meta.srv} Portionen
              </span>
              ${meta.ingredients.length > 0 ? `
                <span class="detail-meta-item">${meta.ingredients.length} Zutaten</span>
              ` : ''}
            </div>

            ${meta.note ? `<p class="detail-note">${x(meta.note)}</p>` : ''}

            ${meta.ingredients.length > 0 ? `
              <div class="detail-section-label">Zutaten</div>
              <ul class="detail-ing-list">
                ${meta.ingredients.map(ing => `
                  <li class="detail-ing-item">
                    <span class="detail-ing-amount">${x(ing.amount)} ${x(ing.unit)}</span>
                    <span class="detail-ing-name">${x(ing.name)}</span>
                  </li>
                `).join('')}
              </ul>
            ` : ''}

            ${this._detailChanging ? `
              <div class="detail-change-wrap">
                <div class="detail-section-label">Anderes Rezept wählen</div>
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
                        const catL = CATEGORIES.find(c => c.v === m.cat)?.l ?? m.cat;
                        return `<div class="detail-change-option plan-recipe-option" data-recipe-uid="${x(r.uid)}">
                          <span class="plan-recipe-option__title">${x(r.summary)}</span>
                          <span class="plan-recipe-option__meta">${x(catL)} · ${m.srv} Pers.</span>
                        </div>`;
                      }).join('')}
                    </div>`;
                  })()}
                </div>
                <div class="detail-actions" style="margin-top:8px">
                  <button class="btn btn--ghost" data-action="toggle-detail-change">Abbrechen</button>
                </div>
              </div>
            ` : `
              <div class="detail-actions">
                ${this._detailPlanUid ? `
                  <button class="btn btn--danger" data-action="remove-from-plan" style="margin-right:auto">
                    <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    Aus Planung entfernen
                  </button>
                ` : `
                  <button class="btn btn--danger" data-action="delete-recipe-direct" data-recipe-uid="${x(recipe.uid)}" data-recipe-title="${x(recipe.summary)}">
                    <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    Löschen
                  </button>
                `}
                <button class="btn btn--ghost" data-action="edit-recipe" data-recipe-uid="${x(recipe.uid)}">
                  <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                  Bearbeiten
                </button>
                ${this._detailPlanUid ? `
                  <button class="btn btn--primary" data-action="toggle-detail-change">
                    <svg viewBox="0 0 24 24"><path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/></svg>
                    Gericht ändern
                  </button>
                ` : `
                  <button class="btn btn--primary" data-action="plan-recipe" data-recipe-uid="${x(recipe.uid)}">
                    <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>
                    Einplanen
                  </button>
                `}
              </div>
            `}
          </div>
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
      return { ...ing, amount: amt, label: `${amt} ${ing.unit} ${ing.name}` };
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

        <div class="form__section-label">Kategorie</div>
        <div class="picker picker--grid">
          ${CATEGORIES.map(c => `
            <button class="pill${f.cat === c.v ? ' pill--on' : ''}" data-cat="${c.v}">${c.l}</button>
          `).join('')}
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

        <div class="form__section-label">Portionen</div>
        <div class="srv-stepper">
          <button class="srv-btn" data-action="recipe-srv-minus">−</button>
          <span class="srv-val">${f.srv}</span>
          <button class="srv-btn" data-action="recipe-srv-plus">+</button>
        </div>

        <div class="form__section-label">Zutaten</div>
        ${f.ingredients.length > 0 ? `
          <ul class="ing-list">
            ${f.ingredients.map((ing, idx) => `
              <li class="ing-item">
                <span class="ing-item__text">${x(ing.amount)} ${x(ing.unit)} ${x(ing.name)}</span>
                <button class="icon-btn icon-btn--sm" data-action="del-ing" data-idx="${idx}" aria-label="Entfernen">
                  <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
              </li>
            `).join('')}
          </ul>
        ` : ''}
        <div class="ing-add-row">
          <input class="ing-add__name form__input form__input--sm" type="text" placeholder="Zutat" value="${x(f._ingName)}" autocomplete="off" />
          <input class="ing-add__amount form__input form__input--sm" type="number" placeholder="Menge" value="${x(f._ingAmount)}" min="0" step="any" />
          <select class="ing-add__unit form__select">
            ${UNITS.map(u => `<option value="${u}"${f._ingUnit === u ? ' selected' : ''}>${u}</option>`).join('')}
          </select>
          <button class="btn btn--ghost btn--sm" data-action="add-ing">+</button>
        </div>

        <div class="form__section-label">Notiz (optional)</div>
        <textarea class="form__note" placeholder="Kurze Beschreibung oder Tipps…" rows="2">${x(f.note)}</textarea>

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
                    const catL = CATEGORIES.find(c => c.v === m.cat)?.l ?? m.cat;
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
        cat: 'pasta',
        score: 'C',
        srv: 4,
        note: 'Klassiker mit Hackfleisch-Tomaten-Sauce',
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
          Erlaubte Kategorien: <code>${CATEGORIES.map(c => c.v).join(', ')}</code>.
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

    // Header add recipe
    const addBtn = root.querySelector('[data-action="open-create-recipe"]');
    if (addBtn) addBtn.addEventListener('click', () => this._openCreateRecipe());

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
        if (e.target.closest('[data-action="edit-recipe"],[data-action="plan-recipe"],[data-action="delete-recipe-direct"]')) return;
        this._recipeDetail = el.dataset.recipeUid;
        this._detailPlanUid = null;
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
        this._recipeDetail = recipeUid;
        this._detailPlanUid = el.dataset.planUid;
        this._detailChanging = false;
        this._detailChangeSearch = '';
        this._render();
      });
    });

    root.querySelectorAll('[data-action="close-detail"]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target !== el && !el.classList.contains('detail-close')) return;
        this._recipeDetail = null;
        this._detailPlanUid = null;
        this._detailChanging = false;
        this._detailChangeSearch = '';
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
      el.addEventListener('click', () => {
        this._recipeDetail = null;
        this._openPlanForm('', el.dataset.recipeUid);
      });
    });

    // Delete recipe directly (with confirmation)
    root.querySelectorAll('[data-action="delete-recipe-direct"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const title = el.dataset.recipeTitle || 'dieses Rezept';
        if (!confirm(`„${title}" wirklich löschen?`)) return;
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
          this._recipeForm.cat = el.dataset.cat;
        } else {
          this._catFilter = el.dataset.cat;
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
        this._recipeForm.ingredients.splice(parseInt(el.dataset.idx), 1);
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
    if (deleteRecipe) deleteRecipe.addEventListener('click', () => this._deleteRecipe(this._recipeForm.uid));

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
        this._render();
        // Restore focus after re-render
        setTimeout(() => {
          const el = this.shadowRoot.querySelector('.plan-recipe-search');
          if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
        }, 0);
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
    this._recipeForm = {
      open: true, uid,
      title: recipe.summary,
      cat:   meta.cat || 'sonstiges',
      score: meta.score || '',
      srv:   meta.srv || 4,
      note:  meta.note || '',
      img:   meta.img || '',
      ingredients: [...meta.ingredients],
      _ingName: '', _ingAmount: '', _ingUnit: 'g',
    };
    this._activePanel = 'recipe-form';
    this._render();
  }

  _openPlanForm(dayIso, recipeUid = '', slot = 'mittag') {
    let srv = 4;
    if (recipeUid) {
      const r = this._recipes.find(r => r.uid === recipeUid);
      if (r) srv = parseRecipeMeta(r.description).srv || 4;
    }
    this._planForm    = { open: true, dayIso: dayIso || isoToday(), recipeUid, srv, slot };
    this._planSearch  = '';
    this._activePanel = 'plan-form';
    this._render();
  }

  _addIngredient() {
    const nameEl = this.shadowRoot.querySelector('.ing-add__name');
    const amtEl  = this.shadowRoot.querySelector('.ing-add__amount');
    const unitEl = this.shadowRoot.querySelector('.ing-add__unit');
    const name   = (nameEl?.value ?? this._recipeForm._ingName).trim();
    if (!name) return;
    this._recipeForm.ingredients.push({
      name,
      amount: (amtEl?.value ?? this._recipeForm._ingAmount).trim(),
      unit:   (unitEl?.value ?? this._recipeForm._ingUnit) || 'g',
    });
    this._recipeForm._ingName   = '';
    this._recipeForm._ingAmount = '';
    this._recipeForm._ingUnit   = unitEl?.value || 'g';
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

    const { uid, cat, score, srv, note, ingredients, img } = this._recipeForm;
    const desc = encodeRecipeMeta({ cat, score, srv, note, ingredients, img });

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

    const validCats = CATEGORIES.map(c => c.v);
    let count = 0;
    const errors = [];

    for (const [i, r] of recipes.entries()) {
      const title = String(r.title ?? '').trim();
      if (!title) { errors.push(`Eintrag ${i + 1}: "title" fehlt.`); continue; }

      const cat   = validCats.includes(r.cat) ? r.cat : 'sonstiges';
      const score = 'ABCDE'.includes(String(r.score ?? '').toUpperCase())
        ? String(r.score).toUpperCase() : '';
      const srv   = parseInt(r.srv) || 4;
      const note  = String(r.note ?? '').trim();
      const img   = String(r.img ?? '').trim();

      const ingredients = Array.isArray(r.ingredients)
        ? r.ingredients.map(ing => ({
            name:   String(ing.name ?? '').trim(),
            amount: String(ing.amount ?? ''),
            unit:   String(ing.unit ?? 'Stk'),
          })).filter(ing => ing.name)
        : [];

      const desc = encodeRecipeMeta({ cat, score, srv, note, ingredients, img });
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

  async _sendToShopping() {
    const entity = this._config.shopping_entity;
    if (!entity) return;
    const items = this._buildShoppingList().filter(ing => {
      const key = `${ing.planUid}::${ing.name}::${ing.unit}`;
      return !this._shopDeselected.has(key);
    });
    if (!items.length) return;
    for (const item of items) {
      await this._svc(entity, 'add_item', { item: `${item.amount} ${item.unit} ${item.name}` });
    }
    this._shopSuccess = true;
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
        padding: 8px 16px; border-radius: 8px;
        font-size: 13px; font-weight: 600; font-family: inherit;
        cursor: pointer; border: none; transition: all 0.15s;
        display: inline-flex; align-items: center; gap: 6px;
      }
      .btn--primary { background: var(--primary-color,#0A84FF); color: #fff; }
      .btn--primary:hover { opacity: 0.82; }
      .btn--ghost {
        background: rgba(128,128,128,0.1); color: var(--secondary-text-color,currentColor);
        border: 1px solid rgba(128,128,128,0.18);
      }
      .btn--ghost:hover { background: rgba(128,128,128,0.18); }
      .btn--danger { background: rgba(244,67,54,0.1); color: var(--error-color,#f44336); margin-right: auto; border: none; }
      .btn--danger:hover { background: rgba(244,67,54,0.2); }
      .btn--sm { padding: 5px 10px; font-size: 12px; }
      .btn--loading { opacity: 0.5; pointer-events: none; }
      .btn svg { width: 15px; height: 15px; fill: currentColor; }

      /* ── View Tabs ── */
      .view-tabs { display: flex; gap: 6px; padding: 0 14px 12px; }
      .view-tab {
        padding: 6px 16px; border-radius: 20px;
        border: 1px solid rgba(128,128,128,0.18);
        background: rgba(128,128,128,0.07);
        font-size: 14px; font-weight: 500; font-family: inherit;
        color: var(--secondary-text-color, currentColor);
        cursor: pointer; transition: all 0.15s;
      }
      .view-tab:hover { border-color: var(--primary-color,#0A84FF); color: var(--primary-color,#0A84FF); }
      .view-tab--active {
        border-color: var(--primary-color,#0A84FF);
        background: rgba(var(--rgb-primary-color,10,132,255),0.12);
        color: var(--primary-color,#0A84FF);
      }

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
      .rezepte { padding: 0 12px 12px; }
      .search-row { margin-bottom: 8px; }
      .search__input {
        width: 100%; box-sizing: border-box;
        background: rgba(128,128,128,0.08);
        border: 1px solid rgba(128,128,128,0.15); border-radius: 10px;
        padding: 9px 14px; font-size: 14px; font-family: inherit;
        color: var(--primary-text-color, currentColor); outline: none;
        transition: border-color 0.15s;
      }
      .search__input::placeholder { color: var(--secondary-text-color, currentColor); opacity: 0.4; }
      .search__input:focus { border-color: var(--primary-color, #0A84FF); }

      .cat-filters { display: flex; gap: 5px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: none; }
      .cat-filters::-webkit-scrollbar { display: none; }
      .cat-pill {
        padding: 4px 12px; border-radius: 20px; white-space: nowrap;
        border: 1px solid rgba(128,128,128,0.18); background: rgba(128,128,128,0.07);
        font-size: 12px; font-weight: 500; font-family: inherit;
        color: var(--secondary-text-color, currentColor); cursor: pointer; transition: all 0.15s;
      }
      .cat-pill:hover { border-color: var(--primary-color,#0A84FF); color: var(--primary-color,#0A84FF); }
      .cat-pill--active {
        border-color: var(--primary-color,#0A84FF);
        background: rgba(var(--rgb-primary-color,10,132,255),0.12);
        color: var(--primary-color,#0A84FF);
      }

      .recipe-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
        gap: 10px;
      }

      .recipe-card {
        background: rgba(128,128,128,0.05); border-radius: 16px;
        border: 1px solid rgba(128,128,128,0.1);
        display: flex; flex-direction: column; overflow: hidden;
        transition: transform 0.15s, box-shadow 0.15s;
      }
      .recipe-card:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.2); }

      .recipe-card__img-wrap {
        position: relative; aspect-ratio: 16/9; overflow: hidden; flex-shrink: 0;
      }
      .recipe-card__img {
        width: 100%; height: 100%; object-fit: cover; display: block;
      }
      .recipe-card__img-overlay {
        position: absolute; top: 7px; left: 7px; display: flex; gap: 4px; flex-wrap: wrap;
      }
      .recipe-card__edit {
        position: absolute; top: 7px; right: 7px;
        background: rgba(0,0,0,0.45); backdrop-filter: blur(4px);
      }
      .recipe-card__edit svg { fill: #fff; opacity: 0.9; }

      .recipe-card__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 4px; padding: 10px 10px 0; }
      .recipe-card__badges { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }

      .recipe-card__body { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
      .recipe-card__title {
        font-size: 13px; font-weight: 600; line-height: 1.35;
        color: var(--primary-text-color, currentColor); word-break: break-word;
      }
      .recipe-card__meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .recipe-card__srv {
        display: flex; align-items: center; gap: 3px;
        font-size: 11px; color: var(--secondary-text-color,currentColor); opacity: 0.65;
      }
      .recipe-card__srv svg { width: 12px; height: 12px; fill: currentColor; }
      .recipe-card__ings {
        font-size: 11px; color: var(--secondary-text-color,currentColor); opacity: 0.5;
      }
      .recipe-card__actions { margin-top: auto; padding-top: 4px; }

      /* ── Plan search dropdown ── */
      .plan-recipe-search-wrap { position: relative; }
      .plan-recipe-dropdown {
        position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 10;
        background: var(--ha-card-background, #1c1c1e);
        border: 1px solid rgba(128,128,128,0.2); border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35); overflow: hidden;
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

      /* ── Form Modal Overlay ── */
      .form-overlay {
        position: absolute; inset: 0; z-index: 9999;
        background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
        display: flex; align-items: flex-end; justify-content: center;
        animation: fadeIn 0.18s ease;
        border-radius: inherit;
      }
      .form-modal {
        background: var(--ha-card-background, #1c1c1e);
        border-radius: 20px 20px 0 0; overflow-y: auto;
        width: 100%; max-width: 560px; max-height: 90%;
        box-shadow: 0 -8px 40px rgba(0,0,0,0.5);
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

      .form__note, .import-paste-textarea {
        width: 100%; box-sizing: border-box;
        background: rgba(128,128,128,0.08);
        border: 1px solid rgba(128,128,128,0.15); border-radius: 10px;
        padding: 10px 14px; font-size: 13px; font-family: inherit; line-height: 1.5;
        color: var(--primary-text-color, currentColor); outline: none; resize: vertical;
        transition: border-color 0.15s;
      }
      .form__note::placeholder, .import-paste-textarea::placeholder { color: var(--secondary-text-color, currentColor); opacity: 0.4; }
      .form__note:focus, .import-paste-textarea:focus { border-color: var(--primary-color, #0A84FF); }

      .form__actions {
        display: flex; gap: 8px; margin-top: 14px; justify-content: flex-end; align-items: center;
      }

      /* ── Picker / Pills ── */
      .picker--grid { display: flex; flex-wrap: wrap; gap: 6px; }
      .pill {
        padding: 5px 12px; border-radius: 20px;
        border: 1px solid rgba(128,128,128,0.2); background: rgba(128,128,128,0.07);
        font-size: 12px; font-weight: 500; font-family: inherit;
        color: var(--secondary-text-color, currentColor);
        cursor: pointer; transition: all 0.15s; white-space: nowrap;
      }
      .pill:hover { border-color: var(--primary-color,#0A84FF); color: var(--primary-color,#0A84FF); }
      .pill--on {
        border-color: var(--primary-color,#0A84FF);
        background: rgba(var(--rgb-primary-color,10,132,255),0.15);
        color: var(--primary-color,#0A84FF);
      }

      /* Nutri-Score pills */
      .nutri-pill--A.pill--on { border-color: #038141; background: rgba(3,129,65,0.12);   color: #038141; }
      .nutri-pill--B.pill--on { border-color: #85BB2F; background: rgba(133,187,47,0.12); color: #85BB2F; }
      .nutri-pill--C.pill--on { border-color: #c4a000; background: rgba(254,203,2,0.12);  color: #c4a000; }
      .nutri-pill--D.pill--on { border-color: #EE8100; background: rgba(238,129,0,0.12);  color: #EE8100; }
      .nutri-pill--E.pill--on { border-color: #E63312; background: rgba(230,51,18,0.12);  color: #E63312; }

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
      .recipe-card__del {
        position: absolute; bottom: 3px; right: 3px;
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
        background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
        animation: fadeIn 0.18s ease;
        border-radius: inherit;
      }
      @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

      .detail-modal {
        background: var(--ha-card-background, #1c1c1e);
        border-radius: 20px; overflow: hidden;
        width: 100%; max-width: 560px; max-height: 90vh;
        display: flex; flex-direction: column;
        box-shadow: 0 24px 64px rgba(0,0,0,0.6);
        animation: slideUp 0.2s ease;
        position: relative;
      }
      @keyframes slideUp { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

      .detail-img-wrap { position: relative; aspect-ratio: 16/9; flex-shrink: 0; }
      .detail-img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .detail-img-overlay {
        position: absolute; bottom: 10px; left: 12px; display: flex; gap: 6px; align-items: center;
      }
      .detail-no-img {
        padding: 20px 16px 0; display: flex; gap: 6px; align-items: center; flex-shrink: 0;
      }
      .detail-close {
        position: absolute; top: 10px; right: 10px; z-index: 1;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
      }
      .detail-close svg { fill: #fff; opacity: 1; }

      .detail-body {
        padding: 16px 20px 20px; overflow-y: auto; flex: 1;
        display: flex; flex-direction: column; gap: 10px;
      }
      .detail-title {
        font-size: 20px; font-weight: 700; line-height: 1.25; margin: 0;
        color: var(--primary-text-color, currentColor);
      }
      .detail-meta-row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
      .detail-meta-item {
        display: flex; align-items: center; gap: 5px;
        font-size: 14px; color: var(--secondary-text-color, currentColor); opacity: 0.7;
      }
      .detail-meta-item svg { width: 16px; height: 16px; fill: currentColor; }
      .detail-note {
        font-size: 14px; line-height: 1.5; margin: 0;
        color: var(--secondary-text-color, currentColor); opacity: 0.8;
        font-style: italic;
      }
      .detail-section-label {
        font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
        color: var(--secondary-text-color, currentColor); opacity: 0.5;
        margin-top: 4px;
      }
      .detail-ing-list {
        list-style: none; margin: 0; padding: 0;
        display: flex; flex-direction: column; gap: 2px;
      }
      .detail-ing-item {
        display: flex; align-items: baseline; gap: 10px;
        padding: 6px 10px; border-radius: 8px;
        background: rgba(128,128,128,0.05);
      }
      .detail-ing-amount {
        font-size: 13px; font-weight: 600; min-width: 70px; flex-shrink: 0;
        color: var(--primary-color, #0A84FF);
      }
      .detail-ing-name { font-size: 14px; color: var(--primary-text-color, currentColor); }
      .detail-actions {
        display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px;
      }

      .detail-change-wrap { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
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
