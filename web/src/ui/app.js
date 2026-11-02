/* Корень приложения: экраны по адресу, нижняя панель из 5 вкладок, полоска идущей тренировки, тосты, плашка обновления. */
import { html, render, useApp, useData, useRoute, navigate, useEffect, useLayoutEffect, useState, AppCtx, takeScroll, todayYmd } from './core.js';
import { Icon } from './icons.js';
import { ToastHost } from './toast.js';
import { useNow } from './train/timer.js';
import { fmtClock } from './train/catalog.js';
import { t } from '../i18n/index.js';
import { Dashboard } from './screens/dashboard.js';
import { More, About } from './screens/more.js';
import { Profile } from './screens/profile.js';
import { Settings, BackupPage } from './screens/settings.js';
import { FoodDiary } from './screens/food/diary.js';
import { FoodAdd } from './screens/food/add.js';
import { FoodEditor } from './screens/food/editor.js';
import { Recipes, RecipeEditor } from './screens/food/recipes.js';
import { FoodLibrary, FoodSettings, FoodDays } from './screens/food/library.js';
import { Nutrients } from './screens/food/nutrients.js';
import { Body } from './screens/body/body.js';
import { Photos } from './screens/body/photos.js';
import { BodyHistory } from './screens/body/history.js';
import { Cycle } from './screens/body/cycle.js';
import { Onboarding } from './screens/onboarding.js';
import { GoalScreen, MicroGoals } from './screens/goal.js';
import { Expenditure } from './screens/expenditure.js';
import { Checkin, CheckinSettings } from './screens/checkin.js';
import { computeExpenditure } from './food/expenditure.js';
import { TrainHome } from './screens/train/train.js';
import { TrainSession } from './screens/train/session.js';
import { ExerciseLibrary, ExerciseCard, ExerciseEditor } from './screens/train/library.js';
import { WorkoutHistory, WorkoutLog } from './screens/train/history.js';
import { PlanList, PlanEditor } from './screens/train/plans.js';
import { TrainSettings } from './screens/train/settings.js';
import { GymList, GymEditor } from './screens/train/gyms.js';
import { PlateCalculator } from './screens/train/plates.js';
import { Levels } from './screens/train/levels.js';
import { ProgramList, ProgramGenerator } from './screens/train/programs.js';
import { History } from './screens/history.js';

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
  ['/food/nutrients', Nutrients],
  ['/train', TrainHome],
  ['/train/session', TrainSession],
  ['/train/library', ExerciseLibrary],
  ['/train/exercise/:id', ExerciseCard],
  ['/train/exercise-edit/:id', ExerciseEditor],
  ['/train/history', WorkoutHistory],
  ['/train/log/:id', WorkoutLog],
  ['/train/plans', PlanList],
  ['/train/plan/:id', PlanEditor],
  ['/train/settings', TrainSettings],
  ['/train/gyms', GymList],
  ['/train/gym/:id', GymEditor],
  ['/train/plates', PlateCalculator],
  ['/train/levels', Levels],
  ['/train/programs', ProgramList],
  ['/train/program/new', ProgramGenerator],
  ['/more/templates', PlanList],
  ['/more/history', History],
  ['/more', More],
  ['/onboarding', Onboarding],
  ['/more/goal', GoalScreen],
  ['/checkin', Checkin],
  ['/more/expenditure', Expenditure],
  ['/more/checkin-settings', CheckinSettings],
  ['/more/micro', MicroGoals],
  ['/more/profile', Profile],
  ['/body', Body],
  ['/body/photos', Photos],
  ['/body/history', BodyHistory],
  ['/body/cycle', Cycle],
  ['/more/settings', Settings],
  ['/more/backup', BackupPage],
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
const GLOW = { '/': '10,132,255', '/food': '255,69,58', '/train': '138,135,255', '/body': '175,82,222', '/more': '142,142,147' };

function tabOf(path) {
  if (path === '/') return 'home';
  if (path.startsWith('/food')) return 'food';
  if (path.startsWith('/train')) return 'train';
  if (path.startsWith('/body')) return 'body';
  return 'more';
}

const TABS = [['home', '/', 'nav.dashboard', 'var(--k-plan)'], ['food', '/food', 'nav.food', 'var(--k-food)'], ['train', '/train', 'nav.train', 'var(--k-str)'], ['body', '/body', 'nav.body', 'var(--k-body)', 'scale'], ['more', '/more', 'nav.more', 'var(--muted)']];

function TabBar({ path }) {
  const cur = tabOf(path);
  return html`<nav class="tabs" aria-label=${t('nav.aria')}>${TABS.map(([k, href, label, color, icon]) => html`<button class=${'tab' + (cur === k ? ' on' : '')} style=${'--tc:' + color} aria-current=${cur === k ? 'page' : null}
        onClick=${() => (cur === k && path !== href ? navigate(href, { replace: true }) : navigate(href))}><${Icon} name=${icon || k}/>${t(label)}</button>`)}</nav>`;
}

/* Идёт тренировка, а открыт другой экран: полоска над вкладками с временем и «Продолжить» */
function LiveBar() {
  const { repos } = useApp();
  useData(['workoutSessions']);
  const s = repos.workoutSession.get('current');
  const now = useNow(!!s, 1000);
  if (!s) return null;
  return html`<button class="wk-live" onClick=${() => navigate('/train/session')}>
    <${Icon} name="timer"/><span class="grow">${t('train.live')} · ${fmtClock((now - Date.parse(s.startedAt)) / 1000)}</span><b>${t('train.continue')}</b>
  </button>`;
}

function UpdateBanner() {
  const { updates } = useApp();
  const [w, setW] = useState(updates.waiting);
  useEffect(() => updates.listen(setW), []);
  if (!w) return null;
  return html`<div class="upd"><span>${t('update.available')}</span><button class="small" onClick=${() => updates.apply()}>${t('update.apply')}</button></div>`;
}

/* Раз в день сохраняем оценку расхода на сегодня — история того, что приложение думало в тот день */
function TdeeSnapshot() {
  const app = useApp();
  useData(['foodEntries', 'dayEntries', 'scaleEntries', 'dietProfile', 'profile']);
  useEffect(() => {
    const tm = setTimeout(() => {
      const today = todayYmd();
      const ex = computeExpenditure(app, today);
      if (!ex || !ex.current) return;
      const cur = app.repos.tdeeEntry.get(today);
      const tdee = Math.round(ex.current.tdee);
      if (cur && cur.tdee === tdee && cur.status === ex.current.status) return;
      app.repos.tdeeEntry.save({ id: today, date: today, tdee, status: ex.current.status, reason: ex.current.reason || '', version: app.repos.dietProfile.get().tdeeVersion || 'v1' }).catch(() => {});
    }, 1500);
    return () => clearTimeout(tm);
  });
  return null;
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
  const path = route.path;
  /* старые адреса раздела «Тело» */
  useEffect(() => { if (path.startsWith('/more/body')) navigate(path.replace('/more/body', '/body') + (Object.keys(route.query).length ? '?' + Object.entries(route.query).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&') : ''), { replace: true }); }, [path]);
  const fullScreen = path === '/train/session' || path.startsWith('/onboarding') || path.startsWith('/checkin');
  useLayoutEffect(() => {
    const g = GLOW[path] || GLOW['/' + (route.parts[0] || '')] || GLOW['/more'];
    document.body.style.setProperty('--tabrgb', g);
    document.body.classList.toggle('no-tabs', fullScreen);
    const y = takeScroll('#' + path);
    if (y != null) window.scrollTo(0, y);
  }, [path]);

  const Screen = screenFor(path);
  let body;
  if (Screen) body = html`<${Screen} route=${route}/>`;
  else body = html`<div class="wrap"><div class="card pad"><h2>${t('common.notFound')}</h2><button class="primary" onClick=${() => navigate('/', { replace: true })}>${t('nav.dashboard')}</button></div></div>`;

  return html`<${Theme}/>
    <${UpdateBanner}/>
    ${body}
    ${fullScreen ? null : html`<${LiveBar}/><${TabBar} path=${path}/>`}
    <${TdeeSnapshot}/>
    <${ToastHost}/>`;
}

export function mountApp(el, ctx) {
  el.textContent = '';
  render(html`<${AppCtx.Provider} value=${ctx}><${App}/><//>`, el);
}
