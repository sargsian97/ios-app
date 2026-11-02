/* Расход силовой тренировки: карточка в активной тренировке и в записи истории.
   Скриншот итогов с часов (Zepp и похожие) читает ИИ (ключ Claude или аккаунт Claude в артефакте) и заполняет
   поля stats; расчёт — чистая strengthEstimate (длительность и пульс с часов + подходы с таймерами). */
import { html, useApp, useState, useRef } from '../core.js';
import { Card } from '../kit.js';
import { t, fmtNum } from '../../i18n/index.js';
import { NumIn } from './inputs.js';
import { exName, currentBodyweight } from './catalog.js';
import { strengthEstimate, ageOn, JOURNAL_GYM_STEPS_DEFAULT } from '../../domain/calc/index.js';
import { aiZepp, aiReady, aiErrorKey } from '../../services/ai-food.js';
import { journalBurnFor } from '../food/budget.js';
import { periodLabel } from '../food/labels.js';

/* Оценка для тренировки или идущей сессии: только сделанные подходы; длительность — с часов, иначе таймер приложения */
export function estimateForLog(log, app, elapsedSec = null) {
  const { repos } = app;
  if (!log) return null;
  const byId = {};
  repos.exercise.list().forEach((e) => { byId[e.id] = e; });
  const exercises = (log.exercises || []).filter((e) => !e.cardio && !e.skipped).map((e) => ({
    name: exName(e, byId),
    sets: (e.sets || []).filter((x) => x.done !== false).map((x) => ({ reps: x.reps, timeSec: x.timeSec, dur: x.durSec, rest: x.restSec, done: true }))
  }));
  const st = log.stats || {};
  const dsec = log.durationSec != null ? log.durationSec : elapsedSec;
  const profile = repos.profile.get();
  const base = repos.expenditureSettings.get().baseKcal;
  const r = strengthEstimate({
    exercises, durationMin: st.durMin != null ? st.durMin : dsec != null ? dsec / 60 : null, avgHr: st.avgHr, vo2max: st.vo2max,
    weightKg: log.bodyweightKg || currentBodyweight(repos), age: profile.birthDate ? ageOn(profile.birthDate, log.date) : null, sex: profile.sex || 'male', base
  });
  if (r) r.watch = st.kcalWatch != null ? st.kcalWatch : null;
  return r;
}

function ZeppShot({ onData }) {
  const { store } = useApp();
  const [st, setSt] = useState({ busy: false, msg: '', ok: false });
  const inp = useRef(null);
  if (!aiReady()) return html`<div class="hint" style="margin:0 0 10px">${t('train.kcal.noAi')}</div>`;
  async function pick(ev) {
    const files = Array.from(ev.currentTarget.files || []);
    ev.currentTarget.value = '';
    if (!files.length) return;
    setSt({ busy: true, msg: t('train.kcal.readingHint'), ok: false });
    try {
      const data = await aiZepp(store, files, { today: new Date().toISOString().slice(0, 10), now: new Date().toISOString() });
      const parts = [];
      if (data.durMin != null) parts.push(t('train.kcal.took.min', { v: fmtNum(data.durMin, 1) }));
      if (data.avgHr != null) parts.push(t('train.kcal.took.hr', { v: data.avgHr }) + (data.maxHr != null ? ', ' + t('train.kcal.took.hrMax', { v: data.maxHr }) : ''));
      if (data.vo2max != null) parts.push(t('train.kcal.took.vo2', { v: fmtNum(data.vo2max, 1) }));
      if (data.kcalWatch != null) parts.push(t('train.kcal.took.watch', { v: fmtNum(data.kcalWatch) }));
      onData(data);
      setSt({ busy: false, ok: true, msg: t('train.kcal.took', { v: parts.join(' · ') }) });
    } catch (e) {
      setSt({ busy: false, ok: false, msg: e && e.code === 'empty' ? t('train.kcal.err.empty') : t(aiErrorKey(e), e && e.code === 'limit' ? { period: periodLabel(e.period), limit: e.limit } : {}) });
    }
  }
  return html`<div class="zepp-shot" style="margin:0 0 12px">
    <button type="button" style="width:100%" disabled=${st.busy} onClick=${() => inp.current && inp.current.click()}>${st.busy ? t('train.kcal.reading') : t('train.kcal.zepp')}</button>
    <input ref=${inp} type="file" accept="image/*" multiple hidden onChange=${pick}/>
    ${st.msg ? html`<div class=${'hint' + (st.ok ? ' ok' : '')} style="margin-top:6px">${st.msg}</div>` : null}
  </div>`;
}

const FIELDS = [['durMin', 'train.kcal.f.durMin', 'decimal'], ['avgHr', 'train.kcal.f.avgHr', 'numeric'], ['maxHr', 'train.kcal.f.maxHr', 'numeric'], ['vo2max', 'train.kcal.f.vo2max', 'decimal'], ['kcalWatch', 'train.kcal.f.kcalWatch', 'numeric']];

export function strengthText(r) {
  if (!r) return t('train.kcal.none');
  const k = (x) => fmtNum(Math.round(x));
  const how = r.src === 'both' ? t('train.kcal.how.both', { a: k(r.bySets), b: k(r.byHr) }) : r.src === 'hr' ? t('train.kcal.how.hr') : t('train.kcal.how.sets');
  return t('train.kcal.result', { kcal: k(r.kcal), how, min: k(r.durationMin), rest: k(r.restKcal), done: r.done, timed: r.timed ? t('train.kcal.timed', { n: r.timed }) : '', watch: r.watch != null ? t('train.kcal.watch', { v: k(r.watch) }) : '' });
}

/* log — тренировка или идущая сессия; onStats(stats) сохраняет поля с часов */
export function StrengthKcalCard({ log, onStats, elapsedSec = null }) {
  const app = useApp();
  const st = log.stats || {};
  const put = (patch) => onStats(Object.assign({}, st, patch));
  let r = null;
  try { r = estimateForLog(log, app, elapsedSec); } catch (e) { r = null; }
  const gymSteps = app.repos.expenditureSettings.get().gymSteps ?? JOURNAL_GYM_STEPS_DEFAULT;
  return html`<${Card} title=${t('train.kcal.title')} icon="flame" color="var(--k-burn)">
    <${ZeppShot} onData=${(d) => put(d)}/>
    <div class="grid2">
      ${FIELDS.map(([k, l, m]) => html`<label class="fld"><span class="lbl">${t(l)}</span>
        <${NumIn} mode=${m} digits=${m === 'numeric' ? 0 : 1} value=${st[k]} label=${t(l)} onCommit=${(v) => put({ [k]: v == null ? null : m === 'numeric' ? Math.round(v) : Math.round(v * 10) / 10 })}/></label>`)}
    </div>
    <div class="hint" style="margin-top:8px">${strengthText(r)}</div>
    <div class="hint" style="margin-top:4px">${t('train.kcal.gymSteps', { n: fmtNum(gymSteps) })}</div>
  <//>`;
}
