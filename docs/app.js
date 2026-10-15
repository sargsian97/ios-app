import { openStore, parseBackup } from './store.js';

(function(){
'use strict';

/* ---------- helpers ---------- */
var DOW=['вс','пн','вт','ср','чт','пт','сб'];
var SCHED={1:'A',3:'B',5:'C'};
var DAYWD={A:'Пн',B:'Ср',C:'Пт'};
var MEALS=[['b','Завтрак'],['l','Обед'],['d','Ужин'],['s','Перекус']];
function pad(n){return n<10?'0'+n:''+n;}
function ymd(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function parseD(s){var p=String(s).split('-');return new Date(+p[0],+p[1]-1,+p[2]);}
function addDays(s,n){var d=parseD(s);d.setDate(d.getDate()+n);return ymd(d);}
function fmt(s){var d=parseD(s);return LANG==='en'?DOW[d.getDay()]+', '+MON_SH[d.getMonth()]+' '+d.getDate():pad(d.getDate())+'.'+pad(d.getMonth()+1)+' '+DOW[d.getDay()];}
function fmtS(s){var d=parseD(s);return LANG==='en'?MON_SH[d.getMonth()]+' '+d.getDate():pad(d.getDate())+'.'+pad(d.getMonth()+1);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function clone(o){return JSON.parse(JSON.stringify(o));}
function num(v){v=String(v==null?'':v).trim().replace(',','.');if(v==='')return '';var n=parseFloat(v);return isNaN(n)?'':n;}
function upper(s){var m=String(s==null?'':s).match(/\d+/g);return m?Number(m[m.length-1]):'';}
function nz(v){return v!==''&&v!=null&&!isNaN(v);}
function nv(v,d){return nz(v)?Number(v):d;}
function nextTrainingDate(from){var d=parseD(from);for(var i=1;i<=8;i++){d.setDate(d.getDate()+1);if(SCHED[d.getDay()])return ymd(d);}return from;}
function r2(n){return Math.round(n*100)/100;}
function r1(n){return Math.round(n*10)/10;}
function fmtN(n){var t=String(r2(n));return LANG==='en'?t:t.replace('.',',');}
function fmt1(n){var t=String(r1(n));return LANG==='en'?t:t.replace('.',',');}
function th(n){return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,LANG==='en'?',':'\u00a0');}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function mealByHour(){var h=new Date().getHours();return h<11?'b':h<16?'l':h<21?'d':'s';}
function mealName(k){for(var i=0;i<MEALS.length;i++)if(MEALS[i][0]===k)return MEALS[i][1];return 'Еда';}

/* ---------- state ---------- */
var today=ymd(new Date());
var S={
  tab:'train', db:null, error:null, ready:{w:0,b:0,t:0,d:0,f:0,l:0,s:0,i:0},
  workouts:{}, body:{}, templates:{}, tplDraft:{}, tplDirty:{}, days:{}, food:{}, foods:{}, settings:{},
  date:today, day:'A', draft:null, draftDirty:false,
  dayDraft:null, dayDirty:false, foodDraft:null, foodDirty:false, setDraft:null, setDirty:false,
  saveState:'', dayManual:false, dayWhy:'', planDay:'A', planView:'tpl', foodView:'diary', lq:'',
  bodyDate:today, bodyMonth:today.slice(0,7), bodyForm:{}, bodyMsg:'', bodyDirtyForm:false,
  metric:'weight', histOpen:{}, histSel:today, histMonth:today.slice(0,7), histRange:'week', rest:null, modal:null, sheet:null, lastMeal:null, needRender:false, sample:null, photo:null, photoWhy:'', photoMax:0
};
var $app=document.getElementById('app');
var $tabs=document.getElementById('tabs');
var timers={}, chain=Promise.resolve(), pend={w:0,d:0,f:0,s:0};
var wd0=SCHED[parseD(today).getDay()];
S.day=wd0||SCHED[parseD(nextTrainingDate(today)).getDay()];

/* ---------- write queue ---------- */
function enqueue(fn){
  chain=chain.then(fn).catch(function(e){S.saveState='error';S.saveErr=(e&&e.message)||String(e);paintStatus();});
  return chain;
}
function trackWrite(kind,fn){
  pend[kind]=(pend[kind]||0)+1;
  return enqueue(fn).then(function(){pend[kind]--;});
}
function allReady(){var r=S.ready;return r.w&&r.b&&r.t&&r.d&&r.f&&r.l&&r.s&&r.i;}

/* ---------- settings ---------- */
var DEF={base:2000,trainKcal:500,corrPct:0,offset:0,protein:140,fat:60,fiber:30,height:173,age:29};
function cfg(){
  var s=S.setDraft||S.settings.main||{},o={};
  Object.keys(DEF).forEach(function(k){o[k]=nz(s[k])?Number(s[k]):DEF[k];});
  o.kPer1000=nz(s.kPer1000)?Number(s.kPer1000):'';
  o.stepLen=nz(s.stepLen)?Number(s.stepLen):'';
  o.restTarget=nz(s.restTarget)?Number(s.restTarget):120;o.restBell=Number(s.restBell)===1;
  return o;
}
function weightOn(date){
  var ids=Object.keys(S.body).filter(function(k){return k<=date&&nz(S.body[k].weight);}).sort();
  return ids.length?Number(S.body[ids[ids.length-1]].weight):84;
}

/* ---------- day / burn / food data ---------- */
var CARDIO=[['treadmill','Беговая дорожка'],['elliptical','Эллипс'],['bike','Велотренажёр'],['stepper','Степпер'],['rower','Гребной тренажёр'],['outdoor','На улице (ходьба/бег)'],['other','Другое']];
function cardioName(k){for(var i=0;i<CARDIO.length;i++)if(CARDIO[i][0]===k)return CARDIO[i][1];return 'Кардио';}
function newSession(){return {id:uid(),type:'treadmill',minutes:'',km:'',speed:'',incline:'',avgHr:'',maxHr:'',kcalWatch:'',kcal:'',rpe:'',inSteps:true,note:''};}
function cardioMetrics(s){
  var min=nz(s.minutes)?Number(s.minutes):0,v=nz(s.speed)?Number(s.speed):0,km=nz(s.km)?Number(s.km):0;
  if(!v&&km>0&&min>0)v=km/(min/60);
  if(!km&&v>0&&min>0)km=v*min/60;
  return {min:min,v:v,km:km};
}
function cardioEst(s,weight,base){
  var m=cardioMetrics(s),walkRun=(s.type==='treadmill'||s.type==='outdoor');
  var out={kcal:0,src:'',steps:0,stepsSrc:'',stepLen:0,v:m.v,km:m.km,min:m.min};
  if(walkRun&&s.inSteps!==false){
    if(nz(s.steps)&&Number(s.steps)>0){out.steps=Number(s.steps);out.stepsSrc='по браслету';}
    else if(m.km>0){
      var cf=cfg(),H=cf.height/100;
      var len=cf.stepLen!==''?cf.stepLen:(m.v<=6.4?0.42*H:0.6*H);
      out.stepLen=len;out.steps=Math.round(m.km*1000/len);out.stepsSrc='оценка по длине шага '+fmtN(len)+' м';
    }
  }
  if(nz(s.kcal)){out.kcal=Number(s.kcal);out.src='твоя оценка';return out;}
  if(walkRun&&m.v>0&&m.min>0){
    var sp=m.v*1000/60,g=(s.type==='treadmill'&&nz(s.incline)?Number(s.incline):0)/100;
    var vo2=m.v<=6.4?(0.1*sp+1.8*sp*g):(0.2*sp+0.9*sp*g);
    out.kcal=vo2*weight*5/1000*m.min;out.src='формула ACSM, без покоя';return out;
  }
  if(nz(s.kcalWatch)&&m.min>0){out.kcal=Math.max(0,Number(s.kcalWatch)-base/1440*m.min);out.src='часы минус покой';return out;}
  out.src='впиши ккал по часам или скорость и время';return out;
}
function defaultLifted(date){
  var dd=S.days[date];
  if(dd&&dd.lifted!==undefined&&dd.lifted!==null)return !!dd.lifted;
  if(S.workouts[date])return true;
  return !!SCHED[parseD(date).getDay()];
}
function dayInfo2(date){
  var dd=S.days[date]||{},w=S.workouts[date]||{};
  return {date:date,lifted:defaultLifted(date),steps:nz(dd.steps)?dd.steps:(nz(w.steps)?w.steps:''),trainKcal:nz(dd.trainKcal)?dd.trainKcal:'',cardioOn:!!dd.cardioOn,cardio:dd.cardio?clone(dd.cardio):[]};
}
function dayInfo(date){
  if(date===S.date&&S.dayDraft)return S.dayDraft;
  return dayInfo2(date);
}
function foodEntries(date){
  if(date===S.date&&S.foodDraft)return S.foodDraft.entries;
  return (S.food[date]&&S.food[date].entries)||[];
}
function sumEntries(en){
  var t={kcal:0,p:0,f:0,c:0,fib:0,pa:0,pv:0};
  en.forEach(function(e){t.kcal+=Number(e.kcal)||0;t.p+=Number(e.p)||0;t.f+=Number(e.f)||0;t.c+=Number(e.c)||0;t.fib+=Number(e.fib)||0;t.pa+=Number(e.pa)||0;t.pv+=Number(e.pv)||0;});
  return t;
}
/* время подхода: замер таймера, если он правдоподобен; иначе оценка по повторам */
function setWorkEst(x){var r=nz(x.r)?Number(x.r):0;return r>0?24+3*r:50;}
function setWork(x){var e=setWorkEst(x);if(nz(x.dur)){var d=Number(x.dur);if(d>=0.5*e&&d<=2*e)return d;}return e;}
function strengthStats(w){
  var o={work:0,rest:0,n:0,done:0},rm=0;
  ((w&&w.exercises)||[]).forEach(function(e){(e.sets||[]).forEach(function(x){
    if(x.done||nz(x.r)){o.done++;o.work+=setWork(x);}
    if(nz(x.dur))o.n++;
    if(nz(x.rest))rm+=Number(x.rest);
  });});
  var tot=(w&&nz(w.durationMin))?Number(w.durationMin)*60:0;
  o.rest=tot>0?Math.max(0,tot-o.work):rm; /* отдых и переходы = вся тренировка минус подходы */
  return o;
}
function strengthKcal(date){
  var w=(date===S.date&&S.draft)?S.draft:S.workouts[date];if(!w)return null;
  var st=strengthStats(w);
  if(st.done<3||(!nz(w.durationMin)&&st.n<0.6*st.done))return null;
  var f=3.5*weightOn(date)/200/60; /* ккал на 1 MET за секунду */
  var other=nz(w.durationMin)?Math.max(0,Number(w.durationMin)*60-st.work-st.rest):0; /* переходы между упражнениями, разминка */
  /* модель: подход 6 MET, отдых 2.5 MET (быстрый темп, пульс не падает до покоя), +10% на восстановление после нагрузки */
  var model=(st.work*(6.0-1)+st.rest*(2.5-1)+other*(2.5-1))*f*1.1;
  var kcal=model,kw=null,src='model',bb=Number(cfg().base)||2000;
  if(nz(w.durationMin)&&Number(w.durationMin)>0){
    if(nz(w.kcalWatch)){ /* часы: берём как есть, вычитая только покой (он уже в базовых 2000) */
      kw=Math.max(0,Number(w.kcalWatch)-Number(w.durationMin)*bb/1440);kcal=kw;src='watch';
    }else{ /* часы не вписаны: личный средний расход ккал/мин по прошлым тренировкам с часами */
      var rt=[];Object.keys(S.workouts).forEach(function(d){var o=S.workouts[d];if(o&&d!==date&&nz(o.kcalWatch)&&nz(o.durationMin)&&Number(o.durationMin)>0)rt.push(Number(o.kcalWatch)/Number(o.durationMin));});
      if(rt.length){var r=rt.reduce(function(x,y){return x+y;},0)/rt.length;kw=Math.max(0,(r-bb/1440)*Number(w.durationMin));kcal=kw;src='personal';}
    }
  }
  return {kcal:kcal,src:src,model:model,watch:kw,work:st.work,rest:st.rest,other:other,n:st.n,done:st.done};
}
function burn(date){
  var c=cfg(),di=dayInfo(date),w=weightOn(date);
  var steps=nz(di.steps)?Number(di.steps):0;
  var cNet=0,cSteps=0;
  if(di.cardioOn)(di.cardio||[]).forEach(function(s){var e=cardioEst(s,w,c.base);cNet+=e.kcal;cSteps+=e.steps;});
  var k=c.kPer1000!==''?c.kPer1000:0.37*w; /* ккал на 1000 шагов */
  var wk=(date===S.date&&S.draft)?S.draft:S.workouts[date],gs=(di.lifted&&wk&&nz(wk.gymSteps))?Number(wk.gymSteps):0; /* шаги в зале уже учтены в ккал силовой */
  var stepsEff=Math.max(0,steps-cSteps-gs);
  var stepK=stepsEff*k/1000;
  var sk=di.lifted&&!nz(di.trainKcal)?strengthKcal(date):null;
  var train=di.lifted?(nz(di.trainKcal)?Number(di.trainKcal):(sk?sk.kcal:c.trainKcal)):0;
  var raw=c.base+stepK+train+cNet;
  var burned=raw*(1+c.corrPct/100);
  return {base:c.base,steps:steps,gymSteps:gs,cardioSteps:Math.min(cSteps,steps),cardioOn:!!di.cardioOn,cardioNet:cNet,k:k,stepK:stepK,train:train,trainTimer:!!sk,lifted:di.lifted,skipped:(!di.lifted&&!!SCHED[parseD(date).getDay()]),raw:raw,corr:c.corrPct,burned:burned,goal:burned+c.offset,offset:c.offset,hasSteps:nz(di.steps)};
}

/* ---------- drafts ---------- */
/* упражнение с вариантами: берём тот, что не делали в прошлый раз */
function pickAlt(alt,date){
  var ids=Object.keys(S.workouts).filter(function(d){return d<date;}).sort().reverse();
  for(var i=0;i<ids.length;i++){var w=S.workouts[ids[i]];if(!workoutLogged(w))continue;
    for(var j=0;j<(w.exercises||[]).length;j++){var k=alt.indexOf(w.exercises[j].name);if(k>=0)return alt[(k+1)%alt.length];}}
  return alt[0];
}
function buildFromTemplate(day,date){
  var t=S.templates[day],ex=[];
  if(t&&t.exercises){
    t.exercises.forEach(function(e){
      var n=Math.max(1,parseInt(e.sets,10)||3),sets=[];
      for(var i=0;i<n;i++)sets.push({w:nz(e.weight)?Number(e.weight):'',r:'',done:false});
      ex.push({name:(e.alt&&e.alt.length>1?pickAlt(e.alt,date):(e.name||'Упражнение')),reps:String(e.reps==null?'':e.reps),target:n+'×'+(e.reps==null?'':e.reps),sets:sets});
    });
  }
  return {date:date,day:day,exercises:ex,durationMin:'',avgHr:'',kcalWatch:'',note:''};
}
function workoutLogged(w){return !!w&&(w.exercises||[]).some(function(e){return (e.sets||[]).some(function(x){return x.done||nz(x.r);});});}
function trackStart(){
  var ks=Object.keys(S.workouts).concat(Object.keys(S.days)).concat(Object.keys(S.food)).sort();
  return ks.length?ks[0]:today;
}
function suggestType(date){
  /* самая давняя пропущенная плановая тренировка за 7 дней, иначе следующая по циклу */
  var st=trackStart();
  for(var i=7;i>=1;i--){
    var d0=addDays(date,-i),t=SCHED[parseD(d0).getDay()];
    if(!t||d0<st)continue;
    var made=Object.keys(S.workouts).some(function(k){var w=S.workouts[k];return k>=d0&&k<date&&w.day===t&&workoutLogged(w);});
    if(!made)return {type:t,why:'пропущена '+fmt(d0)};
  }
  var nd=nextTrainingDate(date);
  return {type:SCHED[parseD(nd).getDay()],why:'следующая по циклу'};
}
function autoDay(date){
  var wd=SCHED[parseD(date).getDay()];
  return wd?{type:wd,why:''}:suggestType(date);
}
function loadDraft(){
  var w=S.workouts[S.date];
  if(w){S.draft=clone(w);if(w.day)S.day=w.day;S.dayWhy='';}
  else{
    if(!S.dayManual){var ad=autoDay(S.date);S.day=ad.type;S.dayWhy=ad.why;}
    S.draft=buildFromTemplate(S.day,S.date);
  }
  S.draftDirty=false;
}
function loadDay(){
  var di=dayInfo2(S.date);S.dayDraft=di;S.dayDirty=false;
}
function loadFood(){
  var f=S.food[S.date];
  S.foodDraft={date:S.date,entries:f&&f.entries?clone(f.entries):[]};S.foodDirty=false;
}
function loadSettings(){S.setDraft=S.settings.main?clone(S.settings.main):{};S.setDirty=false;}
function loadAll(){loadDraft();loadDay();loadFood();}

function markDirty(){S.draftDirty=true;S.saveState='pending';paintStatus();clearTimeout(timers.w);timers.w=setTimeout(persistDraft,1200);}
function persistDraft(){
  clearTimeout(timers.w);
  if(!S.db||!S.draft||!S.draftDirty)return Promise.resolve();
  var snap=clone(S.draft);snap.updatedAt=new Date().toISOString();S.draftDirty=false;var _st=strengthStats(snap);if(_st.n>0){snap.workSec=Math.round(_st.work);snap.restSec=Math.round(_st.rest);}else{delete snap.workSec;delete snap.restSec;}S.saveState='saving';paintStatus();
  return trackWrite('w',function(){
    return S.db.doc('workouts/'+snap.date).set(snap).then(function(){S.saveState='saved';paintStatus();},function(e){
      if(S.draft&&S.draft.date===snap.date)S.draftDirty=true;throw e;});
  });
}
function markDay(){S.dayDirty=true;S.saveState='pending';paintStatus();clearTimeout(timers.d);timers.d=setTimeout(persistDay,900);}
function persistDay(){
  clearTimeout(timers.d);
  if(!S.db||!S.dayDraft||!S.dayDirty)return Promise.resolve();
  var snap=clone(S.dayDraft);S.dayDirty=false;S.saveState='saving';paintStatus();
  return trackWrite('d',function(){
    return S.db.doc('days/'+snap.date).set(snap).then(function(){S.saveState='saved';paintStatus();},function(e){
      if(S.dayDraft&&S.dayDraft.date===snap.date)S.dayDirty=true;throw e;});
  });
}
function markFood(){S.foodDirty=true;S.saveState='pending';paintStatus();clearTimeout(timers.f);timers.f=setTimeout(persistFood,500);}
function persistFood(){
  clearTimeout(timers.f);
  if(!S.db||!S.foodDraft||!S.foodDirty)return Promise.resolve();
  var snap=clone(S.foodDraft);S.foodDirty=false;S.saveState='saving';paintStatus();
  return trackWrite('f',function(){
    return S.db.doc('food/'+snap.date).set(snap).then(function(){S.saveState='saved';paintStatus();},function(e){
      if(S.foodDraft&&S.foodDraft.date===snap.date)S.foodDirty=true;throw e;});
  });
}
function markSet(){S.setDirty=true;S.saveState='pending';paintStatus();clearTimeout(timers.s);timers.s=setTimeout(persistSet,1000);}
function persistSet(){
  clearTimeout(timers.s);
  if(!S.db||!S.setDraft||!S.setDirty)return Promise.resolve();
  var snap=clone(S.setDraft);S.setDirty=false;S.saveState='saving';paintStatus();
  return trackWrite('s',function(){
    return S.db.doc('settings/main').set(snap).then(function(){S.saveState='saved';paintStatus();},function(e){S.setDirty=true;throw e;});
  });
}
function markTpl(x){
  S.tplDirty[x]=true;S.saveState='pending';paintStatus();
  clearTimeout(timers['t'+x]);timers['t'+x]=setTimeout(function(){persistTpl(x);},1200);
}
function persistTpl(x){
  clearTimeout(timers['t'+x]);
  if(!S.db||!S.tplDirty[x]||!S.tplDraft[x])return Promise.resolve();
  var snap=clone(S.tplDraft[x]);S.tplDirty[x]=false;S.saveState='saving';paintStatus();
  return enqueue(function(){
    return S.db.doc('templates/'+x).set(snap).then(function(){S.saveState='saved';paintStatus();},function(e){S.tplDirty[x]=true;throw e;});
  });
}
function persistAll(){persistDraft();persistDay();persistFood();persistSet();persistTpl('A');persistTpl('B');persistTpl('C');}

/* ---------- workout history lookups ---------- */
function lastTime(name,date){
  var ids=Object.keys(S.workouts).filter(function(k){return k<date;}).sort().reverse();
  for(var i=0;i<ids.length;i++){
    var w=S.workouts[ids[i]];
    for(var j=0;j<(w.exercises||[]).length;j++){
      var e=w.exercises[j];
      if(e.name===name){
        var sets=(e.sets||[]).filter(function(s){return s.done||nz(s.r);});
        if(sets.length)return {date:ids[i],sets:sets};
      }
    }
  }
  return null;
}
function setStr(s){return (nz(s.w)?fmtN(s.w)+' кг × ':'')+(nz(s.r)?s.r:'?');}
function lastHtml(ex){
  var lt=lastTime(ex.name,S.date);
  if(!lt)return '';
  var first=setStr(lt.sets[0]),same=lt.sets.every(function(s){return setStr(s)===first;});
  var txt=same?lt.sets.length+' × '+first:lt.sets.map(setStr).join(' · ');
  var out='Прошлый раз ('+fmtS(lt.date)+'): '+esc(txt);
  var up=upper(ex.reps);
  var hit=nz(up)&&lt.sets.length>=2&&lt.sets.every(function(s){return nz(s.r)&&Number(s.r)>=up;})&&nz(lt.sets[0].w)&&Number(lt.sets[0].w)>0;
  if(hit)out+=' · <b>все подходы закрыты — можно добавить вес</b>';
  return '<div class="last">'+out+'</div>';
}

/* ---------- status / modal ---------- */
function statusHtml(){
  var t='',c='status';
  if(S.saveState==='saved'){t='Сохранено ✓';c+=' ok';}
  else if(S.saveState==='saving'){t='Сохраняю…';}
  else if(S.saveState==='pending'){t='Изменения…';}
  else if(S.saveState==='error'){t='Не сохранилось';c+=' err';}
  return '<span class="'+c+'" id="st">'+t+'</span>';
}
function paintStatus(){
  var el=document.getElementById('st');if(!el)return;
  var tmp=document.createElement('div');tmp.innerHTML=statusHtml();
  el.className=tmp.firstChild.className;el.textContent=tmp.firstChild.textContent;
}
function ask(text,yes,cb){S.modal={text:text,yes:yes,cb:cb};render(true);}

/* ---------- shared widgets ---------- */
function dateBar(title,chips,body){
  var lab=S.date===today?'Сегодня':(S.date===addDays(today,-1)?'Вчера':(S.date===addDays(today,1)?'Завтра':''));
  return '<div class="lt"><h1 class="htitle">'+tbadge(TBT[title])+esc(title)+'</h1>'+statusHtml()+'</div>'
    +'<div class="dnav"><button class="ghost" data-act="dateShift" data-n="-1" aria-label="Назад">‹</button>'
    +'<div class="dmid"><input type="date" data-f="date" value="'+esc(S.date)+'"><div class="hsub">'+esc(fmt(S.date))+(lab?' · '+lab:'')+'</div></div>'
    +'<button class="ghost" data-act="dateShift" data-n="1" aria-label="Вперёд">›</button></div>'
    +(chips||'')+(body?'<div class="card pad ringcard">'+body+'</div>':'');
}
function fld(label,key,val,mode,ph){
  return '<div><label class="lbl">'+esc(label)+'</label><input data-f="'+key+'" inputmode="'+(mode||'text')+'" placeholder="'+esc(ph||'')+'" value="'+esc(val)+'"></div>';
}

/* ---------- render: train / day ---------- */
/* ---------- иконки и карточки в стиле Apple Health ---------- */
var IC={
  cal:'<rect x="3.5" y="5" width="17" height="15.5" rx="3.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M3.5 10h17M8 3v3.5M16 3v3.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="8.2" cy="14.4" r="1.1"/><circle cx="12" cy="14.4" r="1.1"/><circle cx="15.8" cy="14.4" r="1.1"/>',
  list:'<rect x="5" y="3.5" width="14" height="17.5" rx="3.2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M9 9h6M9 13h6M9 17h3.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  flame:'<path d="M12 2.4c.5 3.2-2.4 5-3.8 7.4A6.2 6.2 0 0 0 12 21.6a6.2 6.2 0 0 0 5.6-8.4c-.9-1.6-2.1-2.3-2.8-3.8-.5 1.3-1.4 2-2.5 2.2.9-3.1.1-6.1-.3-9.2z"/>',
  steps:'<ellipse cx="8" cy="15.2" rx="2.7" ry="3.9"/><ellipse cx="8" cy="9.6" rx="1.4" ry="1.5"/><ellipse cx="16" cy="9.8" rx="2.7" ry="3.9"/><ellipse cx="16" cy="4.2" rx="1.4" ry="1.5"/>',
  dumb:'<rect x="2" y="9" width="2.6" height="6" rx="1"/><rect x="4.6" y="6.5" width="3.2" height="11" rx="1.3"/><rect x="7.8" y="11" width="8.4" height="2" rx="1"/><rect x="16.2" y="6.5" width="3.2" height="11" rx="1.3"/><rect x="19.4" y="9" width="2.6" height="6" rx="1"/>',
  apple:'<path d="M12 7.6c-1.5-1.2-3.3-1.5-4.8-.9C4.9 7.6 3.9 10 4.5 13c.6 3 2.5 6.1 4.5 6.1 1 0 1.6-.6 3-.6s2 .6 3 .6c2 0 3.9-3.1 4.5-6.1.6-3-.4-5.4-2.7-6.3-1.5-.6-3.3-.3-4.8.9z"/><path d="M12.3 6.8c-.3-1.9.7-3.6 2.7-4.3.3 1.9-.7 3.6-2.7 4.3z"/>',
  heart:'<path d="M12 21.2S3 15.7 3 9.3C3 6.4 5.2 4.3 7.9 4.3c1.7 0 3.2.9 4.1 2.3.9-1.4 2.4-2.3 4.1-2.3 2.7 0 4.9 2.1 4.9 5 0 6.4-9 11.9-9 11.9z"/>',
  body:'<circle cx="12" cy="4.3" r="2.3"/><path d="M3.5 8.8h17M12 8.8v5.8m0 0-3.6 6.8m3.6-6.8 3.6 6.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  scale:'<rect x="3.5" y="3.5" width="17" height="17" rx="4.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M7.6 11.4a4.4 4.4 0 0 1 8.8 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M12 11.4l2-2.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  ruler:'<rect x="2.5" y="7" width="19" height="10" rx="2.8" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M6.5 7v3.4M10 7v5M13.5 7v3.4M17 7v5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  clock:'<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 7.2V12l3.2 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  spark:'<path d="M12 2.8l1.9 5.6 5.6 1.9-5.6 1.9L12 17.8l-1.9-5.6-5.6-1.9 5.6-1.9z"/><path d="M18.6 15.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  save:'<path d="M12 3.5v10.2m0 0-4-4m4 4 4-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 14.5v3.2a2.8 2.8 0 0 0 2.8 2.8h9.4a2.8 2.8 0 0 0 2.8-2.8v-3.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  camera:'<path d="M8.6 5.5l1.2-1.8h4.4l1.2 1.8h2.9a2.7 2.7 0 0 1 2.7 2.7v8.6a2.7 2.7 0 0 1-2.7 2.7H5.7A2.7 2.7 0 0 1 3 16.8V8.2a2.7 2.7 0 0 1 2.7-2.7z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12.4" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/>',
  photo:'<rect x="3" y="4.5" width="18" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="M3.8 17.2l4.9-4.6 3.4 3 3.1-2.6 5 4.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
};
function ico(k,cls){return '<svg class="ico'+(cls?' '+cls:'')+'" viewBox="0 0 24 24" aria-hidden="true">'+IC[k]+'</svg>';}
var TB={train:['dumb','linear-gradient(135deg,#9B99FF,#5856D6)'],food:['apple','linear-gradient(135deg,#FF7A6E,#FF2D55)'],body:['body','linear-gradient(135deg,#DA7DF3,#AF52DE)'],hist:['cal','linear-gradient(135deg,#5BE7DA,#14B8A6)'],plan:['list','linear-gradient(135deg,#5AB0FF,#0A84FF)']};
var TBT={'Тренировки':'train','Тренировка':'train','Питание':'food'};
var TAB_RGB={train:'138,135,255',food:'255,69,58',body:'191,90,242',hist:'48,213,200',plan:'10,132,255'};
function tbadge(k){var t=TB[k];return t?'<span class="tbadge" style="background:'+t[1]+'">'+ico(t[0])+'</span>':'';}
function chip2(k,grad){return '<span class="chip2" style="background:'+grad+'">'+ico(k)+'</span>';}
var MC={b:'#FFB800',l:'#FF7A1A',d:'#8A87FF',s:'#FF2D55'};
function h2i(k,color,txt){return '<h2 class="h2i" style="--cc:'+color+'">'+ico(k)+'<span>'+esc(txt)+'</span></h2>';}
function miniBars(vals,color){
  var n=vals.length,mx=Math.max.apply(null,vals.concat([1])),W=92,H=46,bw=9,gap=n>1?(W-n*bw)/(n-1):0,s='<svg class="mc" viewBox="0 0 '+W+' '+H+'" aria-hidden="true">';
  vals.forEach(function(v,i){
    var hh=v>0?Math.max(4,v/mx*(H-4)):3,last=i===n-1;
    s+='<rect x="'+(i*(bw+gap)).toFixed(1)+'" y="'+(H-hh).toFixed(1)+'" width="'+bw+'" height="'+hh.toFixed(1)+'" rx="2.4" class="'+(last?'mbl':'mb')+'" style="'+(last?'fill:'+color:'')+'"/>';
  });
  return s+'</svg>';
}
function hcard(o){
  return '<div class="hc" style="--cc:'+o.color+'"><div class="hch"><span class="hci">'+ico(o.ic)+'</span><span class="hct">'+esc(o.title)+'</span><span class="hcw">'+esc(o.when||'')+'</span></div>'
    +'<div class="hcb"><div class="hcl"><div class="hcs">'+esc(o.label||'')+'</div><div class="hcn"><b'+(o.vid?' id="'+o.vid+'"':'')+'>'+o.value+'</b><small>'+esc(o.unit||'')+'</small></div></div><div class="hcc">'+(o.chart||'')+'</div></div></div>';
}
function last7(fn){var a=[];for(var i=6;i>=0;i--)a.push(fn(addDays(S.date,-i)));return a;}
function setsDone(date){
  var w=(date===S.date&&S.draft)?S.draft:S.workouts[date],n=0;
  ((w&&w.exercises)||[]).forEach(function(e){(e.sets||[]).forEach(function(x){if(x.done||nz(x.r))n++;});});
  return n;
}
var MT=[['weight','Вес','кг','scale','linear-gradient(145deg,#2F7BF0 0%,#6BA9FA 100%)','#4A90F5'],
  ['waist','Талия','см','ruler','linear-gradient(145deg,#C93BE6 0%,#DA7DF3 100%)','#C93BE6'],
  ['fat','Жир (расчёт)','%','heart','linear-gradient(145deg,#EC4A5F 0%,#F2848F 100%)','#EC4A5F'],
  ['thigh','Бёдра','см','body','linear-gradient(145deg,#6E78F2 0%,#9BA6F7 100%)','#7B86F4'],
  ['glute','Ягодицы','см','body','linear-gradient(145deg,#4FD1C0 0%,#8FE3D6 100%)','#3CC4B2'],
  ['bic','Бицепс','см','dumb','linear-gradient(145deg,#EE6B33 0%,#F2A07A 100%)','#EE6B33']];
function metricTilesHtml(){
  return '<div class="btiles">'+MT.map(function(x){
    var sr=series(x[0]),l=sr.length?sr[sr.length-1]:null,pv=sr.length>1?sr[sr.length-2].v:null;
    var dl=(l&&pv!=null)?(function(){var d=r2(l.v-pv);return d===0?'без изм.':(d>0?'+':'−')+fmtN(Math.abs(d));})():'';
    return '<div class="bti'+(S.metric===x[0]?' on':'')+'" style="background:'+x[4]+'" data-act="metric" data-m="'+x[0]+'">'+ico(x[3])
      +'<div class="bti-n">'+esc(x[1])+'</div><div class="bti-v">'+(l?fmtN(l.v)+'<small> '+x[2]+'</small>':'—')+'</div>'
      +'<div class="bti-d">'+(l?esc(fmtS(l.d))+(dl?' · '+dl:''):'нет данных')+'</div></div>';
  }).join('')+'</div>';
}

function burnInner(b){
  var h=h2i('flame','var(--k-burn)','Расход калорий за день');
  h+='<div class="kv"><span>Базовый обмен (BMR) + переваривание</span><span>'+th(b.base)+'</span></div>';
  h+='<div class="kv"><span>Шаги: '+(b.hasSteps?th(b.steps)+(b.cardioSteps?' (без '+th(b.cardioSteps)+' из кардио)':'')+' · ≈'+fmtN(b.k)+' на 1000':'не внесены')+'</span><span>'+(b.hasSteps?'≈ '+th(b.stepK):'—')+'</span></div>';
  if(b.cardioOn)h+='<div class="kv"><span>Кардио (без покоя)</span><span>≈ '+th(b.cardioNet)+'</span></div>';
  h+='<div class="kv"><span>Силовая тренировка'+(b.trainTimer?' (по таймеру)':'')+'</span><span>'+(b.lifted?th(b.train):(b.skipped?'пропущена, 0':'нет'))+'</span></div>';
  if(b.corr)h+='<div class="kv"><span>Поправка '+(b.corr>0?'+':'')+b.corr+'%</span><span>'+(b.burned-b.raw>0?'+':'')+th(b.burned-b.raw)+'</span></div>';
  h+='<div class="kv tot"><span>Итого расход</span><span>≈ '+th(b.burned)+' ккал</span></div>';
  if(b.offset)h+='<div class="kv"><span>Цель по еде ('+(b.offset>0?'+':'')+b.offset+')</span><span>'+th(b.goal)+' ккал</span></div>';
  h+='<div class="hint">Шаги считаются от веса ('+fmtN(weightOn(S.date))+' кг). Шаги кардио-дорожки не считаются дважды. Настройки — во вкладке «План».</div>';
  return h;
}
function paintBurn(){
  var el=document.getElementById('burncard');if(el)el.innerHTML=burnInner(burn(S.date));
  var a=document.getElementById('hcS'),c=document.getElementById('hcB'),dd=S.dayDraft;
  if(a&&dd)a.textContent=nz(dd.steps)?th(dd.steps):'—';
  if(c)c.textContent=th(burn(S.date).burned);
}
function cfld(label,key,s,ci,mode,ph){
  return '<div><label class="lbl">'+esc(label)+'</label><input data-f="cd_'+key+'" data-ci="'+ci+'" inputmode="'+(mode||'decimal')+'" placeholder="'+esc(ph||'')+'" value="'+esc(s[key])+'"></div>';
}
function cardioInfo(s){
  var e=cardioEst(s,weightOn(S.date),cfg().base),h='';
  if(e.v>0){
    var pace=60/e.v,pm=Math.floor(pace),ps=Math.round((pace-pm)*60);if(ps===60){pm++;ps=0;}
    h+='Скорость '+fmtN(e.v)+' км/ч · темп '+pm+':'+pad(ps)+' мин/км';
    if(e.km>0)h+=' · '+fmtN(e.km)+' км';
    h+='<br>';
  }
  if(e.kcal>0)h+='<b>≈ '+th(e.kcal)+' ккал</b> ('+esc(e.src)+')';
  else h+=esc(e.src);
  if(e.steps>0)h+='<br>Шаги этой сессии ≈ '+th(e.steps)+' ('+esc(e.stepsSrc)+'), входят в дневные.';
  return h;
}
function cardioCard(s,ci){
  var tm=s.type==='treadmill',wr=tm||s.type==='outdoor';
  var h='<div class="card pad"><div class="exh"><div class="exn">Кардио '+(ci+1)+'</div><button class="small danger" data-act="cdDel" data-ci="'+ci+'">Убрать</button></div>'
    +'<label class="lbl">Тип</label><select data-f="cd_type" data-ci="'+ci+'">'+CARDIO.map(function(x){return '<option value="'+x[0]+'"'+(s.type===x[0]?' selected':'')+'>'+x[1]+'</option>';}).join('')+'</select>'
    +'<div class="grid2" style="margin-top:8px">'+cfld('Время, мин','minutes',s,ci)+cfld('Дистанция, км','km',s,ci)
    +cfld('Скорость, км/ч','speed',s,ci,'decimal','авто')+(tm?cfld('Наклон, %','incline',s,ci):'<div></div>')
    +cfld('Средний пульс','avgHr',s,ci,'numeric')+cfld('Макс. пульс','maxHr',s,ci,'numeric')
    +cfld('Ккал по часам','kcalWatch',s,ci,'numeric')+cfld('Ккал в расчёт','kcal',s,ci,'numeric','авто')
    +cfld('Усилие RPE (1–10)','rpe',s,ci,'decimal')+(wr?cfld('Шаги за сессию (браслет)','steps',s,ci,'numeric','авто'):'<div></div>')+'</div>';
  if(wr)h+='<div class="chkrow"><input type="checkbox" id="is'+ci+'" data-f="cd_inSteps" data-ci="'+ci+'"'+(s.inSteps!==false?' checked':'')+'><label for="is'+ci+'">Шаги этой сессии входят в шаги за день</label></div>';
  h+='<div class="prev" id="cinfo'+ci+'">'+cardioInfo(s)+'</div>'
    +'<label class="lbl">Заметка</label><input data-f="cd_note" data-ci="'+ci+'" value="'+esc(s.note)+'" placeholder="Интервалы, самочувствие…">'
    +'</div>';
  return h;
}
function renderCardio(dd){
  var h='<div class="card pad"><div class="togrow"><div class="togl">'+chip2('heart','linear-gradient(135deg,#7AD7FF,#32ADE6)')+'<div><b>Кардио</b><div class="hint">'+(dd.cardioOn?'Была отдельная кардио-сессия':'Отдельного кардио не было')+'</div></div></div>'
    +'<button class="sw'+(dd.cardioOn?' on':'')+'" data-act="cardio" aria-label="Кардио"><i></i></button></div></div>';
  if(!dd.cardioOn)return h;
  (dd.cardio||[]).forEach(function(s,ci){h+=cardioCard(s,ci);});
  h+='<button style="width:100%;margin:0 0 12px" data-act="cdAdd">+ Ещё одна кардио-сессия</button>';
  return h;
}
function renderTrain(){
  var d=S.draft,dd=S.dayDraft;if(!d||!dd)return '';
  var b0=burn(S.date);
  var st7=last7(function(d){var di=dayInfo(d);return nz(di.steps)?Number(di.steps):0;});
  var bn7=last7(function(d){var di=dayInfo(d);return nz(di.steps)?burn(d).burned:0;});
  var sd7=last7(setsDone),when=S.date===today?'Сегодня':fmtS(S.date);
  var chips=hcard({ic:'flame',color:'var(--k-burn)',title:'Расход',when:when,label:'Всего за день',value:th(b0.burned),vid:'hcB',unit:'ккал',chart:miniBars(bn7,'var(--k-burn)')})
    +hcard({ic:'steps',color:'var(--k-steps)',title:'Шаги',when:when,label:'За день',value:nz(dd.steps)?th(dd.steps):'—',vid:'hcS',unit:'шагов',chart:miniBars(st7,'var(--k-steps)')})
    +hcard({ic:'dumb',color:'var(--k-str)',title:'Силовая',when:when,label:(dd.lifted?'Сделано':(b0.skipped?'Пропуск':'Нет'))+(dd.cardioOn?' · + кардио':''),value:dd.lifted?String(setsDone(S.date)):'—',unit:'подходов',chart:miniBars(sd7,'var(--k-str)')});
  var h=dateBar('Тренировки',welcomeCard()+chips,'');
  h+='<div class="card pad"><div class="togrow"><div class="togl">'+chip2('dumb','linear-gradient(135deg,#9B99FF,#5856D6)')+'<div><b>Силовая тренировка</b><div class="hint">'+(dd.lifted?'Сделана — заполни ниже':((SCHED[parseD(S.date).getDay()]&&!S.workouts[S.date])?'Пропущена — расход считается без неё':'Не было'))+'</div></div></div>'
    +'<button class="sw'+(dd.lifted?' on':'')+'" data-act="lift" aria-label="Силовая тренировка"><i></i></button></div>';
  if(dd.lifted)h+='<div class="pills">'+['A','B','C'].map(function(x){return '<button class="pill'+(S.day===x?' on':'')+'" data-act="day" data-d="'+x+'">'+x+'</button>';}).join('')+'</div>'+(S.dayWhy?'<div class="hint">Выбрана '+S.day+': '+esc(S.dayWhy)+'. Можно переключить.</div>':'');
  h+='</div>';
  h+=renderCardio(dd);
  if(!dd.lifted){
    var nd=nextTrainingDate(S.date);
    h+='<div class="card pad next"><div><b>Следующая силовая</b><div class="hint">'+esc(fmt(nd))+' · день '+SCHED[parseD(nd).getDay()]+'</div></div><button class="primary" data-act="goDate" data-d="'+nd+'">Открыть</button></div>';
    if(S.workouts[S.date])h+='<div class="hint" style="margin:0 0 12px">За этот день есть записанная тренировка — включи тумблер, чтобы увидеть.</div>';
  }else{
    var total=0,done=0;
    d.exercises.forEach(function(e){e.sets.forEach(function(s){total++;if(s.done)done++;});});
    h+='<div class="card pad"><div class="bar" style="margin-top:0"><i style="width:'+(total?Math.round(done/total*100):0)+'%"></i></div><div class="hint">Выполнено '+done+' из '+total+' подходов</div></div>';
    if(!d.exercises.length)h+='<div class="card empty">В плане этого дня нет упражнений. Добавь их во вкладке «План» или ниже.</div>';
    d.exercises.forEach(function(ex,ei){
      h+='<div class="card ex" data-ei="'+ei+'"><div class="exh"><div><div class="exn"><span class="grip" aria-hidden="true"><svg viewBox="0 0 12 18"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/><circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/><circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/></svg></span>'+esc(ex.name)+'</div><div class="tg">Цель: '+esc(ex.target||'')+'</div></div>'
        +'<button class="small danger" data-act="exDel" data-ei="'+ei+'">Убрать</button></div>'+restInline(ei)+lastHtml(ex)
        +'<div class="cols"><span></span><span>Вес, кг</span><span>Повторы</span><span style="text-align:center">✓</span></div>'+((ei===0&&!strengthStats(S.draft).n)?'<div class="hint" style="margin:-2px 0 6px">Начинаешь подход — нажми его номер. Закончил — галочка: пойдёт отдых.</div>':'');
      ex.sets.forEach(function(s,si){
        var isWork=S.rest&&S.rest.on&&S.rest.date===S.date&&S.rest.mode==='work'&&S.rest.ei===ei&&S.rest.si===si;
        h+='<div class="set'+(s.done?' done':'')+'">'+(s.done?'<span class="sn">'+(si+1)+'</span>':'<button class="sn snb'+(isWork?' on':'')+'" data-act="wstart" data-ei="'+ei+'" data-si="'+si+'" aria-label="Начать подход">'+(si+1)+'</button>')
          +'<input inputmode="decimal" data-f="w" data-ei="'+ei+'" data-si="'+si+'" placeholder="вес тела" value="'+esc(s.w)+'">'
          +'<input inputmode="numeric" data-f="r" data-ei="'+ei+'" data-si="'+si+'" placeholder="'+esc(upper(ex.reps)||'повт')+'" value="'+esc(s.r)+'">'
          +'<button class="chk'+(s.done?' on':'')+'" data-act="done" data-ei="'+ei+'" data-si="'+si+'">✓</button></div>';
      });
      var rs=ex.sets.filter(function(x){return nz(x.rest);}).map(function(x){return Number(x.rest);});
      var dsx=ex.sets.filter(function(x){return nz(x.dur);}).map(function(x){return Number(x.dur);});
      var avgf=function(a){return a.reduce(function(x,y){return x+y;},0)/a.length;},parts=[];
      if(dsx.length)parts.push('подход ср. '+fmtMS(avgf(dsx)));
      if(rs.length)parts.push('отдых ср. '+fmtMS(avgf(rs)));
      if(parts.length)h+='<div class="hint">'+parts.join(' · ')+'</div>';
      h+='<div class="acts"><button class="small" data-act="setAdd" data-ei="'+ei+'">+ подход</button>'
        +(ex.sets.length>1?'<button class="small" data-act="setDel" data-ei="'+ei+'">− подход</button>':'')+'</div></div>';
    });
    h+='<div class="card pad">'+h2i('dumb','var(--k-str)','Добавить упражнение')+'<div class="row"><input id="newEx" placeholder="Название"><button class="primary" data-act="exAdd">+</button></div></div>';
    h+='<div class="card pad">'+h2i('dumb','var(--k-str)','Итоги силовой')+'<div class="grid2">'
      +fld('Длительность, мин','s_durationMin',d.durationMin,'numeric')+fld('Средний пульс','s_avgHr',d.avgHr,'numeric')
      +fld('Шаги за тренировку','s_gymSteps',d.gymSteps,'numeric','вычтем из шагов дня')+fld('Ккал по часам','s_kcalWatch',d.kcalWatch,'numeric')+fld('Ккал в расчёт','d_trainKcal',dd.trainKcal,'numeric',String((function(){var k=strengthKcal(S.date);return k?Math.round(k.kcal):cfg().trainKcal;})()))+'</div>'+strengthLine()
      +'<label class="lbl" style="margin-top:10px">Заметка</label><textarea data-f="note" placeholder="Самочувствие, локти, плечо…">'+esc(d.note)+'</textarea></div>';
    h+='<div class="row" style="margin-bottom:12px"><button class="primary grow" data-act="saveNow">Сохранить</button>'
      +(S.workouts[S.date]?'<button class="danger" data-act="wDel">Удалить</button>':'')+'</div>';
  }
  /* предпоследним — шаги, последним — расход */
  h+='<div class="card pad">'+h2i('steps','var(--k-steps)','Шаги за день')+'<input class="bigin" data-f="d_steps" inputmode="numeric" placeholder="0" value="'+esc(dd.steps)+'">'
    +'<div class="hint">Вписывай итог за день. Можно по ходу дня, расход пересчитается.</div></div>';
  h+='<div class="card pad" id="burncard">'+burnInner(burn(S.date))+'</div>';
  return h;
}

/* ---------- render: food ---------- */
function pSpan(pa,pv,p){
  pa=Number(pa)||0;pv=Number(pv)||0;p=Number(p)||0;
  var u=Math.max(0,p-pa-pv),parts=[];
  if(pa>0.04)parts.push('<span class="pa">жив. '+fmt1(pa)+'</span>');
  if(pv>0.04)parts.push('<span class="pv">раст. '+fmt1(pv)+'</span>');
  if(u>0.04&&(pa>0.04||pv>0.04))parts.push('<span class="pu">? '+fmt1(u)+'</span>');
  return 'белки '+fmt1(p)+(parts.length?' ('+parts.join(' + ')+')':'');
}
function proteinRow(t,target){
  var tot=t.p,pa=t.pa||0,pv=t.pv||0,u=Math.max(0,tot-pa-pv),base=Math.max(target,tot,1);
  function w(v){return Math.min(100,v/base*100).toFixed(1);}
  return '<div class="mac"><div class="mh"><span>Белки</span><span>'+fmt1(tot)+' / '+fmt1(target)+' г</span></div>'
    +'<div class="mbar pbar"><i class="pa" style="width:'+w(pa)+'%"></i><i class="pv" style="width:'+w(pv)+'%"></i><i class="pu" style="width:'+w(u)+'%"></i></div>'
    +'<div class="plegend"><span class="pa">Животные '+fmt1(pa)+' г'+(tot>0?' · '+Math.round(pa/tot*100)+'%':'')+'</span>'
    +'<span class="pv">Растительные '+fmt1(pv)+' г'+(tot>0?' · '+Math.round(pv/tot*100)+'%':'')+'</span>'
    +(u>0.05?'<span class="pu">Не указано '+fmt1(u)+' г</span>':'')+'</div></div>';
}
function macStrip(t){
  var sub=((t.pa||0)+(t.pv||0)>0.04)?'<em><i class="pa">'+fmt1(t.pa||0)+'</i> · <i class="pv">'+fmt1(t.pv||0)+'</i></em>':'';
  return '<div class="mstrip"><div class="m1"><b>'+fmt1(t.p)+'</b><span>Белки</span>'+sub+'</div><div class="m2"><b>'+fmt1(t.f)+'</b><span>Жиры</span></div><div class="m3"><b>'+fmt1(t.c)+'</b><span>Углеводы</span></div><div class="m4"><b>'+fmt1(t.fib)+'</b><span>Клетчатка</span></div></div>';
}
function weekStats(end){
  var n=0,eat=0,bur=0,i;
  for(i=0;i<7;i++){
    var id=addDays(end,-i),en=foodEntries(id);
    if(!en.length)continue;
    n++;eat+=sumEntries(en).kcal;bur+=burn(id).burned;
  }
  function avgW(e){
    var lo=addDays(e,-6),v=Object.keys(S.body).filter(function(k){return k>=lo&&k<=e&&nz(S.body[k].weight);}).map(function(k){return Number(S.body[k].weight);});
    return v.length?v.reduce(function(a,b){return a+b;},0)/v.length:null;
  }
  return {n:n,eat:n?eat/n:0,bur:n?bur/n:0,w1:avgW(end),w0:avgW(addDays(end,-7))};
}
function macRow(label,val,target,unit,mode){
  var pc=target>0?Math.min(100,Math.round(val/target*100)):0;
  var over=mode==='max'&&target>0&&val>target*1.1;
  return '<div class="mac"><div class="mh"><span>'+esc(label)+'</span><span>'+fmt1(val)+' / '+fmt1(target)+' '+unit+'</span></div><div class="mbar'+(over?' over':'')+'"><i style="width:'+pc+'%;'+((!over&&{'Жиры':1,'Углеводы':1,'Клетчатка':1}[label])?'background:'+({'Жиры':'#FFB800','Углеводы':'#32ADE6','Клетчатка':'#30D5C8'})[label]:'')+'"></i></div></div>';
}
function renderFood(){
  var lib=S.foodView==='lib';
  var en=foodEntries(S.date),t=sumEntries(en),b=burn(S.date),c=cfg();
  var left=b.goal-t.kcal;
  var over=left<0,frac=b.goal>0?Math.min(1,t.kcal/b.goal):0,pct=b.goal>0?Math.round(t.kcal/b.goal*100):0,RC=2*Math.PI*88;
  var ring='<div class="ring"><svg viewBox="0 0 220 220" width="100%" role="img" aria-label="Калории: употреблено '+th(t.kcal)+' из '+th(b.goal)+'">'
    +'<defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF3B30"/><stop offset="1" stop-color="#FF7A70"/></linearGradient></defs>'
    +'<circle class="rtrack" cx="110" cy="110" r="88"/>'
    +(frac>0?'<circle class="rarc'+(over?' over':'')+'" cx="110" cy="110" r="88" stroke-dasharray="'+(RC*frac).toFixed(1)+' '+RC.toFixed(1)+'" transform="rotate(-90 110 110)"/>':'')
    +'</svg><div class="rc"><div class="rl">'+(over?'Перебор':'Осталось')+'</div><div class="rn'+(over?' over':'')+'">'+th(Math.abs(left))+'</div><div class="ru">ккал</div><div class="rp">'+pct+'% от цели</div></div></div>'
    +'<div class="rstats"><div><b>'+th(b.goal)+'</b><span>Цель</span></div><div><b>'+th(t.kcal)+'</b><span>Употреблено</span></div><div><b class="'+(over?'rover':'')+'">'+th(Math.abs(left))+'</b><span>'+(over?'Перебор':'Осталось')+'</span></div></div>';
  var h=dateBar('Питание','',lib?'':ring);
  h+='<div class="pills sub"><button class="pill'+(S.foodView==='diary'?' on':'')+'" data-act="fview" data-v="diary">Дневник</button><button class="pill'+(S.foodView==='lib'?' on':'')+'" data-act="fview" data-v="lib">Мои продукты</button></div>';
  if(lib)return h+renderLib();
  h+='<div class="card pad">'+macStrip(t)
    +'<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:6px">'
    +'<div class="kv"><span>Базовый обмен (BMR)</span><span>'+th(b.base)+'</span></div>'
    +'<div class="kv"><span>+ Активность</span><span>'+th(b.stepK+b.cardioNet+b.train)+'</span></div>'
    +'<div class="hint" style="margin:-2px 0 4px">шаги '+th(b.stepK)+(b.cardioOn?' · кардио '+th(b.cardioNet):'')+(b.lifted?' · сила '+th(b.train):'')+'</div>'
    +(b.corr?'<div class="kv"><span>Поправка '+(b.corr>0?'+':'')+b.corr+'%</span><span>'+(b.burned-b.raw>0?'+':'')+th(b.burned-b.raw)+'</span></div>':'')
    +'<div class="kv tot"><span>= Расход за день</span><span>'+th(b.burned)+' ккал</span></div>'
    +(b.offset?'<div class="kv"><span>Цель по еде ('+(b.offset>0?'+':'')+b.offset+')</span><span>'+th(b.goal)+' ккал</span></div>':'')
    +'<div class="hint">BMR — расход в покое. В '+th(b.base)+' входит и переваривание пищи.</div></div>'
    +(b.hasSteps?'':'<div class="hint" style="color:var(--warn)">Шаги за этот день не внесены — цель без них. Внеси во вкладке «Тренировка».</div>')+'</div>';
  var carbT=Math.max(0,(b.goal-c.protein*4-c.fat*9)/4);
  h+='<div class="card pad">'+h2i('apple','var(--k-food)','БЖУ и клетчатка')
    +proteinRow(t,c.protein)+macRow('Жиры',t.f,c.fat,'г','max')+macRow('Углеводы',t.c,carbT,'г','max')+macRow('Клетчатка',t.fib,c.fiber,'г','min')
    +'<div class="hint">Углеводы = остаток калорий после белков и жиров. Цели меняются во вкладке «План → Настройки».</div></div>';
  var ws=weekStats(S.date);
  if(ws.n>=2){
    var diff=ws.eat-ws.bur,exp=diff*7/7700;
    h+='<div class="card pad">'+h2i('cal','var(--k-cal)','Неделя (дней с едой: '+ws.n+')')+''
      +'<div class="kv"><span>Среднее употреблено</span><span>'+th(ws.eat)+' ккал</span></div>'
      +'<div class="kv"><span>Средний расход (расчёт)</span><span>'+th(ws.bur)+' ккал</span></div>'
      +'<div class="kv tot"><span>Баланс в день</span><span>'+(diff>0?'+':'')+th(diff)+' ккал</span></div>'
      +(ws.w1!=null&&ws.w0!=null?'<div class="kv"><span>Вес, среднее за 7 дн.</span><span>'+fmtN(ws.w0)+' → '+fmtN(ws.w1)+' ('+(ws.w1-ws.w0>0?'+':'')+fmtN(ws.w1-ws.w0)+')</span></div>':'')
      +'<div class="hint">По расчёту вес за неделю должен измениться на '+(exp>0?'+':'')+fmtN(exp)+' кг. Если на деле заметно иначе, поправь «Поправку» в настройках.</div></div>';
  }
  if(!en.length){
    var prev=addDays(S.date,-1),pe=(S.food[prev]&&S.food[prev].entries)||[];
    h+='<div class="card empty">Пока ничего не записано.'+(pe.length?'<div style="margin-top:10px"><button data-act="copyPrev">Скопировать вчера ('+pe.length+')</button></div>':'')+'</div>';
  }
  MEALS.forEach(function(m){
    var list=en.filter(function(e){return (e.meal||'s')===m[0];});
    if(!list.length)return;
    var st=sumEntries(list);
    h+='<div class="card pad"><div class="mt"><b><span class="mdot" style="background:'+MC[m[0]]+'"></span>'+m[1]+'</b><span class="hs">'+th(st.kcal)+' ккал</span></div>'+macStrip(st);
    list.forEach(function(e){
      h+='<div class="fe" data-act="eEdit" data-id="'+esc(e.id)+'"><div><div class="fn">'+esc(e.name)+(nz(e.grams)?' · '+fmtN(e.grams)+' г':'')+'</div>'
        +'<div class="fm">'+pSpan(e.pa,e.pv,e.p)+' · жиры '+fmt1(Number(e.f)||0)+' · углеводы '+fmt1(Number(e.c)||0)+' · клетч. '+fmt1(Number(e.fib)||0)+'</div></div><div class="fk">'+th(Number(e.kcal)||0)+'</div></div>';
    });
    h+='</div>';
  });
  if(!S.sheet)h+='<button class="fab primary" data-act="addOpen">+ Добавить еду</button>';
  return h;
}
function renderLib(){
  var ids=Object.keys(S.foods).sort(function(a,b){return String(S.foods[a].name).localeCompare(String(S.foods[b].name),'ru');});
  var q=S.lq.toLowerCase();
  var h='<div class="card pad"><div class="row"><input data-f="lq" placeholder="Поиск по моим продуктам" value="'+esc(S.lq)+'"><button class="primary" data-act="foodNew">+ Новый</button></div>'
    +'<div class="hint">Значения — на 100 г. Потом выбираешь продукт и вводишь граммы.</div></div><div id="lib">'+libHtml(ids,q)+'</div>';
  return h;
}
function libHtml(ids,q){
  var rows=ids.filter(function(id){return !q||String(S.foods[id].name).toLowerCase().indexOf(q)>=0;});
  if(!ids.length)return '<div class="card empty">Библиотека пуста. Нажми «+ Новый» или добавляй еду вручную с галочкой «Сохранить в мои продукты».</div>';
  if(!rows.length)return '<div class="card empty">Ничего не найдено.</div>';
  return '<div class="card pad">'+rows.map(function(id){
    var f=S.foods[id];
    return '<div class="fe" data-act="foodEdit" data-id="'+esc(id)+'"><div><div class="fn">'+esc(f.name)+'</div><div class="fm">на 100 г: '+pSpan(f.pa,f.pv,f.p)+' · жиры '+fmt1(Number(f.f)||0)+' · углеводы '+fmt1(Number(f.c)||0)+' · клетч. '+fmt1(Number(f.fib)||0)+(nz(f.serving)?' · порция '+fmtN(f.serving)+' г':'')+'</div></div><div class="fk">'+th(Number(f.kcal)||0)+'</div></div>';
  }).join('')+'</div>';
}

/* ---------- food sheet ---------- */
function ptypeOf(pa,pv){pa=Number(pa)||0;pv=Number(pv)||0;if(pa+pv<=0.001)return '';if(pv<=0.001)return 'a';if(pa<=0.001)return 'v';return 'm';}
function splitP(p,pt,pa){
  p=Number(p)||0;
  if(pt==='a')return {pa:p,pv:0};
  if(pt==='v')return {pa:0,pv:p};
  if(pt==='m'){var a=Math.max(0,Math.min(p,Number(pa)||0));return {pa:a,pv:p-a};}
  return {pa:0,pv:0};
}
function freqMap(){
  var lo=addDays(today,-30),m={};
  Object.keys(S.food).forEach(function(k){if(k<lo)return;(S.food[k].entries||[]).forEach(function(e){if(e.foodId)m[e.foodId]=(m[e.foodId]||0)+1;});});
  return m;
}
function lastGrams(fid){
  var ids=Object.keys(S.food).sort().reverse();
  for(var i=0;i<ids.length;i++){var en=S.food[ids[i]].entries||[];for(var j=en.length-1;j>=0;j--)if(en[j].foodId===fid&&nz(en[j].grams))return en[j].grams;}
  return '';
}
function libMatch(name){
  var n=String(name).trim().toLowerCase();if(!n)return null;
  var ids=Object.keys(S.foods);
  for(var i=0;i<ids.length;i++)if(String(S.foods[ids[i]].name).trim().toLowerCase()===n)return ids[i];
  return null;
}
function f100(f){return {kcal:Number(f.kcal)||0,p:Number(f.p)||0,f:Number(f.f)||0,c:Number(f.c)||0,fib:Number(f.fib)||0,pa:Number(f.pa)||0,pv:Number(f.pv)||0};}
function totalsFrom(p,g,pt){
  var k=g/100,tp=p.p*k,sp=splitP(tp,pt,p.pa*k);
  return {kcal:r1(p.kcal*k),p:r1(tp),f:r1(p.f*k),c:r1(p.c*k),fib:r1(p.fib*k),pa:r1(sp.pa)};
}
function newAdd(){
  return {type:'add',meal:S.lastMeal||mealByHour(),name:'',grams:'',m:{kcal:'',p:'',f:'',c:'',fib:'',pa:''},ptype:'',basis:'total',per100:null,src:'',srcName:'',foodId:null,note:'',status:'',stale:false,edited:false,p100edited:false,save:true};
}
function sugHtml(){
  var q=String(S.sheet.name||'').trim().toLowerCase(),fm=freqMap();
  var ids=Object.keys(S.foods).filter(function(id){return !q||String(S.foods[id].name).toLowerCase().indexOf(q)>=0;});
  ids.sort(function(a,b){var d=(fm[b]||0)-(fm[a]||0);return d||String(S.foods[a].name).localeCompare(String(S.foods[b].name),'ru');});
  if(!ids.length)return '';
  return '<div class="hint" style="margin:0 0 4px">'+(q?'Есть в моих продуктах:':'Мои продукты:')+'</div>'+ids.slice(0,q?5:6).map(function(id){var f=S.foods[id];return '<div class="item" data-act="fsel" data-id="'+esc(id)+'"><span>'+esc(f.name)+'</span><small>'+th(Number(f.kcal)||0)+' ккал/100 г</small></div>';}).join('');
}
function per100Text(p){return th(p.kcal)+' ккал · белки '+fmt1(p.p)+' · жиры '+fmt1(p.f)+' · углеводы '+fmt1(p.c)+' · клетч. '+fmt1(p.fib);}
function setStatus(t){if(S.sheet)S.sheet.status=t;var el=document.getElementById('aist');if(el)el.textContent=t;}
function totHtml(){
  var sh=S.sheet,g=Number(sh.grams);
  if(!sh.per100||!(g>0))return '<div class="hint">Введи граммы — посчитаю итог за порцию.</div>';
  var m=sh.m,sp=splitP(m.p,sh.ptype,m.pa);
  return '<b>'+th(m.kcal)+' ккал</b> за '+fmtN(g)+' г'+macStrip({p:m.p,f:m.f,c:m.c,fib:m.fib,pa:sp.pa,pv:sp.pv});
}
function paintTot(){var el=document.getElementById('tot');if(el)el.innerHTML=totHtml();}
function applyPer100(){
  var sh=S.sheet,p=sh&&sh.per100,g=sh?Number(sh.grams):0;
  if(p&&g>0){
    sh.m=totalsFrom(p,g,sh.ptype);sh.gPrev=g;
    ['kcal','p','f','c','fib','pa'].forEach(function(key){var inp=$app.querySelector('[data-f="sh_m_'+key+'"]');if(inp)inp.value=sh.m[key];});
  }
  paintTot();
}
function hasM(m){return nz(m.kcal)||nz(m.p)||nz(m.f)||nz(m.c)||nz(m.fib);}
function scaleM(m,k){['kcal','p','f','c','fib','pa'].forEach(function(key){if(nz(m[key]))m[key]=r1(Number(m[key])*k);});}
function setSheetGrams(v){
  var sh=S.sheet,old=Number(sh.gPrev)||0,nw=Number(v)||0;
  sh.grams=(v===''||v==null)?'':Number(v);
  if(sh.per100&&!sh.stale&&!sh.edited){applyPer100();}
  else if(old>0&&nw>0&&hasM(sh.m)){
    scaleM(sh.m,nw/old);
    ['kcal','p','f','c','fib','pa'].forEach(function(key){var inp=$app.querySelector('[data-f="sh_m_'+key+'"]');if(inp)inp.value=nz(sh.m[key])?sh.m[key]:'';});
    if(sh.per100)paintTot();
  }
  if(nw>0)sh.gPrev=nw;
}
function useLib(id){
  var sh=S.sheet,f=S.foods[id];if(!sh||!f)return;
  sh.name=f.name;sh.foodId=id;sh.src='library';sh.srcName=f.name;sh.stale=false;sh.edited=false;sh.p100edited=false;
  sh.per100=f100(f);sh.ptype=ptypeOf(f.pa,f.pv);
  if(!(Number(sh.grams)>0)){var lg=lastGrams(id);sh.grams=nz(lg)?lg:(nz(f.serving)?f.serving:100);}
  applyPer100();
  sh.status='Из моих продуктов: на 100 г '+per100Text(sh.per100);
  render(true);
}
var aiToken=0,aiCtl=null;
function aiFill(){
  var sh=S.sheet;if(!sh||sh.type!=='add')return Promise.resolve();
  sh.busyP=doAi(sh);return sh.busyP;
}
function cleanSplit(p,pa,pv){
  pa=Number(pa);pv=Number(pv);
  if(!(isFinite(pa)&&isFinite(pv)&&pa>=0&&pv>=0&&pa+pv>0&&p>0))return {pa:0,pv:0};
  var s=pa+pv,a=pa/s*p;return {pa:a,pv:p-a};
}
async function doAi(sh){
  var name=String(sh.name).trim();
  if(!name){setStatus('Сначала введи название продукта.');return;}
  if(!S.sample){setStatus('Автозаполнение недоступно. Введи значения вручную.');return;}
  if(aiCtl)aiCtl.abort();
  aiCtl=new AbortController();var my=++aiToken,ctl=aiCtl,g=Number(sh.grams);
  setStatus('Считаю питательность…');
  var prompt='Ты справочник по питательности продуктов. Дай значения на 100 г продукта по общеизвестным справочным данным (USDA, российские таблицы состава).\n'
    +'Продукт: «'+name+'».'+(g>0?' Порция: '+g+' г.':'')+'\n'
    +'Если состояние не указано, считай продукт таким, каким его обычно едят или продают (орехи и семечки сухие). Если написано «варёный», «жареный», «запечённый» и т.п., учитывай это.\n'
    +'pa — животный белок, pv — растительный белок на 100 г (pa+pv=p). Животный: мясо, птица, рыба, яйца, молочные продукты, сывороточный и казеиновый протеин. Растительный: крупы, бобовые, орехи, семена, хлеб, овощи, соя. Для смешанных блюд раздели по составу.\n'
    +'Ответь ТОЛЬКО одним JSON-объектом без пояснений: {"kcal":число,"p":число,"f":число,"c":число,"fib":число,"pa":число,"pv":число,"note":"коротко, какое допущение сделал"}\n'
    +'Все числа на 100 г: kcal в ккал, остальное в граммах.\n'
    +'Пример: {"kcal":559,"p":30.2,"f":49,"c":10.7,"fib":6,"pa":0,"pv":30.2,"note":"семечки тыквенные сухие очищенные"}';
  try{
    var r=await S.sample.json(prompt+(LANG==='en'?'\nПоле note напиши по-английски.':''),{modelTier:'quick',signal:ctl.signal,schema:'nutrition'});
    if(my!==aiToken||S.sheet!==sh)return;
    if(sh.src==='library'&&sh.foodId)return;
    var p={kcal:Number(r.kcal),p:Number(r.p),f:Number(r.f),c:Number(r.c),fib:Number(r.fib)};
    var ok=['kcal','p','f','c','fib'].every(function(k){return isFinite(p[k])&&p[k]>=0;})&&p.kcal<=950&&p.p<=100&&p.f<=100&&p.c<=100&&p.fib<=100;
    if(!ok){setStatus('Не удалось надёжно определить. Введи значения вручную.');return;}
    var sp=cleanSplit(p.p,r.pa,r.pv);p.pa=sp.pa;p.pv=sp.pv;
    sh.per100=p;sh.ptype=ptypeOf(p.pa,p.pv);sh.src='ai';sh.srcName=name;sh.note=String(r.note||'');sh.stale=false;sh.edited=false;sh.p100edited=false;sh.foodId=null;
    if(Number(sh.grams)>0){applyPer100();setStatus('✓ На 100 г: '+per100Text(p)+(sh.note?' ('+sh.note+')':'')+'. Оценка по справочным данным — проверь.');}
    else setStatus('На 100 г: '+per100Text(p)+'. Введи граммы.');
    render(true);
  }catch(e){
    if(my!==aiToken)return;
    var c=e&&e.code;
    if(c==='cancelled')return;
    if(c==='not_granted'||c==='sampling_disabled'||c==='not_declared'||c==='capability_disabled'||c==='capability_removed'){S.sample=null;setStatus('Автозаполнение не разрешено. Введи значения вручную.');}
    else if(c==='rate_limited')setStatus('Слишком много запросов. Подожди немного и нажми «Заполнить».');
    else if(c==='invalid_json')setStatus('Не получилось разобрать ответ. Нажми «Заполнить» ещё раз.');
    else if(c==='bad_key')setStatus('Ключ Claude API не подходит. Проверь его в «План → Настройки».');
    else if(c==='no_credit')setStatus('На счёте Claude API закончились деньги. Пополни баланс на console.anthropic.com.');
    else if(c==='network')setStatus('Нет интернета. Введи значения вручную или попробуй позже.');
    else setStatus('Не удалось получить данные. Нажми «Заполнить» ещё раз или введи вручную.');
  }
}
function maybeAuto(){
  var sh=S.sheet;if(!sh||sh.type!=='add')return;
  var name=String(sh.name).trim(),g=Number(sh.grams);
  if(!name)return;
  var lid=libMatch(name);
  if(lid&&!(sh.src==='library'&&sh.foodId===lid)){useLib(lid);return;}
  if(sh.per100&&!sh.stale){if(g>0&&!sh.edited)applyPer100();return;}
  if(sh.basis==='per100'){if(sh.per100&&g>0)applyPer100();return;}
  if(!(g>0)||sh.edited)return;
  aiFill();
}
function mealPills(cur){
  return '<div class="pills" style="margin-top:0">'+MEALS.map(function(m){return '<button class="pill'+(cur===m[0]?' on':'')+'" data-act="meal" data-m="'+m[0]+'">'+m[1]+'</button>';}).join('')+'</div>';
}
function macroFields(m,pre){
  return '<div class="grid2" style="margin-top:8px">'+fld('Ккал',pre+'kcal',m.kcal,'decimal','авто')+fld('Клетчатка, г',pre+'fib',m.fib,'decimal')+'</div>'
    +'<div class="grid3" style="margin-top:8px">'+fld('Белки, г',pre+'p',m.p,'decimal')+fld('Жиры, г',pre+'f',m.f,'decimal')+fld('Углеводы, г',pre+'c',m.c,'decimal')+'</div>';
}
function ptypeBlock(pt,paVal,paField,att,key){
  att=att||'';
  var h='<div style="margin-top:8px"><label class="lbl">Тип белка</label><div class="pills" style="margin-top:0">'
    +[['a','Животный','pa'],['v','Растительный','pv'],['m','Смешанный','pm']].map(function(x){return '<button class="pill '+x[2]+(pt===x[0]?' on':'')+'" data-act="ptype" data-k="'+key+'" data-v="'+x[0]+'"'+att+'>'+x[1]+'</button>';}).join('')+'</div>';
  if(pt==='m')h+='<div style="margin-top:6px"><label class="lbl">Из них животный, г</label><input data-f="'+paField+'"'+att+' inputmode="decimal" value="'+esc(paVal)+'"></div>';
  if(!pt)h+='<div class="hint">Не указан — в статистике будет серым.</div>';
  return h+'</div>';
}
function macroBlock(sh){
  var h='<div class="hint" style="margin:12px 0 0"><b>Питательность</b> — всё можно править</div>'
    +'<div class="pills" style="margin-top:6px"><button class="pill'+(sh.basis==='total'?' on':'')+'" data-act="basis" data-v="total">Итого за порцию</button><button class="pill'+(sh.basis==='per100'?' on':'')+'" data-act="basis" data-v="per100">На 100 г (с упаковки)</button></div>';
  if(sh.basis==='per100'){
    var p=sh.per100||{};
    h+=macroFields(p,'sh_p_')+ptypeBlock(sh.ptype,p.pa,'sh_p_pa','','sh')+'<div class="prev" id="tot">'+totHtml()+'</div>';
  }else{
    h+=macroFields(sh.m,'sh_m_')+ptypeBlock(sh.ptype,sh.m.pa,'sh_m_pa','','sh');
  }
  return h;
}
function mform(m,pt){
  return '<div style="margin-top:10px"><label class="lbl">Название</label><input data-f="sh_m_name" value="'+esc(m.name)+'"></div>'
    +'<div style="margin-top:8px">'+fld('Граммы (необяз.)','sh_m_grams',m.grams,'decimal')+'</div>'+macroFields(m,'sh_m_')+ptypeBlock(pt,m.pa,'sh_m_pa','','sh');
}
function photoRowHtml(r,ri){
  var att=' data-ri="'+ri+'"';
  return '<div class="prow"><div class="exh"><span class="hs">'+(r.src==='label'?'С этикетки ✓':'Оценка по фото')+'</span><button class="small danger" data-act="phDel"'+att+'>Убрать</button></div>'
    +'<label class="lbl">Название</label><input data-f="ph_name"'+att+' value="'+esc(r.name)+'">'
    +'<div class="grid2" style="margin-top:8px"><div><label class="lbl">Граммы'+(r.src==='label'?'':' (оценка)')+'</label><input class="bigin" data-f="ph_grams"'+att+' inputmode="decimal" value="'+esc(r.grams)+'"></div>'
    +'<div><label class="lbl">Ккал</label><input class="bigin" data-f="ph_kcal"'+att+' inputmode="decimal" value="'+esc(r.m.kcal)+'"></div></div>'
    +'<div class="grid3" style="margin-top:8px">'
    +'<div><label class="lbl">Белки, г</label><input data-f="ph_p"'+att+' inputmode="decimal" value="'+esc(r.m.p)+'"></div>'
    +'<div><label class="lbl">Жиры, г</label><input data-f="ph_f"'+att+' inputmode="decimal" value="'+esc(r.m.f)+'"></div>'
    +'<div><label class="lbl">Углеводы, г</label><input data-f="ph_c"'+att+' inputmode="decimal" value="'+esc(r.m.c)+'"></div></div>'
    +'<div style="margin-top:8px"><label class="lbl">Клетчатка, г</label><input data-f="ph_fib"'+att+' inputmode="decimal" value="'+esc(r.m.fib)+'"></div>'
    +ptypeBlock(r.ptype,r.m.pa,'ph_pa',att,'ph')
    +(r.note?'<div class="hint">'+esc(r.note)+'</div>':'')+'</div>';
}
function renderSheet(){
  var sh=S.sheet;if(!sh)return '';
  var first=!sh._shown;sh._shown=true;
  var h='<div class="sheet-bg'+(first?' in':'')+'" data-act="sheetClose"></div><div class="sheet'+(first?' in':'')+'"><div class="grab" aria-hidden="true"></div>';
  if(sh.type==='add'){
    h+='<div class="sh-top"><b class="shb">'+chip2('apple','linear-gradient(135deg,#FF7A6E,#FF2D55)')+'Добавить еду</b><button class="ghost small" data-act="sheetClose">✕</button></div>'+mealPills(sh.meal)
      +photoButtons()+'<div class="hint" id="phst">'+esc(sh.phMsg||photoHint())+'</div>'
      +'<div style="margin-top:10px"><label class="lbl">Что съел?</label><input id="q" data-f="sh_name" value="'+esc(sh.name)+'" placeholder="Например: тыквенные семечки"></div>'
      +'<div class="sug" id="sug" style="margin-top:6px">'+sugHtml()+'</div>'
      +'<div style="margin-top:8px"><label class="lbl">Граммы</label><input id="g" class="bigin" data-f="sh_g" inputmode="decimal" placeholder="г" value="'+esc(sh.grams)+'"></div>'
      +'<div class="chips">'+[30,50,100,150,200].map(function(x){return '<button class="chip" data-act="gset" data-v="'+x+'">'+x+'</button>';}).join('')+'</div>'
      +(S.sample?'<button class="ib" style="width:100%" data-act="aiFill">'+ico('spark')+'Заполнить автоматически</button>':'')
      +'<div class="hint" id="aist" style="min-height:18px;margin-top:6px">'+esc(sh.status||(S.sample?'Введи название и граммы — остальное заполню сам. Всё можно поправить.':'Автозаполнение работает с ключом Claude API («План → Настройки»). Пока введи значения вручную.'))+'</div>'
      +macroBlock(sh)
      +'<div class="chkrow"><input type="checkbox" id="sv" data-f="sh_save"'+(sh.save?' checked':'')+'><label for="sv">Сохранить в мои продукты</label></div>'
      +'<button class="primary" style="width:100%" data-act="addGo">Добавить</button>';
  }else if(sh.type==='edit'){
    h+='<div class="sh-top"><b>Изменить запись</b><button class="ghost small" data-act="sheetClose">✕</button></div>'+mealPills(sh.meal)+mform(sh.m,sh.ptype)
      +'<div class="hint">Если поменяешь граммы, остальное пересчитается пропорционально.</div>'
      +'<div class="row" style="margin-top:12px"><button class="primary grow" data-act="editGo">Сохранить</button><button class="danger" data-act="editDel">Удалить</button></div>';
  }else if(sh.type==='photo'){
    h+='<div class="sh-top"><b>Еда по фото</b><button class="ghost small" data-act="sheetClose">✕</button></div>'+mealPills(sh.meal);
    if(sh.busy){
      h+='<div class="prev" style="margin-top:12px">'+esc(sh.status)+'</div><button style="width:100%" data-act="photoStop">Остановить</button>';
    }else{
      if(sh.status)h+='<div class="hint" style="margin:10px 0">'+esc(sh.status)+'</div>';
      if(sh.note)h+='<div class="hint" style="margin:10px 0">'+esc(sh.note)+'</div>';
      h+='<div class="hint" style="margin:8px 0">Вес по фото приблизительный — поправь его. Остальное пересчитается.</div>';
      sh.rows.forEach(function(r,ri){h+=photoRowHtml(r,ri);});
      if(sh.rows.length){
        h+='<div class="chkrow"><input type="checkbox" id="psv" data-f="ph_save"'+(sh.saveLib?' checked':'')+'><label for="psv">Сохранить продукты в мои</label></div>'
          +'<button class="primary" style="width:100%" data-act="photoAdd">Добавить ('+sh.rows.length+')</button>';
      }
      h+='<div class="hint" style="margin-top:10px">Ещё фото:</div>'+photoButtons();
    }
  }else if(sh.type==='food'){
    var fd=sh.fd;
    h+='<div class="sh-top"><b>'+(sh.id?'Продукт':'Новый продукт')+'</b><button class="ghost small" data-act="sheetClose">✕</button></div>'
      +'<label class="lbl">Название</label><input data-f="fd_name" value="'+esc(fd.name)+'" placeholder="Например: куриная грудка варёная">'
      +'<div class="hint">Всё — на 100 г продукта.</div>'
      +macroFields(fd,'fd_')+ptypeBlock(fd.ptype,fd.pa,'fd_pa','','fd')
      +'<div style="margin-top:8px">'+fld('Порция, г (необяз.)','fd_serving',fd.serving,'decimal','например 55 для яйца')+'</div>'
      +'<div class="row" style="margin-top:12px"><button class="primary grow" data-act="foodSave">Сохранить</button>'+(sh.id?'<button class="danger" data-act="foodDel">Удалить</button>':'')+'</div>';
  }
  return h+'</div>';
}
function paintSug(){var el=document.getElementById('sug');if(el)el.innerHTML=sugHtml();}
function openAdd(){S.sheet=newAdd();render(true);var q=document.getElementById('q');if(q)q.focus();}
function closeSheet(){aiToken++;if(aiCtl)aiCtl.abort();S.sheet=null;render(true);}
function calcKcal(m){
  if(nz(m.kcal))return Number(m.kcal);
  return r1(4*((Number(m.p)||0)+(Number(m.c)||0))+9*(Number(m.f)||0));
}
async function addGo(){
  var sh=S.sheet,name=String(sh.name).trim(),m=sh.m;
  if(!name){setStatus('Введи название.');return;}
  var has=function(){return nz(m.kcal)||nz(m.p)||nz(m.f)||nz(m.c);};
  if(sh.busyP)await sh.busyP;
  if(S.sheet!==sh)return;
  if(!has()&&S.sample&&Number(sh.grams)>0){sh.stale=true;await aiFill();if(S.sheet!==sh)return;m=sh.m;}
  if(!has()){setStatus(sh.basis==='per100'?'Введи граммы — тогда посчитаю итог.':'Заполни питательность: нажми «Заполнить» или впиши вручную.');return;}
  var g=nz(sh.grams)?Number(sh.grams):'';
  var sp=splitP(nv(m.p,0),sh.ptype,m.pa);
  var en={id:uid(),meal:sh.meal,name:name,grams:g,kcal:calcKcal(m),p:nv(m.p,0),f:nv(m.f,0),c:nv(m.c,0),fib:nv(m.fib,0),pa:r1(sp.pa),pv:r1(sp.pv)};
  var linked=sh.src==='library'&&sh.foodId&&!sh.edited&&!sh.p100edited;
  if(linked)en.foodId=sh.foodId;
  else if(sh.save&&g>0){
    var per;
    if(sh.per100&&!sh.edited){var sp2=splitP(sh.per100.p,sh.ptype,sh.per100.pa);per={kcal:sh.per100.kcal,p:sh.per100.p,f:sh.per100.f,c:sh.per100.c,fib:sh.per100.fib,pa:sp2.pa,pv:sp2.pv};}
    else per={kcal:en.kcal/g*100,p:en.p/g*100,f:en.f/g*100,c:en.c/g*100,fib:en.fib/g*100,pa:en.pa/g*100,pv:en.pv/g*100};
    var fid=(sh.src==='library'&&sh.foodId&&sh.p100edited)?sh.foodId:uid();
    var fd={name:name,kcal:r1(per.kcal),p:r1(per.p),f:r1(per.f),c:r1(per.c),fib:r1(per.fib),pa:r1(per.pa),pv:r1(per.pv)};
    if(S.foods[fid]&&nz(S.foods[fid].serving))fd.serving=S.foods[fid].serving;
    en.foodId=fid;
    if(S.db)enqueue(function(){return S.db.doc('foods/'+fid).set(fd);});
  }
  aiToken++;if(aiCtl)aiCtl.abort();
  S.lastMeal=sh.meal;S.foodDraft.entries.push(en);markFood();S.sheet=null;render(true);
}
function editGo(){
  var sh=S.sheet,m=sh.m,en=S.foodDraft.entries,i=-1,k;
  for(k=0;k<en.length;k++)if(en[k].id===sh.id)i=k;
  if(i<0||!String(m.name).trim())return;
  var sp=splitP(nv(m.p,0),sh.ptype,m.pa);
  en[i]=Object.assign({},en[i],{meal:sh.meal,name:String(m.name).trim(),grams:nz(m.grams)?Number(m.grams):'',kcal:calcKcal(m),p:nv(m.p,0),f:nv(m.f,0),c:nv(m.c,0),fib:nv(m.fib,0),pa:r1(sp.pa),pv:r1(sp.pv)});
  markFood();S.sheet=null;render(true);
}

/* ---------- photo ---------- */
function photoHint(){
  if(S.photo===true)return 'Фото еды: определю продукты и вес. Фото этикетки: возьму точные значения с упаковки.';
  if(S.photo===false)return 'Распознавание фото работает с ключом Claude API. Добавь его во вкладке «План → Настройки».';
  return 'Проверяю, доступно ли распознавание фото…';
}
function photoButtons(){
  return '<div class="grid2" style="margin-top:10px"><button class="ib" data-act="photoCam">'+ico('camera')+'Камера</button><button class="ib" data-act="photoGal">'+ico('photo')+'Галерея</button></div>';
}
var PHOTO_PROMPT='Ты помогаешь вести дневник питания. На фото еда или упаковка продукта.\n'
  +'Задача: определить продукты на фото и оценить вес каждого в граммах (в том виде, как подано) и питательность.\n'
  +'Правила:\n'
  +'- Если на фото таблица пищевой ценности с упаковки: возьми значения ТОЧНО с упаковки на 100 г (если есть только на порцию, пересчитай на 100 г), поставь "src":"label". Название возьми с упаковки. Вес оцени только по указанной на упаковке порции, иначе по виду.\n'
  +'- Иначе перечисли отдельные продукты или ингредиенты (не больше 8) и оцени вес по размеру порции, посуде и объёму. "src":"estimate".\n'
  +'- Питательность на 100 г бери по справочным данным (USDA, российские таблицы). pa — животный белок, pv — растительный белок на 100 г (pa+pv=p). Животный: мясо, птица, рыба, яйца, молочные продукты, сывороточный и казеиновый протеин. Растительный: крупы, бобовые, орехи, семена, хлеб, овощи, соя. Составные блюда разбей по ингредиентам.\n'
  +'Ответь ТОЛЬКО одним JSON-объектом без пояснений: {"items":[{"name":"название по-русски","grams":число,"kcal":число,"p":число,"f":число,"c":число,"fib":число,"pa":число,"pv":число,"src":"estimate или label","note":"коротко"}],"note":"общее замечание, например что вес приблизительный"}\n'
  +'Числа kcal, p, f, c, fib, pa, pv — на 100 г продукта. grams — вес порции на фото. Если на фото нет еды, верни {"items":[],"note":"что на фото"}.\n'
  +'Пример: {"items":[{"name":"Куриная грудка запечённая","grams":150,"kcal":165,"p":31,"f":3.6,"c":0,"fib":0,"pa":31,"pv":0,"src":"estimate","note":"кусок размером с ладонь"}],"note":"вес оценён по размеру тарелки"}';
function rowApply(r){if(r.per100&&Number(r.grams)>0)r.m=totalsFrom(r.per100,Number(r.grams),r.ptype);}
function makeRow(it){
  if(!it||!String(it.name||'').trim())return null;
  var p={kcal:Number(it.kcal),p:Number(it.p),f:Number(it.f),c:Number(it.c),fib:Number(it.fib)};
  var ok=['kcal','p','f','c','fib'].every(function(k){return isFinite(p[k])&&p[k]>=0;})&&p.kcal<=950&&p.p<=100&&p.f<=100&&p.c<=100&&p.fib<=100;
  if(!ok)return null;
  var sp=cleanSplit(p.p,it.pa,it.pv);p.pa=sp.pa;p.pv=sp.pv;
  var g=Number(it.grams);if(!(g>0&&g<=3000))g=100;
  var r={name:String(it.name).trim(),grams:Math.round(g),gPrev:Math.round(g),per100:p,ptype:ptypeOf(p.pa,p.pv),src:it.src==='label'?'label':'estimate',note:String(it.note||''),edited:false,m:null};
  rowApply(r);return r;
}
function startPhoto(kind){
  if(S.photo===false||(S.photo!==true&&S.sampleChecked&&!S.sample)){
    var msg=photoHint();
    if(S.sheet){S.sheet.phMsg=msg;S.sheet.status=S.sheet.type==='photo'?msg:S.sheet.status;}
    var el0=document.getElementById('phst');if(el0)el0.textContent=msg;
    if(S.sheet&&S.sheet.type==='photo')render(true);
    return;
  }
  var el=document.getElementById(kind==='cam'?'photoCam':'photoGal');
  if(el){el.value='';el.click();}
}
async function analyzePhoto(file){
  if(!file)return;
  var prev=S.sheet,meal=(prev&&prev.meal)||S.lastMeal||mealByHour();
  if(!S.sample||S.photo===false){
    S.sheet={type:'photo',meal:meal,busy:false,status:photoHint(),rows:[],saveLib:false,note:''};render(true);return;
  }
  if(S.photoMax&&file.size>S.photoMax){S.sheet={type:'photo',meal:meal,busy:false,status:'Файл слишком большой. Выбери другое фото.',rows:[],saveLib:false,note:''};render(true);return;}
  if(aiCtl)aiCtl.abort();
  aiCtl=new AbortController();var my=++aiToken,ctl=aiCtl;
  var sh={type:'photo',meal:meal,busy:true,status:'Распознаю фото… обычно 10–40 секунд.',rows:[],saveLib:false,note:''};
  S.sheet=sh;render(true);
  try{
    var r=await S.sample.json(PHOTO_PROMPT+(LANG==='en'?'\nНазвания продуктов и поле note пиши по-английски (обычные английские названия продуктов).':''),{images:file,modelTier:'default',signal:ctl.signal,schema:'photo'});
    if(my!==aiToken||S.sheet!==sh)return;
    var items=(r&&r.items)||[];if(!Array.isArray(items))items=[];
    sh.rows=items.slice(0,8).map(makeRow).filter(Boolean);
    sh.note=String((r&&r.note)||'');sh.busy=false;
    sh.status=sh.rows.length?'':'Не нашёл еду на фото. Попробуй другое фото или добавь вручную.';
    sh.saveLib=sh.rows.some(function(x){return x.src==='label';});
    render(true);
  }catch(e){
    if(my!==aiToken)return;
    var c=e&&e.code,msg='Не удалось распознать фото. Попробуй ещё раз или добавь вручную.';
    if(c==='cancelled'){S.sheet=newAdd();S.sheet.meal=meal;render(true);return;}
    if(c==='images_unavailable'){S.photo=false;msg='Отправка фото недоступна в этом приложении.';}
    else if(c==='image_rejected')msg='Файл не подошёл (формат или размер). Выбери другое фото.';
    else if(c==='not_granted'||c==='sampling_disabled'||c==='not_declared'||c==='capability_disabled'||c==='capability_removed'){S.photo=false;S.sample=null;msg='Распознавание не разрешено. Добавь вручную.';}
    else if(c==='rate_limited')msg='Слишком много запросов. Подожди немного.';
    else if(c==='invalid_json')msg='Не получилось разобрать ответ. Попробуй другое фото.';
    else if(c==='bad_key')msg='Ключ Claude API не подходит. Проверь его в «План → Настройки».';
    else if(c==='no_credit')msg='На счёте Claude API закончились деньги. Пополни баланс на console.anthropic.com.';
    else if(c==='network')msg='Нет интернета. Добавь еду вручную или попробуй позже.';
    else if(c==='refused')msg='Claude не стал разбирать это фото. Добавь еду вручную.';
    sh.busy=false;sh.status=msg;render(true);
  }
}
function photoAdd(){
  var sh=S.sheet;if(!sh||sh.type!=='photo')return;
  var n=0;
  sh.rows.forEach(function(r){
    var m=r.m;if(!m||!String(r.name).trim())return;
    if(!nz(m.kcal)&&!nz(m.p)&&!nz(m.f)&&!nz(m.c))return;
    var g=nz(r.grams)?Number(r.grams):'';
    var sp=splitP(nv(m.p,0),r.ptype,m.pa);
    var en={id:uid(),meal:sh.meal,name:String(r.name).trim(),grams:g,kcal:calcKcal(m),p:nv(m.p,0),f:nv(m.f,0),c:nv(m.c,0),fib:nv(m.fib,0),pa:r1(sp.pa),pv:r1(sp.pv)};
    if(sh.saveLib&&g>0&&!libMatch(en.name)){
      var per;
      if(r.per100&&!r.edited){var s2=splitP(r.per100.p,r.ptype,r.per100.pa);per={kcal:r.per100.kcal,p:r.per100.p,f:r.per100.f,c:r.per100.c,fib:r.per100.fib,pa:s2.pa,pv:s2.pv};}
      else per={kcal:en.kcal/g*100,p:en.p/g*100,f:en.f/g*100,c:en.c/g*100,fib:en.fib/g*100,pa:en.pa/g*100,pv:en.pv/g*100};
      var fid=uid(),fd={name:en.name,kcal:r1(per.kcal),p:r1(per.p),f:r1(per.f),c:r1(per.c),fib:r1(per.fib),pa:r1(per.pa),pv:r1(per.pv)};
      en.foodId=fid;
      if(S.db)enqueue(function(){return S.db.doc('foods/'+fid).set(fd);});
    }
    S.foodDraft.entries.push(en);n++;
  });
  if(!n)return;
  S.lastMeal=sh.meal;aiToken++;if(aiCtl)aiCtl.abort();
  markFood();S.sheet=null;render(true);
}

/* ---------- render: history (календарь + итоги) ---------- */
var MONTHS=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
var WD1=['П','В','С','Ч','П','С','В'];
function dayStats(date){
  var di=dayInfo(date),en=foodEntries(date),t=sumEntries(en),b=burn(date),w=S.workouts[date];
  var logged=workoutLogged(w),hasFood=en.length>0,hasSteps=nz(di.steps)&&Number(di.steps)>0;
  var cardio=di.cardioOn?(di.cardio||[]):[];
  var past=date<today,sched=!!SCHED[parseD(date).getDay()];
  var explicitDone=!!(S.days[date]&&S.days[date].lifted===true);
  var skipped=sched&&past&&date>=trackStart()&&!logged&&!explicitDone;
  var any=hasFood||logged||hasSteps||cardio.length>0||!!S.days[date]||!!w;
  /* баланс считаем только для законченного дня, где есть и еда, и шаги */
  var complete=hasFood&&hasSteps&&past;
  return {date:date,di:di,t:t,b:b,w:w,logged:logged,hasFood:hasFood,hasSteps:hasSteps,any:any,complete:complete,past:past,
    eaten:t.kcal,burned:b.burned,bal:t.kcal-b.burned,
    cardio:cardio,cardioMin:cardio.reduce(function(a,x){return a+(Number(x.minutes)||0);},0),skipped:skipped};
}
function rangeDates(from,to){var a=[],d=from;while(d<=to){a.push(d);d=addDays(d,1);}return a;}
function weekRange(date){var k=(parseD(date).getDay()+6)%7,from=addDays(date,-k);return {from:from,to:addDays(from,6)};}
function monthRange(date){
  var p=date.split('-'),last=new Date(+p[0],+p[1],0).getDate();
  return {from:p[0]+'-'+p[1]+'-01',to:p[0]+'-'+p[1]+'-'+pad(last)};
}
function periodStats(from,to){
  var ds=rangeDates(from,to).map(dayStats);
  var cd=ds.filter(function(x){return x.complete;}),fd=ds.filter(function(x){return x.hasFood;});
  var r={days:ds,n:cd.length,nFood:fd.length,noSteps:fd.filter(function(x){return !x.hasSteps&&x.past;}).length,
    todayFood:ds.some(function(x){return x.date===today&&x.hasFood;}),eaten:0,burned:0,p:0,pa:0,pv:0,pn:0,
    steps:0,stepsN:0,lifts:0,skips:0,cardioMin:0,w0:null,w1:null,d0:'',d1:''};
  cd.forEach(function(x){r.eaten+=x.eaten;r.burned+=x.burned;});
  fd.forEach(function(x){if(x.past){r.p+=x.t.p;r.pa+=x.t.pa;r.pv+=x.t.pv;r.pn++;}});
  ds.forEach(function(x){
    if(x.hasSteps){r.steps+=Number(x.di.steps);r.stepsN++;}
    if(x.logged)r.lifts++;if(x.skipped)r.skips++;r.cardioMin+=x.cardioMin;
  });
  r.bal=r.eaten-r.burned;
  var wk=Object.keys(S.body).filter(function(k){return k>=from&&k<=to&&nz(S.body[k].weight);}).sort();
  if(wk.length){r.d0=wk[0];r.d1=wk[wk.length-1];r.w0=Number(S.body[r.d0].weight);r.w1=Number(S.body[r.d1].weight);}
  return r;
}
function histBars(ds,sel){
  var W=340,H=150,L=4,R=4,T=8,B=22,n=ds.length;
  var mx=1;ds.forEach(function(x){if(x.hasSteps)mx=Math.max(mx,x.burned);if(x.hasFood)mx=Math.max(mx,x.eaten);});
  var gw=(W-L-R)/n,bw=Math.max(2,Math.min(14,gw*0.36));
  function Y(v){return T+(1-v/mx)*(H-T-B);}
  var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="Расход и употреблено по дням">';
  [0.5,1].forEach(function(f){var y=Y(mx*f);s+='<line class="gl" x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'"/>';});
  ds.forEach(function(x,i){
    var cx=L+gw*i+gw/2,id=x.date;
    s+='<g data-act="hSel" data-id="'+id+'" style="cursor:pointer">';
    if(id===sel)s+='<rect x="'+(cx-gw/2)+'" y="'+T+'" width="'+gw+'" height="'+(H-T-B+14)+'" rx="6" class="selbg"/>';
    if(x.hasSteps)s+='<rect x="'+(cx-bw-0.5)+'" y="'+Y(x.burned)+'" width="'+bw+'" height="'+Math.max(1,H-B-Y(x.burned))+'" rx="2" class="b-burn"/>';
    if(x.hasFood)s+='<rect x="'+(cx+0.5)+'" y="'+Y(x.eaten)+'" width="'+bw+'" height="'+Math.max(1,H-B-Y(x.eaten))+'" rx="2" class="b-eat'+(x.complete?'':' part')+'"/>';
    var dn=parseD(id).getDate(),lab=n<=8?DOW[parseD(id).getDay()]:((dn%5===0||dn===1)?String(dn):'');
    s+='<text class="ax" x="'+cx+'" y="'+(H-6)+'" text-anchor="middle">'+lab+'</text><rect x="'+(cx-gw/2)+'" y="0" width="'+gw+'" height="'+H+'" fill="transparent"/></g>';
  });
  return s+'</svg>';
}
function cellRing(st){
  var R=16.5,C=2*Math.PI*R,s='<svg class="cr" viewBox="0 0 40 40"><circle class="cr-t" cx="20" cy="20" r="'+R+'"/>';
  if(st.hasFood){
    if(st.complete&&st.burned>0){
      var r=st.eaten/st.burned,cls=r<0.95?'def':(r>1.05?'sur':'eq');
      s+='<circle class="cr-a '+cls+'" cx="20" cy="20" r="'+R+'" stroke-dasharray="'+(C*Math.min(1,r)).toFixed(1)+' '+C.toFixed(1)+'" transform="rotate(-90 20 20)"/>';
    }else s+='<circle class="cr-d" cx="20" cy="20" r="'+R+'"/>';
  }
  return s+'</svg>';
}
function calHtml(){
  var p=S.histMonth.split('-'),y=+p[0],m=+p[1]-1,off=(new Date(y,m,1).getDay()+6)%7,dim=new Date(y,m+1,0).getDate();
  var h='<div class="card pad"><div class="calh"><div class="calt">'+MONTHS[m]+' <span>'+y+'</span></div>'
    +'<div class="calnav"><button class="lk" data-act="hToday">Сегодня</button><button class="chev" data-act="hMonth" data-n="-1" aria-label="Прошлый месяц">‹</button><button class="chev" data-act="hMonth" data-n="1" aria-label="Следующий месяц">›</button></div></div>'
    +'<div class="cal2">'+WD1.map(function(x,i){return '<div class="cw'+(i>4?' we':'')+'">'+x+'</div>';}).join('');
  for(var i=0;i<off;i++)h+='<div></div>';
  for(var d=1;d<=dim;d++){
    var id=p[0]+'-'+p[1]+'-'+pad(d),st=dayStats(id),cls='cell';
    if(id>today)cls+=' fut';
    if(id===today)cls+=' tod';
    if(id===S.histSel)cls+=' sel';
    var dots=(st.logged?'<i class="d1"></i>':'')+(st.cardio.length?'<i class="d2"></i>':'')+(st.skipped?'<i class="d4"></i>':'');
    h+='<div class="'+cls+'" data-act="hSel" data-id="'+id+'"><div class="cc">'+cellRing(st)+'<span class="cn">'+d+'</span></div><div class="cdots">'+dots+'</div></div>';
  }
  h+='</div><div class="legend"><span><u class="rs rdef"></u>дефицит</span><span><u class="rs req"></u>≈ поддержание</span><span><u class="rs rsur"></u>профицит</span><span><u class="rs rdash"></u>нет шагов или день не закончен</span></div>'
    +'<div class="legend"><span><i class="d1"></i>силовая</span><span><i class="d2"></i>кардио</span><span><i class="d4"></i>пропуск</span></div>'
    +'<div class="hint" style="margin-top:6px">Кольцо — сколько от расхода употреблено за день.</div></div>';
  return h;
}
function sumHtml(){
  var rng=S.histRange==='month'?monthRange(S.histSel):weekRange(S.histSel);
  var r=periodStats(rng.from,rng.to);
  var title=S.histRange==='month'?MONTHS[+rng.from.split('-')[1]-1]+' '+rng.from.split('-')[0]:fmtS(rng.from)+' – '+fmtS(rng.to);
  var h='<div class="card pad"><div class="pills" style="margin:0 0 12px"><button class="pill'+(S.histRange==='week'?' on':'')+'" data-act="hRange" data-v="week">Неделя</button><button class="pill'+(S.histRange==='month'?' on':'')+'" data-act="hRange" data-v="month">Месяц</button></div>'
    +'<div class="sumh"><button class="chev" data-act="hPer" data-n="-1" aria-label="Назад">‹</button><div class="sumt">'+esc(title)+'</div><button class="chev" data-act="hPer" data-n="1" aria-label="Вперёд">›</button></div>';
  if(!r.n){
    h+='<div class="hint" style="text-align:center;margin:6px 0 4px">В этом периоде пока нет дня, где есть и еда, и шаги, и он закончен. Баланс считаю только по таким дням.</div>';
  }else{
    var def=r.bal<0;
    h+='<div class="tiles3"><div class="t3 tb"><span>Потрачено</span><b>'+th(r.burned)+'</b></div><div class="t3 te"><span>Употреблено</span><b>'+th(r.eaten)+'</b></div>'
      +'<div class="t3 tc '+(def?'dfc':'srp')+'"><span>'+(def?'Дефицит':'Профицит')+'</span><b>'+th(Math.abs(r.bal))+'</b></div></div>'
      +'<div class="kv"><span>В среднем в день: употреблено / расход</span><span>'+th(r.eaten/r.n)+' / '+th(r.burned/r.n)+'</span></div>'
      +'<div class="kv"><span>Баланс в день</span><span>'+(r.bal>0?'+':'')+th(r.bal/r.n)+' ккал</span></div>'
      +'<div class="kv"><span>По балансу изменение жира</span><span>'+(r.bal>0?'+':'')+fmtN(r.bal/7700)+' кг</span></div>';
  }
  var notes=[];
  if(r.n)notes.push('Баланс по '+r.n+' дн.');
  if(r.nFood>r.n){
    var why=[];if(r.noSteps)why.push('без шагов: '+r.noSteps);if(r.todayFood)why.push('сегодня не входит, пока день не закончен');
    notes.push('с едой '+r.nFood+(why.length?' ('+why.join(', ')+')':''));
  }
  if(notes.length)h+='<div class="hint" style="margin:6px 0 4px">'+esc(notes.join(' · '))+'</div>';
  if(r.stepsN)h+='<div class="kv"><span>Шагов в день (ср.)</span><span>'+th(r.steps/r.stepsN)+'</span></div>';
  h+='<div class="kv"><span>Силовых / пропусков</span><span>'+r.lifts+' / '+r.skips+'</span></div>';
  if(r.cardioMin)h+='<div class="kv"><span>Кардио</span><span>'+th(r.cardioMin)+' мин</span></div>';
  if(r.pn&&r.p>0)h+='<div class="kv"><span>Белка в день (ср.)</span><span>'+fmt1(r.p/r.pn)+' г <span class="pa">жив. '+fmt1(r.pa/r.pn)+'</span> <span class="pv">раст. '+fmt1(r.pv/r.pn)+'</span></span></div>';
  if(r.w0!=null)h+='<div class="kv"><span>Вес</span><span>'+fmtN(r.w0)+' → '+fmtN(r.w1)+(r.d0!==r.d1?' ('+(r.w1-r.w0>0?'+':'')+fmtN(r.w1-r.w0)+')':'')+'</span></div>';
  if(r.nFood)h+='<div class="legend" style="margin-top:12px"><span><u class="lg lb"></u>расход</span><span><u class="lg le"></u>употреблено</span><span><u class="lg le part"></u>день не закончен</span></div>'+histBars(r.days,S.histSel);
  return h+'</div>';
}
function dayCardHtml(id){
  var st=dayStats(id),di=st.di,w=st.w,t=st.t,b=st.b;
  var kind=w?'Силовая · день '+esc(w.day||'?'):(di.lifted?'Силовая':(st.skipped?'Пропуск '+SCHED[parseD(id).getDay()]:'Отдых'));
  var bal='—',lab='Баланс',cls='tc';
  if(st.complete){lab=st.bal<0?'Дефицит':'Профицит';cls=st.bal<0?'tc dfc':'tc srp';bal=th(Math.abs(st.bal));}
  var h='<div class="card pad"><div class="mt"><b>'+esc(fmt(id))+'</b><span class="hs">'+kind+'</span></div>'
    +'<div class="tiles3" style="margin-top:8px"><div class="t3 tb"><span>Расход</span><b>'+(st.hasSteps?th(b.burned):'—')+'</b></div><div class="t3 te"><span>Употреблено</span><b>'+(st.hasFood?th(t.kcal):'—')+'</b></div>'
    +'<div class="t3 '+cls+'"><span>'+lab+'</span><b>'+bal+'</b></div></div>';
  if(st.hasFood&&!st.complete)h+='<div class="hint" style="margin:-2px 0 8px">'+(!st.past?'День не закончен: баланс посчитаю, когда он пройдёт. Сейчас — во вкладке «Питание».':'Нет шагов за этот день: расход неизвестен, баланс не считаю.')+'</div>';
  if(!st.hasFood&&st.hasSteps)h+='<div class="hint" style="margin:-2px 0 8px">Еда за этот день не записана.</div>';
  h+='<div class="det">';
  if(st.hasSteps)h+='<div class="r"><span>Шаги</span><span>'+th(di.steps)+' ≈ '+th(b.stepK)+' ккал</span></div>';
  st.cardio.forEach(function(cs){
    var e=cardioEst(cs,weightOn(id),cfg().base);
    var parts=[nz(cs.minutes)?cs.minutes+' мин':'',e.km>0?fmtN(e.km)+' км':'',e.v>0?fmtN(e.v)+' км/ч':'',(cs.type==='treadmill'&&nz(cs.incline))?'накл. '+cs.incline+'%':'',nz(cs.avgHr)?'пульс '+cs.avgHr:'',e.kcal>0?'≈'+th(e.kcal)+' ккал':''].filter(Boolean);
    h+='<div class="r"><span>Кардио: '+esc(cardioName(cs.type))+'</span><span>'+esc(parts.join(' · '))+'</span></div>';
  });
  if(st.hasFood)h+='<div class="r"><span>Питание</span><span>'+th(t.kcal)+' ккал</span></div>'+macStrip(t);
  if(w){
    (w.exercises||[]).forEach(function(e){
      var ss=(e.sets||[]).filter(function(s){return s.done||nz(s.r);});
      var first=ss.length?setStr(ss[0]):'',same=ss.every(function(s){return setStr(s)===first;});
      h+='<div class="r"><span>'+esc(e.name)+'</span><span>'+(ss.length?(same?ss.length+' × '+esc(first):esc(ss.map(setStr).join(' · '))):'—')+'</span></div>';
    });
    var ex=[];
    if(nz(w.durationMin))ex.push(w.durationMin+' мин');
    if(nz(w.avgHr))ex.push('пульс '+w.avgHr);
    if(nz(w.kcalWatch))ex.push(w.kcalWatch+' ккал (часы)');
    if(ex.length)h+='<div class="r"><span>Тренировка</span><span>'+esc(ex.join(' · '))+'</span></div>';
    var sst=strengthStats(w),wk=sst.work,rt=sst.rest,tot=nz(w.durationMin)?Number(w.durationMin)*60:0;var pc=function(v){return tot>0?' · '+Math.round(v/tot*100)+'%':'';};
    if(wk>0)h+='<div class="r"><span>Время подходов</span><span>'+fmtMS(wk)+' мин'+pc(wk)+'</span></div>';
    if(rt>0)h+='<div class="r"><span>Время отдыха</span><span>'+fmtMS(rt)+' мин'+pc(rt)+'</span></div>';
    if(wk>0)h+='<div class="hint">Если таймер забыт, время подхода считаю по повторам, а отдых = вся тренировка минус подходы.</div>';
    if(w.note)h+='<div class="r"><span>Заметка</span><span>'+esc(w.note)+'</span></div>';
  }
  if(!st.any)h+='<div class="hint">За этот день записей нет.</div>';
  h+='</div><div class="acts" style="justify-content:flex-end;margin-top:8px"><button class="small" data-act="hGo" data-id="'+id+'">Открыть</button>'+(st.any?'<button class="small danger" data-act="hDel" data-id="'+id+'">Удалить день</button>':'')+'</div></div>';
  return h;
}
function weekAvgCards(){
  var e7=last7(function(d){var en=foodEntries(d);return en.length?sumEntries(en).kcal:0;}),f7=e7.filter(function(x){return x>0;});
  var o7=last7(function(d){var bb=burn(d);return bb.hasSteps?bb.burned:0;}),q7=o7.filter(function(x){return x>0;});
  var av=function(a){return a.length?th(a.reduce(function(p,q){return p+q;},0)/a.length):'—';};
  return hcard({ic:'apple',color:'var(--k-food)',title:'Употреблено',when:'7 дней',label:'В среднем за день',value:av(f7),unit:'ккал',chart:miniBars(e7,'var(--k-food)')})
    +hcard({ic:'flame',color:'var(--k-burn)',title:'Расход',when:'7 дней',label:'В среднем за день',value:av(q7),unit:'ккал',chart:miniBars(o7,'var(--k-burn)')});
}
function renderHistory(){
  var h='<div class="top"><h1>'+tbadge('hist')+'История</h1><span class="status">'+esc(fmt(S.histSel))+'</span></div>';
  return h+weekAvgCards()+calHtml()+sumHtml()+dayCardHtml(S.histSel);
}

/* ---------- render: body ---------- */
var BF=[['weight','Вес, кг'],['waist','Талия, см'],['thigh','Бёдра, см'],['glute','Ягодицы, см'],['bic','Бицепс, см'],['bicR','Бицепс правый, см'],['neck','Шея, см']];
var METRICS=[['weight','Вес','кг'],['waist','Талия','см'],['fat','Жир','%'],['thigh','Бёдра','см'],['glute','Ягодицы','см'],['bic','Бицепс','см']];
function bodyList(){return Object.keys(S.body).sort().map(function(id){var o=clone(S.body[id]);o.date=id;return o;});}
function prevVal(key,beforeDate){
  var l=bodyList().filter(function(b){return b.date<beforeDate&&nz(b[key]);});
  return l.length?l[l.length-1][key]:null;
}
function latestVal(key,date){
  var ids=Object.keys(S.body).filter(function(k){return k<=date&&nz(S.body[k][key]);}).sort();
  return ids.length?Number(S.body[ids[ids.length-1]][key]):null;
}
function fatEst(date){
  var c=cfg(),H=c.height,age=c.age,w=latestVal('weight',date),waist=latestVal('waist',date),neck=latestVal('neck',date),m=[];
  if(w){
    var bmi=w/Math.pow(H/100,2);
    m.push({n:'Deurenberg',v:1.20*bmi+0.23*age-16.2});
    m.push({n:'CUN-BAE',v:-44.988+0.503*age+3.172*bmi-0.026*bmi*bmi-0.02*bmi*age+0.00021*bmi*bmi*age});
  }
  if(waist)m.push({n:'RFM',v:64-20*(H/waist)});
  if(waist&&neck&&waist>neck)m.push({n:'US Navy',v:495/(1.0324-0.19077*Math.log10(waist-neck)+0.15456*Math.log10(H))-450});
  m=m.filter(function(x){return isFinite(x.v)&&x.v>2&&x.v<60;});
  if(!m.length)return null;
  var vs=m.map(function(x){return x.v;}).sort(function(a,b){return a-b;});
  var med=vs.length%2?vs[(vs.length-1)/2]:(vs[vs.length/2-1]+vs[vs.length/2])/2;
  return {pct:med,methods:m};
}
function fatHint(){
  var l=bodyList().filter(function(b){return nz(b.weight);});if(!l.length)return '';
  var f=fatEst(l[l.length-1].date);if(!f)return '';
  return '<div class="hint">Считаю сам: беру середину (медиану) формул по росту, возрасту, весу, талии и шее. '+f.methods.map(function(x){return esc(x.n)+' '+fmtN(x.v)+'%';}).join(' · ')+'. Итог: '+fmtN(f.pct)+'%.</div>';
}
function series(key){
  if(key==='fat')return bodyList().filter(function(b){return nz(b.weight);}).map(function(b){var f=fatEst(b.date);return f?{t:parseD(b.date).getTime(),d:b.date,v:r1(f.pct)}:null;}).filter(Boolean);
  return bodyList().filter(function(b){return nz(b[key]);}).map(function(b){return {t:parseD(b.date).getTime(),d:b.date,v:Number(b[key])};});
}
function avg7(pts){
  return pts.map(function(p){
    var lo=p.t-6*86400000,sum=0,n=0;
    pts.forEach(function(q){if(q.t>=lo&&q.t<=p.t){sum+=q.v;n++;}});
    return {t:p.t,v:sum/n};
  });
}
function chartSvg(pts,avg,color){
  if(pts.length<2)return '<div class="empty">Нужно минимум 2 замера для графика.</div>';
  var W=340,H=170,L=34,R=8,T=10,B=22;
  var t0=pts[0].t,t1=pts[pts.length-1].t;if(t1===t0)t1=t0+86400000;
  var vals=pts.map(function(p){return p.v;});
  var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals);
  if(mx===mn){mx+=1;mn-=1;}
  var padv=(mx-mn)*0.12;mn-=padv;mx+=padv;
  function X(t){return L+(t-t0)/(t1-t0)*(W-L-R);}
  function Y(v){return T+(1-(v-mn)/(mx-mn))*(H-T-B);}
  var s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="График">';
  for(var i=0;i<4;i++){
    var v=mn+(mx-mn)*i/3,y=Y(v);
    s+='<line class="gl" x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'"/><text class="ax" x="'+(L-4)+'" y="'+(y+3)+'" text-anchor="end">'+fmtN(v)+'</text>';
  }
  var rawCol=(!avg&&color)?color:null;
  s+='<polyline class="l1" '+(rawCol?'style="stroke:'+rawCol+';opacity:1;stroke-width:2.6" ':'')+'points="'+pts.map(function(p){return X(p.t).toFixed(1)+','+Y(p.v).toFixed(1);}).join(' ')+'"/>';
  pts.forEach(function(p){s+='<circle class="dot" '+(rawCol?'style="fill:'+rawCol+';opacity:1" ':'')+'cx="'+X(p.t).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="'+(rawCol?3:2.4)+'"/>';});
  if(avg)s+='<polyline class="l2" '+(color?'style="stroke:'+color+'" ':'')+'points="'+avg.map(function(p){return X(p.t).toFixed(1)+','+Y(p.v).toFixed(1);}).join(' ')+'"/>';
  s+='<text class="ax" x="'+L+'" y="'+(H-6)+'">'+esc(fmtS(pts[0].d))+'</text><text class="ax" x="'+(W-R)+'" y="'+(H-6)+'" text-anchor="end">'+esc(fmtS(pts[pts.length-1].d))+'</text></svg>';
  return s;
}
function deltaHtml(cur,prev,unit,goodDown){
  if(prev==null||cur==null)return '';
  var d=r2(cur-prev);if(d===0)return '<span class="d">без изменений</span>';
  var cls=(d<0)===goodDown?'dn':'up';
  return '<span class="d '+cls+'">'+(d>0?'+':'')+fmtN(d)+' '+unit+'</span>';
}
var BODY_C=['waist','thigh','glute','bic','bicR','neck'];
function dlt(cur,prev,goodDown){
  if(prev==null||cur==null)return '';
  var d=r2(cur-prev);
  if(d===0)return '<span class="dl">без изм.</span>';
  var cls=goodDown===null?'':((d<0)===goodDown?' dn':' up');
  return '<span class="dl'+cls+'">'+(d>0?'+':'−')+fmtN(Math.abs(d))+'</span>';
}
function bodyCalHtml(){
  var p=S.bodyMonth.split('-'),y=+p[0],m=+p[1]-1,off=(new Date(y,m,1).getDay()+6)%7,dim=new Date(y,m+1,0).getDate();
  var ws=[],nFull=0,nW=0,cells='';
  var ruler='<svg class="bb" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="7.5" width="19" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6.5 7.5v3M10 7.5v4.5M13.5 7.5v3M17 7.5v4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  for(var i=0;i<off;i++)cells+='<div></div>';
  for(var d=1;d<=dim;d++){
    var id=p[0]+'-'+p[1]+'-'+pad(d),b=S.body[id],cls='bt';
    var hasW=!!b&&nz(b.weight),hasC=!!b&&BODY_C.some(function(k){return nz(b[k]);});
    if(hasW)ws.push({d:id,v:Number(b.weight)});
    if(hasC){cls+=' full';nFull++;}else if(hasW){cls+=' wt';nW++;}
    if(id>today)cls+=' fut';
    if(id===today)cls+=' tod';
    if(id===S.bodyDate)cls+=' sel';
    cells+='<div class="'+cls+'" data-act="bPick" data-id="'+id+'"><div class="bt-top"><span class="bd">'+d+'</span>'+(hasC?ruler:'')+'</div><span class="bv">'+(hasW?fmtN(b.weight):'')+'</span></div>';
  }
  var sum='';
  if(ws.length){
    var vals=ws.map(function(x){return x.v;}),avg=vals.reduce(function(a,b){return a+b;},0)/vals.length;
    var mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals),ch=ws.length>1?ws[ws.length-1].v-ws[0].v:null;
    sum='<div class="bmsum"><div class="bm bm1"><span>Среднее</span><b>'+fmtN(avg)+'</b></div>'
      +'<div class="bm bm2"><span>Диапазон</span><b>'+fmtN(mn)+(mx!==mn?'–'+fmtN(mx):'')+'</b></div>'
      +'<div class="bm bm3'+(ch==null?'':(ch<0?' dn':(ch>0?' up':'')))+'"><span>За месяц</span><b>'+(ch==null?'—':(ch>0?'+':(ch<0?'−':''))+fmtN(Math.abs(ch)))+'</b></div></div>';
  }
  var h='<div class="card pad"><div class="calh"><div class="calt">'+MONTHS[m]+' <span>'+y+'</span></div>'
    +'<div class="calnav"><button class="lk" data-act="bToday">Сегодня</button><button class="chev" data-act="bMonth" data-n="-1" aria-label="Прошлый месяц">‹</button><button class="chev" data-act="bMonth" data-n="1" aria-label="Следующий месяц">›</button></div></div>'
    +sum
    +'<div class="cal2 bgrid">'+WD1.map(function(x,i){return '<div class="cw'+(i>4?' we':'')+'">'+x+'</div>';}).join('')+cells+'</div>'
    +'<div class="legend"><span><u class="bk full"></u>есть обхваты</span><span><u class="bk wt"></u>только вес</span><span><u class="bk none"></u>нет данных</span></div>'
    +'<div class="hint" style="margin-top:6px">В клетке — вес в кг. В этом месяце: с обхватами '+nFull+', только вес '+nW+'.</div></div>';
  return h;
}
function bodyDayHtml(id){
  var b=S.body[id];
  if(!b)return '<div class="card pad"><div class="mt"><b>'+esc(fmt(id))+'</b><span class="hs">замера нет</span></div><div class="hint">На эту дату ничего не записано. Заполни форму ниже и сохрани.</div></div>';
  var rows=[['weight','Вес','кг',true],['waist','Талия','см',true],['thigh','Бёдра','см',true],['glute','Ягодицы','см',true],['bic','Бицепс','см',false],['bicR','Бицепс правый','см',false],['neck','Шея','см',null]];
  var h='<div class="card pad"><div class="mt"><b>'+esc(fmt(id))+'</b><span class="hs">изменение — к прошлому замеру</span></div><div style="margin-top:6px">';
  rows.forEach(function(r){
    if(!nz(b[r[0]]))return;
    h+='<div class="kv"><span>'+r[1]+'</span><span>'+fmtN(b[r[0]])+' '+r[2]+' '+dlt(Number(b[r[0]]),prevVal(r[0],id)==null?null:Number(prevVal(r[0],id)),r[3])+'</span></div>';
    if(r[0]==='weight'){
      var f=fatEst(id),pd=Object.keys(S.body).filter(function(k){return k<id&&nz(S.body[k].weight);}).sort().pop(),pf=pd?fatEst(pd):null;
      if(f)h+='<div class="kv"><span>Жир (расчёт)</span><span>'+fmtN(f.pct)+' % '+dlt(r1(f.pct),pf?r1(pf.pct):null,true)+'</span></div>';
    }
  });
  if(b.note)h+='<div class="kv"><span>Заметка</span><span>'+esc(b.note)+'</span></div>';
  return h+'</div></div>';
}
function renderBody(){
  var list=bodyList(),h='<div class="top"><h1>'+tbadge('body')+'Замеры</h1><span class="status" id="bm">'+esc(S.bodyMsg)+'</span></div>';
  var m=MT.filter(function(x){return x[0]===S.metric;})[0]||MT[0];
  var pts=series(m[0]),wsr=series('weight'),lwa=wsr.length?avg7(wsr).pop():null;
  h+=metricTilesHtml();
  h+='<div class="card pad"><div class="hch" style="--cc:'+m[5]+'"><span class="hci">'+ico(m[3])+'</span><span class="hct">'+esc(m[1])+'</span><span class="hcw">'+(pts.length?esc(fmtS(pts[pts.length-1].d)):'')+'</span></div><div style="margin-top:10px">'
    +chartSvg(pts,m[0]==='weight'?avg7(pts):null,m[5])+'</div>'
    +(m[0]==='weight'?'<div class="hint">Серая линия — взвешивания, цветная — среднее за 7 дней'+(lwa?': сейчас '+fmtN(lwa.v)+' кг':'')+'.</div>':'')+(m[0]==='fat'?fatHint():'')+'</div>';
  var f=S.bodyForm,ex=!!S.body[S.bodyDate];
  h+=bodyCalHtml()+bodyDayHtml(S.bodyDate);
  h+='<div class="card pad">'+h2i('ruler','var(--k-body)',(ex?'Изменить замер за ':'Новый замер за ')+fmt(S.bodyDate))+''
    +'<div class="row" style="margin-bottom:10px"><button class="ghost" data-act="bShift" data-n="-1">‹</button><input type="date" data-f="bdate" value="'+esc(S.bodyDate)+'"><button class="ghost" data-act="bShift" data-n="1">›</button></div>'
    +'<div class="grid2">';
  BF.forEach(function(x){
    var pv=prevVal(x[0],S.bodyDate);
    h+='<div><label class="lbl">'+esc(x[1])+'</label><input data-f="b_'+x[0]+'" inputmode="decimal" placeholder="'+(pv!=null?esc(fmtN(pv)):'')+'" value="'+esc(f[x[0]])+'"></div>';
  });
  h+='</div><label class="lbl" style="margin-top:10px">Заметка</label><input data-f="b_note" value="'+esc(f.note)+'" placeholder="Утром, натощак…">'
    +'<div class="hint">Серым — прошлое значение. Пустые поля не сохраняются.</div>'
    +'<div class="row" style="margin-top:10px"><button class="primary grow" data-act="bSave">Сохранить замер</button>'+(ex?'<button class="danger" data-act="bDel">Удалить</button>':'')+'</div></div>';
  return h;
}
function loadBodyForm(){
  S.bodyDirtyForm=false;
  var b=S.body[S.bodyDate],f={};
  BF.forEach(function(x){f[x[0]]=b&&nz(b[x[0]])?b[x[0]]:'';});
  f.note=b&&b.note?b.note:'';
  S.bodyForm=f;
}

/* ---------- render: plan + settings ---------- */
function planOf(x){return S.tplDraft[x]||{exercises:[]};}
function renderPlan(){
  var h='<div class="top"><h1>'+tbadge('plan')+'План</h1>'+statusHtml()+'</div>';
  h+='<div class="pills sub" style="margin-top:0"><button class="pill'+(S.planView==='tpl'?' on':'')+'" data-act="pview" data-v="tpl">Тренировки</button><button class="pill'+(S.planView==='set'?' on':'')+'" data-act="pview" data-v="set">Настройки</button></div>';
  if(S.planView==='set')return h+renderSettings();
  h+='<div class="card pad"><div class="pills" style="margin-top:0">'+['A','B','C'].map(function(x){return '<button class="pill'+(S.planDay===x?' on':'')+'" data-act="planDay" data-d="'+x+'">'+x+'</button>';}).join('')+'</div>'
    +'<div class="hint">Шаблон подставляется в новую тренировку этого дня. Уже записанные тренировки не меняются.</div></div>';
  var p=planOf(S.planDay),ex=p.exercises||[];
  h+='<div class="card pad"><div class="planh"><span>Упражнение</span><span>Подх.</span><span>Повт.</span><span>Вес</span></div>';
  if(!ex.length)h+='<div class="empty">Пусто. Добавь первое упражнение.</div>';
  ex.forEach(function(e,i){
    h+='<div class="planrow"><input data-f="p_name" data-i="'+i+'" value="'+esc(e.name)+'"><input data-f="p_sets" data-i="'+i+'" inputmode="numeric" value="'+esc(e.sets)+'">'
      +'<input data-f="p_reps" data-i="'+i+'" value="'+esc(e.reps)+'"><input data-f="p_weight" data-i="'+i+'" inputmode="decimal" placeholder="—" value="'+esc(e.weight)+'"></div>'
      +'<div class="planact"><button class="small" data-act="pUp" data-i="'+i+'"'+(i===0?' disabled':'')+'>↑</button><button class="small" data-act="pDown" data-i="'+i+'"'+(i===ex.length-1?' disabled':'')+'>↓</button><button class="small danger" data-act="pDel" data-i="'+i+'">Удалить</button></div>';
  });
  h+='<button class="primary" style="width:100%" data-act="pAdd">+ Упражнение</button></div>';
  return h;
}
function renderSettings(){
  var s=S.setDraft||{},c=cfg(),w=weightOn(S.date);
  var h=aiCard()+backupCard()+langCard()+'<div class="card pad">'+h2i('flame','var(--k-burn)','Расход калорий')+'<div class="grid2">'
    +fld('Базовый обмен + переваривание, ккал','c_base',nz(s.base)?s.base:'','numeric',String(DEF.base))
    +fld('Ккал за силовую','c_trainKcal',nz(s.trainKcal)?s.trainKcal:'','numeric',String(DEF.trainKcal))
    +fld('Ккал на 1000 шагов','c_kPer1000',nz(s.kPer1000)?s.kPer1000:'','decimal','авто: '+Math.round(0.37*w))
    +fld('Поправка к расходу, %','c_corrPct',nz(s.corrPct)?s.corrPct:'','decimal','0')
    +fld('Рост, см','c_height',nz(s.height)?s.height:'','numeric',String(DEF.height))
    +fld('Возраст, лет','c_age',nz(s.age)?s.age:'','numeric',String(DEF.age))
    +fld('Длина шага, м','c_stepLen',nz(s.stepLen)?s.stepLen:'','decimal','авто: '+fmtN(0.42*c.height/100))+'</div>'
    +'<div class="hint">Шаги по умолчанию считаются от веса (≈'+fmtN(0.37)+' ккал на 1000 шагов на кг). Расчёты по формулам часто завышают расход на 10–20%: сравнивай со средним весом за неделю и подкручивай поправку (например −10).</div></div>';
  h+='<div class="card pad">'+h2i('heart','var(--k-food)','Цель по еде')+'<div class="hint" style="margin:0 0 8px">Сколько есть относительно расхода за день</div>'
    +'<div class="pills" style="margin-top:0;flex-wrap:wrap">'+[[0,'Поддержка'],[-300,'−300'],[-500,'−500'],[200,'+200']].map(function(x){return '<button class="pill'+(c.offset===x[0]?' on':'')+'" style="flex:none;padding:0 14px" data-act="offs" data-v="'+x[0]+'">'+x[1]+'</button>';}).join('')+'</div>'
    +'<div style="margin-top:10px">'+fld('Свой сдвиг, ккал','c_offset',nz(s.offset)?s.offset:'','numeric','0')+'</div></div>';
  h+='<div class="card pad">'+h2i('clock','var(--k-steps)','Таймер отдыха')+'<div class="grid2">'+fld('Цель отдыха, сек','c_restTarget',nz(s.restTarget)?s.restTarget:'','numeric','120')+'</div>'
    +'<div class="togrow" style="margin-top:12px"><div><b>Звук и вибрация</b><div class="hint" style="margin:2px 0 0">сигнал, когда отдых дошёл до цели</div></div><button class="sw'+(c.restBell?' on':'')+'" data-act="rbellt" aria-label="Звук"><i></i></button></div>'
    +'<div class="hint">Нажми номер подхода, когда начинаешь его: пойдёт время подхода. Нажми галочку, когда закончил: пойдёт отдых. Время подходов и отдыха идёт в расчёт калорий силовой.</div></div>';
  h+='<div class="card pad">'+h2i('apple','var(--k-cal)','Нормы на день')+'<div class="grid3">'
    +fld('Белки, г','c_protein',nz(s.protein)?s.protein:'','numeric',String(DEF.protein))+fld('Жиры, г','c_fat',nz(s.fat)?s.fat:'','numeric',String(DEF.fat))+fld('Клетчатка, г','c_fiber',nz(s.fiber)?s.fiber:'','numeric',String(DEF.fiber))+'</div>'
    +'<div class="hint">Углеводы считаются автоматически: остаток калорий после белков и жиров.</div></div>';
  return h;
}

/* ---------- main render ---------- */
var ICONS={
  train:'<svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/></svg>',
  food:'<svg viewBox="0 0 24 24"><path d="M12 7.6c-1.5-1.2-3.3-1.5-4.8-.9C4.9 7.6 3.9 10 4.5 13c.6 3 2.5 6.1 4.5 6.1 1 0 1.6-.6 3-.6s2 .6 3 .6c2 0 3.9-3.1 4.5-6.1.6-3-.4-5.4-2.7-6.3-1.5-.6-3.3-.3-4.8.9z"/><path d="M12 7.4c0-2 .9-3.4 2.6-4"/></svg>',
  body:'<svg viewBox="0 0 24 24"><rect x="2.5" y="7.5" width="19" height="9" rx="2.5"/><path d="M6.5 7.5v3M10 7.5v4.5M13.5 7.5v3M17 7.5v4.5"/></svg>',
  hist:'<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v3.5M16 3v3.5"/><circle cx="8" cy="14.2" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="14.2" r=".9" fill="currentColor" stroke="none"/><circle cx="16" cy="14.2" r=".9" fill="currentColor" stroke="none"/><circle cx="8" cy="17.4" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="17.4" r=".9" fill="currentColor" stroke="none"/></svg>',
  plan:'<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 4h6v2.2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/><path d="M9 12h6M9 16h4"/></svg>'
};
function renderTabs(){
  var T=[['train','Тренировки','var(--k-str)'],['food','Питание','var(--k-food)'],['body','Замеры','var(--k-body)'],['hist','История','var(--k-cal)'],['plan','План','var(--k-plan)']];
  $tabs.innerHTML=T.map(function(t){return '<button class="tab'+(S.tab===t[0]?' on':'')+'" style="--tc:'+t[2]+'" data-act="tab" data-t="'+t[0]+'">'+ICONS[t[0]]+t[1]+'</button>';}).join('');
}
function render(force){
  var a=document.activeElement;
  if(!force&&a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA')&&$app.contains(a)){S.needRender=true;return;}
  S.needRender=false;
  var y=window.scrollY||0,h;
  if(S.error){h='<div class="card pad"><h2>Журнал недоступен</h2><p>'+esc(S.error)+'</p></div>';}
  else if(!allReady()||!S.draft||!S.dayDraft||!S.foodDraft){h='<div class="empty">Загрузка…</div>';}
  else if(S.tab==='train')h=renderTrain();
  else if(S.tab==='food')h=renderFood();
  else if(S.tab==='hist')h=renderHistory();
  else if(S.tab==='body')h=renderBody();
  else h=renderPlan();
  if(S.sheet)h+=renderSheet();
  if(S.update)h='<div class="upd"><span>Доступна новая версия</span><button class="small" data-act="upd">Обновить</button></div>'+h;
  if(S.modal){var mf=!S.modal._shown;S.modal._shown=true;}
  if(S.modal)h+='<div class="modal'+(mf?' in':'')+'"><div class="box"><p>'+esc(S.modal.text)+'</p><div class="row"><button data-act="mNo">Отмена</button><button class="primary" data-act="mYes">'+esc(S.modal.yes)+'</button></div></div></div>';
  $app.innerHTML=h;renderTabs();
  document.body.style.setProperty('--tabrgb',TAB_RGB[S.tab]||'10,132,255');
  document.body.style.overflow=(S.sheet||S.modal)?'hidden':'';
  window.scrollTo(0,y);
}

/* ---------- actions ---------- */
function setDate(d){
  persistAll();
  S.date=d;
  S.dayManual=false;
  loadAll();render(true);
}
function ensurePlan(){
  if(!S.tplDraft[S.planDay])S.tplDraft[S.planDay]={name:'День '+S.planDay,weekday:({A:1,B:3,C:5})[S.planDay],exercises:[]};
  if(!S.tplDraft[S.planDay].exercises)S.tplDraft[S.planDay].exercises=[];
  return S.tplDraft[S.planDay];
}
function setSet(k,v){if(!S.setDraft)S.setDraft={};S.setDraft[k]=v;markSet();}
function delDayDocs(id){
  if(!S.db)return;
  ['workouts','days','food'].forEach(function(col){
    var key=({workouts:'w',days:'d',food:'f'})[col];
    if((col==='workouts'&&S.workouts[id])||(col==='days'&&S.days[id])||(col==='food'&&S.food[id]))
      trackWrite(key,function(){return S.db.doc(col+'/'+id).delete();});
  });
  if(id===S.date){S.draftDirty=false;S.dayDirty=false;S.foodDirty=false;loadAll();}
}
function onClick(e){
  if(Date.now()-(S.suppressClick||0)<450){S.suppressClick=0;return;}
  var el=e.target.closest('[data-act]');if(!el)return;
  var a=el.dataset.act,ei=+el.dataset.ei,si=+el.dataset.si,i=+el.dataset.i;
  var d=S.draft;
  if(a==='tab'){persistAll();S.tab=el.dataset.t;S.sheet=null;if(S.tab==='body')loadBodyForm();render(true);window.scrollTo(0,0);return;}
  if(a==='mNo'){S.modal=null;render(true);return;}
  if(a==='mYes'){var cb=S.modal&&S.modal.cb;S.modal=null;render(true);if(cb)cb();return;}
  if(a==='dateShift'){setDate(addDays(S.date,Number(el.dataset.n)));return;}
  if(a==='goDate'){setDate(el.dataset.d);return;}
  if(a==='lift'){
    S.dayDraft.lifted=!S.dayDraft.lifted;
    if(S.dayDraft.lifted&&!S.workouts[S.date]&&!S.draftDirty&&!S.dayManual){var ad2=autoDay(S.date);S.day=ad2.type;S.dayWhy=ad2.why;S.draft=buildFromTemplate(S.day,S.date);}
    markDay();render(true);return;
  }
  if(a==='cardio'){var cd=S.dayDraft;cd.cardioOn=!cd.cardioOn;if(cd.cardioOn&&!(cd.cardio&&cd.cardio.length))cd.cardio=[newSession()];markDay();render(true);return;}
  if(a==='cdAdd'){if(!S.dayDraft.cardio)S.dayDraft.cardio=[];S.dayDraft.cardio.push(newSession());markDay();render(true);return;}
  if(a==='cdDel'){S.dayDraft.cardio.splice(Number(el.dataset.ci),1);if(!S.dayDraft.cardio.length)S.dayDraft.cardioOn=false;markDay();render(true);return;}
  if(a==='day'){
    var nd=el.dataset.d;if(nd===S.day)return;
    var apply=function(){S.day=nd;S.dayManual=true;S.dayWhy='';S.draft=buildFromTemplate(nd,S.date);S.draftDirty=false;render(true);};
    if(S.workouts[S.date]||S.draftDirty)ask('Заменить записанные данные этого дня шаблоном '+nd+'?','Заменить',function(){var did=S.date;if(S.workouts[did]&&S.db)trackWrite('w',function(){return S.db.doc('workouts/'+did).delete();});apply();});
    else apply();
    return;
  }
  if(a==='wstart'){unlockAudio();startWork(ei,si);render(true);return;}
  if(a==='wnext'){var rn=S.rest;if(!rn||!rn.on)return;var nx=nextUndone(rn.ei,rn.si);if(nx>=0){unlockAudio();startWork(rn.ei,nx);render(true);}return;}
  if(a==='rb'){
    var rr=S.rest;if(!rr)return;var kb=el.dataset.k;
    if(kb==='pause'){if(rr.paused){rr.start=Date.now();rr.paused=false;}else{rr.acc=restElapsed();rr.paused=true;}}
    else if(kb==='reset'){rr.start=Date.now();rr.acc=0;rr.paused=false;rr.notified=false;}
    else if(kb==='bell'){unlockAudio();setSet('restBell',cfg().restBell?0:1);}
    else if(kb==='close'){stopRest();render(true);return;}
    paintRest();return;
  }
  if(a==='done'){
    var anchorTop=el.getBoundingClientRect().top;
    var s=d.exercises[ei].sets[si];s.done=!s.done;
    if(s.done&&!nz(s.r))s.r=upper(d.exercises[ei].reps);
    if(s.done){unlockAudio();startRest(ei,si);}
    else if(S.rest&&S.rest.on&&S.rest.date===S.date&&S.rest.ei===ei&&S.rest.si===si)stopRest();
    markDirty();render(true);
    try{var ne=document.querySelector('[data-act="done"][data-ei="'+ei+'"][data-si="'+si+'"]');if(ne&&typeof window.scrollBy==='function')window.scrollBy(0,ne.getBoundingClientRect().top-anchorTop);}catch(x){}
    return;
  }
  if(a==='hSel'){S.histSel=el.dataset.id;S.histMonth=S.histSel.slice(0,7);render(true);return;}
  if(a==='hToday'){S.histSel=today;S.histMonth=today.slice(0,7);render(true);return;}
  if(a==='hPer'){
    var np=Number(el.dataset.n);
    if(S.histRange==='month'){var hp2=S.histSel.split('-'),hd2=new Date(+hp2[0],+hp2[1]-1+np,1);S.histSel=ymd(hd2);}
    else S.histSel=addDays(S.histSel,7*np);
    S.histMonth=S.histSel.slice(0,7);render(true);return;
  }
  if(a==='hMonth'){
    var hp=S.histMonth.split('-'),hd=new Date(+hp[0],+hp[1]-1+Number(el.dataset.n),1);
    S.histMonth=hd.getFullYear()+'-'+pad(hd.getMonth()+1);
    if(S.histSel.slice(0,7)!==S.histMonth)S.histSel=(today.slice(0,7)===S.histMonth)?today:S.histMonth+'-01';
    render(true);return;
  }
  if(a==='hRange'){S.histRange=el.dataset.v;render(true);return;}
  if(a==='rbell'){setSet('restBell',Number(el.dataset.v));render(true);return;}
  if(a==='lang'){setLang(el.dataset.v,true);return;}
  if(a==='rbellt'){setSet('restBell',cfg().restBell?0:1);render(true);return;}
  if(a==='setAdd'){var ss=d.exercises[ei].sets,last=ss[ss.length-1];ss.push({w:last?last.w:'',r:'',done:false});markDirty();render(true);return;}
  if(a==='setDel'){var s2=d.exercises[ei].sets;if(s2.length>1)s2.pop();markDirty();render(true);return;}
  if(a==='exDel'){d.exercises.splice(ei,1);markDirty();render(true);return;}
  if(a==='exAdd'){var inp=document.getElementById('newEx'),nm=inp?inp.value.trim():'';if(!nm)return;d.exercises.push({name:nm,reps:'',target:'—',sets:[{w:'',r:'',done:false}]});markDirty();render(true);return;}
  if(a==='saveNow'){S.draftDirty=true;persistDraft();persistDay();return;}
  if(a==='wDel'){ask('Удалить тренировку за '+fmt(S.date)+'?','Удалить',function(){var did=S.date;if(S.db)trackWrite('w',function(){return S.db.doc('workouts/'+did).delete();});S.draft=buildFromTemplate(S.day,S.date);S.draftDirty=false;render(true);});return;}
  if(a==='hOpen'){var id=el.dataset.id;S.histOpen[id]=!S.histOpen[id];render(true);return;}
  if(a==='hGo'){persistAll();S.dayManual=false;S.date=el.dataset.id;var w2=S.workouts[S.date];if(w2&&w2.day)S.day=w2.day;loadAll();S.tab='train';render(true);window.scrollTo(0,0);return;}
  if(a==='hDel'){var did2=el.dataset.id;ask('Удалить всё за '+fmt(did2)+' (тренировку, шаги, питание)?','Удалить',function(){delDayDocs(did2);render(true);});return;}
  if(a==='metric'){S.metric=el.dataset.m;render(true);return;}
  if(a==='bShift'){S.bodyDate=addDays(S.bodyDate,Number(el.dataset.n));S.bodyMonth=S.bodyDate.slice(0,7);loadBodyForm();render(true);return;}
  if(a==='bPick'){S.bodyDate=el.dataset.id;S.bodyMonth=S.bodyDate.slice(0,7);loadBodyForm();render(true);return;}
  if(a==='bMonth'){var bp=S.bodyMonth.split('-'),bd=new Date(+bp[0],+bp[1]-1+Number(el.dataset.n),1);S.bodyMonth=bd.getFullYear()+'-'+pad(bd.getMonth()+1);render(true);return;}
  if(a==='bToday'){S.bodyDate=today;S.bodyMonth=today.slice(0,7);loadBodyForm();render(true);return;}
  if(a==='bSave'){saveBody();return;}
  if(a==='bDel'){var bid=S.bodyDate;ask('Удалить замер за '+fmt(bid)+'?','Удалить',function(){if(S.db)enqueue(function(){return S.db.doc('body/'+bid).delete();});S.bodyMsg='Удалено';loadBodyForm();render(true);});return;}
  if(a==='pview'){persistSet();S.planView=el.dataset.v;render(true);return;}
  if(a==='planDay'){persistTpl(S.planDay);S.planDay=el.dataset.d;render(true);return;}
  if(a==='pAdd'){var pp=ensurePlan();pp.exercises.push({name:'Новое упражнение',sets:3,reps:'12',weight:''});markTpl(S.planDay);render(true);return;}
  if(a==='pDel'){var p2=ensurePlan();p2.exercises.splice(i,1);markTpl(S.planDay);render(true);return;}
  if(a==='pUp'&&i>0){var p3=ensurePlan(),t3=p3.exercises[i];p3.exercises[i]=p3.exercises[i-1];p3.exercises[i-1]=t3;markTpl(S.planDay);render(true);return;}
  if(a==='pDown'){var p4=ensurePlan();if(i<p4.exercises.length-1){var t4=p4.exercises[i];p4.exercises[i]=p4.exercises[i+1];p4.exercises[i+1]=t4;markTpl(S.planDay);render(true);}return;}
  if(a==='offs'){setSet('offset',Number(el.dataset.v));render(true);return;}
  if(a==='keySave'){keySave();return;}
  if(a==='keyTest'){keyCheck(getKey());return;}
  if(a==='keyDel'){ask('Удалить ключ Claude API с этого телефона? Фото и автозаполнение перестанут работать.','Удалить',function(){setKey('');S.keyMsg='Ключ удалён.';setupAI();render(true);});return;}
  if(a==='exp'){doExport();return;}
  if(a==='imp'){pickImport();return;}
  if(a==='welcomeSkip'){try{localStorage.setItem('journal.welcomeDone','1');}catch(x){}render(true);return;}
  if(a==='upd'){if(S.update)S.update.postMessage({type:'SKIP_WAITING'});return;}
  /* food */
  if(a==='fview'){S.foodView=el.dataset.v;render(true);return;}
  if(a==='addOpen'){openAdd();return;}
  if(a==='sheetClose'){closeSheet();return;}
  if(a==='meal'){S.sheet.meal=el.dataset.m;render(true);return;}
  if(a==='fsel'){useLib(el.dataset.id);var gi=document.getElementById('g');if(gi){gi.focus();try{gi.select();}catch(x){}}return;}
  if(a==='gset'){var gv=Number(el.dataset.v);var gi2=document.getElementById('g');if(gi2)gi2.value=gv;setSheetGrams(gv);if(!hasM(S.sheet.m))maybeAuto();return;}
  if(a==='aiFill'){aiFill();return;}
  if(a==='addGo'){addGo();return;}
  if(a==='basis'){
    var shb=S.sheet,vb=el.dataset.v;if(!shb||shb.type!=='add'||shb.basis===vb)return;
    if(vb==='per100'&&!shb.per100){
      var g0=Number(shb.grams),m0=shb.m;
      if(g0>0&&(nz(m0.kcal)||nz(m0.p))){
        var sp0=splitP(nv(m0.p,0),shb.ptype,m0.pa),q0={kcal:nv(m0.kcal,0)/g0*100,p:nv(m0.p,0)/g0*100,f:nv(m0.f,0)/g0*100,c:nv(m0.c,0)/g0*100,fib:nv(m0.fib,0)/g0*100,pa:sp0.pa/g0*100,pv:sp0.pv/g0*100};
        Object.keys(q0).forEach(function(k){q0[k]=r1(q0[k]);});shb.per100=q0;
      }
    }
    shb.basis=vb;
    if(vb==='total'&&shb.per100&&(Number(shb.per100.kcal)>0||Number(shb.per100.p)>0))applyPer100();
    render(true);return;
  }
  if(a==='ptype'){
    var kk=el.dataset.k,vv=el.dataset.v;
    var fixQ=function(q,pt){var qp=Number(q.p)||0;if(pt==='a'){q.pa=qp;q.pv=0;}else if(pt==='v'){q.pa=0;q.pv=qp;}else if(!(q.pa>0&&q.pv>0)){q.pa=r1(qp/2);q.pv=r1(qp-q.pa);}};
    if(kk==='sh'){
      var s1=S.sheet;if(!s1)return;s1.ptype=vv;
      if(vv==='m'&&!nz(s1.m.pa))s1.m.pa=r1((Number(s1.m.p)||0)/2);
      if(s1.per100){fixQ(s1.per100,vv);if(s1.type==='add'){s1.p100edited=true;applyPer100();}}
    }else if(kk==='fd'){
      var fd1=S.sheet.fd;fd1.ptype=vv;if(vv==='m'&&!nz(fd1.pa))fd1.pa=r1((Number(fd1.p)||0)/2);
    }else if(kk==='ph'){
      var pr=S.sheet.rows[+el.dataset.ri];if(!pr)return;pr.ptype=vv;
      if(pr.per100)fixQ(pr.per100,vv);
      if(!pr.edited)rowApply(pr);
      if(vv==='m'&&!nz(pr.m.pa))pr.m.pa=r1((Number(pr.m.p)||0)/2);
    }
    render(true);return;
  }
  if(a==='photoCam'){startPhoto('cam');return;}
  if(a==='photoGal'){startPhoto('gal');return;}
  if(a==='photoStop'){aiToken++;if(aiCtl)aiCtl.abort();var pm=S.sheet&&S.sheet.meal;S.sheet=newAdd();if(pm)S.sheet.meal=pm;render(true);return;}
  if(a==='photoAdd'){photoAdd();return;}
  if(a==='phDel'){S.sheet.rows.splice(+el.dataset.ri,1);render(true);return;}
  if(a==='eEdit'){
    var en=S.foodDraft.entries.filter(function(x){return x.id===el.dataset.id;})[0];if(!en)return;
    S.sheet={type:'edit',id:en.id,meal:en.meal||'s',ptype:ptypeOf(en.pa,en.pv),m:{name:en.name,grams:nz(en.grams)?en.grams:'',kcal:en.kcal,p:en.p,f:en.f,c:en.c,fib:en.fib,pa:nz(en.pa)?en.pa:''},base:{g:nz(en.grams)?Number(en.grams):0,kcal:Number(en.kcal)||0,p:Number(en.p)||0,f:Number(en.f)||0,c:Number(en.c)||0,fib:Number(en.fib)||0,pa:Number(en.pa)||0}};
    render(true);return;
  }
  if(a==='editGo'){editGo();return;}
  if(a==='editDel'){var eid=S.sheet.id;S.foodDraft.entries=S.foodDraft.entries.filter(function(x){return x.id!==eid;});markFood();S.sheet=null;render(true);return;}
  if(a==='copyPrev'){
    var pe=(S.food[addDays(S.date,-1)]&&S.food[addDays(S.date,-1)].entries)||[];
    pe.forEach(function(x){var c=clone(x);c.id=uid();S.foodDraft.entries.push(c);});
    markFood();render(true);return;
  }
  if(a==='foodNew'){S.sheet={type:'food',id:null,fd:{name:'',kcal:'',p:'',f:'',c:'',fib:'',serving:'',pa:'',ptype:''}};render(true);return;}
  if(a==='foodEdit'){var f2=S.foods[el.dataset.id];if(!f2)return;S.sheet={type:'food',id:el.dataset.id,fd:{name:f2.name,kcal:f2.kcal,p:f2.p,f:f2.f,c:f2.c,fib:f2.fib,serving:nz(f2.serving)?f2.serving:'',pa:nz(f2.pa)?f2.pa:'',ptype:ptypeOf(f2.pa,f2.pv)}};render(true);return;}
  if(a==='foodSave'){
    var fd=S.sheet.fd;if(!String(fd.name).trim())return;
    var o={name:String(fd.name).trim(),kcal:nv(fd.kcal,0),p:nv(fd.p,0),f:nv(fd.f,0),c:nv(fd.c,0),fib:nv(fd.fib,0)};
    if(nz(fd.serving))o.serving=Number(fd.serving);
    if(!nz(fd.kcal))o.kcal=r1(4*(o.p+o.c)+9*o.f);
    var spf=splitP(o.p,fd.ptype,fd.pa);o.pa=r1(spf.pa);o.pv=r1(spf.pv);
    var id3=S.sheet.id||uid();
    if(S.db)enqueue(function(){return S.db.doc('foods/'+id3).set(o).then(function(){S.saveState='saved';paintStatus();});});
    S.sheet=null;render(true);return;
  }
  if(a==='foodDel'){var id4=S.sheet.id;if(S.db&&id4)enqueue(function(){return S.db.doc('foods/'+id4).delete();});S.sheet=null;render(true);return;}
}
function saveBody(){
  var o={},any=false;
  BF.forEach(function(x){var v=num(S.bodyForm[x[0]]);if(v!==''){o[x[0]]=v;any=true;}});
  if(S.bodyForm.note&&String(S.bodyForm.note).trim()){o.note=String(S.bodyForm.note).trim();}
  if(!any){S.bodyMsg='Заполни хотя бы одно поле';paintBodyMsg();return;}
  o.updatedAt=new Date().toISOString();
  var id=S.bodyDate;S.bodyMsg='Сохраняю…';paintBodyMsg();
  enqueue(function(){
    return S.db.doc('body/'+id).set(o).then(function(){S.bodyDirtyForm=false;S.bodyMsg='Сохранено ✓';paintBodyMsg();},function(e){S.bodyMsg='Не сохранилось';paintBodyMsg();throw e;});
  });
}
function paintBodyMsg(){var el=document.getElementById('bm');if(el)el.textContent=S.bodyMsg;}
function scaleSheet(){
  var sh=S.sheet,b=sh.base,g=nz(sh.m.grams)?Number(sh.m.grams):0;
  if(!b||!(b.g>0)||!(g>0))return;
  var k=g/b.g;
  ['kcal','p','f','c','fib','pa'].forEach(function(key){
    sh.m[key]=r1((b[key]||0)*k);
    var inp=$app.querySelector('[data-f="sh_m_'+key+'"]');if(inp)inp.value=sh.m[key];
  });
}
function onInput(e){
  var t=e.target,f=t.dataset&&t.dataset.f;if(!f)return;
  var d=S.draft,ei=+t.dataset.ei,si=+t.dataset.si,i=+t.dataset.i;
  if(f==='w'||f==='r'){var s=d.exercises[ei].sets[si];s[f]=num(t.value);if(f==='r'&&s[f]!==''&&!s.done){s.done=true;var b=t.parentNode.querySelector('.chk');if(b)b.classList.add('on');}markDirty();return;}
  if(f.indexOf('s_')===0){var k=f.slice(2);d[k]=(k==='note')?t.value:num(t.value);markDirty();return;}
  if(f==='note'){d.note=t.value;markDirty();return;}
  if(f==='d_steps'){S.dayDraft.steps=num(t.value);markDay();paintBurn();return;}
  if(f==='d_trainKcal'){S.dayDraft.trainKcal=num(t.value);markDay();paintBurn();return;}
  if(f.indexOf('b_')===0){S.bodyForm[f.slice(2)]=t.value;S.bodyDirtyForm=true;return;}
  if(f.indexOf('p_')===0){var pp=ensurePlan(),row=pp.exercises[i];if(!row)return;var pk=f.slice(2);
    if(pk==='sets')row.sets=num(t.value);else if(pk==='weight')row.weight=num(t.value);else row[pk]=t.value;
    markTpl(S.planDay);return;}
  if(f.indexOf('c_')===0){setSet(f.slice(2),num(t.value));return;}
  if(f==='lq'){S.lq=t.value;var lib=document.getElementById('lib');if(lib)lib.innerHTML=libHtml(Object.keys(S.foods).sort(function(a,b2){return String(S.foods[a].name).localeCompare(String(S.foods[b2].name),'ru');}),S.lq.toLowerCase());return;}
  if(f.indexOf('sh_p_')===0){
    var shp=S.sheet,pk2=f.slice(5);
    if(!shp.per100)shp.per100={kcal:'',p:'',f:'',c:'',fib:'',pa:0,pv:0};
    var q2=shp.per100;q2[pk2]=num(t.value);
    var tp2=Number(q2.p)||0;
    if(pk2==='pa'){q2.pa=Math.min(tp2,Number(q2.pa)||0);q2.pv=tp2-q2.pa;}
    else if(pk2==='p'){if(shp.ptype==='a'){q2.pa=tp2;q2.pv=0;}else if(shp.ptype==='v'){q2.pa=0;q2.pv=tp2;}else if(shp.ptype==='m'){q2.pv=Math.max(0,tp2-(Number(q2.pa)||0));}}
    shp.stale=false;shp.p100edited=true;shp.edited=false;if(!shp.src)shp.src='manual';
    applyPer100();return;
  }
  if(f.indexOf('ph_')===0){
    var psh=S.sheet,prw=psh&&psh.rows&&psh.rows[+t.dataset.ri],pk3=f.slice(3);
    if(!prw||pk3==='save')return;
    if(pk3==='name')prw.name=t.value;
    else if(pk3==='grams'){
      var oldG=Number(prw.gPrev)||Number(prw.grams)||0;prw.grams=num(t.value);var newG=Number(prw.grams)||0;
      if(!prw.edited)rowApply(prw);
      else if(oldG>0&&newG>0)scaleM(prw.m,newG/oldG);
      if(newG>0){
        prw.gPrev=newG;
        ['kcal','p','f','c','fib','pa'].forEach(function(key){var inp=$app.querySelector('[data-f="ph_'+key+'"][data-ri="'+t.dataset.ri+'"]');if(inp)inp.value=prw.m[key];});
      }
    }else{prw.m[pk3]=num(t.value);if(pk3!=='pa')prw.edited=true;}
    return;
  }
  if(f==='sh_name'){var sh1=S.sheet,nm1=String(t.value).trim();sh1.name=t.value;if(nm1!==sh1.srcName){sh1.stale=true;if(sh1.src==='library')sh1.foodId=null;}paintSug();return;}
  if(f==='sh_g'){setSheetGrams(num(t.value));return;}
  if(f.indexOf('sh_m_')===0){var mk=f.slice(5);S.sheet.m[mk]=(mk==='name')?t.value:num(t.value);if(mk==='grams')scaleSheet();else if(mk!=='pa'&&S.sheet.type==='add')S.sheet.edited=true;return;}
  if(f.indexOf('cd_')===0){
    var ci=+t.dataset.ci,cs=S.dayDraft.cardio&&S.dayDraft.cardio[ci],ck=f.slice(3);
    if(!cs||ck==='type'||ck==='inSteps')return;
    cs[ck]=(ck==='note')?t.value:num(t.value);markDay();
    var cie=document.getElementById('cinfo'+ci);if(cie)cie.innerHTML=cardioInfo(cs);
    paintBurn();return;
  }
  if(f.indexOf('fd_')===0){var fk=f.slice(3);S.sheet.fd[fk]=(fk==='name')?t.value:num(t.value);return;}
}
function onChange(e){
  var t=e.target,f=t.dataset&&t.dataset.f;
  if(f==='date'&&t.value){setDate(t.value);return;}
  if(f==='bdate'&&t.value){S.bodyDate=t.value;S.bodyMonth=S.bodyDate.slice(0,7);loadBodyForm();render(true);return;}
  if(f==='sh_save'){S.sheet.save=!!t.checked;return;}
  if(f==='ph_save'){S.sheet.saveLib=!!t.checked;return;}
  if(f==='sh_name'||f==='sh_g'){var shc=S.sheet;clearTimeout(timers.auto);timers.auto=setTimeout(function(){if(S.sheet===shc)maybeAuto();},350);return;}
  if(f==='cd_type'){S.dayDraft.cardio[+t.dataset.ci].type=t.value;markDay();render(true);return;}
  if(f==='cd_inSteps'){
    var ci3=+t.dataset.ci,cs3=S.dayDraft.cardio[ci3];cs3.inSteps=!!t.checked;markDay();
    var ce3=document.getElementById('cinfo'+ci3);if(ce3)ce3.innerHTML=cardioInfo(cs3);paintBurn();return;
  }
}
function onFocusOut(){
  if(!S.needRender)return;
  setTimeout(function(){var a=document.activeElement;if(a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'))return;if(S.needRender)render(true);},60);
}

/* ---------- rest timer ---------- */
function fmtMS(sec){sec=Math.max(0,Math.round(sec));return Math.floor(sec/60)+':'+pad(sec%60);}
var audioCtx=null;
function unlockAudio(){try{var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;if(!audioCtx)audioCtx=new AC();if(audioCtx.state==='suspended')audioCtx.resume();}catch(e){}}
function beep(){
  try{if(audioCtx){var o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=880;g.gain.value=0.18;o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+0.3);}}catch(e){}
  try{if(navigator.vibrate)navigator.vibrate([200,100,200]);}catch(e){}
}
function restElapsed(){var r=S.rest;if(!r)return 0;return r.acc+(r.paused?0:(Date.now()-r.start)/1000);}
var RI={
  pause:'<svg viewBox="0 0 24 24"><rect x="7" y="5" width="3.5" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="3.5" height="14" rx="1.2" fill="currentColor"/></svg>',
  play:'<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  reset:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 4v4.5h4.5"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17h12l-1.5-2v-4.5a4.5 4.5 0 0 0-9 0V15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  bellOff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17h12l-1.5-2v-4.5a4.5 4.5 0 0 0-9 0V15z"/><path d="M10 20a2 2 0 0 0 4 0"/><path d="M4 4l16 16"/></svg>',
  close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};
function strengthLine(){
  var st=strengthStats(S.draft);if(!st.n)return '';
  var sk=strengthKcal(S.date);
  return '<div class="hint" style="margin-top:8px">Подходы: '+fmtMS(st.work)+' · отдых между ними: '+fmtMS(st.rest)+(sk?' · ≈ '+th(sk.kcal)+' ккал (идёт в расчёт вместо '+cfg().trainKcal+(sk.other>0?'; с учётом переходов между упражнениями':'; впиши длительность, чтобы учесть переходы')+')':' · записано подходов '+st.n+' из '+st.done+': для расчёта по времени нужно хотя бы 60%')+'</div>';
}
function nextUndone(ei,from){
  var ex=S.draft&&S.draft.exercises[ei];if(!ex)return -1;
  for(var i=(from==null?-1:from)+1;i<ex.sets.length;i++)if(!ex.sets[i].done)return i;
  return -1;
}
function restInline(ei){
  var r=S.rest,c=cfg();
  if(!r||!r.on||r.date!==S.date||r.ei!==ei)return '';
  var e=restElapsed(),work=r.mode==='work',nxt=work?-1:nextUndone(ei,r.si);
  var label=work?('Подход '+(r.si+1)+' · работа'):('Отдых · цель '+fmtMS(c.restTarget));
  return '<div class="restin'+(work?' work':(e>=c.restTarget?' ok':''))+'" id="restin"><div class="ri-top"><div class="ri-main"><div class="ri-l" id="riL">'+label+'</div><div class="ri-t" id="riT">'+fmtMS(e)+'</div></div>'
    +'<div class="ri-btns">'+(nxt>=0?'<button class="ri-go" data-act="wnext" aria-label="Начать подход">'+RI.play+'<span>Начать подход</span></button>':'')
    +'<button data-act="rb" data-k="pause" id="riP" aria-label="Пауза">'+(r.paused?RI.play:RI.pause)+'</button>'
    +(work?'':'<button data-act="rb" data-k="bell" id="riB" aria-label="Звук">'+(c.restBell?RI.bell:RI.bellOff)+'</button>')
    +'<button data-act="rb" data-k="close" aria-label="Закрыть">'+RI.close+'</button></div></div>'
    +(work?'':'<div class="ri-bar"><i id="riI" style="width:'+Math.min(100,e/c.restTarget*100).toFixed(1)+'%"></i></div>')+'</div>';
}
function paintRest(){
  var r=S.rest,el=document.getElementById('restin');
  if(!r||!r.on)return;
  var c=cfg(),e=restElapsed(),work=r.mode==='work';
  if(el){
    var t=document.getElementById('riT');if(t)t.textContent=fmtMS(e);
    var bi=document.getElementById('riI');if(bi)bi.style.width=Math.min(100,e/c.restTarget*100).toFixed(1)+'%';
    el.classList.toggle('ok',!work&&e>=c.restTarget);
    var pb=document.getElementById('riP');if(pb)pb.innerHTML=r.paused?RI.play:RI.pause;
    var bb=document.getElementById('riB');if(bb)bb.innerHTML=c.restBell?RI.bell:RI.bellOff;
    var lb=document.getElementById('riL');if(lb)lb.textContent=work?('Подход '+(r.si+1)+' · работа'):('Отдых · цель '+fmtMS(c.restTarget));
  }
  if(!work&&e>=c.restTarget&&!r.notified){r.notified=true;if(c.restBell)beep();}
}
function startRest(ei,si){
  var r=S.rest;
  if(r&&r.on&&r.date===S.date&&S.draft){
    var ps=S.draft.exercises[r.ei]&&S.draft.exercises[r.ei].sets[r.si],e=restElapsed();
    if(r.mode==='work'&&r.ei===ei&&r.si===si){if(ps&&e>=3&&e<=900)ps.dur=Math.round(e);}
    else if(r.mode==='rest'){if(ps&&e>=10&&e<=900)ps.rest=Math.round(e);}
  }
  S.rest={on:true,mode:'rest',start:Date.now(),acc:0,paused:false,ei:ei,si:si,date:S.date,notified:false};
  wakeOn();paintRest();
}
function startWork(ei,si){
  var r=S.rest;
  if(r&&r.on&&r.date===S.date&&r.mode==='rest'&&S.draft){
    var ps=S.draft.exercises[r.ei]&&S.draft.exercises[r.ei].sets[r.si],e=restElapsed();
    if(ps&&e>=5&&e<=900)ps.rest=Math.round(e);
  }
  S.rest={on:true,mode:'work',start:Date.now(),acc:0,paused:false,ei:ei,si:si,date:S.date,notified:false};
  wakeOn();markDirty();paintRest();
}
function stopRest(){S.rest=null;wakeOff();paintRest();}
setInterval(function(){if(S.rest&&S.rest.on)paintRest();},250);

/* ---------- перетаскивание упражнений ---------- */
var drag=null;
function isCtl(t){return !!(t.closest&&t.closest('input,textarea,select,button,a,label'));}
function dragStart(card,y){
  if(!card||drag)return;
  drag={card:card,startY:y,sy:y,lastY:y,active:false,timer:null,scroll:null};
  drag.timer=setTimeout(activateDrag,380);
}
function activateDrag(){
  if(!drag)return;
  drag.active=true;drag.card.classList.add('dragging');
  try{if(navigator.vibrate)navigator.vibrate(12);}catch(e){}
  drag.scroll=setInterval(function(){
    if(!drag||!drag.active)return;
    var h=window.innerHeight||800,y=drag.lastY,v=y<90?-10:(y>h-130?10:0);
    if(v){try{window.scrollBy(0,v);}catch(e){}dragMove(y);}
  },16);
}
function dragMove(y){
  var d=drag;if(!d||!d.active)return;
  d.lastY=y;
  var card=d.card;
  card.style.transform='translateY('+(y-d.startY)+'px) scale(1.02)';
  for(var it=0;it<4;it++){
    var r=card.getBoundingClientRect(),mid=r.top+r.height/2,nx=card.nextElementSibling,pv=card.previousElementSibling,moved=false;
    if(nx&&nx.classList.contains('ex')){var nr=nx.getBoundingClientRect();if(mid>nr.top+nr.height/2){nx.after(card);moved=true;}}
    if(!moved&&pv&&pv.classList.contains('ex')){var pr=pv.getBoundingClientRect();if(mid<pr.top+pr.height/2){pv.before(card);moved=true;}}
    if(!moved)break;
    var nt=card.getBoundingClientRect().top;d.startY+=nt-r.top;
    card.style.transform='translateY('+(y-d.startY)+'px) scale(1.02)';
  }
}
function dragEnd(){
  var d=drag;drag=null;if(!d)return;
  clearTimeout(d.timer);clearInterval(d.scroll);
  if(!d.active)return;
  var order=[].slice.call($app.querySelectorAll('.card.ex')).map(function(c){return Number(c.dataset.ei);});
  d.card.classList.remove('dragging');d.card.style.transform='';
  S.suppressClick=Date.now();
  if(S.draft&&order.some(function(v,i){return v!==i;})){
    var old=S.draft.exercises;S.draft.exercises=order.map(function(i){return old[i];});
    if(S.rest&&S.rest.date===S.date){var ni=order.indexOf(S.rest.ei);if(ni>=0)S.rest.ei=ni;}
    markDirty();
  }
  render(true);
}
$app.addEventListener('touchstart',function(e){
  var card=e.target.closest&&e.target.closest('.card.ex');
  if(!card||isCtl(e.target)||e.touches.length!==1)return;
  dragStart(card,e.touches[0].clientY);
},{passive:true});
document.addEventListener('touchmove',function(e){
  if(!drag)return;var y=e.touches[0].clientY;
  if(drag.active){e.preventDefault();dragMove(y);}
  else if(Math.abs(y-drag.sy)>8){clearTimeout(drag.timer);drag=null;}
},{passive:false});
document.addEventListener('touchend',dragEnd);
document.addEventListener('touchcancel',dragEnd);
$app.addEventListener('mousedown',function(e){
  if(e.button!==0)return;
  var card=e.target.closest&&e.target.closest('.card.ex');
  if(!card||isCtl(e.target))return;
  dragStart(card,e.clientY);
});
document.addEventListener('mousemove',function(e){
  if(!drag)return;
  if(drag.active)dragMove(e.clientY);
  else if(Math.abs(e.clientY-drag.sy)>8){clearTimeout(drag.timer);drag=null;}
});
document.addEventListener('mouseup',dragEnd);

var I18N_TPL={"Тренировка": "Workout", "Питание": "Nutrition", "Замеры": "Body", "История": "History", "План": "Plan", "Тренировки": "Workouts", "Настройки": "Settings", "Дневник": "Diary", "Мои продукты": "My Foods", "Сегодня": "Today", "Вчера": "Yesterday", "Завтра": "Tomorrow", "Загрузка…": "Loading…", "Загрузка": "Loading", "Журнал недоступен": "Journal unavailable", "Нет доступа к хранилищу. Открой журнал из своего аккаунта Claude, чтобы данные сохранялись.": "Storage isn’t available. Open the journal from your Claude account so your data can be saved.", "Шаги": "Steps", "Расход": "Burned", "Силовая": "Strength", "Потрачено": "Burned", "Употреблено": "Consumed", "Цель": "Goal", "Осталось": "Remaining", "Перебор": "Over", "Дефицит": "Deficit", "Профицит": "Surplus", "Баланс": "Balance", "За день": "Per day", "Всего за день": "Total for the day", "В среднем за день": "Daily average", "7 дней": "7 days", "шагов": "steps", "ккал": "kcal", "подходов": "sets", "кг": "kg", "см": "cm", "г": "g", "мин": "min", "сек": "sec", "км": "km", "км/ч": "km/h", "Сделано": "Done", "Пропуск": "Skipped", "Нет": "None", "Нет · + кардио": "None · + cardio", "Сделано · + кардио": "Done · + cardio", "Пропуск · + кардио": "Skipped · + cardio", "{n}% от цели": "{n}% of goal", "Расход калорий за день": "Daily Energy Burn", "Расход калорий": "Energy Burn", "Шаги за день": "Steps for the Day", "Итоги силовой": "Strength Summary", "БЖУ и клетчатка": "Macros & Fiber", "Базовый обмен (BMR)": "Basal Metabolic Rate (BMR)", "Базовый обмен (BMR) + переваривание": "Basal Metabolic Rate (BMR) + Digestion", "Базовый обмен + переваривание, ккал": "Basal metabolism + digestion, kcal", "+ Активность": "+ Activity", "= Расход за день": "= Daily burn", "Итого расход": "Total burn", "Кардио (без покоя)": "Cardio (net of resting)", "Силовая тренировка": "Strength Training", "Силовая тренировка (по таймеру)": "Strength Training (timer-based)", "пропущена, {n}": "skipped, {n}", "нет": "none", "Поправка": "Adjustment", "Цель по еде": "Food Goal", "BMR — расход в покое. В {n} входит и переваривание пищи.": "BMR is the energy you burn at rest. The {n} figure also includes the cost of digestion.", "Шаги за этот день не внесены — цель без них. Внеси во вкладке «Тренировка».": "Steps for this day haven’t been entered, so the goal is calculated without them. Add them in the “Workout” tab.", "Шаги считаются от веса ({n} кг). Шаги кардио-дорожки не считаются дважды. Настройки — во вкладке «План».": "Steps are calculated from your weight ({n} kg). Treadmill steps are not counted twice. Settings are in the “Plan” tab.", "Шаги: не внесены": "Steps: not entered", "Вписывай итог за день. Можно по ходу дня, расход пересчитается.": "Enter your daily total. You can update it through the day and the burn will recalculate.", "(формула ACSM, без покоя)": "(ACSM formula, net of resting)", "(часы минус покой)": "(watch minus resting)", "впиши ккал по часам или скорость и время": "enter watch kcal, or speed and time", "Кардио": "Cardio", "Сделана — заполни ниже": "Completed — fill in below", "Не было": "Not done", "Пропущена — расход считается без неё": "Skipped — burn is calculated without it", "Была отдельная кардио-сессия": "A separate cardio session was logged", "Отдельного кардио не было": "No separate cardio session", "Следующая силовая": "Next strength workout", "Открыть": "Open", "За этот день есть записанная тренировка — включи тумблер, чтобы увидеть.": "There’s a logged workout for this day — turn the switch on to see it.", "Выбрана {L}: пропущена {d}. Можно переключить.": "{L} selected: skipped on {d}. You can switch it.", "Выбрана {L}: следующая по циклу. Можно переключить.": "{L} selected: next in your cycle. You can switch it.", "Выполнено {n} из {n} подходов": "{n} of {n} sets completed", "В плане этого дня нет упражнений. Добавь их во вкладке «План» или ниже.": "This day’s plan has no exercises. Add them in the “Plan” tab or below.", "Добавить упражнение": "Add Exercise", "Название": "Name", "Упражнение": "Exercise", "Убрать": "Remove", "Вес, кг": "Weight, kg", "Повторы": "Reps", "Подх.": "Sets", "Повт.": "Reps", "Вес": "Weight", "Цель: —": "Target: —", "Цель: {n}×{n}": "Target: {n}×{n}", "Цель: {n}×{n}–{n}": "Target: {n}×{n}–{n}", "+ подход": "+ Set", "− подход": "− Set", "Начинаешь подход — нажми его номер. Закончил — галочка: пойдёт отдых.": "Starting a set? Tap its number. Finished? Tap the checkmark to begin your rest.", "Нажми номер подхода, когда начинаешь его: пойдёт время подхода. Нажми галочку, когда закончил: пойдёт отдых. Время подходов и отдыха идёт в расчёт калорий силовой.": "Tap a set’s number when you start it to time the set. Tap the checkmark when you finish to start your rest. Set and rest times are used to calculate strength calories.", "Прошлый раз": "Last time", "все подходы закрыты — можно добавить вес": "all sets completed — you can add weight", "Новое упражнение": "New Exercise", "Тест": "Test", "Отдых между подходами": "Rest between sets", "подход ср. {n} · отдых ср. {n}": "set avg {n} · rest avg {n}", "Подход {n} · работа": "Set {n} · Work", "Отдых · цель {n}": "Rest · goal {n}", "Начать подход": "Start Set", "Пауза": "Pause", "Сначала": "Restart", "Закрыть": "Close", "Звук": "Sound", "Подходы: {n} · отдых между ними: {n} · ≈ {n} ккал (идёт в расчёт вместо {n}; с учётом переходов между упражнениями)": "Sets: {n} · rest between them: {n} · ≈ {n} kcal (used instead of {n}; includes time between exercises)", "Подходы: {n} · отдых между ними: {n} · ≈ {n} ккал (идёт в расчёт вместо {n}; впиши длительность, чтобы учесть переходы)": "Sets: {n} · rest between them: {n} · ≈ {n} kcal (used instead of {n}; enter the duration to include time between exercises)", "Длительность, мин": "Duration, min", "Средний пульс": "Average heart rate", "Ккал по часам (справка)": "Watch kcal (reference)", "Ккал в расчёт": "Kcal used", "Заметка": "Note", "Сохранить": "Save", "Удалить": "Delete", "Самочувствие, локти, плечо…": "How you felt, elbows, shoulders…", "Тип": "Type", "Время, мин": "Time, min", "Дистанция, км": "Distance, km", "Скорость, км/ч": "Speed, km/h", "Наклон, %": "Incline, %", "Макс. пульс": "Max heart rate", "Ккал по часам": "Watch kcal", "Усилие RPE ({n}–{n})": "Effort RPE ({n}–{n})", "Шаги за сессию (браслет)": "Session steps (band)", "Шаги этой сессии входят в шаги за день": "This session’s steps are included in the daily steps", "Кардио {n}": "Cardio {n}", "Беговая дорожка": "Treadmill", "Эллипс": "Elliptical", "Велотренажёр": "Stationary Bike", "Степпер": "Stair Climber", "Гребной тренажёр": "Rowing Machine", "На улице (ходьба/бег)": "Outdoors (Walk/Run)", "Другое": "Other", "Интервалы, самочувствие…": "Intervals, how you felt…", "Скорость {n} км/ч · темп {n} мин/км · {n} км": "Speed {n} km/h · pace {n} min/km · {n} km", "Шаги этой сессии ≈ {n} (оценка по длине шага {n} м), входят в дневные.": "This session’s steps ≈ {n} (estimated from a {n} m stride), included in the daily total.", "Шаги этой сессии ≈ {n} (по браслету), входят в дневные.": "This session’s steps ≈ {n} (from your band), included in the daily total.", "Шаги: {n} (без {n} из кардио) · ≈{n} на {n}": "Steps: {n} (excluding {n} from cardio) · ≈{n} per {n}", "Шаги: {n} · ≈{n} на {n}": "Steps: {n} · ≈{n} per {n}", "Шагов в день (ср.)": "Steps per day (avg)", "Введи название и граммы — остальное заполню сам. Всё можно поправить.": "Enter a name and grams — I’ll fill in the rest. You can adjust everything.", "Автозаполнение недоступно, введи значения вручную.": "Auto-fill isn’t available. Enter the values manually.", "Добавить еду": "Add Food", "Что съел?": "What did you eat?", "Граммы": "Grams", "Граммы (необяз.)": "Grams (optional)", "Граммы (оценка)": "Grams (estimate)", "Заполнить автоматически": "Auto-Fill", "✨ Заполнить автоматически": "✨ Auto-Fill", "Заполнить": "Fill", "Итого за порцию": "Total per serving", "На {n} г (с упаковки)": "Per {n} g (from the package)", "Итого за порцию (можно править)": "Total per serving (editable)", "Питательность": "Nutrition Facts", "Питательность — всё можно править": "Nutrition facts — everything is editable", "Тип белка": "Protein Type", "Животный": "Animal", "Растительный": "Plant", "Смешанный": "Mixed", "Из них животный, г": "Of which animal, g", "Не указан — в статистике будет серым.": "Not specified — it will appear gray in the charts.", "Сохранить в мои продукты": "Save to My Foods", "Сохранить продукты в мои": "Save foods to My Foods", "Добавить": "Add", "Добавить ({n})": "Add ({n})", "Изменить запись": "Edit Entry", "Если поменяешь граммы, остальное пересчитается пропорционально.": "If you change the grams, the rest will be recalculated proportionally.", "Белки": "Protein", "Жиры": "Fat", "Углеводы": "Carbs", "Клетчатка": "Fiber", "Ккал": "Kcal", "Ккал на {n} шагов": "Kcal per {n} steps", "Белки, г": "Protein, g", "Жиры, г": "Fat, g", "Углеводы, г": "Carbs, g", "Клетчатка, г": "Fiber, g", "Завтрак": "Breakfast", "Обед": "Lunch", "Ужин": "Dinner", "Перекус": "Snack", "Скопировать вчера ({n})": "Copy Yesterday ({n})", "Пока ничего не записано.": "Nothing logged yet.", "Мои продукты:": "My foods:", "Есть в моих продуктах:": "In my foods:", "Ничего не найдено.": "Nothing found.", "Библиотека пуста. Нажми «+ Новый» или добавляй еду вручную с галочкой «Сохранить в мои продукты».": "Your food library is empty. Tap “+ New”, or add food manually and check “Save to My Foods”.", "Поиск по моим продуктам": "Search my foods", "Новый продукт": "New Food", "Продукт": "Food", "Всё — на {n} г продукта.": "All values are per {n} g of the food.", "Значения — на {n} г. Потом выбираешь продукт и вводишь граммы.": "Values are per {n} g. Then you pick a food and enter the grams.", "Порция, г (необяз.)": "Serving, g (optional)", "например {n} для яйца": "e.g. {n} for an egg", "Например: куриная грудка варёная": "For example: boiled chicken breast", "Например: тыквенные семечки": "For example: pumpkin seeds", "Из моих продуктов: на {n} г {n} ккал · белки {n} · жиры {n} · углеводы {n} · клетч. {n}": "From My Foods: per {n} g {n} kcal · protein {n} · fat {n} · carbs {n} · fiber {n}", "Считаю питательность…": "Calculating nutrition…", "Сначала введи название продукта.": "Enter a food name first.", "Введи название.": "Enter a name.", "Введи граммы — посчитаю итог за порцию.": "Enter the grams and I’ll calculate the serving total.", "Введи граммы — тогда посчитаю итог.": "Enter the grams and I’ll calculate the total.", "Заполни питательность: нажми «Заполнить» или впиши вручную.": "Fill in the nutrition facts: tap “Fill” or enter them manually.", "Автозаполнение не разрешено. Введи значения вручную.": "Auto-fill isn’t allowed. Enter the values manually.", "Автозаполнение недоступно. Введи значения вручную.": "Auto-fill isn’t available. Enter the values manually.", "Не удалось надёжно определить. Введи значения вручную.": "Couldn’t determine this reliably. Enter the values manually.", "Слишком много запросов. Подожди немного и нажми «Заполнить».": "Too many requests. Wait a moment, then tap “Fill”.", "Не получилось разобрать ответ. Нажми «Заполнить» ещё раз.": "Couldn’t read the response. Tap “Fill” to try again.", "Не удалось получить данные. Нажми «Заполнить» ещё раз или введи вручную.": "Couldn’t get the data. Tap “Fill” to try again, or enter it manually.", "Оценка по справочным данным — проверь.": "Estimate based on reference data — please double-check.", "белки {n} (": "protein {n} (", "жив. {n}": "anim. {n}", "раст. {n}": "plant {n}", "? {n}": "? {n}", "Животные {n} г": "Animal {n} g", "Животные {n} г · {n}%": "Animal {n} g · {n}%", "Растительные {n} г": "Plant {n} g", "Растительные {n} г · {n}%": "Plant {n} g · {n}%", "Не указано {n} г": "Unspecified {n} g", "Углеводы = остаток калорий после белков и жиров. Цели меняются во вкладке «План → Настройки».": "Carbs are the calories left after protein and fat. You can change the targets in “Plan → Settings”.", "Углеводы считаются автоматически: остаток калорий после белков и жиров.": "Carbs are calculated automatically: the calories left after protein and fat.", "Кольцо — сколько от расхода употреблено за день.": "The ring shows how much of your daily burn you’ve consumed.", "Неделя (дней с едой: {n})": "Week ({n} days with food)", "Среднее употреблено": "Average consumed", "Средний расход (расчёт)": "Average burn (estimated)", "Вес, среднее за {n} дн.": "Weight, {n}-day average", "По расчёту вес за неделю должен измениться на +{n} кг. Если на деле заметно иначе, поправь «Поправку» в настройках.": "By calculation, your weight over the week should change by +{n} kg. If the real change is noticeably different, adjust “Adjustment” in settings.", "По расчёту вес за неделю должен измениться на -{n} кг. Если на деле заметно иначе, поправь «Поправку» в настройках.": "By calculation, your weight over the week should change by -{n} kg. If the real change is noticeably different, adjust “Adjustment” in settings.", "По расчёту вес за неделю должен измениться на {n} кг. Если на деле заметно иначе, поправь «Поправку» в настройках.": "By calculation, your weight over the week should change by {n} kg. If the real change is noticeably different, adjust “Adjustment” in settings.", "Еда по фото": "Food from Photo", "📷 Открыть камеру": "📷 Open Camera", "🖼️ Открыть галерею": "🖼️ Open Gallery", "Открыть камеру": "Open Camera", "Открыть галерею": "Open Gallery", "Фото еды: определю продукты и вес. Фото этикетки: возьму точные значения с упаковки.": "Food photo: I’ll identify the foods and estimate the weight. Label photo: I’ll take the exact values from the package.", "Проверяю, доступно ли распознавание фото…": "Checking whether photo recognition is available…", "Распознаю фото… обычно {n}–{n} секунд.": "Analyzing photo… usually {n}–{n} seconds.", "Остановить": "Stop", "Вес по фото приблизительный — поправь его. Остальное пересчитается.": "The weight from the photo is approximate — adjust it and the rest will recalculate.", "С этикетки ✓": "From the label ✓", "Оценка по фото": "Estimated from photo", "Ещё фото:": "More photos:", "вес приблизительный": "weight is approximate", "Не нашёл еду на фото. Попробуй другое фото или добавь вручную.": "I couldn’t find any food in the photo. Try another photo or add it manually.", "Файл слишком большой. Выбери другое фото.": "The file is too large. Choose another photo.", "Не удалось распознать фото. Попробуй ещё раз или добавь вручную.": "Couldn’t analyze the photo. Try again or add it manually.", "Отправка фото недоступна в этом приложении.": "Sending photos isn’t available in this app.", "Файл не подошёл (формат или размер). Выбери другое фото.": "The file didn’t work (format or size). Choose another photo.", "Распознавание не разрешено. Добавь вручную.": "Recognition isn’t allowed. Add it manually.", "Слишком много запросов. Подожди немного.": "Too many requests. Please wait a moment.", "Не получилось разобрать ответ. Попробуй другое фото.": "Couldn’t read the response. Try another photo.", "Распознавание фото недоступно в этом окне (причина неизвестна). Пришли фото мне в чат — я определю еду и добавлю запись в журнал.": "Photo recognition isn’t available in this window (unknown reason). Send the photo to me in chat and I’ll identify the food and add the entry to your journal.", "Распознавание фото недоступно в этом окне (Claude в этом окне недоступен). Пришли фото мне в чат — я определю еду и добавлю запись в журнал.": "Photo recognition isn’t available in this window (Claude isn’t available here). Send the photo to me in chat and I’ll identify the food and add the entry to your journal.", "Распознавание фото недоступно в этом окне (это приложение не передаёт фото в Claude). Пришли фото мне в чат — я определю еду и добавлю запись в журнал.": "Photo recognition isn’t available in this window (this app doesn’t pass photos to Claude). Send the photo to me in chat and I’ll identify the food and add the entry to your journal.", "Распознавание фото недоступно в этом окне (не удалось проверить возможности). Пришли фото мне в чат — я определю еду и добавлю запись в журнал.": "Photo recognition isn’t available in this window (couldn’t check capabilities). Send the photo to me in chat and I’ll identify the food and add the entry to your journal.", "Распознавание фото недоступно в этом окне (устаревшая версия просмотрщика). Пришли фото мне в чат — я определю еду и добавлю запись в журнал.": "Photo recognition isn’t available in this window (outdated viewer version). Send the photo to me in chat and I’ll identify the food and add the entry to your journal.", "Распознавание фото недоступно в этом окне (ошибка подключения к Claude). Пришли фото мне в чат — я определю еду и добавлю запись в журнал.": "Photo recognition isn’t available in this window (couldn’t connect to Claude). Send the photo to me in chat and I’ll identify the food and add the entry to your journal.", "Бицепс": "Biceps", "Бицепс правый": "Biceps (right)", "Бёдра": "Thighs", "Ягодицы": "Glutes", "Талия": "Waist", "Шея": "Neck", "Жир (расчёт)": "Body Fat (est.)", "Жир": "Body Fat", "Бицепс, см": "Biceps, cm", "Бицепс правый, см": "Right biceps, cm", "Бёдра, см": "Thighs, cm", "Ягодицы, см": "Glutes, cm", "Талия, см": "Waist, cm", "Шея, см": "Neck, cm", "Среднее": "Average", "Диапазон": "Range", "За месяц": "This month", "Среднее за {n} дней": "{n}-day average", "Нужно минимум {n} замера для графика.": "At least {n} measurements are needed for a chart.", "Серая линия — взвешивания, цветная — среднее за {n} дней: сейчас {n} кг.": "The gray line shows weigh-ins; the colored line is the {n}-day average (currently {n} kg).", "Серая линия — взвешивания, цветная — среднее за {n} дней.": "The gray line shows weigh-ins; the colored line is the {n}-day average.", "Считаю сам: беру середину (медиану) формул по росту, возрасту, весу, талии и шее. Deurenberg {n}% · CUN-BAE {n}% · RFM {n}% · US Navy {n}%. Итог: {n}%.": "Calculated automatically: I take the middle value (median) of several formulas using your height, age, weight, waist and neck. Deurenberg {n}% · CUN-BAE {n}% · RFM {n}% · US Navy {n}%. Result: {n}%.", "В клетке — вес в кг. В этом месяце: с обхватами {n}, только вес {n}.": "Each cell shows weight in kg. This month: {n} with girth measurements, {n} weight only.", "есть обхваты": "has girth measurements", "только вес": "weight only", "нет данных": "no data", "замера нет": "no measurement", "На эту дату ничего не записано. Заполни форму ниже и сохрани.": "Nothing is logged for this date. Fill in the form below and save.", "изменение — к прошлому замеру": "change since the previous measurement", "без изм.": "no change", "без изменений": "no change", "Изменить замер за {d}": "Edit Measurement for {d}", "Новый замер за {d}": "New Measurement for {d}", "Сохранить замер": "Save Measurement", "Серым — прошлое значение. Пустые поля не сохраняются.": "Gray shows the previous value. Empty fields aren’t saved.", "Утром, натощак…": "Morning, fasted…", "Заполни хотя бы одно поле": "Fill in at least one field", "Сохраняю…": "Saving…", "Сохранено ✓": "Saved ✓", "Не сохранилось": "Couldn’t save", "Удалено": "Deleted", "Изменения…": "Changes…", "авто": "auto", "авто: {n}": "auto: {n}", "вес тела": "bodyweight", "повт": "reps", "Значение": "Value", "Неделя": "Week", "Месяц": "Month", "Отдых": "Rest", "Силовая · день {L}": "Strength · Day {L}", "Пропуск {L}": "Skipped {L}", "Баланс по {n} дн.": "Balance over {n} days", "с едой {n}": "{n} with food", "с едой {n} (без шагов: {n})": "{n} with food (no steps: {n})", "с едой {n} (сегодня не входит, пока день не закончен)": "{n} with food (today excluded until the day ends)", "с едой {n} (без шагов: {n}, сегодня не входит, пока день не закончен)": "{n} with food (no steps: {n}; today excluded until the day ends)", "В этом периоде пока нет дня, где есть и еда, и шаги, и он закончен. Баланс считаю только по таким дням.": "This period doesn’t have a finished day with both food and steps logged yet. Balance is calculated only from such days.", "День не закончен: баланс посчитаю, когда он пройдёт. Сейчас — во вкладке «Питание».": "The day isn’t over yet: I’ll calculate the balance once it has passed. For now, see the “Nutrition” tab.", "Нет шагов за этот день: расход неизвестен, баланс не считаю.": "No steps for this day: burn is unknown, so I’m not calculating the balance.", "Еда за этот день не записана.": "No food logged for this day.", "За этот день записей нет.": "No entries for this day.", "Удалить день": "Delete Day", "В среднем в день: употреблено / расход": "Daily average: consumed / burned", "По балансу изменение жира": "Fat change implied by balance", "Силовых / пропусков": "Workouts / skipped", "Белка в день (ср.)": "Protein per day (avg)", "расход": "burn", "употреблено": "consumed", "день не закончен": "day not finished", "дефицит": "deficit", "профицит": "surplus", "≈ поддержание": "≈ maintenance", "нет шагов или день не закончен": "no steps or day not finished", "силовая": "strength", "кардио": "cardio", "пропуск": "skipped", "кардио ": "cardio ", "Прошлый месяц": "Previous month", "Следующий месяц": "Next month", "Назад": "Back", "Вперёд": "Forward", "График": "Chart", "Расход и употреблено по дням": "Burned and consumed by day", "Калории: употреблено {n} из {n}": "Calories: {n} consumed of {n}", "Шаблон подставляется в новую тренировку этого дня. Уже записанные тренировки не меняются.": "The template is applied to a new workout on this day. Workouts you’ve already logged won’t change.", "Пусто. Добавь первое упражнение.": "Nothing here yet. Add your first exercise.", "Ккал за силовую": "Kcal per strength workout", "Поправка к расходу, %": "Burn adjustment, %", "Рост, см": "Height, cm", "Возраст, лет": "Age, years", "Длина шага, м": "Step length, m", "Шаги по умолчанию считаются от веса (≈{n} ккал на {n} шагов на кг). Расчёты по формулам часто завышают расход на {n}–{n}%: сравнивай со средним весом за неделю и подкручивай поправку (например −{n}).": "By default, steps are calculated from your weight (≈{n} kcal per {n} steps per kg). Formula-based estimates often overstate burn by {n}–{n}%: compare against your weekly average weight and fine-tune the adjustment (for example −{n}).", "Сколько есть относительно расхода за день": "How much to eat relative to your daily burn", "Поддержка": "Maintenance", "Свой сдвиг, ккал": "Custom offset, kcal", "Таймер отдыха": "Rest Timer", "Цель отдыха, сек": "Rest goal, sec", "Звук и вибрация": "Sound & Haptics", "сигнал, когда отдых дошёл до цели": "alerts you when your rest reaches the goal", "Нормы на день": "Daily Targets", "Заменить": "Replace", "Отмена": "Cancel", "Заменить записанные данные этого дня шаблоном {L}?": "Replace this day’s logged data with template {L}?", "Удалить тренировку за {d}?": "Delete the workout for {d}?", "Удалить всё за {d} (тренировку, шаги, питание)?": "Delete everything for {d} (workout, steps, nutrition)?", "Удалить замер за {d}?": "Delete the measurement for {d}?", "Не удалось подключиться к хранилищу. Обнови страницу.": "Couldn’t connect to storage. Refresh the page.", "Обнови страницу.": "Refresh the page.", "Было": "Was", "Всё": "All", "Календарь": "Calendar", "Хорошая тренировка": "Good workout", "+ Добавить еду": "+ Add Food", "+ Ещё одна кардио-сессия": "+ Add Another Cardio Session", "+ Новый": "+ New", "+ Упражнение": "+ Exercise", "Баланс в день": "Daily balance", "— всё можно править": "— everything is editable", "Русский": "Русский", "English": "English", "Язык / Language": "Language", "Язык": "Language", "Интерфейс, названия упражнений и продуктов переводятся на английский. Новые названия переводятся автоматически и запоминаются.": "The interface, exercise names and food names are translated into English. New names are translated automatically and remembered.", "{n} мин": "{n} min", "{n} км": "{n} km", "{n} км/ч": "{n} km/h", "накл. {n}%": "incline {n}%", "пульс {n}": "HR {n}", "≈{n} ккал": "≈{n} kcal", "{n} ккал (часы)": "{n} kcal (watch)", "≈ {n} ккал": "≈ {n} kcal", "{n} ≈ {n} ккал": "{n} ≈ {n} kcal", "{n} ккал": "{n} kcal", "{n} г": "{n} g", "{n} дней": "{n} days", "{n} / {n} г": "{n} / {n} g", "{n} · без изм.": "{n} · no change", "+{n} кг": "+{n} kg", "+{n} ккал": "+{n} kcal", "-{n} ккал": "-{n} kcal", "{n} кг": "{n} kg", "{n} ккал/{n} г": "{n} kcal/{n} g", "шаги {n}": "steps {n}", "шаги {n} · кардио {n} · сила {n}": "steps {n} · cardio {n} · strength {n}", "шаги {n} · сила {n}": "steps {n} · strength {n}", "за {n} г": "for {n} g", "на {n} г: белки {n} (": "per {n} g: protein {n} (", "Кардио: Беговая дорожка": "Cardio: Treadmill", "Кардио: Велотренажёр": "Cardio: Stationary Bike", "Кардио: Эллипс": "Cardio: Elliptical", "Кардио: Степпер": "Cardio: Stair Climber", "Кардио: Гребной тренажёр": "Cardio: Rowing Machine", "Кардио: На улице (ходьба/бег)": "Cardio: Outdoors (Walk/Run)", "Кардио: Другое": "Cardio: Other", "Сегодня · Завтра": "Today", "Цель:": "Target:"};
var I18N_G={"г": "g", "кг": "kg", "см": "cm", "мм": "mm", "м": "m", "мин": "min", "сек": "sec", "ч": "h", "км": "km", "км/ч": "km/h", "мин/км": "min/km", "ккал": "kcal", "шагов": "steps", "шаги": "steps", "шаг": "step", "подходов": "sets", "подход": "set", "подх": "sets", "повт": "reps", "повторов": "reps", "ср": "avg", "дн": "days", "дней": "days", "день": "day", "дня": "days", "недель": "weeks", "неделя": "week", "месяц": "month", "клетч": "fiber", "накл": "incline", "жив": "anim.", "раст": "plant", "необяз": "optional", "авто": "auto", "итого": "total", "итог": "result", "сегодня": "today", "вчера": "yesterday", "завтра": "tomorrow", "расход": "burn", "потрачено": "burned", "употреблено": "consumed", "цель": "goal", "осталось": "remaining", "баланс": "balance", "дефицит": "deficit", "профицит": "surplus", "поддержание": "maintenance", "белки": "protein", "белок": "protein", "жиры": "fat", "углеводы": "carbs", "клетчатка": "fiber", "сила": "strength", "силовая": "strength", "кардио": "cardio", "пульс": "heart rate", "вес": "weight", "талия": "waist", "шея": "neck", "бёдра": "thighs", "ягодицы": "glutes", "бицепс": "biceps", "жир": "body fat", "заметка": "note", "название": "name", "граммы": "grams", "порция": "serving", "сохранить": "Save", "удалить": "Delete", "добавить": "Add", "открыть": "Open", "отмена": "Cancel", "заменить": "Replace", "закрыть": "Close", "изменить": "Edit", "новый": "New", "продукт": "food", "продукты": "foods", "мои продукты": "my foods", "тренировка": "workout", "тренировки": "workouts", "тренировку": "workout", "упражнение": "exercise", "упражнения": "exercises", "отдых": "rest", "работа": "work", "пропуск": "skipped", "пропущена": "skipped", "сделано": "done", "сделана": "completed", "питание": "nutrition", "еда": "food", "еды": "food", "замер": "measurement", "замеры": "measurements", "история": "history", "план": "plan", "настройки": "settings", "год": "year", "лет": "years", "завтрак": "Breakfast", "обед": "Lunch", "ужин": "Dinner", "перекус": "Snack", "нет": "none", "да": "yes", "и": "and", "или": "or", "из": "of", "на": "per", "по": "by", "за": "for", "в": "in", "с": "from", "без": "without", "до": "to", "от": "from", "для": "for", "при": "at", "ничего": "nothing", "записано": "logged", "записей": "entries", "данных": "data", "данные": "data", "значения": "values", "значение": "value", "ошибка": "error", "загрузка": "loading", "не": "not", "стоп": "Stop", "пауза": "Pause", "старт": "Start", "звук": "sound", "цвет": "color", "график": "chart", "календарь": "calendar", "диапазон": "range", "среднее": "average", "средний": "average", "максимум": "max", "минимум": "min", "животный": "animal", "растительный": "plant", "смешанный": "mixed", "животные": "animal", "растительные": "plant", "беговая дорожка": "Treadmill", "эллипс": "Elliptical", "велотренажёр": "Stationary Bike", "степпер": "Stair Climber", "гребной тренажёр": "Rowing Machine", "другое": "Other", "январь": "January", "февраль": "February", "март": "March", "апрель": "April", "май": "May", "июнь": "June", "июль": "July", "август": "August", "сентябрь": "September", "октябрь": "October", "ноябрь": "November", "декабрь": "December", "Гиперэкстензия": "Back Extension", "Присед со штангой": "Barbell Back Squat", "Присед": "Squat", "Приседания": "Squats", "Приседания со штангой": "Barbell Back Squats", "Ягодичный мост (тренажёр)": "Glute Bridge (Machine)", "Ягодичный мост": "Glute Bridge", "Мост": "Glute Bridge", "Верхний блок, узкий хват": "Close-Grip Lat Pulldown", "Верхний блок, широкий хват": "Wide-Grip Lat Pulldown", "Верхний блок": "Lat Pulldown", "Тяга верхнего блока": "Lat Pulldown", "Тяга с упором грудью": "Chest-Supported Row", "Тяга с упором грудью (T-bar)": "Chest-Supported Row (T-Bar)", "Тяга в наклоне": "Bent-Over Row", "Тяга штанги в наклоне": "Barbell Bent-Over Row", "Тяга нижнего блока": "Seated Cable Row", "Бабочка (грудь)": "Pec Deck (Chest Fly)", "Бабочка": "Pec Deck", "Обратная бабочка": "Reverse Pec Deck (Rear Delt Fly)", "Махи в кроссовере (средняя дельта)": "Cable Lateral Raise (Side Delts)", "Махи в кроссовере": "Cable Lateral Raise", "Махи гантелями в стороны": "Dumbbell Lateral Raise", "Трицепс на блоке (каждая рука)": "Cable Triceps Pushdown (Each Arm)", "Трицепс на блоке": "Cable Triceps Pushdown", "Трицепс": "Triceps", "Французский жим": "Skull Crushers", "Бицепс с гантелями": "Dumbbell Biceps Curl", "Подъём гантелей на бицепс": "Dumbbell Biceps Curl", "Подъём штанги на бицепс": "Barbell Curl", "Сгибание рук с гантелями": "Dumbbell Curl", "Молотки": "Hammer Curls", "Румынская тяга": "Romanian Deadlift", "Становая тяга": "Deadlift", "Тяга на прямых ногах": "Stiff-Leg Deadlift", "Жим на наклоне (тренажёр, на руку)": "Incline Chest Press (Machine, Per Arm)", "Жим на наклоне (тренажёр)": "Incline Chest Press (Machine)", "Жим на наклоне": "Incline Press", "Жим лёжа": "Bench Press", "Жим гантелей лёжа": "Dumbbell Bench Press", "Жим гантелей на наклонной скамье": "Incline Dumbbell Press", "Жим стоя": "Overhead Press", "Жим гантелей сидя": "Seated Dumbbell Shoulder Press", "Жим ногами": "Leg Press", "Жим": "Press", "Отжимания": "Push-Ups", "Отжимания от пола": "Push-Ups", "Отжимания на брусьях": "Dips", "Подтягивания": "Pull-Ups", "Подтягивания узким хватом": "Close-Grip Pull-Ups", "Подтягивания широким хватом": "Wide-Grip Pull-Ups", "Подтягивания обратным хватом": "Chin-Ups", "Выпады": "Lunges", "Болгарские выпады": "Bulgarian Split Squats", "Разгибание ног": "Leg Extension", "Сгибание ног": "Leg Curl", "Подъём на носки": "Calf Raises", "Подъём на носки стоя": "Standing Calf Raises", "Скручивания": "Crunches", "Планка": "Plank", "Подъём ног в висе": "Hanging Leg Raises", "Кроссовер": "Cable Crossover", "Сведение рук в кроссовере": "Cable Fly", "Пуловер": "Pullover", "Шраги": "Shrugs", "Face pull": "Face Pull", "тренажёр": "machine", "штанга": "barbell", "штангой": "barbell", "гантели": "dumbbells", "гантелями": "dumbbells", "блок": "cable", "блоке": "cable", "хват": "grip", "узкий": "close", "широкий": "wide", "на руку": "per arm", "каждая рука": "each arm", "грудь": "chest", "спина": "back", "плечи": "shoulders", "ноги": "legs", "руки": "arms", "пресс": "abs", "дельта": "delts", "средняя дельта": "side delts", "задняя дельта": "rear delts", "грудью": "chest-supported", "куриная грудка": "chicken breast", "курица": "chicken", "рис": "rice", "гречка": "buckwheat", "овсянка": "oatmeal", "яйцо": "egg", "яйца": "eggs", "творог": "cottage cheese", "молоко": "milk", "йогурт": "yogurt", "сыр": "cheese", "тыквенные семечки": "pumpkin seeds", "орехи": "nuts", "миндаль": "almonds", "банан": "banana", "яблоко": "apple", "хлеб": "bread", "макароны": "pasta", "картофель": "potatoes", "картошка": "potatoes", "говядина": "beef", "свинина": "pork", "рыба": "fish", "лосось": "salmon", "тунец": "tuna", "протеин": "protein powder", "варёный": "boiled", "варёная": "boiled", "жареный": "fried", "запечённый": "baked", "сырой": "raw", "Не удалось подключиться к хранилищу": "Couldn’t connect to storage", "Обнови страницу.": "Refresh the page."};
Object.assign(I18N_TPL,{"Камера":"Camera","Галерея":"Gallery","Заполнить автоматически":"Auto-Fill","Claude: фото и автозаполнение":"Claude: Photos & Auto-Fill","Ключ":"Key","Проверить":"Check","Удалить ключ":"Delete Key","Резервная копия":"Backup","Сохранить копию":"Save Backup","Загрузить из файла":"Load from File","Перенести данные из журнала":"Move Your Journal Data","Выбрать файл":"Choose File","Начать с нуля":"Start Fresh","Загрузить":"Load","Доступна новая версия":"A new version is available","Обновить":"Update","Ключ хранится только на этом телефоне и не попадает в резервные копии.":"The key stays on this phone and is never included in backups.","Распознавание фото работает с ключом Claude API. Добавь его во вкладке «План → Настройки».":"Photo recognition needs a Claude API key. Add it in “Plan → Settings”.","Автозаполнение работает с ключом Claude API («План → Настройки»). Пока введи значения вручную.":"Auto-fill needs a Claude API key (“Plan → Settings”). For now, enter the values manually."});
/* ---------- i18n: русский / English ---------- */
var LANG='ru',langDraft='ru';
var DOW_L={ru:['вс','пн','вт','ср','чт','пт','сб'],en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat']};
var MONTHS_L={ru:['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'],en:['January','February','March','April','May','June','July','August','September','October','November','December']};
var MON_SH=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var WD1_L={ru:['П','В','С','Ч','П','С','В'],en:['M','T','W','T','F','S','S']};
var DAYWD_L={ru:{A:'Пн',B:'Ср',C:'Пт'},en:{A:'Mon',B:'Wed',C:'Fri'}};
function applyLangArrays(){DOW=DOW_L[LANG];MONTHS=MONTHS_L[LANG];WD1=WD1_L[LANG];DAYWD=DAYWD_L[LANG];}
var I18N={user:{},pending:{},busy:false,last:0,fail:0};
try{window.__I18N=I18N;}catch(e){}
var CYR=/[А-Яа-яЁё]/;
function lookupCase(map,k){
  if(Object.prototype.hasOwnProperty.call(map,k))return map[k];
  var f=k.charAt(0),low=f.toLowerCase()+k.slice(1),up=f.toUpperCase()+k.slice(1);
  if(f!==low&&Object.prototype.hasOwnProperty.call(map,low)){var v=map[low];return v.charAt(0).toUpperCase()+v.slice(1);}
  if(f!==up&&Object.prototype.hasOwnProperty.call(map,up)){var v2=map[up];return v2.charAt(0).toLowerCase()+v2.slice(1);}
  return null;
}
var DATE_RE=/\b(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), )?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\b/g;
var NUM_RE=/\d+(?:[.,:\u00a0]\d+)*/g;
function normText(t){
  var q={n:[],d:[],L:[]};
  var k=t.replace(DATE_RE,function(m){q.d.push(m);return '{d}';});
  k=k.replace(/\b[ABC]\b/g,function(m){q.L.push(m);return '{L}';});
  k=k.replace(NUM_RE,function(m){q.n.push(m);return '{n}';});
  return {key:k.replace(/\s+/g,' ').trim(),q:q};
}
function fillTpl(tpl,q){
  var ni=0,di=0,li=0;
  return tpl.replace(/\{([ndL])\}/g,function(m,t){return t==='n'?(q.n[ni++]||''):(t==='d'?(q.d[di++]||''):(q.L[li++]||''));});
}
var ABBR={'дн':1,'ср':1,'накл':1,'клетч':1,'жив':1,'раст':1,'необяз':1,'мин':1,'сек':1,'кг':1,'ккал':1,'км':1,'см':1,'г':1,'м':1,'ч':1};
function userRun(run){
  var u=I18N.user[run];if(u)return u;
  I18N.pending[run]=1;return run;
}
function trRun(run){
  var v=lookupCase(I18N_G,run);if(v!==null)return v;
  return userRun(run);   /* незнакомые фразы переводятся целиком, а не по словам */
}
function trSeg(s){
  var core=s.trim();if(!core)return s;
  var nt=normText(core),v=lookupCase(I18N_TPL,nt.key);
  if(v!==null)return s.replace(core,function(){return fillTpl(v,nt.q);});
  var g=lookupCase(I18N_G,core);
  if(g!==null)return s.replace(core,function(){return g;});
  return s.replace(/([А-Яа-яЁё][А-Яа-яЁё\-]*(?:[ \u00a0]+[А-Яа-яЁё\-]+)*)(\.)?/g,function(m,run,dot){
    var r=trRun(run);
    if(r===run)return m;                       /* пока без перевода */
    return r+((dot&&!ABBR[run])?'.':'');
  });
}
function trText(t){
  if(!CYR.test(t))return t;
  var m=t.match(/^(\s*)([\s\S]*?)(\s*)$/),lead=m[1],core=m[2],trail=m[3];
  var nt=normText(core),v=lookupCase(I18N_TPL,nt.key);
  if(v!==null)return lead+fillTpl(v,nt.q)+trail;
  if(core.indexOf(' · ')>0)return lead+core.split(' · ').map(trSeg).join(' · ')+trail;
  return lead+trSeg(core)+trail;
}
var SKIP_TAGS={SCRIPT:1,STYLE:1,TEXTAREA:1,INPUT:1};
function trTextNode(n){
  var p=n.parentNode;if(!p||SKIP_TAGS[p.tagName])return;
  var v=n.nodeValue;if(!CYR.test(v)||n.__tr===v)return;
  var r=trText(v);
  if(r!==v){n.nodeValue=r;n.__tr=r;}
}
function trAttrs(el){
  if(!el||!el.getAttribute)return;
  ['placeholder','aria-label','title'].forEach(function(a){
    var v=el.getAttribute(a);
    if(v&&CYR.test(v)&&el['__tr_'+a]!==v){var r=trText(v);if(r!==v){el.setAttribute(a,r);el['__tr_'+a]=r;}}
  });
}
function trNode(root){
  if(LANG!=='en'||!root)return;
  if(root.nodeType===3){trTextNode(root);return;}
  if(root.nodeType!==1)return;
  var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null),arr=[],n;
  while((n=w.nextNode()))arr.push(n);
  arr.forEach(trTextNode);
  trAttrs(root);
  if(root.querySelectorAll)[].forEach.call(root.querySelectorAll('[placeholder],[aria-label],[title]'),trAttrs);
}
var sampleTimer=null;
function scheduleSample(){
  if(LANG!=='en'||sampleTimer||I18N.busy||I18N.fail>=3)return;
  if(!Object.keys(I18N.pending).some(function(k){return !I18N.user[k];}))return;
  sampleTimer=setTimeout(function(){sampleTimer=null;flushSample();},900);
}
async function flushSample(){
  if(I18N.busy||!S.sample||LANG!=='en')return;
  var keys=Object.keys(I18N.pending).filter(function(k){return !I18N.user[k]&&k.length<=300;}).slice(0,40);
  if(!keys.length)return;
  if(Date.now()-I18N.last<4000){sampleTimer=setTimeout(function(){sampleTimer=null;flushSample();},4300-(Date.now()-I18N.last));return;}
  I18N.busy=true;I18N.last=Date.now();
  try{
    var prompt='You are a professional translator for a fitness and nutrition tracking app (Apple Health style). Translate every Russian string below into natural, idiomatic English. '
      +'Exercise names must use standard gym terminology (for example "Присед со штангой" -> "Barbell Back Squat", "Тяга верхнего блока" -> "Lat Pulldown"). Food names must be natural English food names. Notes keep their meaning and casual tone. Keep numbers, units and punctuation. No commentary. '
      +'Reply ONLY with one JSON object that maps each input string, copied exactly, to its English translation.\nStrings:\n'+JSON.stringify(keys);
    var r=await S.sample.json(prompt,{modelTier:'default'});
    var any=false;
    keys.forEach(function(k){var v=r&&r[k];if(typeof v==='string'&&v.trim()){I18N.user[k]=v.trim();delete I18N.pending[k];any=true;}});
    if(any){
      if(S.db)enqueue(function(){return S.db.doc('i18n/en').set({m:I18N.user});});
      trNode(document.body);
    }
    I18N.fail=0;
  }catch(e){I18N.fail++;}
  I18N.busy=false;
}
function setLang(l,fromUser){
  if(l!=='ru'&&l!=='en')return;
  langDraft=l;
  if(l===LANG)return;
  LANG=l;applyLangArrays();
  document.documentElement.lang=l;
  document.title=l==='en'?'Training & Nutrition Journal':'Журнал тренировок и питания';
  if(fromUser)setSet('lang',l);
  if(!(S.error)&&allReady()&&S.draft)render(true);
  if(l==='en'){trNode(document.body);scheduleSample();}
}
(function(){
  var obs=new MutationObserver(function(muts){
    if(LANG!=='en')return;
    muts.forEach(function(m){
      if(m.type==='childList')[].forEach.call(m.addedNodes,trNode);
      else if(m.type==='characterData')trTextNode(m.target);
      else if(m.type==='attributes')trAttrs(m.target);
    });
    scheduleSample();
  });
  obs.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});
})();
function langCard(){
  return '<div class="card pad">'+h2i('list','var(--k-plan)','Язык / Language')
    +'<div class="pills" style="margin-top:0"><button class="pill'+(LANG==='ru'?' on':'')+'" data-act="lang" data-v="ru">Русский</button><button class="pill'+(LANG==='en'?' on':'')+'" data-act="lang" data-v="en">English</button></div>'
    +'<div class="hint">Интерфейс, названия упражнений и продуктов переводятся на английский. Новые названия переводятся автоматически и запоминаются.</div></div>';
}

/* ---------- приложение на iPhone: ключ Claude, резервные копии ---------- */
var KEY_LS='journal.apiKey';
var PREVIEW=window.JOURNAL_PREVIEW||null;
function getKey(){try{return localStorage.getItem(KEY_LS)||'';}catch(e){return '';}}
function setKey(k){try{if(k)localStorage.setItem(KEY_LS,k);else localStorage.removeItem(KEY_LS);}catch(e){}}
function setupAI(){
  var key=getKey();
  if(!key){S.sample=null;S.sampleChecked=true;S.photo=false;S.photoWhy='нет ключа';return Promise.resolve();}
  S.sampleChecked=false;S.photo=null;
  return import('./ai.js').then(function(m){
    S.sample=m.createSample(key);S.sampleChecked=true;S.photo=true;S.photoMax=0;
    if(LANG==='en')scheduleSample();
    if(S.sheet||S.tab==='plan')render();
  },function(){S.sample=null;S.sampleChecked=true;S.photo=false;S.photoWhy='модуль Claude не загрузился';});
}
function keyMsgPaint(t){S.keyMsg=t;var el=document.getElementById('aimsg');if(el)el.textContent=t;}
function keyCheck(k){
  if(!k)return;
  keyMsgPaint('Проверяю ключ…');
  import('./ai.js').then(function(m){return m.testKey(k);}).then(function(r){
    if(r.ok){keyMsgPaint('Ключ работает ✓');return;}
    if(r.code==='bad_key'){setKey('');setupAI();S.keyMsg='Ключ не подошёл. Скопируй его заново на console.anthropic.com → API Keys.';render(true);return;}
    if(r.code==='network'){keyMsgPaint('Нет интернета. Ключ сохранён, проверь позже.');return;}
    keyMsgPaint('Не удалось проверить ключ: '+(r.message||r.code));
  },function(){keyMsgPaint('Не удалось загрузить модуль Claude. Проверь интернет.');});
}
function keySave(){
  var el=document.getElementById('apikey'),k=el?String(el.value).trim():'';
  if(!/^sk-ant-/.test(k)){keyMsgPaint('Ключ начинается с «sk-ant-». Скопируй его целиком.');return;}
  setKey(k);S.keyMsg='';setupAI();render(true);keyCheck(k);
}
function aiCard(){
  var k=getKey(),h='<div class="card pad">'+h2i('spark','var(--k-plan)','Claude: фото и автозаполнение');
  if(PREVIEW)h+='<div class="hint io" style="margin:0 0 10px">Это предпросмотр внутри Claude: здесь фото и автозаполнение не работают. В приложении на телефоне они заработают с ключом.</div>';
  if(k){
    h+='<div class="kv"><span>Ключ</span><span class="mono">'+esc(k.slice(0,10)+'…'+k.slice(-4))+'</span></div>'
      +'<div class="row" style="margin-top:8px"><button class="grow" data-act="keyTest">Проверить</button><button class="danger" data-act="keyDel">Удалить ключ</button></div>';
  }else{
    h+='<div class="hint" style="margin:0 0 10px">Нужен для распознавания еды по фото и автозаполнения питательности. Создай ключ на console.anthropic.com → API Keys и вставь сюда. Оплата по факту: обычно копейки за запрос.</div>'
      +'<div class="row"><input id="apikey" type="password" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="sk-ant-…"><button class="primary" data-act="keySave">Сохранить</button></div>';
  }
  return h+'<div class="hint" id="aimsg">'+esc(S.keyMsg||'Ключ хранится только на этом телефоне и не попадает в резервные копии.')+'</div></div>';
}
function backupCard(){
  var c=S.db?S.db.counts():{workouts:0,food:0,body:0,foods:0};
  return '<div class="card pad">'+h2i('save','var(--k-cal)','Резервная копия')
    +(PREVIEW?'<div class="hint io" style="margin:0 0 10px">В предпросмотре данные живут только здесь и не связаны с приложением на телефоне.</div>':'')
    +'<div class="hint" style="margin:0 0 10px">Все данные хранятся на этом iPhone. Раз в неделю сохраняй копию в «Файлы» или iCloud Drive, тогда при смене телефона ничего не пропадёт.</div>'
    +'<div class="grid2"><button data-act="exp">Сохранить копию</button><button data-act="imp">Загрузить из файла</button></div>'
    +(S.ioMsg?'<div class="hint io">'+esc(S.ioMsg)+'</div>':'')
    +'<div class="hint">Сейчас на телефоне: тренировок '+c.workouts+', дней питания '+c.food+', замеров '+c.body+', продуктов '+c.foods+'.</div></div>';
}
function welcomeCard(){
  var done=false;try{done=localStorage.getItem('journal.welcomeDone')==='1';}catch(e){}
  if(done||!S.db||!S.db.isEmpty())return '';
  return '<div class="card pad welcome">'+h2i('save','var(--k-plan)','Перенести данные из журнала')
    +'<div class="hint" style="margin:0 0 10px">Есть файл резервной копии (journal-backup-….json)? Загрузи его, и здесь появятся тренировки, питание, замеры и шаблоны A/B/C.</div>'
    +'<div class="grid2"><button class="primary" data-act="imp">Выбрать файл</button><button data-act="welcomeSkip">Начать с нуля</button></div>'
    +(S.ioMsg?'<div class="hint io">'+esc(S.ioMsg)+'</div>':'')+'</div>';
}
var impInput=null;
function pickImport(){
  if(!impInput){
    impInput=document.createElement('input');impInput.type='file';impInput.accept='application/json,.json';impInput.hidden=true;
    document.body.appendChild(impInput);
    impInput.addEventListener('change',function(){var f=impInput.files&&impInput.files[0];impInput.value='';if(f)readImport(f);});
  }
  impInput.click();
}
function readImport(f){
  f.text().then(function(t){
    var data;
    try{data=parseBackup(t);}catch(e){S.ioMsg=e.message;render(true);return;}
    var c=S.db.counts(data);
    ask('Загрузить копию? Тренировок: '+c.workouts+', дней питания: '+c.food+', замеров: '+c.body+', продуктов: '+c.foods+'. То, что сейчас на телефоне, заменится.','Загрузить',function(){
      Object.keys(timers).forEach(function(k){clearTimeout(timers[k]);});
      S.draftDirty=S.dayDirty=S.foodDirty=S.setDirty=S.bodyDirtyForm=false;S.tplDirty={};
      chain.then(function(){return S.db.importAll(data);}).then(function(){
        S.ioMsg='Готово: данные загружены.';
        try{localStorage.setItem('journal.welcomeDone','1');}catch(e){}
        S.dayManual=false;loadAll();render(true);
      },function(e){S.ioMsg='Не получилось загрузить: '+((e&&e.message)||e);render(true);});
    });
  },function(){S.ioMsg='Не получилось прочитать файл.';render(true);});
}
function doExport(){
  function go(){
    var json=JSON.stringify(S.db.exportAll(),null,1),name='journal-backup-'+today+'.json',file=null;
    try{file=new File([json],name,{type:'application/json'});}catch(e){}
    function dl(){
      var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));a.download=name;
      document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1500);
      S.ioMsg='Файл '+name+' сохранён.';render(true);
    }
    if(file&&navigator.canShare&&navigator.canShare({files:[file]})){
      navigator.share({files:[file],title:'Журнал: резервная копия'}).then(function(){S.ioMsg='Копия сохранена: '+name;render(true);},function(e){if(e&&e.name==='AbortError')return;dl();});
    }else dl();
  }
  if(S.draftDirty||S.dayDirty||S.foodDirty||S.setDirty){persistAll();chain.then(go);}else go();
}
var wakeLock=null;
function wakeOn(){try{if(navigator.wakeLock&&!wakeLock&&document.visibilityState==='visible')navigator.wakeLock.request('screen').then(function(l){wakeLock=l;l.addEventListener('release',function(){wakeLock=null;});},function(){});}catch(e){}}
function wakeOff(){try{if(wakeLock)wakeLock.release();}catch(e){}wakeLock=null;}

/* ---------- data wiring ---------- */
function fromSnap(snap){var m={};snap.docs.forEach(function(d){if(d.exists)m[d.id]=d.data();});return m;}
function onErr(e){S.error='Не удалось прочитать данные'+(e&&e.code?' ('+e.code+')':'')+'. Перезапусти приложение.';render(true);}
function sub(col,key,apply){
  S.db.collection(col).onSnapshot(function(snap){
    apply(fromSnap(snap));S.ready[key]=1;
    if(allReady()&&!S.draft){loadAll();}
    render();
  },onErr);
}
async function init(){
  render(true);
  var db=null;
  try{db=await openStore();}catch(e){db=null;}
  if(!db){S.error='Не удалось открыть хранилище на телефоне. Проверь, что в Safari выключен «Частный доступ», и перезапусти приложение.';render(true);return;}
  S.db=db;
  /* предпросмотр внутри Claude: подставляем данные журнала при первом открытии */
  if(PREVIEW&&PREVIEW.data&&db.isEmpty()){try{await db.importAll(PREVIEW.data);}catch(e){}}
  try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist();}catch(e){}
  setupAI();
  sub('workouts','w',function(m){S.workouts=m;if(S.draft&&!pend.w&&!S.draftDirty)loadDraft();});
  sub('body','b',function(m){S.body=m;if(!S.bodyDirtyForm)loadBodyForm();});
  sub('templates','t',function(m){
    S.templates=m;
    ['A','B','C'].forEach(function(x){if(!S.tplDirty[x]){if(m[x])S.tplDraft[x]=clone(m[x]);else delete S.tplDraft[x];}});
    if(S.draft&&!S.draftDirty&&!S.workouts[S.date])S.draft=buildFromTemplate(S.day,S.date);
  });
  sub('days','d',function(m){S.days=m;if(S.dayDraft&&!pend.d&&!S.dayDirty)loadDay();});
  sub('food','f',function(m){S.food=m;if(S.foodDraft&&!pend.f&&!S.foodDirty)loadFood();});
  sub('foods','l',function(m){S.foods=m;if(S.sheet&&S.sheet.type==='add')paintSug();});
  sub('settings','s',function(m){
    S.settings=m;if(!S.setDirty&&!pend.s)loadSettings();
    var lg=(S.setDraft||S.settings.main||{}).lang;if(lg&&lg!==LANG)setLang(lg,false);
  });
  sub('i18n','i',function(m){var d=m.en||{};I18N.user=Object.assign({},d.m||{},I18N.user);if(LANG==='en')trNode(document.body);});
}
(function(){
  function mk(id,cap){
    var pin=document.createElement('input');pin.type='file';pin.id=id;pin.accept='image/*';pin.hidden=true;
    if(cap)pin.setAttribute('capture','environment');
    document.body.appendChild(pin);
    pin.addEventListener('change',function(){var f=pin.files&&pin.files[0];if(f)analyzePhoto(f);});
  }
  mk('photoCam',true);mk('photoGal',false);
})();
$app.addEventListener('click',onClick);
$tabs.addEventListener('click',onClick);
$app.addEventListener('input',onInput);
$app.addEventListener('change',onChange);
$app.addEventListener('focusout',onFocusOut);
window.addEventListener('pagehide',persistAll);
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden'){persistAll();return;}
  var t=ymd(new Date());
  if(t!==today){var old=today;today=t;if(S.histSel===old)S.histSel=t;if(S.bodyDate===old&&!S.bodyDirtyForm){S.bodyDate=t;S.bodyMonth=t.slice(0,7);loadBodyForm();}if(S.date===old&&allReady())setDate(t);else render(true);}
  if(S.rest&&S.rest.on)wakeOn();
});
if('serviceWorker' in navigator&&!window.JOURNAL_PREVIEW){
  navigator.serviceWorker.register('./sw.js').then(function(reg){
    function watch(w){w.addEventListener('statechange',function(){if(w.state==='installed'&&navigator.serviceWorker.controller){S.update=w;render();}});}
    if(reg.waiting&&navigator.serviceWorker.controller)S.update=reg.waiting;
    reg.addEventListener('updatefound',function(){if(reg.installing)watch(reg.installing);});
  }).catch(function(){});
  var swReload=false;
  navigator.serviceWorker.addEventListener('controllerchange',function(){if(swReload)return;swReload=true;persistAll();setTimeout(function(){location.reload();},200);});
}
init();
})();
