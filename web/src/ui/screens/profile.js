/* Профиль: имя, пол, дата рождения, рост. Сохраняется сразу при изменении. */
import { html, useApp, useData, useState, todayYmd } from '../core.js';
import { Page, Card, Segmented, Field } from '../kit.js';
import { t, fmtNum } from '../../i18n/index.js';
import { cmToFtIn, ftInToCm } from '../../domain/units.js';
import { validDate } from '../../data/schema.js';

export function ageOn(birth, today) {
  if (!validDate(birth)) return null;
  const [by, bm, bd] = birth.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
  return ty - by - ((tm < bm || (tm === bm && td < bd)) ? 1 : 0);
}

export function Profile() {
  const { repos } = useApp();
  useData('profile');
  const p = repos.profile.get();
  const [err, setErr] = useState({});
  const [draft, setDraft] = useState({});
  const imperial = p.units.length === 'in';
  const today = todayYmd();

  async function save(patch, key) {
    try { await repos.profile.update(patch); setErr((e) => ({ ...e, [key]: null })); }
    catch (e) { setErr((x) => ({ ...x, [key]: t('profile.invalid') })); }
  }

  function onBirth(v) {
    if (!v) { save({ birthDate: null }, 'birth'); return; }
    const age = ageOn(v, today);
    if (age == null || age < 0 || age > 120) { setErr((e) => ({ ...e, birth: t('profile.birth.bad') })); return; }
    save({ birthDate: v }, 'birth');
  }

  function onHeightCm(v) {
    setDraft((d) => ({ ...d, h: v }));
    const n = Number(String(v).replace(',', '.'));
    if (v === '') return save({ heightCm: null }, 'height');
    if (!(n >= 50 && n <= 272)) { setErr((e) => ({ ...e, height: t('profile.height.bad') })); return; }
    save({ heightCm: Math.round(n * 10) / 10 }, 'height');
  }

  function onHeightImp(ft, inch) {
    setDraft((d) => ({ ...d, ft, inch }));
    const cm = ftInToCm(ft, inch);
    if (cm == null) return save({ heightCm: null }, 'height');
    if (!(cm >= 50 && cm <= 272)) { setErr((e) => ({ ...e, height: t('profile.height.bad') })); return; }
    save({ heightCm: Math.round(cm * 10) / 10 }, 'height');
  }

  const age = ageOn(p.birthDate, today);
  const fi = cmToFtIn(p.heightCm);

  return html`<${Page} title=${t('profile.title')} icon="user" color="linear-gradient(135deg,#9B99FF,#5856D6)" back="/more" backLabel=${t('nav.more')}>
    <${Card}>
      <${Field} label=${t('profile.name')}>
        <input value=${p.name} placeholder=${t('profile.name.ph')} autocomplete="given-name" onChange=${(e) => save({ name: e.currentTarget.value.trim() }, 'name')}/>
      <//>
      <div style="height:14px"></div>
      <${Segmented} label=${t('profile.sex')} value=${p.sex} options=${[['male', t('profile.sex.male')], ['female', t('profile.sex.female')]]} onChange=${(v) => save({ sex: v }, 'sex')}/>
      <div class="hint">${t('profile.sex.hint')}</div>
    <//>
    <${Card}>
      <div class="grid2">
        <${Field} label=${t('profile.birth')} error=${err.birth} hint=${age != null ? t('profile.age', { count: age }) : null}>
          <input type="date" value=${p.birthDate || ''} max=${today} onChange=${(e) => onBirth(e.currentTarget.value)}/>
        <//>
        ${imperial ? html`<${Field} label=${t('profile.height.ftin')} error=${err.height}>
            <div class="row">
              <input inputmode="numeric" aria-label=${t('unit.ft')} placeholder=${t('unit.ft')} value=${draft.ft ?? (fi ? fi.ft : '')} onInput=${(e) => onHeightImp(e.currentTarget.value, draft.inch ?? (fi ? fi.inch : 0))}/>
              <input inputmode="numeric" aria-label=${t('unit.in')} placeholder=${t('unit.in')} value=${draft.inch ?? (fi ? fi.inch : '')} onInput=${(e) => onHeightImp(draft.ft ?? (fi ? fi.ft : 0), e.currentTarget.value)}/>
            </div>
          <//>`
        : html`<${Field} label=${t('profile.height')} error=${err.height}>
            <input inputmode="decimal" placeholder="175" value=${draft.h ?? (p.heightCm != null ? fmtNum(p.heightCm, 1) : '')} onInput=${(e) => onHeightCm(e.currentTarget.value)}/>
          <//>`}
      </div>
      <div class="hint">${t('profile.why')}</div>
    <//>
  <//>`;
}
