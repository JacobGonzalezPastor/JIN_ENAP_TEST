import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const DISCIPLINAS={"1":"Fútbol","2":"Baloncesto","3":"Voleibol","4":"Esgrima","5":"Taekwondo","6":"Tenis","7":"Tiro Deportivo","8":"Pentatlón","9":"Orientación Militar","10":"Atletismo","11":"Natación"};
const ESCUELAS={ENAP:{name:'ENAP',subtitle:'Armada Nacional'},EMAVI:{name:'EMAVI',subtitle:'Fuerza Aeroespacial Colombiana'},ESMIC:{name:'ESMIC',subtitle:'Ejército Nacional'},ECSAN:{name:'ECSAN',subtitle:'Policía Nacional'}};
const COLECTIVOS=new Set(['Fútbol','Baloncesto','Voleibol']);
// Regla de tabla provisional/configurable: no reemplaza el reglamento institucional.
// En colectivos, el perdedor nunca recibe puntos. Fútbol/Baloncesto admiten empate; Voleibol no.
const TABLA_COLECTIVOS={
  'Fútbol':{victoria:3,empate:1,derrota:0},
  'Baloncesto':{victoria:3,empate:1,derrota:0},
  'Voleibol':{victoria:3,empate:0,derrota:0}
};
let db,auth;
let resultsData=[];
let programacionData=[];
let programacionPage=1;
const PAGE_SIZE=6;
const $=id=>document.getElementById(id);
const text=v=>String(v??'');
const esc=v=>text(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const first=(o,keys)=>{for(const k of keys)if(o?.[k]!==undefined&&o[k]!==null&&o[k]!=='')return o[k];return ''};
const discipline=r=>r.disciplinaNombre||r.disciplina||DISCIPLINAS[text(r.disciplinaCodigo)]||'';
const category=r=>r.categoriaNombre||r.categoria||r.categoriaCodigo||'';
const dateOf=r=>r.fecha||r.date||r.registradoEn?.slice?.(0,10)||'';
const isCollective=r=>COLECTIVOS.has(discipline(r));

function localResults(){
  try {
    const raw=localStorage.getItem('enap_resultados_deportivos') || '[]';
    const data=JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch(error) {
    console.warn('No se pudieron leer los resultados locales:', error);
    return [];
  }
}
function allResults(){ return [...resultsData, ...localResults()]; }
function updateLocalResultsUI(){
  const count=localResults().length;
  const el=$('local-results-count');
  if(el) el.textContent=count ? `Pruebas locales: ${count}` : '';
  const btn=$('clear-local-results-btn');
  if(btn) btn.disabled=count===0;
  if(btn) btn.classList.toggle('opacity-40', count===0);
  if(btn) btn.classList.toggle('cursor-not-allowed', count===0);
}
function refreshAfterResultsChange({full=false}={}){
  updateLocalResultsUI();
  renderDashboard();
  if(full){
    refreshProgFilters();
    renderProgramacion();
    if(typeof renderExportCompetition==='function') renderExportCompetition();
  }
}
window.addEventListener('resultadoFirebaseGuardado',()=>refreshAfterResultsChange());
window.addEventListener('resultadosLocalesActualizados',()=>refreshAfterResultsChange({full:true}));

window.switchTab=function(tab){document.querySelectorAll('.tab-content').forEach(x=>x.classList.add('hidden'));document.querySelectorAll('.tab-btn').forEach(x=>{x.classList.remove('bg-blue-600','text-white','shadow-lg','shadow-blue-600/30');x.classList.add('bg-slate-700','text-slate-300')});$(`section-${tab}`)?.classList.remove('hidden');$(`tab-${tab}`)?.classList.remove('bg-slate-700','text-slate-300');$(`tab-${tab}`)?.classList.add('bg-blue-600','text-white','shadow-lg','shadow-blue-600/30');if(tab==='sportstable')renderSportTable();};
window.closeModal=function(id){$(id)?.classList.add('hidden')};
window.showAlert=function(title,msg,isError=false){const t=$('msg-title'),m=$('msg-text'),i=$('msg-icon');if(t)t.innerText=title;if(m)m.innerText=msg;if(i){i.className=isError?'w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-xl':'w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-xl';i.innerHTML=isError?'<i class="fa-solid fa-triangle-exclamation"></i>':'<i class="fa-solid fa-check"></i>'}$('msg-modal')?.classList.remove('hidden')};
window.openModal=function(id){if(id==='admin-modal'&&window.openDigitalResultForm)return window.openDigitalResultForm();$(id)?.classList.remove('hidden')};

// Puntuación JIE26 de trabajo. Los valores son configurables y deben sustituirse
// por la tabla oficial cuando sea confirmada. Los partidos colectivos usan la
// puntuación del resultado (victoria/empate/derrota); los individuales usan posición.
const PUNTOS_INDIVIDUALES={1:10,2:7,3:5};
const ESTADOS_NO_PUNTUABLES=new Set(['BORRADOR','CANCELADO','SUSPENDIDO','ANULADO']);
function resultadoFinalizado(r){
  if(ESTADOS_NO_PUNTUABLES.has(String(r?.estado||'REGISTRADO').toUpperCase())) return false;
  if(discipline(r)==='Esgrima') return fencingPodium(r).length>=3;
  return true;
}
function puntosDerivadosResultado(r){
  if(!resultadoFinalizado(r)) return [];
  const explicit=Array.isArray(r?.puntuacionJIE26)?r.puntuacionJIE26.filter(x=>x?.escuelaCodigo&&Number(x.puntos||0)!==0):[];
  if(explicit.length) return explicit.map(x=>({...x,puntos:Number(x.puntos||0)}));
  const d=discipline(r); const rd=r.resultadoDeportivo||{};
  if(COLECTIVOS.has(d)){
    const teams=schoolCodesFromMatch(r); if(teams.length<2) return [];
    const winner=matchWinner(r); const tabla=TABLA_COLECTIVOS[d]||{victoria:3,empate:0,derrota:0};
    if(winner===teams[0]) return [{escuelaCodigo:teams[0],puntos:tabla.victoria,concepto:'Victoria'},{escuelaCodigo:teams[1],puntos:tabla.derrota,concepto:'Derrota'}];
    if(winner===teams[1]) return [{escuelaCodigo:teams[0],puntos:tabla.derrota,concepto:'Derrota'},{escuelaCodigo:teams[1],puntos:tabla.victoria,concepto:'Victoria'}];
    return [{escuelaCodigo:teams[0],puntos:tabla.empate,concepto:'Empate'},{escuelaCodigo:teams[1],puntos:tabla.empate,concepto:'Empate'}];
  }
  const ranking=individualRanking(r);
  return ranking.filter(x=>PUNTOS_INDIVIDUALES[Number(x.posicion)]!==undefined).map(x=>({escuelaCodigo:x.escuelaCodigo,puntos:PUNTOS_INDIVIDUALES[Number(x.posicion)],posicion:Number(x.posicion),concepto:`${Number(x.posicion)}° lugar`}));
}
function pointsForSchool(item,school){return puntosDerivadosResultado(item).filter(x=>x.escuelaCodigo===school).reduce((s,x)=>s+Number(x.puntos||0),0)}
function medalsForSchool(item,school,type){return (item.medallas||[]).filter(x=>x.escuelaCodigo===school&&x.tipo===type).length}
const PUNTOS_GENERALES_MEDALLAS = { ORO: 10, PLATA: 7, BRONCE: 5 };
function puntosGeneralesMedallasResultado(item, school) {
  const saved = Array.isArray(item?.puntosGeneralesMedallas) ? item.puntosGeneralesMedallas : null;
  if (saved) return saved.filter(x => x.escuelaCodigo === school).reduce((sum,x) => sum + Number(x.puntos || 0), 0);
  return (item?.medallas || []).filter(m => m.escuelaCodigo === school)
    .reduce((sum,m) => sum + (PUNTOS_GENERALES_MEDALLAS[m.tipo] || 0), 0);
}
function resultPodium(item){const medals=item.medallas||[];return ['ORO','PLATA','BRONCE'].map(t=>medals.find(m=>m.tipo===t)||null)}

function schoolCodesFromMatch(r){
  const rd=r.resultadoDeportivo||{};
  const direct=(rd.equipos||[]).map(e=>e?.escuelaCodigo).filter(Boolean);
  if(direct.length>=2) return direct;
  const local=rd.equipoLocal?.escuelaCodigo||rd.local?.escuelaCodigo||rd.local?.escuelaCodigo;
  const visitante=rd.equipoVisitante?.escuelaCodigo||rd.visitante?.escuelaCodigo;
  return [local,visitante].filter(Boolean);
}
function parsePair(v){const m=String(v||'').match(/(-?\d+(?:\.\d+)?)\s*[-:]\s*(-?\d+(?:\.\d+)?)/);return m?[Number(m[1]),Number(m[2])]:[0,0]}
function teamScore(r,index){const rd=r.resultadoDeportivo||{};const d=discipline(r);
  if(d==='Fútbol'){
    const m=rd.marcador||{};
    return Number(m.primerTiempo?.[index?'visitante':'local']||0)+Number(m.segundoTiempo?.[index?'visitante':'local']||0)+Number(m.tiempoExtra?.[index?'visitante':'local']||0);
  }
  if(d==='Baloncesto'){const base=(rd.periodos||[]).reduce((s,p)=>s+Number(p[index?'visitante':'local']||0),0);const ot=parsePair(rd.tiempoExtra);return base+Number(ot[index?1:0]||0);}
  return null;
}
function matchWinner(r){const rd=r.resultadoDeportivo||{};const teams=schoolCodesFromMatch(r);if(!teams.length)return null;
  if(rd.ganador==='A'||rd.ganador==='LOCAL')return teams[0];
  if(rd.ganador==='B'||rd.ganador==='VISITANTE')return teams[1];
  if(rd.ganador===teams[0]||rd.ganador===teams[1])return rd.ganador;
  if(discipline(r)==='Fútbol'||discipline(r)==='Baloncesto'){
    const a=teamScore(r,0),b=teamScore(r,1); if(a>b)return teams[0]; if(b>a)return teams[1];
  }
  if(discipline(r)==='Voleibol'){
    const a=Number(rd.setsGanadosLocal||0),b=Number(rd.setsGanadosVisitante||0); if(a>b)return teams[0]; if(b>a)return teams[1];
  }
  return null;
}
function collectiveStats(results,sport,cat){
  const rows=Object.keys(ESCUELAS).map(code=>({escuelaCodigo:code,PJ:0,PG:0,PE:0,PP:0,GF:0,GC:0,DG:0,setsF:0,setsC:0,difSets:0,PF:0,PC:0,DP:0,Pts:0}));
  const map=Object.fromEntries(rows.map(x=>[x.escuelaCodigo,x]));
  const rs=results.filter(r=>discipline(r)===sport&&(!cat||category(r)===cat));
  for(const r of rs){
    const teams=schoolCodesFromMatch(r); if(teams.length<2)continue;
    const [a,b]=teams, A=map[a],B=map[b]; if(!A||!B)continue;
    A.PJ++;B.PJ++; const winner=matchWinner(r);
    if(sport==='Fútbol'){
      const ga=teamScore(r,0),gb=teamScore(r,1);A.GF+=ga;A.GC+=gb;B.GF+=gb;B.GC+=ga;
      if(winner===a){A.PG++;B.PP++;A.Pts+=TABLA_COLECTIVOS[sport].victoria;}
      else if(winner===b){B.PG++;A.PP++;B.Pts+=TABLA_COLECTIVOS[sport].victoria;}
      else {A.PE++;B.PE++;A.Pts+=TABLA_COLECTIVOS[sport].empate;B.Pts+=TABLA_COLECTIVOS[sport].empate;}
    } else if(sport==='Baloncesto'){
      const fa=teamScore(r,0),fb=teamScore(r,1);A.PF+=fa;A.PC+=fb;B.PF+=fb;B.PC+=fa;
      if(winner===a){A.PG++;B.PP++;A.Pts+=TABLA_COLECTIVOS[sport].victoria;}
      else if(winner===b){B.PG++;A.PP++;B.Pts+=TABLA_COLECTIVOS[sport].victoria;}
      else {A.PE++;B.PE++;A.Pts+=TABLA_COLECTIVOS[sport].empate;B.Pts+=TABLA_COLECTIVOS[sport].empate;}
    } else if(sport==='Voleibol'){
      const sa=Number(r.resultadoDeportivo?.setsGanadosLocal||0),sb=Number(r.resultadoDeportivo?.setsGanadosVisitante||0);A.setsF+=sa;A.setsC+=sb;B.setsF+=sb;B.setsC+=sa;
      if(winner===a){A.PG++;B.PP++;A.Pts+=TABLA_COLECTIVOS[sport].victoria;}
      else if(winner===b){B.PG++;A.PP++;B.Pts+=TABLA_COLECTIVOS[sport].victoria;}
    }
  }
  rows.forEach(x=>{x.DG=x.GF-x.GC;x.difSets=x.setsF-x.setsC;x.DP=x.PF-x.PC});
  rows.sort((a,b)=>b.Pts-a.Pts||b.PG-a.PG||b.DG-a.DG||b.difSets-a.difSets||b.DP-a.DP||b.GF-a.GF||b.PF-a.PF||a.escuelaCodigo.localeCompare(b.escuelaCodigo));
  rows.forEach((x,i)=>x.posicion=i+1);
  return rows;
}
function collectiveCategories(results,sport){return [...new Set(results.filter(r=>discipline(r)===sport).map(category).filter(Boolean))].sort()}
function collectiveTableHtml(sport,results,cat){const rows=collectiveStats(results,sport,cat);if(sport==='Voleibol')return `<div class="mt-3 overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400 border-b border-slate-700"><th class="p-2 text-left">Pos</th><th class="p-2 text-left">Escuela</th><th class="p-2">PJ</th><th class="p-2">PG</th><th class="p-2">PP</th><th class="p-2">Sets +</th><th class="p-2">Sets -</th><th class="p-2">Dif.</th><th class="p-2">Pts</th></tr></thead><tbody>${rows.map(x=>`<tr class="border-b border-slate-800"><td class="p-2 font-bold">${x.posicion}</td><td class="p-2 font-semibold">${esc(x.escuelaCodigo)}</td><td class="p-2 text-center">${x.PJ}</td><td class="p-2 text-center">${x.PG}</td><td class="p-2 text-center">${x.PP}</td><td class="p-2 text-center">${x.setsF}</td><td class="p-2 text-center">${x.setsC}</td><td class="p-2 text-center">${x.difSets}</td><td class="p-2 text-center font-bold text-blue-300">${x.Pts}</td></tr>`).join('')}</tbody></table></div>`;
 if(sport==='Baloncesto')return `<div class="mt-3 overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400 border-b border-slate-700"><th class="p-2 text-left">Pos</th><th class="p-2 text-left">Escuela</th><th class="p-2">PJ</th><th class="p-2">PG</th><th class="p-2">PP</th><th class="p-2">PF</th><th class="p-2">PC</th><th class="p-2">Dif.</th><th class="p-2">Pts</th></tr></thead><tbody>${rows.map(x=>`<tr class="border-b border-slate-800"><td class="p-2 font-bold">${x.posicion}</td><td class="p-2 font-semibold">${esc(x.escuelaCodigo)}</td><td class="p-2 text-center">${x.PJ}</td><td class="p-2 text-center">${x.PG}</td><td class="p-2 text-center">${x.PP}</td><td class="p-2 text-center">${x.PF}</td><td class="p-2 text-center">${x.PC}</td><td class="p-2 text-center">${x.DP}</td><td class="p-2 text-center font-bold text-blue-300">${x.Pts}</td></tr>`).join('')}</tbody></table></div>`;
 return `<div class="mt-3 overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-400 border-b border-slate-700"><th class="p-2 text-left">Pos</th><th class="p-2 text-left">Escuela</th><th class="p-2">PJ</th><th class="p-2">PG</th><th class="p-2">PE</th><th class="p-2">PP</th><th class="p-2">GF</th><th class="p-2">GC</th><th class="p-2">DG</th><th class="p-2">Pts</th></tr></thead><tbody>${rows.map(x=>`<tr class="border-b border-slate-800"><td class="p-2 font-bold">${x.posicion}</td><td class="p-2 font-semibold">${esc(x.escuelaCodigo)}</td><td class="p-2 text-center">${x.PJ}</td><td class="p-2 text-center">${x.PG}</td><td class="p-2 text-center">${x.PE}</td><td class="p-2 text-center">${x.PP}</td><td class="p-2 text-center">${x.GF}</td><td class="p-2 text-center">${x.GC}</td><td class="p-2 text-center">${x.DG}</td><td class="p-2 text-center font-bold text-blue-300">${x.Pts}</td></tr>`).join('')}</tbody></table></div>`;
}

function fencingPodium(r){
  const rd=r.resultadoDeportivo||{};
  const ps=Array.isArray(rd.participantes)?rd.participantes:[];
  const map=Object.fromEntries(ps.map(p=>[p.id,p]));
  const fin=rd.cuadro?.final||{}, third=rd.cuadro?.tercerPuesto||{};
  if(!fin.ganador||!fin.participanteA||!fin.participanteB||!third.ganador||!third.participanteA||!third.participanteB) return [];
  const silverId=fin.ganador===fin.participanteA?fin.participanteB:fin.participanteA;
  return [
    {posicion:1,...(map[fin.ganador]||{} )},
    {posicion:2,...(map[silverId]||{} )},
    {posicion:3,...(map[third.ganador]||{} )}
  ].filter(x=>x.escuelaCodigo);
}
function fencingBracketStatus(r){
  const rd=r.resultadoDeportivo||{}, q=rd.cuadro||{};
  const done=x=>Boolean(x?.ganador);
  const complete=done(q.final)&&done(q.tercerPuesto);
  return {sf1:done(q.semifinal1),sf2:done(q.semifinal2),final:done(q.final),third:done(q.tercerPuesto),complete};
}
function tennisGroupKey(r){
  const rd=r.resultadoDeportivo||{};
  return [category(r).toString().trim().toUpperCase(),String(rd.modalidad||r.modalidadCodigo||'Sencillos').trim().toUpperCase()].join('|');
}
function tennisGroupResults(r){
  return allResults().filter(x=>discipline(x)==='Tenis' && tennisGroupKey(x)===tennisGroupKey(r) && x.resultadoDeportivo?.tipo==='TENIS');
}
function tennisRanking(r){
  const matches=tennisGroupResults(r);
  if(!matches.some(x=>x.modalidadFinalizada===true || x.resultadoDeportivo?.modalidadFinalizada===true)) return [];
  const players=new Map();
  const ensure=(p)=>{if(!p?.escuelaCodigo||!p?.nombre)return null;const key=`${String(p.escuelaCodigo).toUpperCase()}|${String(p.nombre).trim().toUpperCase()}`;if(!players.has(key))players.set(key,{key,nombre:p.nombre,escuelaCodigo:p.escuelaCodigo,partidos:0,ganados:0,setsGanados:0,setsJugados:0,gamesGanados:0,gamesJugados:0});return players.get(key)};
  for(const m of matches){const rd=m.resultadoDeportivo||{},a=ensure(rd.jugadorA),b=ensure(rd.jugadorB);if(!a||!b||!['A','B'].includes(rd.ganador))continue;a.partidos++;b.partidos++;const winner=rd.ganador==='A'?a:b;winner.ganados++;for(const set of rd.sets||[]){const ga=Number(set.gamesA||0),gb=Number(set.gamesB||0);if(!(ga||gb))continue;a.setsJugados++;b.setsJugados++;a.gamesGanados+=ga;b.gamesGanados+=gb;a.gamesJugados+=ga+gb;b.gamesJugados+=ga+gb;if(ga>gb)a.setsGanados++;else if(gb>ga)b.setsGanados++;}}
  const list=[...players.values()];
  const pct=(n,d)=>d?n/d:0;
  list.sort((a,b)=>b.ganados-a.ganados||pct(b.setsGanados,b.setsJugados)-pct(a.setsGanados,a.setsJugados)||pct(b.gamesGanados,b.gamesJugados)-pct(a.gamesGanados,a.gamesJugados)||a.nombre.localeCompare(b.nombre));
  // Para empate exacto entre dos participantes, aplica enfrentamiento directo como primer desempate.
  for(let i=0;i<list.length-1;i++){
    const a=list[i],b=list[i+1];
    if(a.ganados===b.ganados && pct(a.setsGanados,a.setsJugados)===pct(b.setsGanados,b.setsJugados) && pct(a.gamesGanados,a.gamesJugados)===pct(b.gamesGanados,b.gamesJugados)){
      const h2h=matches.find(m=>{const rd=m.resultadoDeportivo||{};return [rd.jugadorA?.escuelaCodigo+'|'+rd.jugadorA?.nombre,rd.jugadorB?.escuelaCodigo+'|'+rd.jugadorB?.nombre].includes(a.escuelaCodigo+'|'+a.nombre)&&[rd.jugadorA?.escuelaCodigo+'|'+rd.jugadorA?.nombre,rd.jugadorB?.escuelaCodigo+'|'+rd.jugadorB?.nombre].includes(b.escuelaCodigo+'|'+b.nombre)});
      if(h2h){const rd=h2h.resultadoDeportivo||{};const win=rd.ganador==='A'?rd.jugadorA:rd.ganador==='B'?rd.jugadorB:null;if(win && win.escuelaCodigo===b.escuelaCodigo && win.nombre===b.nombre){list[i]=b;list[i+1]=a;}}
    }
  }
  return list.map((p,i)=>({...p,posicion:i+1}));
}
function individualRanking(r){
  const rd=r.resultadoDeportivo||{}; const d=discipline(r);
  if(d==='Tenis' && rd.tipo==='TENIS') return tennisRanking(r);
  if(Array.isArray(r.clasificacion)&&r.clasificacion.some(x=>Number(x.posicion)>0)) return [...r.clasificacion].filter(x=>Number(x.posicion)>0).sort((a,b)=>Number(a.posicion)-Number(b.posicion));
  if(d==='Esgrima') return fencingPodium(r);
  if(d==='Tiro Deportivo'&&Array.isArray(rd.participantes)) return [...rd.participantes].sort((a,b)=>Number(b.total||0)-Number(a.total||0)||Number(b.xCentros||0)-Number(a.xCentros||0)).map((p,i)=>({...p,posicion:i+1}));
  if(d==='Natación'&&Array.isArray(rd.participantes)) return [...rd.participantes].filter(p=>p.estado==='FINAL'&&p.tiempoFinal).sort((a,b)=>timeToMs(a.tiempoFinal)-timeToMs(b.tiempoFinal)).map((p,i)=>({...p,posicion:i+1}));
  if(d==='Orientación Militar'&&Array.isArray(rd.participantes)) return [...rd.participantes].filter(p=>p.estado==='FINAL'&&p.tiempoDefinitivo).sort((a,b)=>timeToMs(a.tiempoDefinitivo)-timeToMs(b.tiempoDefinitivo)).map((p,i)=>({...p,posicion:i+1}));
  if(d==='Atletismo'&&Array.isArray(rd.participantes)){
    const isField=String(rd.modalidad||'').toUpperCase()==='CAMPO';
    const valid=rd.participantes.filter(p=>!['DQ','DNF','DNS','NM'].includes(p.estado)&&p.marcaTiempo);
    return [...valid].sort((a,b)=>isField?compareMarksDesc(a.marcaTiempo,b.marcaTiempo):compareTimesAsc(a.marcaTiempo,b.marcaTiempo)).map((p,i)=>({...p,posicion:i+1}));
  }
  return [];
}
function timeToMs(v){const s=String(v||'').trim();const parts=s.split(':').map(Number);if(parts.some(Number.isNaN))return Number.POSITIVE_INFINITY;if(parts.length===3)return parts[0]*3600000+parts[1]*60000+parts[2]*1000;if(parts.length===2)return parts[0]*60000+parts[1]*1000;return Number(s)||Number.POSITIVE_INFINITY}
function compareTimesAsc(a,b){return timeToMs(a)-timeToMs(b)}
function compareMarksDesc(a,b){const na=Number(String(a).replace(',','.')),nb=Number(String(b).replace(',','.'));if(Number.isFinite(na)&&Number.isFinite(nb))return nb-na;return String(b).localeCompare(String(a))}
function individualPodiumHtml(r){
  const rank=individualRanking(r);
  if(rank.length) return rank.slice(0,3).map((x,i)=>`<div>${['🥇','🥈','🥉'][i]} <b>${esc(x.escuelaCodigo||'')}</b> ${esc(x.nombre||'')}</div>`).join('');
  const rd=r.resultadoDeportivo||{}; const d=discipline(r);
  if(d==='Esgrima' && rd.tipo==='ESGRIMA_ELIMINACION_DIRECTA'){
    const st=fencingBracketStatus(r);
    return `<div class="space-y-2"><div class="text-xs text-slate-300">⚔️ Eliminación directa · ${esc(rd.arma||'')}</div><div class="grid grid-cols-2 gap-2 text-xs"><div>Semifinal 1: ${st.sf1?'✅':'⏳'}</div><div>Semifinal 2: ${st.sf2?'✅':'⏳'}</div><div>Final: ${st.final?'✅':'⏳'}</div><div>Tercer puesto: ${st.third?'✅':'⏳'}</div></div><div class="text-amber-300">${st.complete?'Podio listo':'Podio pendiente de completar el cuadro'}</div></div>`;
  }
  return '<span class="text-slate-500">Clasificación pendiente de cuadro/resultado final</span>';
}

function renderDashboard(){
 const results=allResults();
 const countEl=$('results-count'); if(countEl) countEl.textContent=`${results.length} resultado${results.length===1?'':'s'} registrado${results.length===1?'':'s'}`;
 const standings=Object.fromEntries(Object.keys(ESCUELAS).map(k=>[k,{...ESCUELAS[k],gold:0,silver:0,bronze:0,points:0}]));
 const seenTennisGroups=new Set();
 results.forEach(r=>{Object.keys(standings).forEach(s=>{standings[s].gold+=medalsForSchool(r,s,'ORO');standings[s].silver+=medalsForSchool(r,s,'PLATA');standings[s].bronze+=medalsForSchool(r,s,'BRONCE');standings[s].points+=puntosGeneralesMedallasResultado(r,s)});
   if(discipline(r)==='Tenis' && r.resultadoDeportivo?.tipo==='TENIS'){
     const key=tennisGroupKey(r);if(seenTennisGroups.has(key))return;seenTennisGroups.add(key);
     const rank=tennisRanking(r);if(rank.length>=3){rank.slice(0,3).forEach((p,i)=>{const school=standings[p.escuelaCodigo];if(!school)return;const type=['ORO','PLATA','BRONCE'][i];school[['gold','silver','bronze'][i]]++;school.points+=({ORO:10,PLATA:7,BRONCE:5}[type]);});}
   }
 });
 const sorted=Object.entries(standings).map(([id,v])=>({id,...v})).sort((a,b)=>b.points-a.points||b.gold-a.gold||b.silver-a.silver||b.bronze-a.bronze||a.name.localeCompare(b.name));
 sorted.forEach(s=>{$(`card-${s.id.toLowerCase()}-medals`)?.replaceChildren(document.createTextNode(`🥇${s.gold} 🥈${s.silver} 🥉${s.bronze}`));$(`card-${s.id.toLowerCase()}-points`)?.replaceChildren(document.createTextNode(`${s.points} pts`))});
 const tbody=$('podium-table-body');if(tbody)tbody.innerHTML=sorted.map((s,i)=>`<tr class="hover:bg-slate-700/40"><td class="p-4 text-center font-bold">${i+1}°</td><td class="p-4"><b>${esc(s.name)}</b><div class="text-xs text-slate-400">${esc(s.subtitle)}</div></td><td class="p-4 text-center font-bold text-amber-400">${s.gold}</td><td class="p-4 text-center font-bold">${s.silver}</td><td class="p-4 text-center font-bold text-amber-600">${s.bronze}</td><td class="p-4 text-center font-extrabold text-blue-400">${s.points} pts</td></tr>`).join('');
 const grid=$('disciplines-grid');if(grid){grid.innerHTML=Object.values(DISCIPLINAS).map(d=>{const rs=results.filter(r=>discipline(r)===d);const cats=collectiveCategories(results,d);if(COLECTIVOS.has(d)){
   return `<div class="bg-slate-900/60 border border-slate-700/80 rounded-2xl p-4"><div class="flex justify-between border-b border-slate-800 pb-2"><b>${esc(d)}</b><span class="text-xs text-slate-400">${rs.length} resultado(s)</span></div>${cats.length?cats.map(cat=>`<div class="mt-3"><div class="text-xs text-blue-300 font-semibold mb-2">${esc(cat)}</div>${collectiveTableHtml(d,rs,cat)}</div>`).join(''):'<div class="py-6 text-center text-slate-500 italic text-xs">Sin partidos registrados</div>'}</div>`;
 }
 return `<div class="bg-slate-900/60 border border-slate-700/80 rounded-2xl p-4"><div class="flex justify-between border-b border-slate-800 pb-2"><b>${esc(d)}</b><span class="text-xs text-slate-400">${rs.length} resultado(s)</span></div>${rs.length?rs.map(r=>`<div class="mt-3 bg-slate-800/70 rounded-xl p-3 text-xs"><div class="font-semibold text-blue-300">${esc(category(r))}</div><div class="mt-2 space-y-1">${individualPodiumHtml(r)}</div></div>`).join(''):'<div class="py-6 text-center text-slate-500 italic text-xs">Sin resultados</div>'}</div>`;
 }).join('')}
 const filter=$('filter-sport');if(filter){const current=filter.value;filter.innerHTML='<option value="ALL">Todas las Disciplinas</option>'+Object.values(DISCIPLINAS).map(d=>`<option>${d}</option>`).join('');filter.value=Object.values(DISCIPLINAS).includes(current)?current:'ALL'}
 renderSportTable();renderHistory(results);
}
window.renderSportTable=function(){
 const tbody=$('sport-table-body');if(!tbody)return;const selected=$('filter-sport')?.value||'ALL';const rs=allResults().filter(r=>selected==='ALL'||discipline(r)===selected);
 if(!rs.length){tbody.innerHTML='<tr><td colspan="6" class="p-6 text-center text-slate-500">No hay resultados registrados.</td></tr>';return}
 if(selected!=='ALL'&&COLECTIVOS.has(selected)){
   const cats=collectiveCategories(rs,selected);tbody.innerHTML=cats.map(cat=>{const rows=collectiveStats(rs,selected,cat);return `<tr><td colspan="6" class="p-4"><div class="font-bold text-blue-300 mb-2">${esc(cat)}</div><div class="overflow-x-auto">${collectiveTableHtml(selected,rs,cat)}</div></td></tr>`}).join('');return;
 }
 tbody.innerHTML=rs.map(r=>{const p=individualRanking(r);return `<tr class="hover:bg-slate-700/40"><td class="p-4 text-xs text-slate-400">${esc(dateOf(r))}</td><td class="p-4 font-bold">${esc(discipline(r))}</td><td class="p-4 text-xs">${esc(category(r))}</td>${[0,1,2].map(i=>{const x=p[i];return `<td class="p-4 text-center">${x?`<div class="font-bold">${esc(x.escuelaCodigo||'')}</div><div class="text-xs text-slate-300">${esc(x.nombre||x.participanteId||'')}</div>`:'<span class="text-slate-600">—</span>'}</td>`}).join('')}</tr>`}).join('');
};
function renderHistory(results){const c=$('history-container');if(!c)return;if(!results.length){c.innerHTML='<div class="text-center py-8 text-slate-500">No hay registros históricos.</div>';return}c.innerHTML=results.slice().sort((a,b)=>dateOf(b).localeCompare(dateOf(a))).map(r=>{const collective=isCollective(r);let status;if(collective){status=matchWinner(r)?`Partido registrado · Ganador: ${esc(matchWinner(r))}`:'Partido registrado · Tabla acumulada en proceso'}else{const rank=individualRanking(r);if(rank.length){status=rank.slice(0,3).map((x,i)=>`${['🥇','🥈','🥉'][i]} ${esc(x.escuelaCodigo||'')}`).join(' · ')}else if(discipline(r)==='Esgrima'&&r.resultadoDeportivo?.tipo==='ESGRIMA_ELIMINACION_DIRECTA'){const st=fencingBracketStatus(r);status=st.complete?`🥇 ${esc(individualRanking(r)[0]?.escuelaCodigo||'')} · 🥈 ${esc(individualRanking(r)[1]?.escuelaCodigo||'')} · 🥉 ${esc(individualRanking(r)[2]?.escuelaCodigo||'')}`:`Eliminación directa · SF ${Number(st.sf1)+Number(st.sf2)}/2 · Final ${st.final?'completa':'pendiente'} · 3.º puesto ${st.third?'completo':'pendiente'}`}else status='Resultado registrado · Podio pendiente'}return `<div class="bg-slate-900/80 border border-slate-700 rounded-2xl p-4 flex flex-col md:flex-row justify-between gap-3"><div><span class="text-xs text-blue-400">${esc(dateOf(r))}</span><h4 class="font-bold">${esc(discipline(r))} <span class="text-xs text-slate-400">${esc(category(r))}</span></h4><div class="text-xs text-slate-500">${esc(r.competenciaCodigo||r.competenciaId||'')}</div></div><div class="text-xs">${status}</div></div>`}).join('')}

function progDisciplina(o){
  // Fuente principal: código numérico de disciplina corregido en Firestore.
  // Luego nombre canónico; la descripción solo se usa como respaldo si faltan ambos.
  const code=first(o,['disciplinaCodigo','DisciplinaCodigo']);
  const byCode=DISCIPLINAS[text(code)];
  if(byCode) return byCode;
  const raw=first(o,['disciplinaNombre','disciplina','Disciplina']);
  const normalized=String(raw||'').trim().toLocaleLowerCase('es');
  const byName=Object.values(DISCIPLINAS).find(n=>n.toLocaleLowerCase('es')===normalized);
  if(byName) return byName;
  const description=String(first(o,['descripcion','nombre','Nombre','competencia'])||'').trim();
  const m=description.match(/^(f[uú]tbol|baloncesto|vole[ií]bol)\b/i);
  if(m){
    const n=m[1].toLocaleLowerCase('es');
    if(n.startsWith('f')) return 'Fútbol';
    if(n.startsWith('bal')) return 'Baloncesto';
    return 'Voleibol';
  }
  return raw||'Sin disciplina';
}
function progFecha(o){return first(o,['fecha','Fecha','date'])}
function progHora(o){return first(o,['hora','Hora','time'])}
function progJornada(o){return first(o,['jornadaCodigo','jornada','Jornada'])}
function progEscenario(o){return first(o,['escenarioNombre','escenarioCodigo','escenario','Escenario'])}
function progDescripcion(o){return first(o,['descripcion','nombre','Nombre','competencia'])||'Competencia'}
function resultadoDeProgramacion(o){const id=String(o.id||o.competenciaId||o.idSugerido||'');const code=String(o.codigo||o.competenciaCodigo||'');return allResults().find(r=>(String(r.competenciaId||'')===id||String(r.competenciaCodigo||'')===code)&&resultadoFinalizado(r))||null}
function competenciaTieneResultado(o){return Boolean(resultadoDeProgramacion(o))}
function estadoProgramacion(o){const result=resultadoDeProgramacion(o);if(result){if(isCollective(result)){const phase=String(result.faseCompetencia||result.resultadoDeportivo?.faseCompetencia||'CLASIFICACION').toUpperCase();if(phase!=='FINAL')return ['Competencia en definición','bg-amber-500/20 text-amber-200 border border-amber-400/30'];}return ['Finalizada','bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'];}const manual=first(o,['estado','Estado']);if(['Suspendida','Cancelada','Aplazada'].includes(manual))return [manual,'bg-rose-500/20 text-rose-300 border border-rose-400/30'];const dt=new Date(`${progFecha(o)}T${progHora(o)||'00:00'}:00`);if(!Number.isNaN(dt.getTime())){const diff=(Date.now()-dt.getTime())/60000;if(diff>=0&&diff<120)return ['En curso','bg-blue-500/20 text-blue-300 border border-blue-400/30'];if(diff>=120)return ['Resultados pendientes','bg-amber-500/20 text-amber-300 border border-amber-400/30']}return [manual||'Programada','bg-slate-800 text-slate-300 border border-slate-700']}
function refreshProgFilters(){for(const [id,vals,label] of [['prog-jornada',[...new Set(programacionData.map(progJornada).filter(Boolean))].sort(),'Todas las jornadas'],['prog-disciplina',[...new Set(programacionData.map(progDisciplina).filter(Boolean))].sort(),'Todas las disciplinas'],['prog-escenario',[...new Set(programacionData.map(progEscenario).filter(Boolean))].sort(),'Todos los escenarios'],['prog-estado',[...new Set(programacionData.map(o=>estadoProgramacion(o)[0]).filter(Boolean))].sort(),'Todos los estados']]){const el=$(id);if(!el)continue;const old=el.value;el.innerHTML=`<option value="ALL">${label}</option>`+vals.map(v=>`<option>${esc(v)}</option>`).join('');if(vals.includes(old))el.value=old}}
window.getFilteredProgramacion=()=>{const j=$('prog-jornada')?.value||'ALL',d=$('prog-disciplina')?.value||'ALL',e=$('prog-escenario')?.value||'ALL',s=$('prog-estado')?.value||'ALL';return programacionData.filter(o=>(j==='ALL'||progJornada(o)===j)&&(d==='ALL'||progDisciplina(o)===d)&&(e==='ALL'||progEscenario(o)===e)&&(s==='ALL'||estadoProgramacion(o)[0]===s)).sort((a,b)=>(progFecha(a)+' '+progHora(a)).localeCompare(progFecha(b)+' '+progHora(b)))};
window.changeProgramacionPage=delta=>{const pages=Math.max(1,Math.ceil(window.getFilteredProgramacion().length/PAGE_SIZE));programacionPage=Math.min(pages,Math.max(1,programacionPage+delta));renderProgramacion()};
window.renderProgramacion=function(){const list=window.getFilteredProgramacion(),pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));programacionPage=Math.min(programacionPage,pages);const page=list.slice((programacionPage-1)*PAGE_SIZE,programacionPage*PAGE_SIZE);$('programacion-count').textContent=`${list.length} competencias`;$('prog-page-info').textContent=`Página ${programacionPage} de ${pages}`;$('programacion-grid').innerHTML=page.length?page.map(o=>{const st=estadoProgramacion(o),result=resultadoDeProgramacion(o),collective=Boolean(result&&isCollective(result)),phase=String(result?.faseCompetencia||'CLASIFICACION').toUpperCase();const note=collective&&phase!=='FINAL'?'<p class="text-xs text-amber-200 border border-amber-400/20 bg-amber-500/10 rounded-lg p-2">Partido finalizado. La competencia sigue en definición y la medallería está pendiente de la final.</p>':collective&&phase==='FINAL'?'<p class="text-xs text-emerald-200 border border-emerald-400/20 bg-emerald-500/10 rounded-lg p-2">Final registrada como fase definitoria de la medallería.</p>':'';return `<article class="bg-slate-900 border border-slate-700 rounded-2xl p-4 space-y-3"><div class="flex justify-between gap-2"><span class="text-xs text-blue-300">${esc(progJornada(o))}</span><span class="text-xs rounded-full px-2 py-1 ${st[1]}">${st[0]}</span></div><h3 class="font-bold">${esc(progDescripcion(o))}</h3><div class="text-sm text-slate-300 space-y-1"><p>📅 ${esc(progFecha(o))} · ${esc(progHora(o))}</p><p>🏅 ${esc(progDisciplina(o))}</p><p>📍 ${esc(progEscenario(o))}</p></div>${note}</article>`}).join(''):'<div class="col-span-full text-center text-slate-400 py-10">No hay competencias para los filtros seleccionados.</div>'};

async function initFirebase(){
  try{
    const app=initializeApp(firebaseConfig);
    db=getFirestore(app);
    auth=getAuth(app);
    onSnapshot(collection(db,'Resultados'),snap=>{
      resultsData=snap.docs.map(d=>({id:d.id,...d.data()}));
      renderDashboard();refreshProgFilters();renderProgramacion();
    },err=>{
      console.error('Error leyendo Resultados:',err);
      renderDashboard();
    });
    onSnapshot(collection(db,'Competencias'),snap=>{
      programacionData=snap.docs.map(d=>({id:d.id,...d.data()}));
      refreshProgFilters();renderProgramacion();
    },err=>console.warn('Competencias:',err));
    // La lectura pública no depende de autenticación anónima. Si está habilitada,
    // se conserva la sesión inicial; si no lo está, el dashboard continúa funcionando.
    try{
      if(!auth.currentUser){
        if(typeof __initial_auth_token!=='undefined'&&__initial_auth_token) await signInWithCustomToken(auth,__initial_auth_token);
        else await signInAnonymously(auth);
      }
    }catch(authError){
      console.warn('Autenticación inicial no disponible; se mantiene lectura pública de Firestore:',authError);
    }
  }catch(e){
    console.error(e);
    renderDashboard();renderProgramacion();
  }
}
window.onload=()=>{
  updateLocalResultsUI();
  renderDashboard();
  initFirebase();
  const clearBtn=$('clear-local-results-btn');
  if(clearBtn && !clearBtn.dataset.bound){
    clearBtn.dataset.bound='1';
    clearBtn.addEventListener('click',()=>{
      const count=localResults().length;
      if(!count){ return; }
      if(!confirm(`¿Desea borrar ${count} resultado(s) de prueba guardados en este navegador? Esta acción no borra resultados de Firebase.`)) return;
      localStorage.removeItem('enap_resultados_deportivos');
      window.dispatchEvent(new CustomEvent('resultadosLocalesActualizados'));
    });
  }
};


function resultCompetitionKey(r){return String(r.competenciaCodigo||r.competenciaId||r.id||'');}
function resultCompetitionLabel(r){
  const code=r.competenciaCodigo||r.competenciaId||'';
  const desc=r.competenciaDescripcion||r.descripcionCompetencia||'';
  return `${code}${desc?` · ${desc}`:''}`.trim();
}
function flattenValue(v){
  if(v===null||v===undefined) return '';
  if(typeof v==='string'||typeof v==='number'||typeof v==='boolean') return String(v);
  if(Array.isArray(v)) return v.map(flattenValue).join(' | ');
  if(typeof v==='object') return Object.entries(v).map(([k,val])=>`${k}: ${flattenValue(val)}`).join(' ; ');
  return String(v);
}
function exportRowsForCompetition(r){
  const base={
    competencia:r.competenciaCodigo||r.competenciaId||'',
    competenciaId:r.competenciaId||'',
    disciplina:discipline(r),
    categoria:category(r),
    modalidad:r.modalidadCodigo||'',
    fecha:r.fecha||'',
    hora:r.hora||'',
    jornada:r.jornadaCodigo||'',
    escenario:r.escenarioCodigo||'',
    estado:r.estado||'',
    responsable:r.registradoPorNombre||'Administrador no identificado',
    registradoEn:r.registradoEn||r.creadoEn||'',
    actualizadoEn:r.actualizadoEn||'',
    observaciones:r.observaciones||''
  };
  const rows=[];
  const rd=r.resultadoDeportivo||{};
  const teams=schoolCodesFromMatch(r);
  if(isCollective(r)){
    const scoreA=teamScore(r,0),scoreB=teamScore(r,1);
    rows.push({...base,detalle:'Partido',escuela:teams[0]||'',escuelaContraria:teams[1]||'',participante:'',resultado:scoreA!==null&&scoreB!==null?`${scoreA} - ${scoreB}`:'',posicion:'',puntos:(puntosDerivadosResultado(r).find(x=>x.escuelaCodigo===teams[0])?.puntos??''),ganador:matchWinner(r)||'',datosAdicionales:flattenValue(rd)});
    return rows;
  }
  // Tenis: el PDF debe mostrar el partido registrado aunque el cuadro/modalidad
  // todavía no esté marcado como finalizado. El ranking de tenis solo aparece
  // cuando se cierra la modalidad, pero cada partido ya tiene marcador propio.
  if(discipline(r)==='Tenis' && rd.tipo==='TENIS'){
    const a=rd.jugadorA||{}, b=rd.jugadorB||{};
    const sets=Array.isArray(rd.sets)?rd.sets:[];
    const score=sets
      .filter(s=>s && (s.gamesA!==undefined && s.gamesA!==null && s.gamesB!==undefined && s.gamesB!==null) && (String(s.gamesA)!=='' || String(s.gamesB)!==''))
      .map(s=>`${Number(s.gamesA||0)}-${Number(s.gamesB||0)}`)
      .join(', ');
    const winnerSide=String(rd.ganador||'').toUpperCase();
    const winner=winnerSide==='A' ? `${a.escuelaCodigo||''}${a.nombre?` · ${a.nombre}`:''}`
      : winnerSide==='B' ? `${b.escuelaCodigo||''}${b.nombre?` · ${b.nombre}`:''}`
      : (rd.ganador||'Pendiente');
    rows.push({...base,detalle:'Partido de tenis',escuela:a.escuelaCodigo||'',escuelaContraria:b.escuelaCodigo||'',participante:`${a.nombre||'Jugador A'} vs ${b.nombre||'Jugador B'}`,resultado:score||flattenValue(rd.marcador||rd.resultado||''),posicion:'',puntos:'',ganador:winner,datosAdicionales:flattenValue({modalidad:rd.modalidad||r.modalidadCodigo||'',sets,estadisticas:rd.estadisticas||{}})});
    return rows;
  }
  const ranking=individualRanking(r);
  if(ranking.length){
    ranking.forEach(p=>{
      const pts=puntosDerivadosResultado(r).find(x=>x.escuelaCodigo===p.escuelaCodigo && Number(x.posicion||0)===Number(p.posicion||0));
      rows.push({...base,detalle:'Clasificación',escuela:p.escuelaCodigo||'',escuelaContraria:'',participante:p.nombre||p.participanteId||'',resultado:p.resultado??p.total??'',posicion:p.posicion??'',puntos:pts?.puntos??'',ganador:Number(p.posicion)===1?'Sí':'',datosAdicionales:flattenValue(p)});
    });
  }
  if(!rows.length){
    rows.push({...base,detalle:'Resultado registrado',escuela:'',escuelaContraria:'',participante:'',resultado:'',posicion:'',puntos:'',ganador:'',datosAdicionales:flattenValue(rd)});
  }
  return rows;
}
const EXPORT_HEADERS=[
  ['competencia','Competencia'],['competenciaId','ID competencia'],['disciplina','Disciplina'],['categoria','Categoría'],['modalidad','Modalidad'],['fecha','Fecha'],['hora','Hora'],['jornada','Jornada'],['escenario','Escenario'],['estado','Estado'],['detalle','Detalle'],['escuela','Escuela'],['escuelaContraria','Escuela contraria'],['participante','Participante / equipo'],['resultado','Resultado'],['posicion','Posición'],['puntos','Puntos'],['ganador','Ganador'],['responsable','Resultados cargados por'],['registradoEn','Registrado en'],['actualizadoEn','Actualizado en'],['observaciones','Observaciones'],['datosAdicionales','Datos deportivos']
];
function csvEscape(v){return `"${String(v??'').replace(/"/g,'""')}"`;}
function rowsToCsv(rows){return '\ufeff'+EXPORT_HEADERS.map(([,label])=>csvEscape(label)).join(',')+'\n'+rows.map(row=>EXPORT_HEADERS.map(([key])=>csvEscape(row[key])).join(',')).join('\n');}
function downloadTextFile(filename,text,mime='text/csv;charset=utf-8;'){
  const blob=new Blob([text],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function resultsWithCompetitions(){
  const map=new Map();
  allResults().forEach(r=>{const key=resultCompetitionKey(r);if(key)map.set(key,r);});
  return [...map.values()].sort((a,b)=>`${dateOf(b)} ${resultCompetitionKey(b)}`.localeCompare(`${dateOf(a)} ${resultCompetitionKey(a)}`));
}
async function getAdminDisplayName(r){
  const saved=first(r,['registradoPorNombre']);
  return saved ? String(saved) : 'Administrador no identificado';
}
async function resolveRowsUploader(rows,r){
  const name=await getAdminDisplayName(r);
  return rows.map(x=>({...x,responsable:name}));
}
async function renderExportCompetition(){
  const select=$('export-competition'); const summary=$('export-competition-summary'); const preview=$('export-results-preview');
  if(!select||!summary||!preview)return;
  const rs=resultsWithCompetitions();
  if(!rs.length){select.innerHTML='<option value="">No hay resultados registrados</option>';summary.textContent='Aún no existen resultados registrados para descargar.';preview.innerHTML='<div class="p-8 text-center text-slate-500">Sin resultados.</div>';return;}
  const current=select.value;
  select.innerHTML='<option value="">Seleccione una competencia</option>'+rs.map(r=>`<option value="${esc(resultCompetitionKey(r))}">${esc(resultCompetitionLabel(r))}</option>`).join('');
  if(rs.some(r=>resultCompetitionKey(r)===current))select.value=current;else select.value=resultCompetitionKey(rs[0]);
  const r=rs.find(x=>resultCompetitionKey(x)===select.value)||rs[0];
  const rows=await resolveRowsUploader(exportRowsForCompetition(r),r);
  const uploaderName=await getAdminDisplayName(r);
  summary.innerHTML=`<strong>${esc(resultCompetitionLabel(r))}</strong><div class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-sm"><div><span class="text-slate-400">Disciplina:</span> ${esc(discipline(r))}</div><div><span class="text-slate-400">Fecha:</span> ${esc(r.fecha||dateOf(r))}</div><div><span class="text-slate-400">Resultados cargados por:</span> ${esc(uploaderName)}</div><div><span class="text-slate-400">Filas:</span> ${rows.length}</div></div>`;
  preview.innerHTML=`<table class="w-full text-xs"><thead><tr class="bg-slate-900/80 text-slate-400">${['Escuela','Escuela contraria','Participante / equipo','Resultado','Posición','Puntos','Ganador','Resultados cargados por'].map(h=>`<th class="p-3 text-left whitespace-nowrap">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(x=>`<tr class="border-t border-slate-700"><td class="p-3">${esc(x.escuela)}</td><td class="p-3">${esc(x.escuelaContraria)}</td><td class="p-3">${esc(x.participante)}</td><td class="p-3">${esc(x.resultado)}</td><td class="p-3">${esc(x.posicion)}</td><td class="p-3">${esc(x.puntos)}</td><td class="p-3">${esc(x.ganador)}</td><td class="p-3">${esc(x.responsable)}</td></tr>`).join('')}</tbody></table>`;
}
function pdfSafe(v){return String(v??'').replace(/\s+/g,' ').trim();}
const PDF_ASSETS={
  juegos:'assets/logo-juegos-interescuelas.png',
  enap:'assets/logo-enap.png',
  marca:'assets/escudos/marca-agua-enap.png'
};
const pdfImageCache={};
function loadPdfImage(src){
  if(pdfImageCache[src]) return Promise.resolve(pdfImageCache[src]);
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      try{
        const canvas=document.createElement('canvas');
        canvas.width=img.naturalWidth||img.width;
        canvas.height=img.naturalHeight||img.height;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0);
        const data=canvas.toDataURL('image/png');
        pdfImageCache[src]=data;
        resolve(data);
      }catch(error){reject(error);}
    };
    img.onerror=()=>reject(new Error(`No se pudo cargar la imagen ${src}`));
    img.src=src;
  });
}
async function loadPdfBrandAssets(){
  const entries=await Promise.all(Object.entries(PDF_ASSETS).map(async([key,src])=>[key,await loadPdfImage(src)]));
  return Object.fromEntries(entries);
}
function drawPdfBranding(doc,images,title,subtitle){
  const pageW=doc.internal.pageSize.getWidth();
  const pageH=doc.internal.pageSize.getHeight();
  doc.setFillColor(255,255,255);doc.rect(0,0,pageW,pageH,'F');
  // Marca de agua institucional al fondo, con opacidad muy baja.
  if(images?.marca){
    try{
      doc.saveGraphicsState();
      if(doc.GState&&doc.setGState) doc.setGState(new doc.GState({opacity:0.055}));
      const wmW=Math.min(122,pageW*0.42),wmH=wmW*(1357/1100);
      doc.addImage(images.marca,'PNG',(pageW-wmW)/2,42,wmW,wmH,'WATERMARK','FAST');
      doc.restoreGraphicsState();
    }catch(error){console.warn('No se pudo dibujar la marca de agua:',error);}
  }
  // Logotipo de Juegos Interescuelas: esquina superior izquierda.
  if(images?.juegos) doc.addImage(images.juegos,'PNG',10,4,22,32,'JIE26','FAST');
  // Logotipo ENAP: esquina superior derecha.
  if(images?.enap) doc.addImage(images.enap,'PNG',265,4,22,32,'ENAP','FAST');
  doc.setDrawColor(30,64,175);doc.setLineWidth(0.7);doc.line(12,36,pageW-12,36);
  doc.setTextColor(15,23,42);doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text(pdfSafe(title),pageW/2,13,{align:'center'});
  doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(71,85,105);doc.text(pdfSafe(subtitle),pageW/2,20,{align:'center'});
  doc.setFontSize(7.5);doc.setTextColor(100,116,139);doc.text(`Generado: ${new Date().toLocaleString('es-CO')}`,pageW/2,26,{align:'center'});
}
function pdfFooter(doc,data){
  const pageW=doc.internal.pageSize.getWidth(),pageH=doc.internal.pageSize.getHeight();
  doc.setDrawColor(203,213,225);doc.setLineWidth(0.25);doc.line(12,pageH-12,pageW-12,pageH-12);
  doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(100,116,139);
  doc.text(`JIE26 · ${data||'Resultados'} · Página ${doc.internal.getNumberOfPages()}`,14,pageH-7);
}
function drawPdfTable(doc,head,body,startY,options={}){
  const pageW=doc.internal.pageSize.getWidth();
  const title=options.title||'JUEGOS INTERESCUELAS ENAP 2026';
  const subtitle=options.subtitle||'REPORTE OFICIAL DE RESULTADOS';
  const images=options.images;
  const tableOptions={
    head,body,startY,margin:{left:12,right:12,top:40,bottom:16},
    theme:'grid',
    styles:{font:'helvetica',fontSize:7.2,cellPadding:2.1,textColor:[30,41,59],overflow:'linebreak'},
    headStyles:{fillColor:[30,64,175],textColor:[255,255,255],fontStyle:'bold',halign:'center'},
    alternateRowStyles:{fillColor:[248,250,252]},
    willDrawPage:()=>drawPdfBranding(doc,images,title,subtitle),
    didDrawPage:()=>pdfFooter(doc,options.footer||'Resultados')
  };
  if(options.columnStyles) tableOptions.columnStyles=options.columnStyles;
  if(typeof doc.autoTable==='function'){
    doc.autoTable(tableOptions);
  }else if(typeof window.jspdfAutoTable==='function'){
    window.jspdfAutoTable(doc,tableOptions);
  }else{
    let y=startY;doc.setFontSize(8);body.forEach(row=>{doc.text(row.map(pdfSafe).join(' | '),12,y,{maxWidth:pageW-24});y+=5;if(y>doc.internal.pageSize.getHeight()-18){doc.addPage();drawPdfBranding(doc,images,title,subtitle);y=44;}});pdfFooter(doc,options.footer||'Resultados');
  }
}
async function downloadCompetitionPdf(r,rows){
  rows=await resolveRowsUploader(rows,r);
  const jsPDFCtor=window.jspdf?.jsPDF;
  if(!jsPDFCtor){window.showAlert?.('PDF no disponible','No se pudo cargar el generador de PDF. Verifique la conexión a Internet y vuelva a intentarlo.',true);return;}
  let images;try{images=await loadPdfBrandAssets();}catch(error){console.error(error);window.showAlert?.('Recursos del PDF no disponibles','No se pudieron cargar los logotipos para el PDF. Verifique que la carpeta assets esté completa.',true);return;}
  const doc=new jsPDFCtor({orientation:'landscape',unit:'mm',format:'a4'});
  drawPdfBranding(doc,images,'JUEGOS INTERESCUELAS ENAP 2026','REPORTE OFICIAL DE RESULTADOS POR COMPETENCIA');
  doc.setTextColor(15,23,42);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(pdfSafe(resultCompetitionLabel(r)),12,44);
  doc.setFont('helvetica','normal');doc.setFontSize(8.5);
  const meta=[
    `Disciplina: ${pdfSafe(discipline(r))}`,`Categoría: ${pdfSafe(category(r))}`,`Modalidad: ${pdfSafe(r.modalidadCodigo||'')}`,`Fecha: ${pdfSafe(r.fecha||dateOf(r))}`,
    `Hora: ${pdfSafe(r.hora||'')}`,`Jornada: ${pdfSafe(r.jornadaCodigo||'')}`,`Escenario: ${pdfSafe(r.escenarioCodigo||'')}`,`Estado: ${pdfSafe(r.estado||'')}`
  ];
  meta.forEach((m,i)=>doc.text(m,12+(i%4)*70,51+Math.floor(i/4)*6));
  const uploaderName=pdfSafe(r.registradoPorNombre||'Administrador no identificado');
  doc.setFillColor(241,245,249);doc.roundedRect(12,64,273,12,2,2,'F');
  doc.setFont('helvetica','bold');doc.text('Resultados cargados por:',16,71);doc.setFont('helvetica','normal');doc.text(uploaderName,64,71);
  const head=[['Escuela','Escuela contraria','Participante / equipo','Resultado','Posición','Puntos','Ganador','Resultados cargados por']];
  const body=rows.map(x=>[pdfSafe(x.escuela),pdfSafe(x.escuelaContraria),pdfSafe(x.participante),pdfSafe(x.resultado),pdfSafe(x.posicion),pdfSafe(x.puntos),pdfSafe(x.ganador),pdfSafe(x.responsable)]);
  drawPdfTable(doc,head,body,82,{images,title:'JUEGOS INTERESCUELAS ENAP 2026',subtitle:'REPORTE OFICIAL DE RESULTADOS POR COMPETENCIA',footer:'Resultados por competencia',columnStyles:{0:{cellWidth:24},1:{cellWidth:26},2:{cellWidth:40},3:{cellWidth:28},4:{cellWidth:16,halign:'center'},5:{cellWidth:16,halign:'center'},6:{cellWidth:22},7:{cellWidth:55}}});
  const notes=pdfSafe(r.observaciones||'');
  if(notes){let y=(doc.lastAutoTable?.finalY||100)+9;if(y>doc.internal.pageSize.getHeight()-25){doc.addPage();drawPdfBranding(doc,images,'JUEGOS INTERESCUELAS ENAP 2026','REPORTE OFICIAL DE RESULTADOS POR COMPETENCIA');y=45;}doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(15,23,42);doc.text('Observaciones',12,y);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(notes,12,y+5,{maxWidth:273});pdfFooter(doc,'Resultados por competencia');}
  const code=String(r.competenciaCodigo||r.competenciaId||'competencia').replace(/[^a-zA-Z0-9_-]+/g,'_');
  doc.save(`JIE26_${code}_resultados.pdf`);
}
function resultsWithJornadas(){
  const map=new Map();
  resultsWithCompetitions().forEach(r=>{
    const jornada=String(r.jornadaCodigo||r.jornada||'').trim();
    if(!jornada)return;
    if(!map.has(jornada))map.set(jornada,{key:jornada,label:jornada,results:[]});
    map.get(jornada).results.push(r);
  });
  return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true,sensitivity:'base'}));
}
async function renderExportJornada(){
  const select=$('export-jornada'),summary=$('export-jornada-summary'),preview=$('export-jornada-preview');
  if(!select||!summary||!preview)return;
  const js=resultsWithJornadas();
  if(!js.length){select.innerHTML='<option value="">No hay jornadas con resultados</option>';summary.textContent='Aún no existen resultados registrados para descargar por jornada.';preview.innerHTML='<div class="p-8 text-center text-slate-500">Sin resultados por jornada.</div>';return;}
  const current=select.value;
  select.innerHTML='<option value="">Seleccione una jornada</option>'+js.map(j=>`<option value="${esc(j.key)}">${esc(j.label)} · ${j.results.length} competencia(s)</option>`).join('');
  if(js.some(j=>j.key===current))select.value=current;else select.value=js[0].key;
  const j=js.find(x=>x.key===select.value)||js[0];
  const rows=[];
  for(const r of j.results){const rr=await resolveRowsUploader(exportRowsForCompetition(r),r);rr.forEach(x=>rows.push({...x,competenciaLabel:resultCompetitionLabel(r)}));}
  summary.innerHTML=`<strong>${esc(j.label)}</strong><div class="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-sm"><div><span class="text-slate-400">Competencias con resultados:</span> ${j.results.length}</div><div><span class="text-slate-400">Filas de resultados:</span> ${rows.length}</div><div><span class="text-slate-400">Jornada:</span> ${esc(j.label)}</div></div>`;
  preview.innerHTML=`<table class="w-full text-xs"><thead><tr class="bg-slate-900/80 text-slate-400">${['Competencia','Disciplina','Escuela','Participante / equipo','Resultado','Posición','Puntos','Ganador','Resultados cargados por'].map(h=>`<th class="p-3 text-left whitespace-nowrap">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(x=>`<tr class="border-t border-slate-700"><td class="p-3">${esc(x.competenciaLabel)}</td><td class="p-3">${esc(x.disciplina)}</td><td class="p-3">${esc(x.escuela)}</td><td class="p-3">${esc(x.participante)}</td><td class="p-3">${esc(x.resultado)}</td><td class="p-3">${esc(x.posicion)}</td><td class="p-3">${esc(x.puntos)}</td><td class="p-3">${esc(x.ganador)}</td><td class="p-3">${esc(x.responsable)}</td></tr>`).join('')}</tbody></table>`;
}
async function downloadJornadaPdf(j){
  const jsPDFCtor=window.jspdf?.jsPDF;
  if(!jsPDFCtor){window.showAlert?.('PDF no disponible','No se pudo cargar el generador de PDF.',true);return;}
  let images;try{images=await loadPdfBrandAssets();}catch(error){console.error(error);window.showAlert?.('Recursos del PDF no disponibles','No se pudieron cargar los logotipos para el PDF.',true);return;}
  const doc=new jsPDFCtor({orientation:'landscape',unit:'mm',format:'a4'});
  const rows=[];
  for(const r of j.results){const rr=await resolveRowsUploader(exportRowsForCompetition(r),r);rr.forEach(x=>rows.push({...x,competenciaLabel:resultCompetitionLabel(r)}));}
  drawPdfBranding(doc,images,'JUEGOS INTERESCUELAS ENAP 2026','REPORTE OFICIAL DE RESULTADOS POR JORNADA');
  doc.setTextColor(15,23,42);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text(`Jornada: ${pdfSafe(j.label)}`,12,44);
  doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.text(`Competencias con resultados: ${j.results.length} · Filas de resultados: ${rows.length}`,12,51);
  const head=[['Competencia','Disciplina','Escuela','Participante / equipo','Resultado','Posición','Puntos','Ganador','Resultados cargados por']];
  const body=rows.map(x=>[pdfSafe(x.competenciaLabel),pdfSafe(x.disciplina),pdfSafe(x.escuela),pdfSafe(x.participante),pdfSafe(x.resultado),pdfSafe(x.posicion),pdfSafe(x.puntos),pdfSafe(x.ganador),pdfSafe(x.responsable)]);
  drawPdfTable(doc,head,body,58,{images,title:'JUEGOS INTERESCUELAS ENAP 2026',subtitle:'REPORTE OFICIAL DE RESULTADOS POR JORNADA',footer:`Resultados de ${j.label}`,columnStyles:{0:{cellWidth:55},1:{cellWidth:25},2:{cellWidth:22},3:{cellWidth:38},4:{cellWidth:25},5:{cellWidth:16,halign:'center'},6:{cellWidth:15,halign:'center'},7:{cellWidth:20},8:{cellWidth:51}}});
  doc.save(`JIE26_${String(j.key).replace(/[^a-zA-Z0-9_-]+/g,'_')}_resultados.pdf`);
}
window.openResultsExportModal=function(){
  $('results-export-modal')?.classList.remove('hidden');
  renderExportCompetition();renderExportJornada();
  const select=$('export-competition');
  if(select&&!select.dataset.bound){select.addEventListener('change',renderExportCompetition);select.dataset.bound='1';}
  const jornada=$('export-jornada');
  if(jornada&&!jornada.dataset.bound){jornada.addEventListener('change',renderExportJornada);jornada.dataset.bound='1';}
  const btn=$('download-competition-results-btn');
  if(btn&&!btn.dataset.bound){btn.addEventListener('click',async()=>{const r=resultsWithCompetitions().find(x=>resultCompetitionKey(x)===$('export-competition')?.value);if(!r){window.showAlert?.('Seleccione una competencia','Debe seleccionar una competencia con resultados para descargar.',true);return;}await downloadCompetitionPdf(r,exportRowsForCompetition(r));});btn.dataset.bound='1';}
  const jbtn=$('download-jornada-results-btn');
  if(jbtn&&!jbtn.dataset.bound){jbtn.addEventListener('click',async()=>{const j=resultsWithJornadas().find(x=>x.key===$('export-jornada')?.value);if(!j){window.showAlert?.('Seleccione una jornada','Debe seleccionar una jornada con resultados para descargar.',true);return;}await downloadJornadaPdf(j);});jbtn.dataset.bound='1';}
};
window.addEventListener('resultadoFirebaseGuardado',()=>{renderExportCompetition();renderExportJornada();});
