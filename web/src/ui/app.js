/* Корень приложения: экраны по адресу, нижняя панель, «+», плашка обновления. */
import { html, render, useApp, useData, useRoute, navigate, goBack, useEffect, useRef, useState, AppCtx, todayYmd } from './core.js';
import { Icon } from './icons.js';
import { Sheet } from './kit.js';
import { t } from '../i18n/index.js';
import { Dashboard } from './screens/dashboard.js';
import { More, About } from './screens/more.js';
import { Profile } from './screens/profile.js';
import { Settings } from './screens/settings.js';
import { FoodDiary } from './screens/food/diary.js';
import { FoodAdd } from './screens/food/add.js';
import { FoodEditor } from './screens/food/editor.js';
import { Recipes, RecipeEditor } from './screens/food/recipes.js';
import { FoodLibrary, FoodSettings, FoodDays } from './screens/food/library.js';
import { Body } from './screens/body/body.js';
import { Photos } from './screens/body/photos.js';
import { BodyHistory } from './screens/body/history.js';
import { Cycle } from './screens/body/cycle.js';

/* Экраны старого журнала: адрес → [вкладка журнала, вид плана, путь «назад»] */
const LEGACY = {
  '/train': ['train'],
  '/more/history': ['hist', null, '/more'],
  '/more/templates': ['plan', 'tpl', '/more'],
  '/more/journal-settings': ['plan', 'set', '/more']
};

const ROUTES = [
  ['/', Dashboard],
  ['/food', FoodDiary],
  ['/food/add', FoodAdd],
  ['/food/new-food', FoodEditor],
  ['/food/item/:id', FoodEditor],
  ['/food/recipes', Recipes],
  ['/food/recipe/:id', RecipeEditor],
  ['/food/library', FoodLibrary],
  ['/food/settings', FoodSettings],
  ['/food/days', FoodDays],
  ['/more', More],
  ['/more/profile', Profile],
  ['/more/body', Body],
  ['/more/body/photos', Photos],
  ['/more/body/history', BodyHistory],
  ['/more/body/cycle', Cycle],
  ['/more/settings', Settings],
  ['/more/about', About]
];

function screenFor(path) {
  const parts = path.split('/').filter(Boolean);
  for (const [pattern, C] of ROUTES) {
    const pp = pattern.split('/').filter(Boolean);
    if (pp.length === parts.length && pp.every((p, i) => p.startsWith(':') || p === parts[i])) return C;
  }
  return null;
}

/* Цвет свечения фона по разделу */
const GLOW = { '/': '10,132,255', '/food': '255,69,58', '/train': '138,135,255', '/more': '142,142,147' };

function tabOf(path) {
  if (path === '/') return 'home';
  if (path.startsWith('/food')) return 'food';
  if (path.startsWith('/train')) return 'train';
  return 'more';
}

function TabBar({ path, onPlus }) {
  const cur = tabOf(path);
  const T = [['home', '/', 'nav.dashboard', 'var(--k-plan)'], ['food', '/food', 'nav.food', 'var(--k-food)'], ['plus'], ['train', '/train', 'nav.train', 'var(--k-str)'], ['more', '/more', 'nav.more', 'var(--muted)']];
  return html`<nav class="tabs" aria-label=${t('nav.aria')}>${T.map(([k, href, label, color]) => k === 'plus'
    ? html`<button class="tab plus" aria-label=${t('nav.add')} onClick=${onPlus}><span class="plusc"><${Icon} name="plus"/></span></button>`
    : html`<button class=${'tab' + (cur === k ? ' on' : '')} style=${'--tc:' + color} aria-current=${cur === k ? 'page' : null}
        onClick=${() => (cur === k && path !== href ? navigate(href, { replace: true }) : navigate(href))}><${Icon} name=${k}/>${t(label)}</button>`)}</nav>`;
}

/* Место для экрана журнала: один и тот же DOM-узел переезжает между адресами, состояние сохраняется */
function LegacyHost({ tab, view, back }) {
  const { legacy } = useApp();
  const ref = useRef(null);
  useEffect(() => {
    ref.current.appendChild(legacy.container);
    legacy.show(tab, view);
    return () => { if (legacy.container.parentNode === ref.current) ref.current.removeChild(legacy.container); };
  }, [tab, view]);
  return html`<div class="legacy-host">
    ${back ? html`<div class="wrap navbar-wrap"><div class="navbar"><button class="back" onClick=${() => goBack(back)}><${Icon} name="left"/>${t('nav.more')}</button></div></div>` : null}
    <div ref=${ref}></div>
  </div>`;
}

function PlusSheet({ open, onClose }) {
  const { legacy } = useApp();
  function go(fn) { onClose(); fn(); }
  const add = (extra) => navigate('/food/add?d=' + todayYmd() + (extra || ''));
  const A = [
    ['search', 'var(--k-food)', 'plus.food', 'plus.food.sub', () => add()],
    ['camera', '#FF9500', 'plus.photo', 'plus.photo.sub', () => add('&open=photo')],
    ['barcode', '#30B0C7', 'plus.scan', 'plus.scan.sub', () => add('&open=scan')],
    ['bolt', '#FFCC00', 'plus.quick', 'plus.quick.sub', () => add('&open=quick')],
    ['scale', 'var(--k-body)', 'plus.weight', 'plus.weight.sub', () => navigate('/more/body?open=weigh')],
    ['train', 'var(--k-str)', 'plus.workout', 'plus.workout.sub', () => navigate('/train')]
  ];
  return html`<${Sheet} open=${open} onClose=${onClose} title=${t('plus.title')}>
    <div class="plusgrid">${A.map(([icon, color, label, sub, fn]) => html`<button class=${'pbtn' + (fn ? '' : ' off')} disabled=${!fn} style=${'--cc:' + color} onClick=${fn ? () => go(fn) : null}>
      <span class="hci"><${Icon} name=${icon}/></span><b>${t(label)}</b><small>${t(sub)}</small>
    </button>`)}</div>
  <//>`;
}

function UpdateBanner() {
  const { updates } = useApp();
  const [w, setW] = useState(updates.waiting);
  useEffect(() => updates.listen(setW), []);
  if (!w) return null;
  return html`<div class="upd"><span>${t('update.available')}</span><button class="small" onClick=${() => updates.apply()}>${t('update.apply')}</button></div>`;
}

function Theme() {
  const { repos } = useApp();
  useData('profile');
  const theme = repos.profile.get().theme;
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme; else delete root.dataset.theme;
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    metas.forEach((m) => {
      if (!m.dataset.orig) m.dataset.orig = m.getAttribute('content');
      m.setAttribute('content', theme === 'light' ? '#F2F2F7' : theme === 'dark' ? '#000000' : m.dataset.orig);
    });
  }, [theme]);
  return null;
}

export function App() {
  const route = useRoute();
  const [plus, setPlus] = useState(false);
  const path = route.path;
  useEffect(() => {
    const g = GLOW[path] || GLOW['/' + (route.parts[0] || '')] || GLOW['/more'];
    if (!LEGACY[path]) document.body.style.setProperty('--tabrgb', g);
    window.scrollTo(0, 0);
  }, [path]);

  const lg = LEGACY[path];
  const Screen = screenFor(path);
  let body;
  if (lg) body = html`<${LegacyHost} tab=${lg[0]} view=${lg[1]} back=${lg[2]}/>`;
  else if (Screen) body = html`<${Screen} route=${route}/>`;
  else body = html`<div class="wrap"><div class="card pad"><h2>${t('common.notFound')}</h2><button class="primary" onClick=${() => navigate('/', { replace: true })}>${t('nav.dashboard')}</button></div></div>`;

  return html`<${Theme}/>
    <${UpdateBanner}/>
    ${body}
    <${TabBar} path=${path} onPlus=${() => setPlus(true)}/>
    <${PlusSheet} open=${plus} onClose=${() => setPlus(false)}/>`;
}

export function mountApp(el, ctx) {
  el.textContent = '';
  render(html`<${AppCtx.Provider} value=${ctx}><${App}/><//>`, el);
}
