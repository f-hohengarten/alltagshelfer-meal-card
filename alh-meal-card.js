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

const DAY_NAMES_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DAY_NAMES_LONG  = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTH_NAMES     = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

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
  const mHead = str.match(/^\[ALH ([^\]]*)\]/);
  const meta  = { cat: 'sonstiges', score: '', srv: 4, note: '', ingredients: [] };
  if (mHead) {
    mHead[1].split(';').forEach(p => {
      const i = p.indexOf(':');
      if (i > 0) meta[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    });
    meta.srv = parseInt(meta.srv) || 4;
    const rest = str.slice(mHead[0].length).trim();
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
    meta.note = str;
  }
  return meta;
}

function encodeRecipeMeta({ cat, score, srv, note, ingredients }) {
  const parts = [`cat:${cat || 'sonstiges'}`, `srv:${srv || 4}`];
  if (score) parts.push(`score:${score}`);
  const head = `[ALH ${parts.join(';')}]`;
  const ingStr = (ingredients || [])
    .filter(i => i.name)
    .map(i => `${i.name}:${i.amount || ''}:${i.unit || ''}`)
    .join(',');
  const noteStr = (note || '').trim();
  if (ingStr) return `${head} ${noteStr}|${ingStr}`;
  if (noteStr) return `${head} ${noteStr}`;
  return head;
}

function parsePlanMeta(desc) {
  const str = String(desc ?? '');
  const m = str.match(/^\[ALH ([^\]]*)\]/);
  const meta = { recipe_id: '', srv: 4 };
  if (m) {
    m[1].split(';').forEach(p => {
      const i = p.indexOf(':');
      if (i > 0) meta[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    });
    meta.srv = parseInt(meta.srv) || 4;
  }
  return meta;
}

function encodePlanMeta({ recipe_id, srv }) {
  return `[ALH recipe_id:${recipe_id};srv:${srv || 4}]`;
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
  }

  _blankRecipeForm() {
    return {
      open: false, uid: null,
      title: '', cat: 'pasta', score: '', srv: 4, note: '',
      ingredients: [],
      _ingName: '', _ingAmount: '', _ingUnit: 'g',
      _importUrl: '',
    };
  }

  _blankPlanForm() {
    return { open: false, dayIso: '', recipeUid: '', srv: 4 };
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
      const resultEntity = hass.states['input_text.alh_recipe_import_result'];
      const prev = this._hass.states['input_text.alh_recipe_import_result'];
      if (resultEntity && (!prev || resultEntity.state !== prev.state)) {
        this._handleImportResult(resultEntity.state);
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

    const titleEl   = this.shadowRoot.querySelector('.form__title-input');
    if (titleEl)     this._recipeForm.title = titleEl.value;

    const noteEl    = this.shadowRoot.querySelector('.form__textarea');
    if (noteEl)      this._recipeForm.note  = noteEl.value;

    const urlEl     = this.shadowRoot.querySelector('.import__url');
    if (urlEl)       this._recipeForm._importUrl = urlEl.value;

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
        ${this._activePanel === 'recipe-form' ? this._renderRecipeForm() : ''}
        ${this._activePanel === 'plan-form'   ? this._renderPlanForm()   : ''}
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

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return isoDate(d);
    });

    const weekPlan = this._plan.filter(p => days.includes(p.due));

    return `
      <div class="woche">
        <div class="woche__nav">
          <button class="icon-btn" data-action="week-prev" aria-label="Vorherige Woche">
            <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
          </button>
          <span class="woche__month">${monthStr} ${yearStr}</span>
          <div style="display:flex;gap:6px;align-items:center">
            ${this._weekOffset !== 0 ? `<button class="btn btn--ghost btn--sm" data-action="week-today">Heute</button>` : ''}
            <button class="icon-btn" data-action="week-next" aria-label="Nächste Woche">
              <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
          </div>
        </div>

        <div class="week-grid">
          ${days.map((iso, idx) => {
            const dayPlan = weekPlan.filter(p => p.due === iso);
            const isToday   = iso === today;
            const isWeekend = idx >= 5;
            const dayNum  = new Date(iso + 'T12:00:00').getDate();
            const dayName = DAY_NAMES_SHORT[(idx + 1) % 7];
            return `
              <div class="week-day${isToday ? ' week-day--today' : ''}${isWeekend ? ' week-day--weekend' : ''}">
                <div class="week-day__header">
                  <span class="week-day__name">${dayName}</span>
                  <span class="week-day__num${isToday ? ' week-day__num--today' : ''}">${dayNum}</span>
                </div>
                <div class="week-day__meals">
                  ${dayPlan.map(p => {
                    const meta   = parsePlanMeta(p.description);
                    const recipe = this._recipes.find(r => r.uid === meta.recipe_id);
                    const score  = recipe ? parseRecipeMeta(recipe.description).score : '';
                    return `
                      <div class="meal-chip" data-plan-uid="${x(p.uid)}">
                        <span class="meal-chip__title">${x(p.summary)}</span>
                        ${score ? `<span class="nutri-badge" style="background:${nutriColor(score)};color:${nutriTextColor(score)}">${score}</span>` : ''}
                        <button class="meal-chip__del" data-action="del-plan" data-plan-uid="${x(p.uid)}" aria-label="Entfernen">
                          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                        </button>
                      </div>
                    `;
                  }).join('')}
                </div>
                <button class="week-day__add" data-action="open-plan-form" data-iso="${iso}" aria-label="Mahlzeit hinzufügen">
                  <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                </button>
              </div>
            `;
          }).join('')}
        </div>

        ${weekPlan.length > 0 ? `
          <div class="woche__shop-bar">
            <span class="woche__shop-label">${weekPlan.length} Mahlzeit${weekPlan.length !== 1 ? 'en' : ''} diese Woche</span>
            <button class="btn btn--primary btn--sm" data-action="goto-einkauf-week">Einkaufsliste erstellen</button>
          </div>
        ` : `
          <div class="empty">Noch keine Mahlzeiten geplant.<br>Tippe auf + um eine hinzuzufügen.</div>
        `}
      </div>
    `;
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
    const meta = parseRecipeMeta(recipe.description);
    const score = meta.score;
    const catLabel = CATEGORIES.find(c => c.v === meta.cat)?.l ?? meta.cat;
    return `
      <div class="recipe-card">
        <div class="recipe-card__top">
          <div class="recipe-card__badges">
            <span class="cat-badge cat-badge--${x(meta.cat)}">${x(catLabel)}</span>
            ${score ? `<span class="nutri-badge" style="background:${nutriColor(score)};color:${nutriTextColor(score)}">${score}</span>` : ''}
          </div>
          <button class="icon-btn icon-btn--sm" data-action="edit-recipe" data-recipe-uid="${x(recipe.uid)}" aria-label="Bearbeiten">
            <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
        </div>
        <div class="recipe-card__title">${x(recipe.summary)}</div>
        <div class="recipe-card__meta">
          <span class="recipe-card__srv">
            <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
            ${meta.srv}
          </span>
          ${meta.ingredients.length > 0 ? `<span class="recipe-card__ings">${meta.ingredients.length} Zutaten</span>` : ''}
        </div>
        <div class="recipe-card__actions">
          <button class="btn btn--ghost btn--sm" data-action="plan-recipe" data-recipe-uid="${x(recipe.uid)}">Einplanen</button>
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
    const weekPlan = this._plan.filter(p => days.includes(p.due) && p.status !== 'completed');
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
      <div class="panel recipe-form">
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
          ${this._importResult?.error ? `<div class="import-error">${x(this._importResult.error)}</div>` : ''}
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
        <textarea class="form__textarea" placeholder="Kurze Beschreibung oder Tipps…" rows="2">${x(f.note)}</textarea>

        <div class="form__actions">
          ${isEdit ? `<button class="btn btn--danger" data-action="delete-recipe">Löschen</button>` : ''}
          <button class="btn btn--ghost" data-action="cancel-recipe">Abbrechen</button>
          <button class="btn btn--primary" data-action="submit-recipe">${isEdit ? 'Speichern' : 'Anlegen'}</button>
        </div>
      </div>
    `;
  }

  // ─── Plan Form ───────────────────────────────────────────────────────────────

  _renderPlanForm() {
    const f       = this._planForm;
    const recipes = this._recipes.filter(r => r.status !== 'completed');
    return `
      <div class="panel plan-form">
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
        ` : `
          <select class="plan-form__recipe form__select form__select--full">
            <option value="">— Rezept wählen —</option>
            ${recipes.map(r => `
              <option value="${x(r.uid)}"${f.recipeUid === r.uid ? ' selected' : ''}>${x(r.summary)}</option>
            `).join('')}
          </select>
        `}

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
    `;
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

    // Open plan form from week day "+"
    root.querySelectorAll('[data-action="open-plan-form"]').forEach(el => {
      el.addEventListener('click', () => {
        const iso = el.dataset.iso;
        this._openPlanForm(iso);
      });
    });

    // Delete plan entry
    root.querySelectorAll('[data-action="del-plan"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deletePlanEntry(el.dataset.planUid);
      });
    });

    // Edit recipe
    root.querySelectorAll('[data-action="edit-recipe"]').forEach(el => {
      el.addEventListener('click', () => this._openEditRecipe(el.dataset.recipeUid));
    });

    // Plan recipe from recipe card
    root.querySelectorAll('[data-action="plan-recipe"]').forEach(el => {
      el.addEventListener('click', () => {
        this._openPlanForm('', el.dataset.recipeUid);
      });
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

    const cancelRecipe = root.querySelector('[data-action="cancel-recipe"]');
    if (cancelRecipe) cancelRecipe.addEventListener('click', () => {
      this._activePanel = null;
      this._recipeForm  = this._blankRecipeForm();
      this._render();
    });

    const deleteRecipe = root.querySelector('[data-action="delete-recipe"]');
    if (deleteRecipe) deleteRecipe.addEventListener('click', () => this._deleteRecipe(this._recipeForm.uid));

    const importBtn = root.querySelector('[data-action="import-url"]');
    if (importBtn) importBtn.addEventListener('click', () => this._importUrl());

    const titleInput = root.querySelector('.form__title-input');
    if (titleInput) titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._submitRecipe(); }
      if (e.key === 'Escape') {
        this._activePanel = null;
        this._recipeForm  = this._blankRecipeForm();
        this._render();
      }
    });

    // ── Plan form events ──

    const recipeSelect = root.querySelector('.plan-form__recipe');
    if (recipeSelect) recipeSelect.addEventListener('change', () => {
      this._planForm.recipeUid = recipeSelect.value;
      const recipe = this._recipes.find(r => r.uid === recipeSelect.value);
      if (recipe) {
        const meta = parseRecipeMeta(recipe.description);
        this._planForm.srv = meta.srv || 4;
      }
      this._render();
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

    const cancelPlan = root.querySelector('[data-action="cancel-plan"]');
    if (cancelPlan) cancelPlan.addEventListener('click', () => {
      this._activePanel = null;
      this._planForm    = this._blankPlanForm();
      this._render();
    });
  }

  _restoreFocus() {
    // Re-focus title input when recipe form is open
    if (this._activePanel === 'recipe-form') {
      const inp = this.shadowRoot.querySelector('.form__title-input');
      if (inp && !inp.value) inp.focus();
    }
    if (this._activePanel === 'plan-form') {
      const sel = this.shadowRoot.querySelector('.plan-form__recipe');
      if (sel && !this._planForm.recipeUid) sel.focus();
    }
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────

  _openCreateRecipe() {
    this._recipeForm  = this._blankRecipeForm();
    this._importResult = null;
    this._activePanel = 'recipe-form';
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
      ingredients: [...meta.ingredients],
      _ingName: '', _ingAmount: '', _ingUnit: 'g',
    };
    this._activePanel = 'recipe-form';
    this._render();
  }

  _openPlanForm(dayIso, recipeUid = '') {
    let srv = 4;
    if (recipeUid) {
      const r = this._recipes.find(r => r.uid === recipeUid);
      if (r) srv = parseRecipeMeta(r.description).srv || 4;
    }
    this._planForm    = { open: true, dayIso: dayIso || isoToday(), recipeUid, srv };
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
    const noteEl  = this.shadowRoot.querySelector('.form__textarea');
    const title   = (titleEl?.value ?? this._recipeForm.title).trim();
    if (!title) {
      if (titleEl) { titleEl.focus(); titleEl.style.borderColor = 'var(--error-color, #f44336)'; }
      return;
    }
    if (noteEl) this._recipeForm.note = noteEl.value;

    const { uid, cat, score, srv, note, ingredients } = this._recipeForm;
    const desc = encodeRecipeMeta({ cat, score, srv, note, ingredients });

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
    this._activePanel = null;
    this._recipeForm  = this._blankRecipeForm();
    this._render();
  }

  _submitPlan() {
    const dayEl    = this.shadowRoot.querySelector('.plan-form__date');
    const selEl    = this.shadowRoot.querySelector('.plan-form__recipe');
    const dayIso   = (dayEl?.value ?? this._planForm.dayIso).trim();
    const recipeUid = (selEl?.value ?? this._planForm.recipeUid).trim();

    if (!dayIso || !recipeUid) return;
    const recipe = this._recipes.find(r => r.uid === recipeUid);
    if (!recipe) return;

    this._svc(this._config.plan_entity, 'add_item', {
      item:        recipe.summary,
      due_date:    dayIso,
      description: encodePlanMeta({ recipe_id: recipeUid, srv: this._planForm.srv }),
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
      await this._hass.callService('shell_command', 'alh_recipe_import', { url });
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
    } catch (e) {
      this._importResult = { error: 'Antwort konnte nicht gelesen werden.' };
    }
    this._render();
  }

  // ─── CSS ─────────────────────────────────────────────────────────────────────

  _css() {
    return `
      :host { display: block; }

      .card {
        background: var(--ha-card-background, var(--card-background-color, #1c1c1e));
        border-radius: var(--ha-card-border-radius, 26px);
        border: 1px solid rgba(128,128,128,0.12);
        box-shadow: var(--ha-card-box-shadow, 0 12px 20px rgba(0,0,0,0.28));
        overflow: hidden;
        font-family: var(--primary-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
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
      .icon-btn svg { width: 16px; height: 16px; fill: var(--secondary-text-color, currentColor); opacity: 0.5; }
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
      .view-tabs { display: flex; gap: 4px; padding: 0 14px 10px; }
      .view-tab {
        padding: 4px 14px; border-radius: 20px;
        border: 1px solid rgba(128,128,128,0.18);
        background: rgba(128,128,128,0.07);
        font-size: 12px; font-weight: 500; font-family: inherit;
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
      .cat-badge--pasta       { background: rgba(90,200,245,0.15);   color: #5AC8F5; }
      .cat-badge--salat       { background: rgba(50,215,75,0.15);    color: #32D74B; }
      .cat-badge--fleisch     { background: rgba(255,159,10,0.15);   color: #FF9F0A; }
      .cat-badge--vegetarisch { background: rgba(50,215,75,0.15);    color: #32D74B; }
      .cat-badge--suppe       { background: rgba(106,196,220,0.15);  color: #6AC4DC; }
      .cat-badge--snack       { background: rgba(255,214,10,0.15);   color: #b39600; }
      .cat-badge--dessert     { background: rgba(191,90,242,0.15);   color: #BF5AF2; }
      .cat-badge--sonstiges   { background: rgba(128,128,128,0.12);  color: var(--secondary-text-color,currentColor); }

      /* ── Woche View ── */
      .woche { padding: 0 10px 10px; }
      .woche__nav {
        display: flex; align-items: center; justify-content: space-between;
        padding: 2px 2px 10px;
      }
      .woche__month {
        font-size: 14px; font-weight: 600;
        color: var(--primary-text-color, currentColor);
      }

      .week-grid {
        display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;
      }
      .week-day {
        min-height: 80px; border-radius: 12px;
        background: rgba(128,128,128,0.05);
        border: 1px solid rgba(128,128,128,0.1);
        padding: 5px 3px 4px;
        display: flex; flex-direction: column; gap: 3px; overflow: hidden;
      }
      .week-day--today {
        border-color: var(--primary-color, #0A84FF);
        background: rgba(var(--rgb-primary-color,10,132,255), 0.07);
      }
      .week-day--weekend { background: rgba(128,128,128,0.07); }

      .week-day__header {
        display: flex; flex-direction: column; align-items: center; gap: 1px;
        margin-bottom: 2px;
      }
      .week-day__name {
        font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
        color: var(--secondary-text-color, currentColor); opacity: 0.55;
      }
      .week-day__num {
        font-size: 13px; font-weight: 500; line-height: 1;
        color: var(--primary-text-color, currentColor);
      }
      .week-day__num--today {
        background: var(--primary-color,#0A84FF); color: #fff;
        border-radius: 50%; width: 20px; height: 20px;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700;
      }
      .week-day__meals { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow: hidden; }

      .meal-chip {
        display: flex; align-items: center; gap: 2px;
        background: rgba(var(--rgb-primary-color,10,132,255),0.1);
        border-radius: 6px; padding: 2px 3px;
        min-width: 0;
      }
      .meal-chip__title {
        font-size: 9px; font-weight: 500; flex: 1; min-width: 0;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        color: var(--primary-text-color, currentColor);
      }
      .meal-chip__del {
        width: 14px; height: 14px; border-radius: 3px; border: none;
        background: transparent; cursor: pointer; padding: 0; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center; opacity: 0.4;
        transition: opacity 0.15s;
      }
      .meal-chip__del svg { width: 10px; height: 10px; fill: var(--error-color,#f44336); }
      .meal-chip__del:hover { opacity: 1; }

      .week-day__add {
        width: 100%; padding: 3px 0; border-radius: 6px; border: none;
        background: transparent; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        opacity: 0.25; transition: opacity 0.15s, background 0.15s;
      }
      .week-day__add svg { width: 14px; height: 14px; fill: var(--primary-color,#0A84FF); }
      .week-day__add:hover { opacity: 1; background: rgba(var(--rgb-primary-color,10,132,255),0.08); }

      .woche__shop-bar {
        display: flex; align-items: center; justify-content: space-between;
        margin-top: 10px; padding: 8px 10px;
        background: rgba(128,128,128,0.05); border-radius: 10px;
        border: 1px solid rgba(128,128,128,0.1);
      }
      .woche__shop-label {
        font-size: 12px; color: var(--secondary-text-color,currentColor); opacity: 0.7;
      }

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

      .recipe-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      @media (max-width: 340px) { .recipe-grid { grid-template-columns: 1fr; } }

      .recipe-card {
        background: rgba(128,128,128,0.05); border-radius: 14px;
        border: 1px solid rgba(128,128,128,0.1); padding: 10px;
        display: flex; flex-direction: column; gap: 6px;
      }
      .recipe-card__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 4px; }
      .recipe-card__badges { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
      .recipe-card__title {
        font-size: 13px; font-weight: 600; line-height: 1.3;
        color: var(--primary-text-color, currentColor); word-break: break-word;
      }
      .recipe-card__meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .recipe-card__srv {
        display: flex; align-items: center; gap: 3px;
        font-size: 11px; color: var(--secondary-text-color,currentColor); opacity: 0.6;
      }
      .recipe-card__srv svg { width: 12px; height: 12px; fill: currentColor; }
      .recipe-card__ings {
        font-size: 11px; color: var(--secondary-text-color,currentColor); opacity: 0.5;
      }
      .recipe-card__actions { margin-top: auto; }

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

      /* ── Panel (shared by recipe-form + plan-form) ── */
      .panel {
        border-top: 1px solid rgba(128,128,128,0.12);
        padding: 14px 14px 16px;
        background: rgba(128,128,128,0.02);
      }
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

      .form__textarea {
        width: 100%; box-sizing: border-box;
        background: rgba(128,128,128,0.08);
        border: 1px solid rgba(128,128,128,0.15); border-radius: 10px;
        padding: 10px 14px; font-size: 13px; font-family: inherit; line-height: 1.5;
        color: var(--primary-text-color, currentColor); outline: none; resize: vertical;
        transition: border-color 0.15s;
      }
      .form__textarea::placeholder { color: var(--secondary-text-color, currentColor); opacity: 0.4; }
      .form__textarea:focus { border-color: var(--primary-color, #0A84FF); }

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
