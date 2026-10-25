import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, serverTimestamp, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { competenciasFallback } from "./competencias-fallback.js";

const DISCIPLINAS = {
  "1":"Fútbol", "2":"Baloncesto", "3":"Voleibol", "4":"Esgrima", "5":"Taekwondo", "6":"Tenis",
  "7":"Tiro Deportivo", "8":"Pentatlón", "9":"Orientación Militar", "10":"Atletismo", "11":"Natación"
};
const COLECTIVOS = new Set(["Fútbol", "Baloncesto", "Voleibol"]);
const ESCUELAS = ["ENAP", "EMAVI", "ESMIC", "ECSAN"];
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const $ = id => document.getElementById(id);
const first = (o, keys) => { for (const k of keys) if (o?.[k] !== undefined && o?.[k] !== null && o[k] !== '') return o[k]; return ''; };
// La descripción de la competencia sirve como fuente de respaldo cuando el código/nombre
// de disciplina en Firestore está desfasado. Evita filtros cruzados entre Fútbol,
// Baloncesto y Voleibol si sus metadatos quedaron intercambiados.
const disciplineName = c => {
  // Prioriza el código numérico corregido; evita deducir la disciplina desde el texto
  // de la descripción cuando los datos maestros ya están corregidos.
  const code = first(c,['disciplinaCodigo','DisciplinaCodigo']);
  const byCode = DISCIPLINAS[String(code)];
  if (byCode) return byCode;
  const raw = first(c,['disciplinaNombre','disciplina','Disciplina']);
  const normalizedRaw = String(raw || '').trim().toLocaleLowerCase('es');
  const byName = Object.values(DISCIPLINAS).find(n => n.toLocaleLowerCase('es') === normalizedRaw);
  if (byName) return byName;
  const description = String(first(c,['descripcion','nombre','Nombre','competencia']) || '').trim();
  const collectiveMatch = description.match(/^(f[uú]tbol|baloncesto|vole[ií]bol)\b/i);
  if (collectiveMatch) {
    const label = collectiveMatch[1].toLocaleLowerCase('es');
    if (label.startsWith('f')) return 'Fútbol';
    if (label.startsWith('bal')) return 'Baloncesto';
    return 'Voleibol';
  }
  return raw || '';
};;
const disciplineCode = name => Object.entries(DISCIPLINAS).find(([,v]) => v === name)?.[0] || '';
const optionSchools = `<option value="">Seleccione</option>${ESCUELAS.map(s=>`<option value="${s}">${s}</option>`).join('')}`;

let db = null;
let auth = null;
let competencias = [];
let selectedCompetition = null;
let currentAdminProfile = { nombre: "", uid: "" };
let editingResultId = null;
let editingResultSource = null;
let editingResultData = null;
let firebaseResultsCache = [];
let resultCacheLoaded = false;

function input(id, placeholder='', type='text', required=false, extra='') {
  return `<input id="${id}" type="${type}" placeholder="${placeholder}" ${required?'required':''} class="form-control" ${extra}>`;
}
function select(id, options, required=false, extra='') {
  return `<select id="${id}" ${required?'required':''} class="form-control" ${extra}>${options}</select>`;
}
function field(label, html, cls='') { return `<label class="form-field ${cls}"><span>${label}</span>${html}</label>`; }
function shell(content) {
  const modal = $('admin-modal');
  if (!modal) {
    console.error('No se encontró el contenedor #admin-modal.');
    return;
  }
  // El modal de producción/pruebas se deja vacío en el HTML para evitar
  // que aparezca el formulario antiguo. Crear aquí el panel dinámico.
  let box = modal.querySelector('.bg-slate-800');
  if (!box) {
    box = document.createElement('div');
    modal.appendChild(box);
  }
  box.className = 'bg-slate-800 border border-slate-700 rounded-3xl max-w-7xl w-full p-6 shadow-2xl space-y-5 relative max-h-[94vh] overflow-y-auto';
  box.innerHTML = content;
  modal.setAttribute('aria-hidden', 'false');
}

function renderAdminLogin(errorMessage='') {
  shell(`
    <div class="flex items-center justify-between border-b border-slate-700 pb-4">
      <div><h3 class="text-xl font-bold text-white"><i class="fa-solid fa-shield-halved text-blue-400 mr-2"></i>Acceso de administrador</h3>
      <p class="text-sm text-slate-400 mt-1">Para registrar resultados debes autenticarte con un usuario administrador autorizado.</p></div>
      <button type="button" id="close-admin-login" class="text-slate-400 hover:text-white text-2xl">&times;</button>
    </div>
    <form id="admin-login-form" class="space-y-5">
      <div class="form-summary">
        <div class="font-semibold text-white">Seguridad de Resultados</div>
        <div class="text-sm text-slate-400 mt-1">Firebase Authentication valida el correo y contraseña y luego se verifica que exista <b>Administradores/{uid}</b> con <b>activo = true</b>.</div>
      </div>
      <div class="space-y-4">
        ${field('Correo del administrador',input('admin-email','administrador@ejemplo.com','email',true))}
        ${field('Contraseña',input('admin-password','Contraseña','password',true))}
      </div>
      <div id="admin-login-status" class="text-sm ${errorMessage?'text-rose-400':'text-slate-400'}">${esc(errorMessage || 'Ingrese sus credenciales para continuar.')}</div>
      <div class="flex justify-end gap-3 border-t border-slate-700 pt-4">
        <button type="button" id="cancel-admin-login" class="form-btn secondary">Cancelar</button>
        <button type="submit" class="form-btn primary"><i class="fa-solid fa-right-to-bracket mr-2"></i>Ingresar</button>
      </div>
    </form>`);
  $('close-admin-login').onclick = () => window.closeModal('admin-modal');
  $('cancel-admin-login').onclick = () => window.closeModal('admin-modal');
  $('admin-login-form').addEventListener('submit', loginAdmin);
  setTimeout(() => $('admin-email')?.focus(), 50);
}

async function loginAdmin(event) {
  event.preventDefault();
  const status = $('admin-login-status');
  const email = $('admin-email')?.value.trim();
  const password = $('admin-password')?.value || '';
  if (!email || !password) { status.className='text-sm text-rose-400'; status.textContent='Ingrese correo y contraseña.'; return; }
  status.className='text-sm text-slate-300';
  status.textContent='Validando credenciales...';
  try {
    if (!auth || !db) await initFormFirebase();
    if (auth.currentUser) await signOut(auth);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const adminRef = doc(db, 'Administradores', credential.user.uid);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists() || adminSnap.data()?.activo !== true) {
      await signOut(auth);
      throw new Error('El usuario existe en Firebase Authentication, pero no está autorizado como administrador activo en la colección Administradores.');
    }
    const adminData = adminSnap.data() || {};
    currentAdminProfile = {
      uid: credential.user.uid,
      nombre: first(adminData, ['nombre','nombreCompleto','nombres','displayName']) || credential.user.displayName || 'Administrador'
    };
    renderBaseForm();
    const badge = $('admin-session-badge');
    if (badge) badge.textContent = `Administrador: ${currentAdminProfile.nombre}`;
    await loadCompetenciasIfNeeded();
  } catch (error) {
    console.error(error);
    status.className='text-sm text-rose-400';
    const code = error?.code || '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') status.textContent='Credenciales no válidas.';
    else if (code === 'auth/too-many-requests') status.textContent='Demasiados intentos. Espere un momento y vuelva a intentarlo.';
    else if (code === 'auth/operation-not-allowed') status.textContent='El acceso por correo/contraseña no está habilitado en Firebase Authentication.';
    else status.textContent=error?.message || 'No fue posible iniciar sesión.';
  }
}

async function loadCompetenciasIfNeeded() {
  if (competencias.length) return;
  try {
    const snap = await getDocs(collection(db,'Competencias'));
    competencias = snap.docs.map(doc=>({id:doc.id,...doc.data()}));
  } catch(e) {
    console.warn('No se pudo leer Competencias; se usa catálogo local.',e);
    competencias = competenciasFallback;
  }
  if(!competencias.length) competencias=competenciasFallback;
}

function renderBaseForm() {
  shell(`
    <div class="flex items-center justify-between border-b border-slate-700 pb-4">
      <div><h3 class="text-xl font-bold text-white"><i class="fa-solid fa-clipboard-list text-blue-400 mr-2"></i>Registrar resultado JIE26</h3>
      <p class="text-sm text-slate-400 mt-1">Seleccione una competencia ya programada. La Dashboard carga automáticamente su disciplina, categoría, jornada, fecha y escenario.</p>
      <div id="admin-session-badge" class="text-xs text-emerald-300 mt-2"></div></div>
      <div class="flex items-center gap-2"><button type="button" id="manage-saved-results" class="text-xs text-blue-200 hover:text-white border border-blue-700 rounded-lg px-3 py-2">Editar registrados</button><button type="button" id="logout-admin" class="text-xs text-slate-300 hover:text-white border border-slate-600 rounded-lg px-3 py-2">Cerrar sesión</button><button type="button" id="close-digital-form" class="text-slate-400 hover:text-white text-2xl">&times;</button></div>
    </div>

    <form id="digital-result-form" class="space-y-5">
      <section class="form-section">
        <div class="flex flex-wrap items-center justify-between gap-3"><h4>1. Competencia</h4>
          <label class="flex items-center gap-2 text-sm text-amber-200"><input id="local-test-mode" type="checkbox" checked> Modo prueba local</label>
        </div>
        <p class="text-xs text-slate-400 mb-3">En modo prueba el documento usa exactamente el mismo modelo de <b>Resultados</b>, pero se guarda en este navegador. Desmarque la opción para escribir en Firebase.</p>
        <div class="form-grid two">
          ${field('Disciplina', select('digital-discipline','<option value="">Seleccione una disciplina</option>'+Object.values(DISCIPLINAS).map(d=>`<option>${d}</option>`).join(''),true))}
          ${field('Jornada',select('digital-jornada-select','<option value="">Seleccione primero una disciplina</option>',true))}
          ${field('Competencia',select('digital-competition','<option value="">Seleccione una competencia</option>',true),'wide')}
          ${field('Código',input('digital-code','','text',false,'readonly'))}
          ${field('Fecha',input('digital-date','','date',true,'readonly'))}
          ${field('Hora',input('digital-time','','text',false,'readonly'))}
          ${field('Jornada asociada',input('digital-jornada','','text',false,'readonly'))}
          ${field('Escenario',input('digital-scenario','','text',false,'readonly'))}
          ${field('Categoría',input('digital-category','','text',false,'readonly'))}
          ${field('Modalidad',input('digital-modality','','text',false,'readonly'))}
          ${field('Tipo',input('digital-type','','text',false,'readonly'))}
          <div id="collective-phase-wrap" class="hidden wide">${field('Fase de la competencia',select('collective-phase','<option value="CLASIFICACION">Clasificación / fase preliminar</option><option value="SEMIFINAL">Semifinal</option><option value="TERCER_PUESTO">Tercer puesto</option><option value="FINAL">Final que define medallería</option>',true),'wide')}<p class="text-xs text-amber-200 mt-1">La final asigna oro y plata; el partido por tercer puesto asigna bronce al ganador. La clasificación y semifinales no asignan medallas.</p></div>
        </div>
        <div id="competition-summary" class="form-summary mt-3">Seleccione una competencia.</div>
      </section>

      <section class="form-section"><div class="flex items-center justify-between gap-3"><h4>2. Planilla digital</h4><span id="form-discipline-badge" class="text-xs text-blue-300"></span></div><div id="discipline-fields"></div></section>

      <section class="form-section"><h4>3. Cierre y auditoría</h4>
        <div class="form-grid two">
          ${field('Responsable',input('digital-responsible','Nombre del juez / responsable','text',true))}
          ${field('Estado',select('digital-status','<option value="REGISTRADO">Registrado</option><option value="BORRADOR">Borrador</option>',true))}
          ${field('Observaciones',`<textarea id="digital-observations" class="form-control" rows="3" placeholder="Incidencias, descalificaciones, aclaraciones..."></textarea>`,'wide')}
        </div>
      </section>

      <div id="digital-form-status" class="text-sm text-slate-300"></div>
      <div class="flex justify-end gap-3 border-t border-slate-700 pt-4"><button type="button" id="cancel-digital-form" class="form-btn secondary">Cancelar</button><button type="submit" class="form-btn primary"><i class="fa-solid fa-cloud-arrow-up mr-2"></i>Guardar en Resultados</button></div>
    </form>`);

  $('close-digital-form').onclick = () => window.closeModal('admin-modal');
  $('manage-saved-results').onclick = renderSavedResultsManager;
  $('local-test-mode').addEventListener('change', async () => { await loadExistingResults(); refreshCompetitionOptionsByJornada(); });
  $('cancel-digital-form').onclick = () => { editingResultId=null; editingResultSource=null; editingResultData=null; window.closeModal('admin-modal'); };
  $('logout-admin').onclick = async () => { try { if(auth) await signOut(auth); } finally { renderAdminLogin(); } };
  $('digital-discipline').addEventListener('change', refreshCompetitions);
  $('digital-jornada-select').addEventListener('change', refreshCompetitionOptionsByJornada);
  $('digital-competition').addEventListener('change', loadCompetitionDetails);
  $('collective-phase')?.addEventListener('change', updateCollectivePhaseNotice);
  $('digital-result-form').addEventListener('submit', saveResult);
  $('digital-result-form').querySelector('button[type=submit]').innerHTML = editingResultId ? '<i class="fa-solid fa-floppy-disk mr-2"></i>Guardar corrección' : '<i class="fa-solid fa-cloud-arrow-up mr-2"></i>Guardar en Resultados';
}

function updateCollectivePhaseVisibility(discipline) {
  const wrap = $('collective-phase-wrap');
  if (!wrap) return;
  const collective = ['Fútbol','Baloncesto','Voleibol'].includes(discipline || $('digital-discipline')?.value);
  wrap.classList.toggle('hidden', !collective);
  if (collective && $('collective-phase') && !$('collective-phase').value) $('collective-phase').value = 'CLASIFICACION';
  updateCollectivePhaseNotice();
}
function updateCollectivePhaseNotice() {
  const summary = $('competition-summary');
  if (!summary || !selectedCompetition || !['Fútbol','Baloncesto','Voleibol'].includes(disciplineName(selectedCompetition))) return;
  const phase = $('collective-phase')?.value || 'CLASIFICACION';
  const message = phase === 'FINAL'
    ? 'Esta fase se marcará como final y podrá cerrar la definición de medallería.'
    : 'Partido finalizado no significa competencia finalizada. La medallería seguirá pendiente hasta registrar la final.';
  const existing = summary.querySelector('[data-phase-notice]');
  if (existing) existing.remove();
  const note = document.createElement('p');
  note.dataset.phaseNotice = 'true';
  note.className = phase === 'FINAL' ? 'text-xs text-emerald-300 mt-2' : 'text-xs text-amber-200 mt-2';
  note.textContent = message;
  summary.appendChild(note);
}

function jornadaValue(c) {
  return String(first(c,['jornadaCodigo','JornadaCodigo','jornada','Jornada']) || '').trim();
}

function refreshCompetitions() {
  const discipline = $('digital-discipline').value;
  const saved = getCurrentResults();
  const list = competencias.filter(c => disciplineName(c) === discipline && (!isCompetitionSaved(c, saved) || (editingResultData && sameCompetition(c, editingResultData))));
  const jornadas = [...new Set(list.map(jornadaValue).filter(Boolean))]
    .sort((a,b) => a.localeCompare(b,'es',{numeric:true,sensitivity:'base'}));
  const jornadaSelect = $('digital-jornada-select');
  jornadaSelect.innerHTML = '<option value="">Seleccione una jornada</option>' +
    jornadas.map(j=>`<option value="${esc(j)}">${esc(j)}</option>`).join('') +
    (list.some(c=>!jornadaValue(c)) ? '<option value="__SIN_JORNADA__">Sin jornada asignada</option>' : '');
  jornadaSelect.disabled = !discipline || jornadas.length === 0 && !list.some(c=>!jornadaValue(c));
  $('digital-competition').innerHTML = '<option value="">Seleccione primero la jornada</option>';
  selectedCompetition = null;
  $('digital-code').value = '';
  $('digital-date').value = '';
  $('digital-time').value = '';
  $('digital-jornada').value = '';
  $('digital-scenario').value = '';
  $('digital-category').value = '';
  $('digital-modality').value = '';
  $('digital-type').value = '';
  $('discipline-fields').innerHTML = '';
  $('competition-summary').textContent = list.length ? 'Seleccione la jornada y después la competencia.' : 'No hay competencias para esta disciplina.';
  updateCollectivePhaseVisibility(discipline);
}

function refreshCompetitionOptionsByJornada() {
  const discipline = $('digital-discipline').value;
  const selectedJornada = $('digital-jornada-select').value;
  const saved = getCurrentResults();
  const list = competencias.filter(c => disciplineName(c) === discipline && (!isCompetitionSaved(c, saved) || (editingResultData && sameCompetition(c, editingResultData))) && (
    selectedJornada === '__SIN_JORNADA__' ? !jornadaValue(c) : selectedJornada && jornadaValue(c) === selectedJornada
  ));
  $('digital-competition').innerHTML = '<option value="">Seleccione una competencia</option>' +
    list.map(c=>`<option value="${esc(c.id)}">${esc(first(c,['codigo','idSugerido','id']))} · ${esc(first(c,['descripcion','nombre','Nombre'])||'Competencia')}</option>`).join('');
  selectedCompetition = null;
  $('digital-code').value = '';
  $('digital-date').value = '';
  $('digital-time').value = '';
  $('digital-jornada').value = selectedJornada === '__SIN_JORNADA__' ? 'Sin jornada asignada' : selectedJornada;
  $('digital-scenario').value = '';
  $('digital-category').value = '';
  $('digital-modality').value = '';
  $('digital-type').value = '';
  $('discipline-fields').innerHTML = '';
  $('competition-summary').textContent = selectedJornada ? (list.length ? 'Seleccione una competencia de la jornada elegida.' : 'No hay competencias en esta jornada.') : 'Seleccione una jornada.';
}

function loadCompetitionDetails() {
  const id = $('digital-competition').value;
  selectedCompetition = competencias.find(c => c.id === id);
  if (!selectedCompetition) return;
  const c = selectedCompetition;
  $('digital-code').value = first(c,['codigo','idSugerido','id']);
  $('digital-date').value = first(c,['fecha','Fecha','date']);
  $('digital-time').value = first(c,['hora','Hora','time']);
  $('digital-jornada').value = jornadaValue(c) || 'Sin jornada asignada';
  $('digital-jornada-select').value = jornadaValue(c) || '__SIN_JORNADA__';
  $('digital-scenario').value = first(c,['escenarioNombre','escenario','Escenario','escenarioCodigo']);
  $('digital-category').value = first(c,['categoriaNombre','categoriaCodigo','categoria']);
  $('digital-modality').value = first(c,['modalidadCodigo','modalidad','Modalidad']);
  $('digital-type').value = first(c,['tipoCompetencia','TipoCompetencia','tipo','Tipo']);
  $('competition-summary').innerHTML = `<strong>Competencia seleccionada</strong><div class="grid grid-cols-1 md:grid-cols-2 gap-1 mt-2 text-sm">${[
    ['Código',first(c,['codigo','idSugerido','id'])],['Descripción',first(c,['descripcion','nombre','Nombre'])],['Disciplina',disciplineName(c)],['Categoría',first(c,['categoriaNombre','categoriaCodigo','categoria'])],['Modalidad',first(c,['modalidadCodigo','modalidad','Modalidad'])],['Jornada',first(c,['jornadaCodigo','jornada'])],['Escenario',first(c,['escenarioNombre','escenario','escenarioCodigo'])]
  ].filter(([,v])=>v!=='').map(([k,v])=>`<div><span class="text-slate-400">${esc(k)}:</span> ${esc(v)}</div>`).join('')}</div>`;
  $('form-discipline-badge').textContent = disciplineName(c);
  updateCollectivePhaseVisibility(disciplineName(c));
  if (['Fútbol','Baloncesto','Voleibol'].includes(disciplineName(c))) {
    const suggested = String(first(c,['faseCompetencia','fase','etapa']) || '').toUpperCase();
    if (['CLASIFICACION','SEMIFINAL','TERCER_PUESTO','FINAL'].includes(suggested)) $('collective-phase').value = suggested;
  }
  renderDisciplineForm(disciplineName(c));
  const fieldsRoot=$('discipline-fields');
  if(fieldsRoot && !fieldsRoot.dataset.pentathlonTimeRankBound){
    const refreshTimeRanks=(event)=>{
      if(event.target?.id && /^p-\d+-(result|sex|school|name|team)$/.test(event.target.id)) updatePentathlonAutomaticPositions();
    };
    fieldsRoot.addEventListener('input',refreshTimeRanks);
    fieldsRoot.addEventListener('change',refreshTimeRanks);
    fieldsRoot.dataset.pentathlonTimeRankBound='1';
  }
  updatePentathlonAutomaticPositions();
  updateCollectivePhaseNotice();
}

function participantRow(i, extraCols='') {
  return `<tr>
    <td>${i}</td>
    <td><input id="p-${i}-dorsal" class="form-control" placeholder="Dorsal"></td>
    <td><input id="p-${i}-name" class="form-control" placeholder="Nombre"></td>
    <td><select id="p-${i}-school" class="form-control">${optionSchools}</select></td>
    <td><select id="p-${i}-sex" class="form-control"><option value="">—</option><option>Masculino</option><option>Femenino</option><option>Mixto</option></select></td>
    ${extraCols}
  </tr>`;
}
function tableWrap(headers, rows) { return `<div class="result-table-wrap overflow-x-auto"><table class="result-entry-table min-w-full"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`; }

function fencingModeFromCompetition(c=selectedCompetition) {
  const cat = String(first(c,['categoriaCodigo','CategoriaCodigo','categoria','Categoria']) || '').trim().toUpperCase();
  if (cat === 'ESG_EQUIPOS' || cat.includes('EQUIPOS')) return 'EQUIPOS';
  return 'ELIMINACION_DIRECTA';
}
function renderDisciplineForm(d) {
  const container = $('discipline-fields');
  // Use the competition category as the source of truth; preserve manual mode only for non-team categories.
  const categoryMode = d === 'Esgrima' ? fencingModeFromCompetition() : null;
  const priorFencingMode = d === 'Esgrima' ? (categoryMode === 'EQUIPOS' ? 'EQUIPOS' : (val('e-modality') || categoryMode)) : null;
  let html = '';
  if (d === 'Fútbol') html = renderFootball();
  else if (d === 'Baloncesto') html = renderBasketball();
  else if (d === 'Voleibol') html = renderVolleyball();
  else if (d === 'Esgrima') html = renderFencing();
  else if (d === 'Taekwondo') html = renderTaekwondo();
  else if (d === 'Tenis') html = renderTennis();
  else if (d === 'Tiro Deportivo') html = renderShooting();
  else if (d === 'Pentatlón') html = renderPentathlon();
  else if (d === 'Orientación Militar') html = renderOrienteering();
  else if (d === 'Atletismo') html = renderAthletics();
  else if (d === 'Natación') html = renderSwimming();
  const isCollective = COLECTIVOS.has(d);
  const statusOptions = isCollective
    ? '<option value="PARTIDO_FINALIZADO">Partido finalizado</option><option value="COMPETENCIA_FINALIZADA">Competencia finalizada</option><option value="DQ_LOCAL">Descalificación del equipo local</option><option value="DQ_VISITANTE">Descalificación del equipo visitante</option><option value="SUSPENDIDO">Competencia suspendida</option>'
    : '<option value="COMPETENCIA_FINALIZADA">Competencia finalizada</option><option value="DQ_PARTICIPANTE">Descalificación del participante</option><option value="SUSPENDIDO">Competencia suspendida</option>';
  const statusControl = `<div class="form-grid one mb-3" id="shared-competition-status">${field(isCollective ? 'Estado del encuentro / competencia' : 'Estado de la competencia',select('competition-status',statusOptions,true),'wide')}<div id="dq-participant-fields" class="form-grid two wide hidden">${field('Nombre completo del participante descalificado',input('dq-participant-name','Nombres y apellidos','text',true))}${field('Escuela del participante descalificado',select('dq-participant-school','<option value="">Seleccione escuela</option>'+optionSchools,true))}<p class="text-xs text-amber-200 mt-1 wide">Diligencie estos datos cuando el estado sea “Descalificación del participante”.</p></div><p class="text-xs text-slate-400 mt-1">${isCollective ? 'El estado del encuentro no implica que la medallería esté definida. La fase seleccionada determina cuándo corresponde premiar.' : 'La competencia individual solo debe finalizarse cuando el resultado oficial esté confirmado.'}</p></div>`;
  container.innerHTML = statusControl + html;
  if (d === 'Tenis') {
    const mode=$('ten-mode');
    const syncTennisMode=()=>{
      const doubles=['Dobles','Dobles mixtos'].includes(mode?.value);
      ['ten-doubles-a-wrap','ten-doubles-b-wrap'].forEach(id=>{const el=$(id);if(el)el.classList.toggle('hidden',!doubles);});
      ['ten-a2','ten-b2'].forEach(id=>{const el=$(id);if(el){el.required=doubles; if(!doubles)el.value='';}});
      const sideA=doubles?'Pareja A':'Jugador A', sideB=doubles?'Pareja B':'Jugador B';
      const headingA=document.querySelector('.tennis-pair-a .tennis-pair-heading h5'), headingB=document.querySelector('.tennis-pair-b .tennis-pair-heading h5');
      const descA=document.querySelector('.tennis-pair-a .tennis-pair-heading p'), descB=document.querySelector('.tennis-pair-b .tennis-pair-heading p');
      if(headingA)headingA.textContent=sideA;if(headingB)headingB.textContent=sideB;
      if(descA)descA.textContent=doubles?'Escuela y dos jugadores':'Escuela y jugador';if(descB)descB.textContent=doubles?'Escuela y dos jugadores':'Escuela y jugador';
      const setLabels=document.querySelectorAll('.tennis-set-row .form-field > span');
      setLabels.forEach((label,index)=>{label.textContent=(index%2===0)?sideA:sideB;});
      const statLabels=document.querySelectorAll('.tennis-stats-grid .tennis-stat-label');
      statLabels.forEach(label=>{
        const id=label.getAttribute('for')||'';
        if(id==='ten-aces-a')label.textContent=`Aces ${doubles?'pareja':'jugador'} A`;
        else if(id==='ten-aces-b')label.textContent=`Aces ${doubles?'pareja':'jugador'} B`;
        else if(id==='ten-df-a')label.textContent=`Dobles faltas ${doubles?'pareja':'jugador'} A`;
        else if(id==='ten-df-b')label.textContent=`Dobles faltas ${doubles?'pareja':'jugador'} B`;
      });
      const scoreHint=document.querySelector('.tennis-section-heading p');
      if(scoreHint) scoreHint.textContent=`Ingrese los games obtenidos por cada ${doubles?'pareja':'jugador'}.`;
      const summary=document.querySelector('.tennis-summary');
      if(summary)summary.textContent=doubles?'Registre los jugadores por lado. En dobles y dobles mixtos se requieren dos jugadores por pareja; cada pareja representa una sola escuela.':'Registre un jugador por escuela y el marcador del encuentro individual.';
      const labelA=document.querySelector('.tennis-pair-a .form-field > span');
      const labelB=document.querySelector('.tennis-pair-b .form-field > span');
      if(labelA)labelA.textContent=doubles?'Escuela pareja A':'Escuela jugador A';
      if(labelB)labelB.textContent=doubles?'Escuela pareja B':'Escuela jugador B';
      const playerA=document.querySelector('#ten-a')?.closest('.form-field')?.querySelector('span');
      const playerB=document.querySelector('#ten-b')?.closest('.form-field')?.querySelector('span');
      if(playerA)playerA.textContent=doubles?'Jugador A1':'Jugador A';
      if(playerB)playerB.textContent=doubles?'Jugador B1':'Jugador B';
    };
    mode?.addEventListener('change',syncTennisMode);
    ['ten-a-school','ten-b-school'].forEach(id=>$(id)?.addEventListener('change',syncTennisMode));
    syncTennisMode();
  }
  if (d === 'Esgrima') {
    const previousMode = fencingModeFromCompetition()==='EQUIPOS' ? 'EQUIPOS' : (priorFencingMode || 'ELIMINACION_DIRECTA');
    const modeSelect = $('e-modality');
    if (modeSelect) {
      modeSelect.value = previousMode;
      modeSelect.addEventListener('change', () => renderDisciplineForm('Esgrima'));
    }
    if (modeSelect && previousMode === 'EQUIPOS') setupTeamFencingDraft();
    if (modeSelect && previousMode !== 'EQUIPOS') setupIndividualFencingDraft();
  }
  if (d === 'Orientación Militar') {
    const list = $('or-planillas-list');
    $('or-add-planilla')?.addEventListener('click', () => {
      const cards = [...(list?.querySelectorAll('.or-planilla-card') || [])];
      list?.insertAdjacentHTML('beforeend', orienteeringPlanilla(cards.length));
    });
    list?.addEventListener('click', ev => {
      const remove = ev.target.closest('.or-remove-planilla');
      if (remove && list.querySelectorAll('.or-planilla-card').length > 1) remove.closest('.or-planilla-card').remove();
    });
  }
  if (d === 'Taekwondo') {
    const list = $('tk-bouts-list');
    const syncWeight = card => {
      const sex = card.querySelector('[id$="-sex"]')?.value || 'Masculino';
      const weight = card.querySelector('[id$="-weight"]');
      if (!weight) return;
      const previous = weight.value;
      weight.innerHTML = taekwondoWeightOptions(sex);
      if ([...weight.options].some(o=>o.value===previous)) weight.value = previous;
    };
    list?.addEventListener('change', ev => {
      const card = ev.target.closest('.tk-bout-card');
      if (card && ev.target.id.endsWith('-sex')) syncWeight(card);
    });
    list?.addEventListener('click', ev => {
      const remove = ev.target.closest('.tk-remove-bout');
      if (remove) {
        const cards = [...list.querySelectorAll('.tk-bout-card')];
        if (cards.length > 1) { remove.closest('.tk-bout-card').remove(); [...list.querySelectorAll('.tk-bout-card')].forEach((c,i)=>{const oldIndex=c.dataset.boutIndex;c.dataset.boutIndex=i;c.querySelector('h5').textContent=`Combate ${i+1}`;c.querySelectorAll('[id]').forEach(el=>{el.id=el.id.replace(new RegExp('^tk-'+oldIndex+'-'),'tk-'+i+'-');});}); }
      }
    });
    $('tk-add-bout')?.addEventListener('click', () => {
      const cards = [...list.querySelectorAll('.tk-bout-card')];
      const next = cards.length;
      list.insertAdjacentHTML('beforeend', taekwondoBoutCard(next));
      const card = list.lastElementChild;
      const remove = card.querySelector('.tk-remove-bout'); if (remove) remove.disabled = false;
    });
    const poomList=$('tk-poom-list');
    poomList?.addEventListener('click',ev=>{const btn=ev.target.closest('.tk-remove-poom');if(!btn)return;const cards=[...poomList.querySelectorAll('.tk-poom-card')];if(cards.length>1){btn.closest('.tk-poom-card').remove();[...poomList.querySelectorAll('.tk-poom-card')].forEach((c,i)=>{const old=c.dataset.poomIndex;c.dataset.poomIndex=i;c.querySelector('h5').textContent=`Planilla Poomsae ${i+1}`;c.querySelectorAll('[id]').forEach(el=>el.id=el.id.replace(new RegExp('^tk-p-'+old+'-'),'tk-p-'+i+'-'));});}});
    $('tk-add-poom')?.addEventListener('click',()=>{const next=poomList.querySelectorAll('.tk-poom-card').length;poomList.insertAdjacentHTML('beforeend',taekwondoPoomsaeCard(next));});
  }
  const stateSelect = $('competition-status');
  const dqFields = $('dq-participant-fields');
  const syncDQFields = () => {
    const show = stateSelect?.value === 'DQ_PARTICIPANTE';
    dqFields?.classList.toggle('hidden', !show);
    const nameInput = $('dq-participant-name');
    const schoolSelect = $('dq-participant-school');
    if (nameInput) nameInput.required = show;
    if (schoolSelect) schoolSelect.required = show;
  };
  stateSelect?.addEventListener('change', syncDQFields);
  syncDQFields();
  bindDynamicCalculations(d);
}



function getCompetitionStatus() {
  const status = String(val('competition-status') || '').toUpperCase();
  const allowed = ['PARTIDO_FINALIZADO','COMPETENCIA_FINALIZADA','DQ_LOCAL','DQ_VISITANTE','DQ_PARTICIPANTE','SUSPENDIDO'];
  return allowed.includes(status) ? status : 'COMPETENCIA_FINALIZADA';
}
function competitionStatusLabel(status) {
  return ({PARTIDO_FINALIZADO:'Partido finalizado',COMPETENCIA_FINALIZADA:'Competencia finalizada',DQ_LOCAL:'Descalificación del equipo local',DQ_VISITANTE:'Descalificación del equipo visitante',DQ_PARTICIPANTE:'Descalificación del participante',SUSPENDIDO:'Competencia suspendida'})[status] || 'Competencia finalizada';
}

function renderFootball() {
  const local = `<section class="football-team-panel football-local">
    <h4 class="football-team-heading">Equipo local</h4>
    ${field('Equipo local',select('team-local',optionSchools,true))}
    <div class="football-subheading">Marcador</div>
    ${field('1.er tiempo',input('f-1t-l','0','number',true,'min="0"'))}
    ${field('2.º tiempo',input('f-2t-l','0','number',true,'min="0"'))}
    ${field('Tiempo extra',input('f-te-l','0','number',false,'min="0"'))}
    ${field('Penaltis',input('f-pen-l','0','number',false,'min="0"'))}
    <div class="football-subheading">Tarjetas</div>
    ${field('Tarjetas amarillas',input('f-yellow-local','0','number',false,'min="0" step="1"'))}
    ${field('Tarjetas rojas',input('f-red-local','0','number',false,'min="0" step="1"'))}
  </section>`;
  const visitor = `<section class="football-team-panel football-visitor">
    <h4 class="football-team-heading">Equipo visitante</h4>
    ${field('Equipo visitante',select('team-visitor',optionSchools,true))}
    <div class="football-subheading">Marcador</div>
    ${field('1.er tiempo',input('f-1t-v','0','number',true,'min="0"'))}
    ${field('2.º tiempo',input('f-2t-v','0','number',true,'min="0"'))}
    ${field('Tiempo extra',input('f-te-v','0','number',false,'min="0"'))}
    ${field('Penaltis',input('f-pen-v','0','number',false,'min="0"'))}
    <div class="football-subheading">Tarjetas</div>
    ${field('Tarjetas amarillas',input('f-yellow-visitor','0','number',false,'min="0" step="1"'))}
    ${field('Tarjetas rojas',input('f-red-visitor','0','number',false,'min="0" step="1"'))}
  </section>`;
  return `<div class="football-layout"><div class="football-team-grid">${local}${visitor}</div>
    <section class="football-bottom-field">${field('Ganador',select('f-winner','<option value="">Seleccione</option><option value="LOCAL">Local</option><option value="VISITANTE">Visitante</option><option value="EMPATE">Empate</option>',true))}</section>
    <section class="football-bottom-field">${field('Incidencias',`<textarea id="f-incidents" class="form-control" rows="2"></textarea>`,'wide')}</section>
  </div>`;
}
function renderBasketball() {
  return `<div class="form-grid two">${field('Equipo local',select('team-local',optionSchools,true))}${field('Equipo visitante',select('team-visitor',optionSchools,true))}
    ${field('Puntos finales equipo local',input('b-final-l','0','number',true,'min="0" step="1"'))}${field('Puntos finales equipo visitante',input('b-final-v','0','number',true,'min="0" step="1"'))}
    <div class="wide form-summary">Registre únicamente el marcador final. El ganador obtiene 2 puntos en la clasificación y el perdedor 1 punto. No se diligencian periodos ni prórrogas por separado; el marcador debe ser diferente para definir ganador.</div>
    ${field('Observaciones',`<textarea id="b-notes" class="form-control" rows="2"></textarea>`,'wide')}</div>`;
}
function renderVolleyball() {
  return `<div class="form-grid two">${field('Equipo local',select('team-local',optionSchools,true))}${field('Equipo visitante',select('team-visitor',optionSchools,true))}
    ${[1,2,3,4,5].map(s=>`${field(`Set ${s} local (puntos)`,input(`v-${s}-l`,'0','number',false,'min="0" max="50"'))}${field(`Set ${s} visitante (puntos)`,input(`v-${s}-v`,'0','number',false,'min="0" max="50"'))}`).join('')}<div class="wide form-summary">Registre los puntos de cada set. Los sets 1–4 se juegan normalmente a 25 puntos; el quinto depende del reglamento específico del torneo. El sistema calculará sets ganados, puntos a favor/en contra y puntos de clasificación.</div>
    <div class="wide form-summary">Los sets ganados y el ganador se calculan automáticamente a partir de los parciales registrados.</div></div>`;
}
function renderFencing() {
  const mode = fencingModeFromCompetition()==='EQUIPOS' ? 'EQUIPOS' : (val('e-modality') || 'ELIMINACION_DIRECTA');
  const modeOptions = fencingModeFromCompetition()==='EQUIPOS' ? '<option value="ELIMINACION_DIRECTA">Eliminación directa · 16 tiradores</option><option value="EQUIPOS" selected>Por equipos</option>' : '<option value="ELIMINACION_DIRECTA" selected>Eliminación directa · 16 tiradores</option><option value="EQUIPOS">Por equipos</option>';
  const modeSelect = `<div class="form-grid two">${field('Modalidad de esgrima',select('e-modality',modeOptions,true))}${field('Arma',select('e-weapon','<option>Florete</option><option>Espada</option><option>Sable</option>',true))}</div>`;
  if (mode === 'EQUIPOS') {
    const teamFields = ['A','B','C','D'].map(side => `<div class="form-section"><h5 class="font-bold mb-3">Equipo ${side}</h5><div class="form-grid two">${field(`Escuela equipo ${side}`,select(`e-team-${side.toLowerCase()}-school`,optionSchools,true))}${[1,2,3,4].map(n=>field(`${n===4?'Reserva':'Tirador '+n} · equipo ${side}`,input(`e-team-${side.toLowerCase()}-${n}-name`,'Nombre completo','text',n<4))).join('')}</div></div>`).join('');
    const matchCard=(id,title,a,b)=>`<div class="form-section" data-team-match="${id}"><h5 class="font-bold mb-3">${title}</h5><div class="form-grid two">${field('Equipo participante 1',select(`${id}-team-a`,`<option value="${a}">Equipo ${a}</option>${id==='team-final'?'<option value="WIN_SF1">Ganador semifinal 1</option><option value="WIN_SF2">Ganador semifinal 2</option>':''}`,true))}${field('Equipo participante 2',select(`${id}-team-b`,`<option value="${b}">Equipo ${b}</option>${id==='team-final'?'<option value="WIN_SF1">Ganador semifinal 1</option><option value="WIN_SF2">Ganador semifinal 2</option>':''}`,true))}${field('Toques equipo 1',input(`${id}-score-a`,'0','number',false,'min="0" max="45"'))}${field('Toques equipo 2',input(`${id}-score-b`,'0','number',false,'min="0" max="45"'))}<div class="wide text-sm" id="${id}-winner-label">Ganador pendiente · objetivo 45 toques</div></div></div>`;
    return `<div class="space-y-4"><div class="form-summary">Esgrima por equipos: cuatro equipos, eliminación directa. Complete los marcadores en una sola llave. El avance se calcula automáticamente y se conserva como borrador local; Firebase solo se actualizará cuando confirme la llave completa.</div>${modeSelect}<div class="form-grid two">${field('Estado de la llave',`<div id="e-bracket-state" class="form-summary">Borrador local pendiente</div>`,'wide')}</div>${teamFields}<h4 class="font-bold">Llave de eliminación directa</h4>${matchCard('team-sf1','Semifinal 1','A','B')}${matchCard('team-sf2','Semifinal 2','C','D')}${matchCard('team-final','Final','WIN_SF1','WIN_SF2')}${matchCard('team-third','Tercer puesto (opcional)','LOSER_SF1','LOSER_SF2')}<div class="form-summary">Los marcadores son de 0 a 45. La llave completa debe tener las dos semifinales y la final definidas; el tercer puesto es opcional. Los datos se guardan automáticamente en LocalStorage mientras diligencia.</div><div class="flex flex-wrap gap-2"><button type="button" id="e-save-draft" class="form-btn secondary">Guardar borrador local</button><button type="button" id="e-clear-draft" class="form-btn secondary">Limpiar borrador</button></div></div>`;
  }
  const participantFields = Array.from({length:16},(_,i)=>{const n=i+1,id=`P${n}`;return `${field(`Tirador ${n}`,input(`e-${id.toLowerCase()}-name`,'Nombre completo','text',true))}${field(`Escuela ${n}`,select(`e-${id.toLowerCase()}-school`,optionSchools,true))}`}).join('');
  const bout=(prefix,title)=>`<div class="border border-slate-700 rounded-2xl p-4 space-y-3 bg-slate-900/50"><div class="font-bold text-blue-300">${title}</div><div class="form-grid two">${field('Tirador A',select(`${prefix}-a`,'',true))}${field('Tirador B',select(`${prefix}-b`,'',true))}${field('Toques A (máximo 15)',input(`${prefix}-score-a`,'0','number',true,'min="0" max="15"'))}${field('Toques B (máximo 15)',input(`${prefix}-score-b`,'0','number',true,'min="0" max="15"'))}${field('Sanciones A',input(`${prefix}-san-a`,'Separadas por coma'))}${field('Sanciones B',input(`${prefix}-san-b`,'Separadas por coma'))}<select id="${prefix}-winner" class="hidden" aria-hidden="true" tabindex="-1"></select><div class="wide text-sm" id="${prefix}-winner-label">Ganador automático al llegar a 15 toques.</div></div></div>`;
  const round=(prefix,title,count)=>Array.from({length:count},(_,i)=>bout(`${prefix}-${i+1}`,`${title} ${i+1}`)).join('');
  return `<div class="space-y-4"><div class="form-summary">Esgrima individual: llave de 16 tiradores siguiendo la planilla Excel (sembrados 1–16). Cada combate es un único asalto a 15 toques; al llegar un tirador a 15, el ganador avanza automáticamente a la siguiente ronda. Los cambios se guardan como borrador en este navegador y no se envían a Firebase hasta guardar la competencia completa.</div>${modeSelect}<div class="form-grid two">${participantFields}</div><h4 class="font-bold">Octavos de final</h4>${round('e-r16','Octavos',8)}<h4 class="font-bold">Cuartos de final</h4>${round('e-qf','Cuartos',4)}<h4 class="font-bold">Semifinales</h4>${bout('e-sf1','Semifinal 1')}${bout('e-sf2','Semifinal 2')}<h4 class="font-bold">Final</h4>${bout('e-final','Final')}<div class="form-summary">En individual se asigna bronce a los dos perdedores de semifinal; no es necesario disputar combate por el tercer puesto. El combate queda disponible solo si el reglamento particular lo exige:</div>${bout('e-third','Tercer puesto (opcional)')}<div class="flex flex-wrap gap-2"><button type="button" id="e-ind-save-draft" class="form-btn secondary">Guardar llave local</button><button type="button" id="e-ind-clear-draft" class="form-btn secondary">Limpiar llave local</button></div><div id="e-ind-draft-status" class="form-summary">Borrador local pendiente.</div></div>`;
}

const IND_FENCING_DRAFT_PREFIX='jin26_esgrima_individual_borrador_v1';
function individualDraftKey(){const c=selectedCompetition||{};const key=c.id||first(c,['codigo','idSugerido','competenciaId'])||$('digital-competition')?.value||$('competition-select')?.value||'sin_competencia';return `${IND_FENCING_DRAFT_PREFIX}_${String(key).replace(/[^a-zA-Z0-9_-]/g,'_')}`;}
const IND_FENCING_BOUTS=[...Array.from({length:8},(_,i)=>`e-r16-${i+1}`),...Array.from({length:4},(_,i)=>`e-qf-${i+1}`),'e-sf1','e-sf2','e-final','e-third'];
function indFencer(id){return {id,nombre:val(`e-${id.toLowerCase()}-name`).trim(),escuela:val(`e-${id.toLowerCase()}-school`)};}
function indFencerLabel(id){if(!id)return 'Pendiente';const p=indFencer(id);return `${p.nombre||`Tirador ${id.slice(1)}`}${p.escuela?` · ${p.escuela}`:''}`;}
function indBoutWinner(prefix){const a=val(`${prefix}-a`),b=val(`${prefix}-b`),sa=val(`${prefix}-score-a`),sb=val(`${prefix}-score-b`);if(!a||!b||sa===''||sb===''||Number(sa)>15||Number(sb)>15||Number(sa)===Number(sb))return '';if(Number(sa)===15&&Number(sa)>Number(sb))return a;if(Number(sb)===15&&Number(sb)>Number(sa))return b;return '';}
function persistIndividualDraft(showMessage=false){if(val('e-modality')==='EQUIPOS')return false;try{const values={};document.querySelectorAll('#discipline-fields input, #discipline-fields select, #discipline-fields textarea').forEach(el=>{if(el.id)values[el.id]=el.value;});localStorage.setItem(individualDraftKey(),JSON.stringify({competitionId:compKey(selectedCompetition),savedAt:new Date().toISOString(),values}));const status=$('e-ind-draft-status');if(status&&showMessage)status.textContent='Llave guardada en este navegador. Aún no se ha enviado a Firebase.';return true;}catch(e){console.error('Error guardando llave individual local',e);const status=$('e-ind-draft-status');if(status)status.textContent='No se pudo guardar la llave local. Verifique el almacenamiento del navegador.';return false;}}
function restoreIndividualDraft(){try{const raw=localStorage.getItem(individualDraftKey());if(!raw)return;const d=JSON.parse(raw);Object.entries(d.values||{}).forEach(([id,v])=>{const el=$(id);if(el)el.value=v;});}catch(e){console.warn('No fue posible recuperar la llave individual',e);}}
function updateIndividualBracket(){
 const seeds=[1,16,9,8,5,12,13,4,3,14,11,6,7,10,15,2];
 // La hoja Excel organiza los octavos en este orden de sembrado.
 const slots=Array.from({length:16},(_,i)=>`P${i+1}`);
 const names=()=>Object.fromEntries(slots.map(id=>[id,indFencerLabel(id)]));
 const setBout=(prefix,a,b,locked=false)=>{
   const ae=$(`${prefix}-a`),be=$(`${prefix}-b`),we=$(`${prefix}-winner`);if(!ae||!be||!we)return;
   const oldA=ae.value,oldB=be.value;
   const opts=(ids,placeholder)=>`<option value="">${placeholder}</option>`+ids.filter(Boolean).map(id=>`<option value="${id}">${esc(names()[id]||id)}</option>`).join('');
   ae.innerHTML=opts([a],'Pendiente de clasificar');be.innerHTML=opts([b],'Pendiente de clasificar');
   ae.value=oldA===a?a:(a||'');be.value=oldB===b?b:(b||'');ae.disabled=locked;be.disabled=locked;
   const scoreA=$(`${prefix}-score-a`), scoreB=$(`${prefix}-score-b`);
   const ready=Boolean(a&&b);
   if(scoreA)scoreA.disabled=!ready;
   if(scoreB)scoreB.disabled=!ready;
   if(!ready){if(scoreA)scoreA.value='';if(scoreB)scoreB.value='';}
   const winner=indBoutWinner(prefix);we.innerHTML=opts([a,b].filter(Boolean),'Ganador automático');we.value=winner;we.disabled=true;
   const label=$(`${prefix}-winner-label`);if(label)label.textContent=!ready?'Esperando clasificados de la ronda anterior; el marcador se habilitará cuando ambos tiradores estén definidos.':winner?`Ganador: ${names()[winner]} · ${val(`${prefix}-score-a`)}–${val(`${prefix}-score-b`)}`:'Ganador pendiente · un solo asalto a 15 toques';
 };
 const r16=Array.from({length:8},(_,i)=>{const prefix=`e-r16-${i+1}`;setBout(prefix,`P${seeds[i*2]}`,`P${seeds[i*2+1]}`,true);return indBoutWinner(prefix);});
 const qf=Array.from({length:4},(_,i)=>{const prefix=`e-qf-${i+1}`;setBout(prefix,r16[i*2],r16[i*2+1],true);return indBoutWinner(prefix);});
 const sf1a=qf[0],sf1b=qf[1],sf2a=qf[2],sf2b=qf[3];
 setBout('e-sf1',sf1a,sf1b,true);setBout('e-sf2',sf2a,sf2b,true);
 const sf1=indBoutWinner('e-sf1'),sf2=indBoutWinner('e-sf2');setBout('e-final',sf1,sf2,true);
 // Tercer puesto enfrenta automáticamente a los dos perdedores de semifinal.
 const loser=(prefix)=>{const a=val(`${prefix}-a`),b=val(`${prefix}-b`),w=indBoutWinner(prefix);return w?(w===a?b:a):'';};
 setBout('e-third',loser('e-sf1'),loser('e-sf2'),true);
 // Refresca las etiquetas de opciones de tiradores cuando cambian nombre o escuela.
 const status=$('e-ind-draft-status');if(status){const done=IND_FENCING_BOUTS.slice(0,15).every(p=>indBoutWinner(p));status.textContent=done?'Llave individual completa. Revise el resultado y guarde la competencia para enviarla a Firebase.':'Avance de llave automático · borrador local. Seleccione el ganador de cada combate para habilitar la siguiente ronda.';}
}
function setupIndividualFencingDraft(){
 restoreIndividualDraft();updateIndividualBracket();const root=$('discipline-fields');if(!root)return;
 if(!root.dataset.indDraftBound){root.dataset.indDraftBound='1';root.addEventListener('input',()=>{updateIndividualBracket();persistIndividualDraft(false);});root.addEventListener('change',()=>{updateIndividualBracket();persistIndividualDraft(false);});}
 $('e-ind-save-draft')?.addEventListener('click',()=>{updateIndividualBracket();persistIndividualDraft(true);});
 $('e-ind-clear-draft')?.addEventListener('click',()=>{if(!confirm('¿Eliminar la llave individual guardada localmente para esta competencia?'))return;localStorage.removeItem(individualDraftKey());root.querySelectorAll('input,select,textarea').forEach(el=>{if(!el.disabled)el.value='';});updateIndividualBracket();const st=$('e-ind-draft-status');if(st)st.textContent='Borrador local eliminado.';});
}

const TEAM_FENCING_DRAFT_PREFIX='jin26_esgrima_equipos_borrador_v1';
function teamDraftKey(){const c=selectedCompetition||{};const key=c.id||first(c,['codigo','idSugerido','competenciaId'])||$('digital-competition')?.value||$('competition-select')?.value||'sin_competencia';return `${TEAM_FENCING_DRAFT_PREFIX}_${String(key).replace(/[^a-zA-Z0-9_-]/g,'_')}`;}
function teamMatchWinner(id){const a=val(`${id}-score-a`),b=val(`${id}-score-b`);if(a===''||b===''||Number(a)===Number(b)||Number(a)>45||Number(b)>45||Math.max(Number(a),Number(b))!==45)return '';return Number(a)>Number(b)?val(`${id}-team-a`):val(`${id}-team-b`);}
function teamBracketComplete(){return !!(teamMatchWinner('team-sf1')&&teamMatchWinner('team-sf2')&&teamMatchWinner('team-final'));}
function updateTeamBracket(){
  const sf1=teamMatchWinner('team-sf1'),sf2=teamMatchWinner('team-sf2');
  const setAuto=(id,value)=>{const el=$(id);if(el){el.value=value;el.disabled=true;}};
  const schoolName=(side)=>val(`e-team-${String(side).toLowerCase()}-school`)||`Seleccione escuela del equipo ${side}`;
  const displayTeam=(code)=>({A:schoolName('A'),B:schoolName('B'),C:schoolName('C'),D:schoolName('D'),WIN_SF1:`Ganador semifinal 1 (${sf1?schoolName(sf1):'pendiente'})`,WIN_SF2:`Ganador semifinal 2 (${sf2?schoolName(sf2):'pendiente'})`,LOSER_SF1:`Perdedor semifinal 1`,LOSER_SF2:`Perdedor semifinal 2`}[code]||code||'Pendiente');
  // Show actual school names in the bracket instead of opaque labels A/B/C/D.
  for(const id of ['team-sf1','team-sf2']) for(const suffix of ['team-a','team-b']) { const el=$(`${id}-${suffix}`); if(el){const code=el.value;el.innerHTML=['A','B','C','D'].map(k=>`<option value="${k}">${esc(schoolName(k))}</option>`).join('');el.value=code|| (id==='team-sf1'?(suffix==='team-a'?'A':'B'):(suffix==='team-a'?'C':'D'));} }
  const finalA=$('team-final-team-a'),finalB=$('team-final-team-b');
  if(finalA){finalA.innerHTML=`<option value="WIN_SF1">${esc(displayTeam('WIN_SF1'))}</option><option value="WIN_SF2">${esc(displayTeam('WIN_SF2'))}</option>`;finalA.value='WIN_SF1';finalA.disabled=true;}
  if(finalB){finalB.innerHTML=`<option value="WIN_SF2">${esc(displayTeam('WIN_SF2'))}</option><option value="WIN_SF1">${esc(displayTeam('WIN_SF1'))}</option>`;finalB.value='WIN_SF2';finalB.disabled=true;}
  const thirdA=$('team-third-team-a'),thirdB=$('team-third-team-b');
  if(thirdA){thirdA.innerHTML='<option value="LOSER_SF1">Perdedor semifinal 1</option><option value="LOSER_SF2">Perdedor semifinal 2</option>';thirdA.value='LOSER_SF1';thirdA.disabled=true;}
  if(thirdB){thirdB.innerHTML='<option value="LOSER_SF2">Perdedor semifinal 2</option><option value="LOSER_SF1">Perdedor semifinal 1</option>';thirdB.value='LOSER_SF2';thirdB.disabled=true;}
  for(const id of ['team-sf1','team-sf2','team-final','team-third']){const label=$(`${id}-winner-label`);if(label){const w=teamMatchWinner(id);label.textContent=w?`Ganador provisional: ${displayTeam(w)}. Marcador ${val(`${id}-score-a`)}–${val(`${id}-score-b`)}`:'Ganador pendiente · registre marcadores válidos hasta 45 toques';}}
  const state=$('e-bracket-state');if(state)state.textContent=teamBracketComplete()?'Llave completa; lista para confirmar y enviar a Firebase':'Borrador local · faltan encuentros por definir';
}
function persistTeamDraft(showMessage=false){if(val('e-modality')!=='EQUIPOS')return false;const fields=[...document.querySelectorAll('#discipline-fields input, #discipline-fields select, #discipline-fields textarea')];const values={};fields.forEach(el=>{if(el.id)values[el.id]=el.value;});try{localStorage.setItem(teamDraftKey(),JSON.stringify({competitionId:compKey(selectedCompetition),savedAt:new Date().toISOString(),values}));const status=$('digital-form-status');if(showMessage&&status){status.className='text-sm text-emerald-400';status.textContent='Borrador guardado en este navegador. Aún no se ha enviado a Firebase.';}return true;}catch(e){console.error('No fue posible guardar el borrador local',e);const status=$('digital-form-status');if(status){status.className='text-sm text-rose-400';status.textContent='No se pudo guardar localmente. Verifique el almacenamiento del navegador.';}return false;}}
function restoreTeamDraft(){try{const raw=localStorage.getItem(teamDraftKey());if(!raw)return;const draft=JSON.parse(raw);Object.entries(draft.values||{}).forEach(([id,value])=>{const el=$(id);if(el)el.value=value;});}catch(e){console.warn('No fue posible recuperar borrador de esgrima',e);}}
function setupTeamFencingDraft(){restoreTeamDraft();updateTeamBracket();const root=$('discipline-fields');if(root&&!root.dataset.teamDraftBound){root.dataset.teamDraftBound='1';root.addEventListener('input',()=>{updateTeamBracket();persistTeamDraft(false);});root.addEventListener('change',()=>{updateTeamBracket();persistTeamDraft(false);});}const save=$('e-save-draft');if(save)save.addEventListener('click',()=>persistTeamDraft(true));const clear=$('e-clear-draft');if(clear)clear.addEventListener('click',()=>{if(!confirm('¿Eliminar el borrador local de esta competencia?'))return;try{localStorage.removeItem(teamDraftKey());root.querySelectorAll('input,select,textarea').forEach(el=>{if(!el.disabled)el.value='';});updateTeamBracket();const status=$('digital-form-status');if(status)status.textContent='Borrador local eliminado.';}catch(e){console.error(e);}});}

function taekwondoWeightOptions(sex, selected='') {
  const male = ['Hasta 54 kg','Más de 54 y hasta 58 kg','Más de 58 y hasta 63 kg','Más de 63 y hasta 68 kg','Más de 68 y hasta 74 kg','Más de 74 y hasta 80 kg','Más de 80 y hasta 87 kg','Más de 87 kg'];
  const female = ['Hasta 46 kg','Más de 46 y hasta 49 kg','Más de 49 y hasta 53 kg','Más de 53 y hasta 57 kg','Más de 57 y hasta 62 kg','Más de 62 y hasta 67 kg','Más de 67 y hasta 73 kg','Más de 73 kg'];
  const list = sex === 'Femenino' ? female : male;
  return '<option value="">Seleccione peso</option>' + list.map(x=>`<option ${x===selected?'selected':''}>${x}</option>`).join('') + '<option value="OTRA">Otra categoría (definida por organización)</option>';
}
function taekwondoBoutCard(i) {
  const p=`tk-${i}`;
  return `<article class="form-section tk-bout-card" data-bout-index="${i}">
    <div class="flex items-center justify-between gap-3 mb-3"><h5 class="font-bold text-white">Combate ${i+1}</h5><button type="button" class="form-btn secondary tk-remove-bout" ${i===0?'disabled':''}>Eliminar combate</button></div>
    <div class="form-grid two">
      ${field('Sexo / rama',select(`${p}-sex`,'<option value="Masculino">Masculino</option><option value="Femenino">Femenino</option>',true))}
      ${field('Categoría de peso (referencia WT)',select(`${p}-weight`,taekwondoWeightOptions('Masculino'),true))}
      ${field('Competidor A',input(`${p}-a-name`,'Nombre completo','text',true))}${field('Escuela A',select(`${p}-a-school`,optionSchools,true))}
      ${field('Competidor B',input(`${p}-b-name`,'Nombre completo','text',true))}${field('Escuela B',select(`${p}-b-school`,optionSchools,true))}
      ${[1,2,3].map(r=>`${field(`Round ${r} · puntos A`,input(`${p}-${r}-a`,'0','number',false,'min="0"'))}${field(`Round ${r} · puntos B`,input(`${p}-${r}-b`,'0','number',false,'min="0"'))}${field(`Round ${r} · Gam-jeom A`,input(`${p}-${r}-ga`,'0','number',false,'min="0"'))}${field(`Round ${r} · Gam-jeom B`,input(`${p}-${r}-gb`,'0','number',false,'min="0"'))}`).join('')}
      ${field('Resultado oficial',input(`${p}-final`,'Ej. 2-1 o 18-12'))}${field('Ganador',select(`${p}-winner`,'<option value="">Seleccione</option><option value="A">Competidor A</option><option value="B">Competidor B</option><option value="EMPATE">Empate / pendiente de decisión</option>',true))}
      ${field('Forma de finalización',select(`${p}-end`,'<option>PTS</option><option>PTF</option><option>RSC</option><option>WDR</option><option>DSQ</option><option>DQB</option><option>OTRA</option>'))}
      ${field('Observaciones del combate',`<textarea id="${p}-notes" class="form-control" rows="2" placeholder="Retiro, sanciones, revisión arbitral..."></textarea>`,'wide')}
    </div>
  </article>`;
}
function renderTaekwondoCombate() {
  return `<div class="space-y-4"><div class="form-summary">Registre varios combates de una misma sesión/competencia. Cada combate conserva rama, peso, deportistas, marcador por round y ganador. Las categorías de peso mostradas son una referencia de combate senior de World Taekwondo; confirme con la organización si los Juegos usan categorías por edad o pesos adaptados.</div>
    <div id="tk-bouts-list" class="space-y-4">${taekwondoBoutCard(0)}</div>
    <div class="flex flex-wrap gap-3"><button type="button" id="tk-add-bout" class="form-btn secondary">+ Agregar otro combate</button><span class="text-xs text-slate-400 self-center">Puede registrar combates de distintos pesos en una sola jornada de Taekwondo.</span></div>
    <div class="form-summary"><label class="flex items-start gap-2"><input id="tk-modality-finalized" type="checkbox" class="mt-1"><span><b>Cerrar medallería de Taekwondo</b><br><small>Marque solo cuando estén registrados todos los combates de las categorías incluidas. La clasificación se agrupa por sexo y peso y ordena por victorias; confirme que este criterio coincide con el formato de premiación JIN-ENAP.</small></span></label></div>
  </div>`;
}
function taekwondoPoomsaeCard(i) {
  const p=`tk-p-${i}`;
  return `<article class="form-section tk-poom-card" data-poom-index="${i}">
    <div class="flex items-center justify-between gap-3 mb-3"><h5 class="font-bold text-white">Planilla Poomsae ${i+1}</h5><button type="button" class="form-btn secondary tk-remove-poom" ${i===0?'disabled':''}>Eliminar planilla</button></div>
    <div class="form-summary">Formato Side-by-Side: los dos competidores se evalúan en paralelo y se registra el puntaje total oficial.</div>
    <div class="form-grid two">
      ${field('Poomsae ejecutado',input(`${p}-poomsae`,'Nombre del Poomsae','text',true),'wide')}
      ${field('Competidor A',input(`${p}-a-name`,'Nombre completo','text',true))}${field('Escuela A',select(`${p}-a-school`,optionSchools,true))}
      ${field('Puntaje total A',input(`${p}-score-a`,'0.00','number',true,'min="0" step="0.01"'))}
      ${field('Competidor B',input(`${p}-b-name`,'Nombre completo','text',true))}${field('Escuela B',select(`${p}-b-school`,optionSchools,true))}
      ${field('Puntaje total B',input(`${p}-score-b`,'0.00','number',true,'min="0" step="0.01"'))}
      ${field('Resultado Side-by-Side',select(`${p}-winner`,'<option value="">Se determina por puntaje</option><option value="A">Competidor A</option><option value="B">Competidor B</option><option value="EMPATE">Empate / decisión de jueces</option>',false),'wide')}
      ${field('Observaciones',`<textarea id="${p}-notes" class="form-control" rows="2"></textarea>`,'wide')}
    </div></article>`;
}
function renderTaekwondo() {
  const competitionText = `${first(selectedCompetition,['codigo','idSugerido','id'])} ${first(selectedCompetition,['descripcion','nombre','Nombre'])}`.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const isPoomsae = /poomsae|punse|punsae|poom se/.test(competitionText);
  if (!isPoomsae) return renderTaekwondoCombate();
  const intro = `<div class="form-summary">Taekwondo: competencia Poomsae Side-by-Side. Registre puntajes totales y agregue planillas adicionales.</div>`;
  const poom = `<section class="form-section"><h4 class="font-bold text-white mb-3">Poomsae · Side-by-Side</h4><div id="tk-poom-list" class="space-y-4">${taekwondoPoomsaeCard(0)}</div><div class="flex flex-wrap gap-3 mt-3"><button type="button" id="tk-add-poom" class="form-btn secondary">+ Agregar otra planilla Poomsae</button></div></section>`;
  return `<div class="space-y-4">${intro}${poom}</div>`;
}
function renderTennis() {
  return `<div class="tennis-form">
    <div class="form-grid two tennis-top-grid">
      ${field('Modalidad',select('ten-mode','<option value="Sencillos">Sencillos</option><option value="Dobles">Dobles</option><option value="Dobles mixtos">Dobles mixtos</option>',true))}
      ${field('Ronda',select('ten-round','<option value="CUADROS">Cuadros / fase de cuadro</option><option value="SEMIFINAL">Semifinal</option><option value="FINAL">Final</option>',true))}
    </div>
    <div class="form-summary tennis-summary">Registre los jugadores por pareja. En dobles y dobles mixtos se requieren dos jugadores por lado; cada pareja representa una sola escuela.</div>
    <div class="tennis-pair-grid">
      <section class="tennis-pair-card tennis-pair-a">
        <div class="tennis-pair-heading"><span class="tennis-pair-mark">A</span><div><h5>Jugador A</h5><p>Escuela y jugador</p></div></div>
        ${field('Escuela jugador A',select('ten-a-school',optionSchools,true))}
        <div class="tennis-player-grid">
          ${field('Jugador A1',input('ten-a','Nombre del jugador','text',true))}
          <div id="ten-doubles-a-wrap" class="tennis-extra-player hidden">${field('Jugador A2',input('ten-a2','Nombre del segundo jugador','text',false))}</div>
        </div>
      </section>
      <section class="tennis-pair-card tennis-pair-b">
        <div class="tennis-pair-heading"><span class="tennis-pair-mark">B</span><div><h5>Jugador B</h5><p>Escuela y jugador</p></div></div>
        ${field('Escuela jugador B',select('ten-b-school',optionSchools,true))}
        <div class="tennis-player-grid">
          ${field('Jugador B1',input('ten-b','Nombre del jugador','text',true))}
          <div id="ten-doubles-b-wrap" class="tennis-extra-player hidden">${field('Jugador B2',input('ten-b2','Nombre del segundo jugador','text',false))}</div>
        </div>
      </section>
    </div>
    <section class="tennis-score-card">
      <div class="tennis-section-heading"><h5>Marcador por sets</h5><p>Ingrese los games obtenidos por cada jugador.</p></div>
      <div class="tennis-sets-grid">${[1,2,3].map(s=>`<div class="tennis-set-row"><span class="tennis-set-label">Set ${s}</span>${field('Jugador A',input(`ten-${s}-a`,'0','number',false,'min="0"'))}${field('Jugador B',input(`ten-${s}-b`,'0','number',false,'min="0"'))}</div>`).join('')}</div>
    </section>
    <section class="tennis-score-card">
      <div class="tennis-section-heading"><h5>Estadísticas del encuentro</h5><p>Opcional, de acuerdo con el control arbitral.</p></div>
      <div class="form-grid two tennis-stats-grid">
        <div class="form-field"><label for="ten-aces-a" class="tennis-stat-label">Aces jugador A</label>${input('ten-aces-a','0','number',false,'min="0" step="1"')}</div>
        <div class="form-field"><label for="ten-aces-b" class="tennis-stat-label">Aces jugador B</label>${input('ten-aces-b','0','number',false,'min="0" step="1"')}</div>
        <div class="form-field"><label for="ten-df-a" class="tennis-stat-label">Dobles faltas jugador A</label>${input('ten-df-a','0','number',false,'min="0" step="1"')}</div>
        <div class="form-field"><label for="ten-df-b" class="tennis-stat-label">Dobles faltas jugador B</label>${input('ten-df-b','0','number',false,'min="0" step="1"')}</div>
      </div>
    </section>
    <div class="form-summary tennis-winner-summary">La escuela ganadora se determina automáticamente cuando el marcador oficial confirma el ganador del partido (mejor de tres sets).</div>
    <div class="form-summary tennis-finalize-summary"><label class="flex items-start gap-2"><input id="ten-modality-finalized" type="checkbox" class="mt-1"><span><b>Cerrar modalidad y calcular podio</b><br><small>Marque solo al registrar el último partido de esta categoría/modalidad. El podio se calcula con partidos ganados, porcentaje de sets y porcentaje de games; si persiste un empate, debe resolverse manualmente conforme al reglamento aplicable.</small></span></label></div>
  </div>`;
}
function shootingPlanillaCard(index) {
  const p=`sh-${index}`;
  const cols=['Dorsal','Nombre','Escuela','Sexo','Prec. 1','Prec. 2','Prec. 3','Prec. 4','Prec. 5','Prec. 6','Ráp. 1','Ráp. 2','Ráp. 3','Ráp. 4','Ráp. 5','Ráp. 6','Total','X','Tiempo tiro rápido','Obs.'];
  const rows=Array.from({length:12},(_,n)=>n+1).map(i=>`<tr><td><input id="${p}-${i}-dorsal" class="form-control" inputmode="numeric"></td><td><input id="${p}-${i}-name" class="form-control"></td><td><select id="${p}-${i}-school" class="form-control">${optionSchools}</select></td><td><select id="${p}-${i}-sex" class="form-control"><option value="">Seleccione</option><option value="Masculino">Masculino</option><option value="Femenino">Femenino</option></select></td>${[1,2,3,4,5,6].map(q=>`<td class="sh-precision-cell"><input id="${p}-${i}-s${q}" aria-label="Precisión serie ${q}" class="form-control sh-series sh-precision" data-plan="${index}" data-row="${i}" type="number" min="0" step="0.1" inputmode="decimal"></td>`).join('')}${[1,2,3,4,5,6].map(q=>`<td class="sh-rapid-cell"><input id="${p}-${i}-r${q}" aria-label="Tiro rápido serie ${q}" class="form-control sh-series sh-rapid" data-plan="${index}" data-row="${i}" type="number" min="0" step="0.1" inputmode="decimal"></td>`).join('')}<td><input id="${p}-${i}-total" class="form-control" readonly></td><td><input id="${p}-${i}-x" class="form-control" type="number" min="0" step="1"></td><td class="sh-time-cell"><input id="${p}-${i}-time" class="form-control" placeholder="mm:ss" inputmode="text"></td><td><input id="${p}-${i}-obs" class="form-control"></td></tr>`).join('');
  return `<article class="form-section sh-planilla-card" data-plan-index="${index}"><div class="flex items-center justify-between gap-3 mb-3"><h5 class="font-bold">Planilla ${index+1}</h5><button type="button" class="form-btn secondary sh-remove-plan" ${index===0?'disabled':''}>Eliminar planilla</button></div><div class="form-grid two">${field('Modalidad',select(`${p}-mode`,'<option value="">Seleccione modalidad</option><option value="Precisión">Precisión</option><option value="Tiro rápido">Tiro rápido</option><option value="Mixta">Mixta</option><option value="Fuego Central 25 m">Fuego Central 25 m</option>',true))}${field('Arma',select(`${p}-weapon`,'<option value="">Seleccione</option><option value="Rifle de aire comprimido">Rifle de aire comprimido</option><option value="Pistola de aire comprimido">Pistola de aire comprimido</option><option value="Rifle de fuego">Rifle de fuego</option><option value="Pistola de fuego">Pistola de fuego</option><option value="Revólver de fuego central">Revólver de fuego central</option>',true))}${field('Distancia',select(`${p}-distance`,'<option value="">Seleccione distancia</option><option value="10 m">10 m</option><option value="25 m">25 m</option><option value="50 m">50 m</option><option value="100 m">100 m</option>',true))}${field('Posición',select(`${p}-position`,'<option value="">Seleccione posición</option><option value="De pie">De pie</option><option value="De rodillas">De rodillas</option><option value="Tendido / tumbado">Tendido / tumbado</option><option value="Tres posiciones">Tres posiciones</option>',true))}</div><div class="form-summary mb-2">Fuego Central: registre precisión y tiro rápido en sus respectivas series. Cada etapa contiene seis series de cinco disparos. Para otras modalidades, use las series que correspondan.</div>${tableWrap(cols,rows)}</article>`;
}
function renderShooting() {
 return `<div class="form-summary mb-3">Cada planilla contiene hasta 12 participantes. Registre series y, cuando corresponda, tiempo de tiro rápido. El total se calcula automáticamente.</div><div id="sh-planillas-list" class="space-y-4">${shootingPlanillaCard(0)}</div><div class="flex flex-wrap gap-3 mt-3"><button type="button" id="sh-add-planilla" class="form-btn secondary">+ Agregar otra planilla</button><span class="text-xs text-slate-400 self-center">Cada planilla se conserva de forma independiente dentro del resultado de la competencia.</span></div>`;
}
function pentathlonTestType(c=selectedCompetition) {
  const text = `${first(c,['codigo','idSugerido','id'])} ${first(c,['descripcion','nombre','Nombre'])}`.toLowerCase();
  if (text.includes('relevo')) return 'RELEVOS';
  if (text.includes('tiro')) return 'TIRO';
  if (text.includes('granad')) return 'GRANADA';
  if (text.includes('paso de pista') || text.includes('pista')) return 'PISTA';
  if (text.includes('natación') || text.includes('natacion')) return 'NATACION';
  if (text.includes('cross country') || text.includes('cross-country') || text.includes('campo a través') || text.includes('campo a traves')) return 'CROSS';
  return 'GENERAL';
}

function pentathlonTimeToMs(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  // Acepta HH:MM:SS.mmm, MM:SS.mmm y segundos decimales.
  if (/^\d+(?:[.,]\d+)?$/.test(raw)) return Number(raw.replace(',', '.')) * 1000;
  const parts = raw.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const secondsPart = parts.pop().replace(',', '.');
  const seconds = Number(secondsPart);
  const minutes = Number(parts.pop());
  const hours = parts.length ? Number(parts.pop()) : 0;
  if (![seconds, minutes, hours].every(Number.isFinite) || seconds < 0 || minutes < 0 || hours < 0 || seconds >= 60 || minutes >= 60 && parts.length > 0) return null;
  return ((hours * 3600) + (minutes * 60) + seconds) * 1000;
}
function updatePentathlonAutomaticPositions() {
  if (disciplineName(selectedCompetition) !== 'Pentatlón') return;
  const type = pentathlonTestType();
  if (!['PISTA','NATACION','CROSS','RELEVOS'].includes(type)) return;
  const rows = [];
  for (let i=1;i<=(type==='RELEVOS'?4:16);i++) {
    const name = val(type==='RELEVOS'?`p-${i}-team`:`p-${i}-name`).trim();
    const school = val(`p-${i}-school`);
    const sex = val(`p-${i}-sex`) || 'SIN_RAMA';
    const time = pentathlonTimeToMs(val(`p-${i}-result`));
    const position = $(`p-${i}-position`);
    if (position) { position.readOnly = true; position.title='Posición calculada automáticamente por tiempo'; }
    if (position) position.value = '';
    if ((name || school) && school && time !== null) rows.push({i,sex,time});
  }
  const groups = new Map();
  rows.forEach(row=>{if(!groups.has(row.sex))groups.set(row.sex,[]);groups.get(row.sex).push(row);});
  groups.forEach(group=>{
    group.sort((a,b)=>a.time-b.time || a.i-b.i);
    let lastTime=null, rank=0;
    group.forEach((row,index)=>{
      if (lastTime===null || row.time!==lastTime) rank=index+1;
      const position=$(`p-${row.i}-position`); if(position) position.value=String(rank);
      lastTime=row.time;
    });
  });
}
function renderPentathlon() {
  const type = pentathlonTestType();
  const c = selectedCompetition || {};
  const desc = first(c,['descripcion','nombre','Nombre']) || 'Prueba de Pentatlón';
  const titleMap = {
    TIRO:'Pentatlón · Tiro', PISTA:'Pentatlón · Paso de pista', NATACION:'Pentatlón · Natación utilitaria',
    GRANADA:'Pentatlón · Lanzamiento de granadas', CROSS:'Pentatlón · Cross Country', RELEVOS:'Pentatlón · Relevos'
  };
  const title = titleMap[type] || 'Pentatlón · Prueba general';
  // La captura cambia según la naturaleza de la prueba: tiempo, distancia o puntaje.
  const resultKind = ['PISTA','NATACION','CROSS','RELEVOS'].includes(type) ? 'TIEMPO' : type==='GRANADA' ? 'DISTANCIA' : type==='TIRO' ? 'PUNTAJE' : 'RESULTADO';
  const resultLabel = resultKind==='TIEMPO' ? 'Tiempo oficial' : resultKind==='DISTANCIA' ? 'Distancia (metros)' : resultKind==='PUNTAJE' ? 'Puntaje / resultado de tiro' : 'Resultado';
  const resultPlaceholder = resultKind==='TIEMPO' ? 'HH:MM:SS.mmm' : resultKind==='DISTANCIA' ? 'Ej. 42.50 m' : resultKind==='PUNTAJE' ? 'Puntaje obtenido' : 'Resultado oficial';
  const resultInputType = resultKind==='DISTANCIA' ? 'number' : 'text';
  const resultInputAttrs = resultKind==='DISTANCIA' ? 'min="0" step="0.01" inputmode="decimal"' : resultKind==='TIEMPO' ? 'inputmode="text" autocomplete="off"' : '';
  const rowCount = type==='RELEVOS' ? 4 : 16;
  const rows = Array.from({length:rowCount},(_,idx)=>idx+1).map(i => {
    const nameField = type==='RELEVOS'
      ? `<input id="p-${i}-team" class="form-control" placeholder="Equipo / relevo">`
      : `<input id="p-${i}-name" class="form-control" placeholder="Nombre del cadete">`;
    return `<tr>
      <td class="text-center font-semibold">${i}</td>
      <td>${nameField}</td>
      <td><select id="p-${i}-school" class="form-control"><option value="">Seleccione</option>${ESCUELAS.map(s=>`<option value="${s}">${s}</option>`).join('')}</select></td>
      <td><select id="p-${i}-sex" class="form-control"><option value="">Seleccione</option><option>Masculino</option><option>Femenino</option><option>Mixto</option></select></td>
      <td><label class="sr-only" for="p-${i}-result">${resultLabel}</label><input id="p-${i}-result" class="form-control" type="${resultInputType}" ${resultInputAttrs} placeholder="${resultPlaceholder}" aria-label="${resultLabel}"></td>
      <td><input id="p-${i}-points" class="form-control" type="number" min="0" placeholder="Puntos obtenidos" step="0.1"></td>
      <td><input id="p-${i}-position" class="form-control" type="number" min="1" placeholder="Automática" ${['PISTA','NATACION','CROSS','RELEVOS'].includes(type) ? 'readonly title="Posición calculada automáticamente por tiempo"' : ''}></td>
      <td><input id="p-${i}-obs" class="form-control" placeholder="Observaciones"></td>
    </tr>`;
  }).join('');
  const participantLabel = type==='RELEVOS' ? 'Equipo / relevo' : 'Cadete';
  const phase = field('Prueba / fase',input('p-phase',desc,'text',true),'wide');
  const individualHelp = type==='RELEVOS'
    ? 'Registre los relevos aquí. Ingrese el tiempo oficial de cada equipo.'
    : 'Puede registrar hasta 16 cadetes en esta prueba. Use el mismo nombre y escuela en las distintas pruebas para acumular sus puntos en el podio general.';
  const resultHelp = resultKind==='TIEMPO'
    ? 'Esta modalidad se registra por TIEMPO. Ingrese el tiempo oficial (HH:MM:SS.mmm, MM:SS.mmm o segundos decimales). La posición se calcula automáticamente por rama: el menor tiempo obtiene el primer puesto; los empates comparten posición.'
    : resultKind==='DISTANCIA'
      ? 'Esta modalidad se registra por DISTANCIA. Ingrese la distancia en metros, usando punto decimal si corresponde (por ejemplo, 42.50).'
      : resultKind==='PUNTAJE'
        ? 'Esta modalidad se registra por puntaje/resultado. Ingrese el resultado oficial de tiro y los puntos asignados por el juzgamiento.'
        : 'Ingrese el resultado oficial de la prueba y los puntos asignados por el juzgamiento.';
  return `<div class="form-summary mb-3">
      <strong>${esc(title)}</strong><br>
      <span class="text-slate-400">${esc(desc)}</span><br>
      <span class="text-blue-300">${esc(individualHelp)}</span><br>
      <span class="text-amber-200">${esc(resultHelp)}</span>
    </div>
    <div class="form-grid two mb-4">${phase}${field('Tipo de prueba',input('p-test-type',type,'text',false,'readonly'))}</div>
    ${tableWrap(['#',participantLabel,'Escuela','Sexo',resultLabel,'Puntos','Posición','Observaciones'],rows)}
    <div class="form-summary mt-3">En las pruebas por tiempo, la posición se calcula automáticamente al ingresar los tiempos y se guarda con el resultado. La comparación se realiza por rama (sexo) y el menor tiempo obtiene la mejor posición. Los puntos de cada prueba se registran según los resultados validados por el juez. El podio general individual suma los puntos guardados para cada cadete en las distintas pruebas individuales; no se aplica una fórmula no confirmada.</div>`;
}
function orienteeringPlanilla(index) {
  const cols=['Posición','Dorsal','Número de chips','Grado','Nombre','Escuela','Chip / ID de chip','Género','Hora de salida','Hora de llegada','Tiempo bruto o de carrera','Errores (tiro/baliza)','Tiempo definitivo','Puntos','Estado','Observaciones'];
  const rows=[1,2,3,4,5,6,7,8,9,10].map(i=>`<tr><td><input id="or-${index}-${i}-position" class="form-control" type="number" min="1" placeholder="Pos."></td><td><input id="or-${index}-${i}-dorsal" class="form-control" inputmode="numeric" placeholder="Dorsal"></td><td><input id="or-${index}-${i}-chip-count" class="form-control" type="number" min="0" step="1" placeholder="N.º chips"></td><td><input id="or-${index}-${i}-grado" class="form-control"></td><td><input id="or-${index}-${i}-name" class="form-control"></td><td><select id="or-${index}-${i}-school" class="form-control">${optionSchools}</select></td><td><input id="or-${index}-${i}-chip" class="form-control" placeholder="ID de chip"></td><td><select id="or-${index}-${i}-sex" class="form-control"><option value="">Seleccione</option><option value="Masculino">Masculino</option><option value="Femenino">Femenino</option></select></td><td><input id="or-${index}-${i}-start" class="form-control" type="time" step="1" placeholder="Hora de salida"></td><td><input id="or-${index}-${i}-arrival" class="form-control" type="time" step="1" placeholder="Hora de llegada"></td><td><input id="or-${index}-${i}-gross" class="form-control" placeholder="HH:MM:SS"></td><td><input id="or-${index}-${i}-errors" class="form-control" type="number" min="0" step="1" placeholder="Total"></td><td><input id="or-${index}-${i}-final" class="form-control" placeholder="HH:MM:SS"></td><td><input id="or-${index}-${i}-points" class="form-control" type="number" min="0" step="0.1" placeholder="Puntos"></td><td><select id="or-${index}-${i}-status" class="form-control"><option value="FINAL">FINAL</option><option value="DESCALIFICADO">DESCALIFICADO</option></select></td><td><input id="or-${index}-${i}-obs" class="form-control" placeholder="Observaciones"></td></tr>`).join('');
  return `<section class="or-planilla-card border border-slate-700 rounded-xl p-3 mb-4" data-planilla-index="${index}"><div class="flex items-center justify-between mb-2"><h5 class="font-semibold">Planilla ${index+1}</h5>${index>0?`<button type="button" class="or-remove-planilla btn btn-secondary">Eliminar planilla</button>`:''}</div>${tableWrap(cols,rows)}</section>`;
}
function renderOrienteering() {
  return `<div class="form-summary mb-3">Registre participantes en una o varias planillas. Use “Agregar planilla” para abrir otra planilla de la misma competencia. El podio se calcula con todos los participantes válidos de las planillas; los descalificados no clasifican.</div><div id="or-planillas-list">${orienteeringPlanilla(0)}</div><div class="flex justify-end mb-3"><button type="button" id="or-add-planilla" class="btn btn-secondary">+ Agregar planilla</button></div>`;
}
function renderAthletics() {
  return `<div class="form-grid two">${field('Modalidad',select('at-mode','<option>PISTA</option><option>CAMPO</option>',true))}${field('Prueba',input('at-event','Ej. 100 metros / Salto largo','text',true))}${field('Fase',select('at-phase','<option>FINAL</option><option>ELIMINATORIA</option><option>SEMIFINAL</option><option>SERIE</option>'))}${field('Serie',input('at-heat','1','number'))}<input id="at-timing" type="hidden" value="MANUAL"><div class="field"><label>Cronometraje</label><div class="form-control" aria-readonly="true">MANUAL</div></div></div>
    <div class="form-summary mb-3">Cronometraje manual fijo. Elija el <strong>formato</strong> de cada marca: <strong>SS:MMM</strong> (ej. 10:250 = 10 s 250 milésimas), <strong>MM:SS:MMM</strong> (ej. 1:05:200) o <strong>MTS</strong> (metros, ej. 7.85). El podio se calcula automáticamente: menor tiempo gana en los formatos de tiempo y mayor distancia gana en MTS; los empates comparten posición. No se pueden mezclar tiempos y metros en una misma planilla. Los intervalos y el viento no se registran en esta planilla.</div>
    ${tableWrap(['#','Carril/Dorsal','Nombre','Escuela','Sexo','Formato','Marca / tiempo / metros','Puntos','Estado'],[1,2,3,4,5,6,7,8,9,10,11,12].map(i=>`<tr><td>${i}</td><td><input id="at-${i}-lane" class="form-control"></td><td><input id="at-${i}-name" class="form-control"></td><td><select id="at-${i}-school" class="form-control">${optionSchools}</select></td><td><select id="at-${i}-sex" class="form-control"><option>Masculino</option><option>Femenino</option></select></td><td><select id="at-${i}-format" class="form-control"><option value="SS:MMM">SS:MMM</option><option value="MM:SS:MMM">MM:SS:MMM</option><option value="METROS">MTS (metros)</option></select></td><td><input id="at-${i}-mark" class="form-control" placeholder="Ej. 10:250" inputmode="decimal" autocomplete="off"></td><td><input id="at-${i}-points" class="form-control" type="number" min="0" step="0.01" placeholder="Puntos"></td><td><select id="at-${i}-status" class="form-control"><option>FINAL</option><option>DQ</option><option>DNF</option><option>DNS</option><option>NM</option></select></td></tr>`).join(''))}`;
}
function renderSwimming() {
  const seriesOptions=[1,2,3,4].map(n=>`<option value="${n}">Serie ${n}</option>`).join('');
  const rows=[1,2,3,4,5,6,7,8,9,10].map(i=>`<tr><td>${i}</td><td><select id="sw-${i}-series" class="form-control">${seriesOptions}</select></td><td><input id="sw-${i}-lane" class="form-control"></td><td><input id="sw-${i}-grade" class="form-control"></td><td><input id="sw-${i}-name" class="form-control"></td><td><select id="sw-${i}-school" class="form-control">${optionSchools}</select></td><td><select id="sw-${i}-sex" class="form-control"><option>Masculino</option><option>Femenino</option></select></td><td><input id="sw-${i}-final" class="form-control" placeholder="MM:SS.mmm"></td><td><input id="sw-${i}-pos" class="form-control" type="number" min="1" placeholder="Automática" readonly></td><td><select id="sw-${i}-status" class="form-control"><option value="FINAL">FINAL</option><option value="DESCALIFICADO">DESCALIFICADO</option></select></td></tr>`).join('');
  return `<div class="form-grid two">${field('Prueba',select('sw-event','<option>50 m</option><option>100 m</option><option>200 m</option><option>400 m</option><option>800 m</option><option>1500 m</option><option>Relevos</option>',true))}${field('Estilo',select('sw-style','<option>Libre</option><option>Espalda</option><option>Pecho</option><option>Mariposa</option><option>Combinado</option>',true))}${field('Fase',select('sw-phase','<option>FINAL</option><option>ELIMINATORIA</option><option>SEMIFINAL</option>'))}</div>
    <div class="form-summary mb-3">Registro de Natación: indique la <strong>serie</strong> (1 a 4) de cada participante y su <strong>tiempo final</strong>. El podio se calcula automáticamente con el mejor tiempo, por separado para cada sexo y entre todas las series; los empates comparten posición. Los participantes <strong>DESCALIFICADO</strong> no entran al podio.</div>
    ${tableWrap(['#','Serie','Carril','Grado','Nombre','Escuela','Sexo','Tiempo final','Pos.','Estado'],rows)}`;
}

function swimmingTimeMs(value) {
  const ms = pentathlonTimeToMs(value);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}
// Devuelve la posición de cada participante (misma longitud que la lista; null si no clasifica).
// Solo participan los de estado FINAL con tiempo válido. Se ordena por menor tiempo, separado por sexo.
function swimmingPositions(participantes) {
  const list = Array.isArray(participantes) ? participantes : [];
  const result = list.map(() => null);
  const groups = new Map();
  list.forEach((p, idx) => {
    const estado = String(p?.estado || 'FINAL').toUpperCase();
    const ms = swimmingTimeMs(p?.tiempoFinal);
    if (estado !== 'FINAL' || ms === null) return;
    const sex = String(p?.sexo || 'SIN_RAMA').trim().toUpperCase();
    if (!groups.has(sex)) groups.set(sex, []);
    groups.get(sex).push({ idx, ms });
  });
  for (const rows of groups.values()) {
    rows.sort((x, y) => x.ms - y.ms);
    let last = null, pos = 0;
    rows.forEach((r, i) => { if (i === 0 || r.ms !== last) pos = i + 1; result[r.idx] = pos; last = r.ms; });
  }
  return result;
}

const ATHLETICS_STATUS_NO_RANK = ['DQ','DNF','DNS','NM'];
function athleticsMarkValue(mark, format) {
  const raw = String(mark ?? '').trim();
  if (!raw) return null;
  let m;
  if (format === 'METROS') {
    if (!/^\d+(?:[.,]\d{1,3})?$/.test(raw)) return null;
    const meters = Number(raw.replace(',', '.'));
    return meters > 0 ? { kind: 'DIST', value: meters } : null;
  }
  if (format === 'SS:MMM') {
    m = raw.match(/^([0-5]?\d)[:.,](\d{3})$/);
    return m ? { kind: 'TIME', value: Number(m[1]) * 1000 + Number(m[2]) } : null;
  }
  if (format === 'MM:SS:MMM') {
    m = raw.match(/^(\d{1,3}):([0-5]?\d)[:.,](\d{3})$/);
    return m ? { kind: 'TIME', value: Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number(m[3]) } : null;
  }
  return null;
}
// Para registros antiguos que no guardaron formato: lo deduce de la marca y de la modalidad.
function inferAthleticsFormat(mark, modalidad) {
  const raw = String(mark ?? '').trim();
  const campo = String(modalidad || '').toUpperCase() === 'CAMPO';
  if (/^\d{1,3}:[0-5]?\d[:.,]\d{3}$/.test(raw) && athleticsMarkValue(raw, 'SS:MMM') === null) return 'MM:SS:MMM';
  if (/^[0-5]?\d[:.,]\d{3}$/.test(raw) && !campo) return 'SS:MMM';
  return campo ? 'METROS' : 'SS:MMM';
}
// Posición de cada participante (misma longitud que la lista; null si no clasifica).
// Tiempos: menor es mejor. Metros: mayor es mejor. Los empates comparten posición.
function athleticsPositions(participantes) {
  const list = Array.isArray(participantes) ? participantes : [];
  const result = list.map(() => null);
  const groups = { TIME: [], DIST: [] };
  list.forEach((p, idx) => {
    if (ATHLETICS_STATUS_NO_RANK.includes(String(p?.estado || 'FINAL').toUpperCase())) return;
    const parsed = athleticsMarkValue(p?.marcaTiempo, p?.formatoMarca);
    if (parsed) groups[parsed.kind].push({ idx, value: parsed.value });
  });
  for (const kind of ['TIME', 'DIST']) {
    const rows = groups[kind];
    rows.sort((x, y) => kind === 'TIME' ? x.value - y.value : y.value - x.value);
    let last = null, pos = 0;
    rows.forEach((r, k) => { if (k === 0 || r.value !== last) pos = k + 1; result[r.idx] = pos; last = r.value; });
  }
  return result;
}

function bindDynamicCalculations(d) {
  if (d === 'Atletismo') {
    const hints = { 'SS:MMM': 'Ej. 10:250', 'MM:SS:MMM': 'Ej. 1:05:200', 'METROS': 'Ej. 7.85' };
    for (let i = 1; i <= 12; i++) {
      const fmt = $(`at-${i}-format`), mark = $(`at-${i}-mark`);
      fmt?.addEventListener('change', () => { if (mark) { mark.value = ''; mark.placeholder = hints[fmt.value] || ''; } });
    }
  }
  if (d === 'Natación') {
    const refreshPositions = () => {
      const rows = [1,2,3,4,5,6,7,8,9,10].map(i => ({ i, p: { sexo: val(`sw-${i}-sex`), tiempoFinal: val(`sw-${i}-final`), estado: val(`sw-${i}-status`) } }));
      const pos = swimmingPositions(rows.map(r => r.p));
      rows.forEach((r, k) => { const el = $(`sw-${r.i}-pos`); if (el) el.value = pos[k] ?? ''; });
    };
    [1,2,3,4,5,6,7,8,9,10].forEach(i => ['sex','final','status'].forEach(f => { const el = $(`sw-${i}-${f}`); el?.addEventListener('input', refreshPositions); el?.addEventListener('change', refreshPositions); }));
  }
  if (d === 'Tiro Deportivo') {
    const list=$('sh-planillas-list');
    const applyMode=card=>{
      const mode=card.querySelector('select[id$="-mode"]')?.value||'';
      const showPrecision=mode!=='Tiro rápido';
      const showRapid=mode!=='Precisión';
      const table=card.querySelector('table');
      if(!table)return;
      const rows=[...table.querySelectorAll('tr')];
      rows.forEach(row=>{
        [...row.children].forEach((cell,i)=>{
          if(i>=4&&i<=9)cell.hidden=!showPrecision;
          if(i>=10&&i<=15)cell.hidden=!showRapid;
          if(i===18)cell.hidden=!showRapid;
        });
      });
    };
    list?.addEventListener('change',ev=>{if(ev.target.matches('select[id$="-mode"]'))applyMode(ev.target.closest('.sh-planilla-card'));});
    [...(list?.querySelectorAll('.sh-planilla-card')||[])].forEach(applyMode);
    const calc=card=>{const plan=card.dataset.planIndex;for(let i=1;i<=12;i++){const vals=[1,2,3,4,5,6].flatMap(n=>[Number($(`sh-${plan}-${i}-s${n}`)?.value||0),Number($(`sh-${plan}-${i}-r${n}`)?.value||0)]);const total=$(`sh-${plan}-${i}-total`);if(total)total.value=vals.reduce((a,b)=>a+b,0);}};
    list?.addEventListener('input',ev=>{const card=ev.target.closest('.sh-planilla-card');if(card&&ev.target.classList.contains('sh-series'))calc(card);});
    list?.addEventListener('click',ev=>{const btn=ev.target.closest('.sh-remove-plan');if(!btn)return;const cards=[...list.querySelectorAll('.sh-planilla-card')];if(cards.length<=1)return;btn.closest('.sh-planilla-card').remove();[...list.querySelectorAll('.sh-planilla-card')].forEach((c,i)=>{const old=Number(c.dataset.planIndex);c.dataset.planIndex=i;c.querySelector('h5').textContent=`Planilla ${i+1}`;c.querySelectorAll('[id]').forEach(el=>{el.id=el.id.replace(new RegExp('^sh-'+old+'-'),'sh-'+i+'-');});c.querySelectorAll('[data-plan]').forEach(el=>el.dataset.plan=i);c.querySelectorAll('.sh-remove-plan').forEach(b=>b.disabled=i===0);});});
    $('sh-add-planilla')?.addEventListener('click',()=>{const cards=[...list.querySelectorAll('.sh-planilla-card')];const next=cards.length;list.insertAdjacentHTML('beforeend',shootingPlanillaCard(next));const card=list.lastElementChild;card.dataset.planIndex=next;applyMode(card);});
  }
  if (d === 'Pentatlón') {
    const pos = Number(data.posicion || 0);
    const school = data.escuelaCodigo || data.participante?.escuelaCodigo || data.equipo?.escuelaCodigo || '';
    const name = data.participante?.nombre || data.equipo?.nombre || '';
    if (pos > 0 && school) out.push({posicion:pos, escuelaCodigo:school, participanteId:null, nombre:name, resultado:data.resultado||'', puntosPrueba:Number(data.puntosPrueba||0), tipoPrueba:data.tipoPrueba});
    return out;
  }
  if (d === 'Pentatlón' && Array.isArray(data.participantes)) {
    return data.participantes
      .filter(p => p.nombre || p.escuelaCodigo)
      .map(p => ({
        posicion: p.posicion || null,
        escuelaCodigo: p.escuelaCodigo,
        participanteId: p.id || null,
        nombre: p.nombre || '',
        resultado: p.resultado || '',
        tipoResultado: p.tipoResultado || '',
        tiempoResultado: p.tiempoResultado || '',
        distanciaResultado: p.distanciaResultado ?? null,
        unidadResultado: p.unidadResultado || '',
        puntosPrueba: p.puntosPrueba || 0
      }));
  }
  if (d === 'Esgrima' && val('e-modality') === 'EQUIPOS') {
    const equipos = ['a','b','c','d'].map(side => ({lado:side.toUpperCase(),escuelaCodigo:val(`e-team-${side}-school`),tiradores:[1,2,3,4].map(n=>({numero:n,nombre:val(`e-team-${side}-${n}-name`),reserva:n===4})).filter(x=>x.nombre)}));
    const readMatch=id=>({fase:id, equipoA:val(`${id}-team-a`), equipoB:val(`${id}-team-b`), toquesA:num(`${id}-score-a`), toquesB:num(`${id}-score-b`), ganador:teamMatchWinner(id)});
    const semifinal1=readMatch('team-sf1'), semifinal2=readMatch('team-sf2'), final=readMatch('team-final'), tercerPuesto=readMatch('team-third');
    const resolveSide=(side)=>side==='WIN_SF1'?semifinal1.ganador:side==='WIN_SF2'?semifinal2.ganador:side==='LOSER_SF1'?(semifinal1.ganador?(['A','B'].find(x=>x!==semifinal1.ganador)): ''):side==='LOSER_SF2'?(semifinal2.ganador?(['C','D'].find(x=>x!==semifinal2.ganador)): ''):side;
    [final,tercerPuesto].forEach(m=>{m.equipoA=resolveSide(m.equipoA);m.equipoB=resolveSide(m.equipoB);if(m.ganador==='WIN_SF1')m.ganador=semifinal1.ganador;if(m.ganador==='WIN_SF2')m.ganador=semifinal2.ganador;if(m.ganador==='LOSER_SF1')m.ganador=semifinal1.ganador?(['A','B'].find(x=>x!==semifinal1.ganador)):'';if(m.ganador==='LOSER_SF2')m.ganador=semifinal2.ganador?(['C','D'].find(x=>x!==semifinal2.ganador)):'';});
    return {tipo:'ESGRIMA_EQUIPOS',modalidad:'EQUIPOS',formato:'ELIMINACION_DIRECTA_4_EQUIPOS',arma:val('e-weapon'),metaToques:45,equipos, llave:{semifinal1,semifinal2,final,tercerPuesto},fase:'LLAVE_COMPLETA',ganador:final.ganador,estadoLlave:teamBracketComplete()?'COMPLETA':'BORRADOR_LOCAL',observaciones:val('e-team-notes')||''};
  }
}

function collectRows(prefix, count, mapper) { const out=[]; for(let i=1;i<=count;i++){const row=mapper(i); if(row) out.push(row);} return out; }
function val(id) { return $(id)?.value ?? ''; }
function num(id) { const n=Number(val(id)); return Number.isFinite(n)?n:0; }

function buildResultData(d) {
  if (d === 'Fútbol') return { tipo:'FUTBOL', equipos:[{escuelaCodigo:val('team-local')},{escuelaCodigo:val('team-visitor')}], marcador:{primerTiempo:{local:num('f-1t-l'),visitante:num('f-1t-v')},segundoTiempo:{local:num('f-2t-l'),visitante:num('f-2t-v')},tiempoExtra:{local:num('f-te-l'),visitante:num('f-te-v')},penaltis:{local:num('f-pen-l'),visitante:num('f-pen-v')}}, tarjetas:{amarillas:{local:num('f-yellow-local'),visitante:num('f-yellow-visitor')},rojas:{local:num('f-red-local'),visitante:num('f-red-visitor')}}, ganador:val('f-winner'), estado:getCompetitionStatus(), estadoNombre:competitionStatusLabel(getCompetitionStatus()), incidencias:val('f-incidents') };
  if (d === 'Baloncesto') { const local=num('b-final-l'), visitante=num('b-final-v'); return { tipo:'BALONCESTO', equipos:[{escuelaCodigo:val('team-local')},{escuelaCodigo:val('team-visitor')}], marcador:{local,visitante}, ganador:local>visitante?'LOCAL':visitante>local?'VISITANTE':'', observaciones:val('b-notes') }; }
  if (d === 'Voleibol') { const sets=[1,2,3,4,5].map(s=>({set:s,local:num(`v-${s}-l`),visitante:num(`v-${s}-v`)})).filter(x=>x.local||x.visitante); const setsGanadosLocal=sets.filter(x=>x.local>x.visitante).length; const setsGanadosVisitante=sets.filter(x=>x.visitante>x.local).length; const ganador=setsGanadosLocal>setsGanadosVisitante?'LOCAL':setsGanadosVisitante>setsGanadosLocal?'VISITANTE':''; return { tipo:'VOLEIBOL', equipos:[{escuelaCodigo:val('team-local')},{escuelaCodigo:val('team-visitor')}], sets, setsGanadosLocal, setsGanadosVisitante, puntosFavorLocal:sets.reduce((a,x)=>a+x.local,0), puntosFavorVisitante:sets.reduce((a,x)=>a+x.visitante,0), ganador }; }
  if (d === 'Esgrima' && (val('e-modality') === 'EQUIPOS' || fencingModeFromCompetition()==='EQUIPOS')) {
    const equipos = ['a','b','c','d'].map(side => ({lado:side.toUpperCase(),escuelaCodigo:val(`e-team-${side}-school`),tiradores:[1,2,3,4].map(n=>({numero:n,nombre:val(`e-team-${side}-${n}-name`).trim(),reserva:n===4})).filter(x=>x.nombre)}));
    const readMatch=id=>({fase:id, equipoA:val(`${id}-team-a`), equipoB:val(`${id}-team-b`), toquesA:num(`${id}-score-a`), toquesB:num(`${id}-score-b`), ganador:teamMatchWinner(id)});
    const semifinal1=readMatch('team-sf1'), semifinal2=readMatch('team-sf2'), final=readMatch('team-final'), tercerPuesto=readMatch('team-third');
    const loser=(winner,a,b)=>winner ? (winner===a?b:a) : '';
    const resolveFinalToken=token=>token==='WIN_SF1'?semifinal1.ganador:token==='WIN_SF2'?semifinal2.ganador:token;
    const resolveThirdToken=token=>token==='LOSER_SF1'?loser(semifinal1.ganador,semifinal1.equipoA,semifinal1.equipoB):token==='LOSER_SF2'?loser(semifinal2.ganador,semifinal2.equipoA,semifinal2.equipoB):token;
    final.equipoA=semifinal1.ganador; final.equipoB=semifinal2.ganador; final.ganador=resolveFinalToken(final.ganador);
    tercerPuesto.equipoA=loser(semifinal1.ganador,semifinal1.equipoA,semifinal1.equipoB); tercerPuesto.equipoB=loser(semifinal2.ganador,semifinal2.equipoA,semifinal2.equipoB); tercerPuesto.ganador=resolveThirdToken(tercerPuesto.ganador);
    const bracketComplete=!!(semifinal1.ganador&&semifinal2.ganador&&final.ganador);
    return {tipo:'ESGRIMA_EQUIPOS',modalidad:'EQUIPOS',formato:'ELIMINACION_DIRECTA_4_EQUIPOS',arma:val('e-weapon'),metaToques:45,equipos,llave:{semifinal1,semifinal2,final,tercerPuesto},fase:bracketComplete?'LLAVE_COMPLETA':'EN_PROGRESO',ganador:final.ganador,estadoLlave:bracketComplete?'COMPLETA':'BORRADOR_LOCAL',observaciones:val('e-team-notes')||''};
  }
  if (d === 'Esgrima') {
    const ids=Array.from({length:16},(_,i)=>`P${i+1}`);
    const participantes=ids.map(id=>({id,nombre:val(`e-${id.toLowerCase()}-name`),escuelaCodigo:val(`e-${id.toLowerCase()}-school`)}));
    const prefixes=[...Array.from({length:8},(_,i)=>`e-r16-${i+1}`),...Array.from({length:4},(_,i)=>`e-qf-${i+1}`),'e-sf1','e-sf2','e-final','e-third'];
    const bouts={};prefixes.forEach(prefix=>{bouts[prefix.slice(2)]= {participanteA:val(`${prefix}-a`),participanteB:val(`${prefix}-b`),toquesA:num(`${prefix}-score-a`),toquesB:num(`${prefix}-score-b`),sanciones:{A:val(`${prefix}-san-a`),B:val(`${prefix}-san-b`)},ganador:indBoutWinner(prefix)};});
    return {tipo:'ESGRIMA_ELIMINACION_DIRECTA',modalidad:'ELIMINACION_DIRECTA',formato:'16_PARTICIPANTES',arma:val('e-weapon'),participantes,cuadro:{octavos:prefixes.slice(0,8).map(x=>bouts[x.slice(2)]),cuartos:prefixes.slice(8,12).map(x=>bouts[x.slice(2)]),semifinal1:bouts['sf1'],semifinal2:bouts['sf2'],final:bouts['final'],tercerPuesto:bouts['third'],combates:bouts}};
  }
  if (d === 'Taekwondo') {
    const combates = [...document.querySelectorAll('#tk-bouts-list .tk-bout-card')].map((card,idx)=>{
      const p=`tk-${idx}`;
      return { numero:idx+1, sexo:val(`${p}-sex`), categoriaPeso:val(`${p}-weight`), competidorA:{nombre:val(`${p}-a-name`).trim(),escuelaCodigo:val(`${p}-a-school`)}, competidorB:{nombre:val(`${p}-b-name`).trim(),escuelaCodigo:val(`${p}-b-school`)}, rounds:[1,2,3].map(r=>({round:r,puntosA:num(`${p}-${r}-a`),puntosB:num(`${p}-${r}-b`),gamJeomA:num(`${p}-${r}-ga`),gamJeomB:num(`${p}-${r}-gb`)})), resultadoFinal:val(`${p}-final`), ganador:val(`${p}-winner`), formaFinalizacion:val(`${p}-end`), observaciones:val(`${p}-notes`) };
    });
    const poomsae=[...document.querySelectorAll('#tk-poom-list .tk-poom-card')].map((card,i)=>{const p=`tk-p-${i}`;const a=num(`${p}-score-a`),b=num(`${p}-score-b`);let winner=val(`${p}-winner`);if(!winner)winner=a>b?'A':b>a?'B':'EMPATE';return {numero:i+1,formato:'SIDE_BY_SIDE',poomsae:val(`${p}-poomsae`),competidorA:{nombre:val(`${p}-a-name`).trim(),escuelaCodigo:val(`${p}-a-school`),puntajeTotal:a},competidorB:{nombre:val(`${p}-b-name`).trim(),escuelaCodigo:val(`${p}-b-school`),puntajeTotal:b},puntajeTotalA:a,puntajeTotalB:b,ganador:winner,observaciones:val(`${p}-notes`)}});
    return { tipo:'TAEKWONDO', formatoRegistro:poomsae.length?'MULTIPLES_COMBATES_Y_POOMSAE':'MULTIPLES_COMBATES', totalCombates:combates.length, modalidadFinalizada:$('tk-modality-finalized')?.checked===true, combates, ...(poomsae.length?{formatoPoomsae:'SIDE_BY_SIDE',totalPlanillasPoomsae:poomsae.length,planillasPoomsae:poomsae}:{}), reglaPeso:'REFERENCIA_WORLD_TAEKWONDO_SENIOR_PENDIENTE_VALIDACION_JIE26' };
  }
  if (d === 'Tenis') {
    const modalidad=val('ten-mode'), dobles=['Dobles','Dobles mixtos'].includes(modalidad);
    const escuelaA=val('ten-a-school'), escuelaB=val('ten-b-school');
    const jugadorA={nombre:val('ten-a').trim(),escuelaCodigo:escuelaA}, jugadorB={nombre:val('ten-b').trim(),escuelaCodigo:escuelaB};
    const sets=[1,2,3].map(set=>({set,gamesA:num(`ten-${set}-a`),gamesB:num(`ten-${set}-b`)})).filter(x=>x.gamesA>0||x.gamesB>0);
    const setsA=sets.filter(x=>x.gamesA>x.gamesB).length, setsB=sets.filter(x=>x.gamesB>x.gamesA).length;
    const ganadorLado=setsA>=2?'A':setsB>=2?'B':'';
    const escuelaGanadora=ganadorLado==='A'?escuelaA:ganadorLado==='B'?escuelaB:'';
    const jugadoresA=[{nombre:jugadorA.nombre},...(dobles?[{nombre:val('ten-a2').trim()}]:[])];
    const jugadoresB=[{nombre:jugadorB.nombre},...(dobles?[{nombre:val('ten-b2').trim()}]:[])];
    return {tipo:'TENIS',modalidad,ronda:val('ten-round'),faseCompetencia:val('ten-round'),modalidadFinalizada:$('ten-modality-finalized')?.checked===true,
      jugadorA,jugadorB,parejaA:{escuelaCodigo:escuelaA,jugadores:jugadoresA},parejaB:{escuelaCodigo:escuelaB,jugadores:jugadoresB},
      jugadores:[{lado:'A',...jugadorA},...(dobles?[{lado:'A',nombre:val('ten-a2').trim(),escuelaCodigo:escuelaA}]:[]),{lado:'B',...jugadorB},...(dobles?[{lado:'B',nombre:val('ten-b2').trim(),escuelaCodigo:escuelaB}]:[])],
      sets,setsGanadosA:setsA,setsGanadosB:setsB,estadisticas:{acesA:num('ten-aces-a'),acesB:num('ten-aces-b'),dobleFaltaA:num('ten-df-a'),dobleFaltaB:num('ten-df-b')},
      ganador:escuelaGanadora,escuelaGanadora,ganadorLado,formatoRegistro:dobles?'DOBLES_4_JUGADORES':'INDIVIDUAL_2_JUGADORES'};
  }
  if (d === 'Tiro Deportivo') {
    const planillas=[...document.querySelectorAll('#sh-planillas-list .sh-planilla-card')].map((card,idx)=>{const p=`sh-${idx}`;return {numero:idx+1,modalidad:val(`${p}-mode`),arma:val(`${p}-weapon`),distancia:val(`${p}-distance`),posicion:val(`${p}-position`),participantes:collectRows(p,12,i=>{const name=val(`${p}-${i}-name`);if(!name)return null;return {dorsal:val(`${p}-${i}-dorsal`),nombre:name,escuelaCodigo:val(`${p}-${i}-school`),sexo:val(`${p}-${i}-sex`),series:[1,2,3,4,5,6].map(q=>({serie:q,puntaje:num(`${p}-${i}-s${q}`)})),seriesTiroRapido:[1,2,3,4,5,6].map(q=>({serie:q,puntaje:num(`${p}-${i}-r${q}`)})),total:num(`${p}-${i}-total`),xCentros:num(`${p}-${i}-x`),tiempoTiroRapido:val(`${p}-${i}-time`),observaciones:val(`${p}-${i}-obs`)}})};});
    return {tipo:'TIRO_DEPORTIVO',formatoRegistro:'MULTIPLES_PLANILLAS',totalPlanillas:planillas.length,planillas,participantes:planillas.flatMap(p=>p.participantes.map(x=>({...x,planilla:p.numero,modalidad:p.modalidad,arma:p.arma,distancia:p.distancia,posicion:p.posicion})))};
  }
  if (d === 'Pentatlón') {
    const tipoPrueba = pentathlonTestType();
    const participantes = collectRows('p',tipoPrueba === 'RELEVOS' ? 4 : 16,i => {
      const name = tipoPrueba === 'RELEVOS' ? val(`p-${i}-team`) : val(`p-${i}-name`);
      const school = val(`p-${i}-school`);
      if (!name && !school) return null;
      return {
        id: String(i),
        nombre: name,
        escuelaCodigo: school,
        sexo: val(`p-${i}-sex`),
        resultado: val(`p-${i}-result`),
        tipoResultado: ['PISTA','NATACION','CROSS','RELEVOS'].includes(tipoPrueba) ? 'TIEMPO' : tipoPrueba==='GRANADA' ? 'DISTANCIA' : tipoPrueba==='TIRO' ? 'PUNTAJE' : 'RESULTADO',
        ...( ['PISTA','NATACION','CROSS','RELEVOS'].includes(tipoPrueba) ? {tiempoResultado:val(`p-${i}-result`)} : {} ),
        ...( tipoPrueba==='GRANADA' ? {distanciaResultado:Number(val(`p-${i}-result`)||0),unidadResultado:'m'} : {} ),
        puntosPrueba: num(`p-${i}-points`),
        posicion: num(`p-${i}-position`),
        observaciones: val(`p-${i}-obs`)
      };
    });
    if (['PISTA','NATACION','CROSS','RELEVOS'].includes(tipoPrueba)) {
      const validTimes=participantes.map((p,index)=>({p,index,time:pentathlonTimeToMs(p.resultado)})).filter(x=>x.p.escuelaCodigo && x.time!==null);
      const groups=new Map();
      validTimes.forEach(x=>{const rama=x.p.sexo||'SIN_RAMA';if(!groups.has(rama))groups.set(rama,[]);groups.get(rama).push(x);});
      groups.forEach(group=>{
        group.sort((a,b)=>a.time-b.time || a.index-b.index);
        let lastTime=null,rank=0;
        group.forEach((x,index)=>{if(lastTime===null||x.time!==lastTime)rank=index+1;x.p.posicion=rank;lastTime=x.time;});
      });
    }
    return {
      tipo:'PENTATLON',
      tipoPrueba,
      pruebaFase:val('p-phase'),
      participantes,
      modalidadRegistro:tipoPrueba === 'RELEVOS' ? 'RELEVOS' : 'INDIVIDUAL_HASTA_16',
      maxParticipantes:tipoPrueba === 'RELEVOS' ? 4 : 16,
      escuelasParticipantes:ESCUELAS,
      reglaPuntuacion:'PENDIENTE_CONFIRMACION_REGLAMENTO_JIE26'
    };
  }
  if (d === 'Orientación Militar') {
    const participantes=[];
    document.querySelectorAll('#or-planillas-list .or-planilla-card').forEach((card,planillaIndex)=>{
      for(let i=1;i<=10;i++){
        const get=s=>card.querySelector(`#or-${planillaIndex}-${i}-${s}`)?.value ?? '';
        const nombre=get('name').trim();
        if(!nombre) continue;
        participantes.push({planilla:planillaIndex+1,posicion:Number(get('position')||0)||null,dorsal:get('dorsal'),numeroChips:Number(get('chip-count')||0),grado:get('grado'),nombre,escuelaCodigo:get('school'),idChip:get('chip'),sexo:get('sex'),genero:get('sex'),horaSalida:get('start'),horaLlegada:get('arrival'),tiempoBruto:get('gross'),tiempoCarrera:get('gross'),erroresTotal:Number(get('errors')||0),tiempoDefinitivo:get('final'),puntos:Number(get('points')||0),estado:get('status')||'FINAL',observaciones:get('obs')});
      }
    });
    return {tipo:'ORIENTACION_MILITAR',planillas:document.querySelectorAll('#or-planillas-list .or-planilla-card').length,participantes};
  }
  if (d === 'Atletismo') {
    const participantes=collectRows('at',12,i=>{const name=val(`at-${i}-name`); if(!name) return null; return {carrilDorsal:val(`at-${i}-lane`),nombre:name,escuelaCodigo:val(`at-${i}-school`),sexo:val(`at-${i}-sex`),formatoMarca:val(`at-${i}-format`)||'SS:MMM',marcaTiempo:val(`at-${i}-mark`),posicion:null,puntos:num(`at-${i}-points`),estado:val(`at-${i}-status`)}});
    const posiciones=athleticsPositions(participantes);
    participantes.forEach((p,k)=>{p.posicion=posiciones[k];});
    return { tipo:'ATLETISMO', modalidad:val('at-mode'), prueba:val('at-event'), fase:val('at-phase'), serie:num('at-heat'), cronometraje:'MANUAL', participantes };
  }
  if (d === 'Natación') {
    const participantes=collectRows('sw',10,i=>{const name=val(`sw-${i}-name`); if(!name) return null; return {serie:num(`sw-${i}-series`)||1,carril:val(`sw-${i}-lane`),grado:val(`sw-${i}-grade`),nombre:name,escuelaCodigo:val(`sw-${i}-school`),sexo:val(`sw-${i}-sex`),tiempoFinal:val(`sw-${i}-final`),posicion:null,estado:val(`sw-${i}-status`)||'FINAL'}});
    const posiciones=swimmingPositions(participantes);
    participantes.forEach((p,k)=>{p.posicion=posiciones[k];});
    return { tipo:'NATACION', prueba:val('sw-event'), estilo:val('sw-style'), fase:val('sw-phase'), participantes };
  }
  return {tipo:d};
}

function orientationTimeMs(v){const parts=String(v||'').trim().split(':').map(Number);if(parts.some(Number.isNaN))return Number.POSITIVE_INFINITY;if(parts.length===3)return parts[0]*3600000+parts[1]*60000+parts[2]*1000;if(parts.length===2)return parts[0]*60000+parts[1]*1000;return Number.POSITIVE_INFINITY}

function deriveClassification(d, data, phase = 'CLASIFICACION') {
  const out=[];
  if (d === 'Pentatlón' && data?.tipo === 'PENTATLON' && Array.isArray(data.participantes)) {
    const test=String(data.tipoPrueba||'').toUpperCase();
    const timed=['PISTA','NATACION','CROSS','RELEVOS'].includes(test);
    const distance=test==='GRANADA';
    const groups=new Map();
    const valid=data.participantes.filter(p=>p?.escuelaCodigo && (p.nombre||p.escuelaCodigo));
    valid.forEach(p=>{
      const rama=String(p.sexo||'').trim().toUpperCase() || 'SIN_RAMA';
      if(!groups.has(rama)) groups.set(rama,[]);
      groups.get(rama).push(p);
    });
    for (const [rama,players] of groups) {
      let ordered=[...players];
      if(timed) ordered=ordered.filter(p=>pentathlonTimeToMs(p.resultado)!==null).sort((a,b)=>pentathlonTimeToMs(a.resultado)-pentathlonTimeToMs(b.resultado));
      else if(distance) ordered=ordered.filter(p=>Number.isFinite(Number(p.resultado))&&String(p.resultado??'').trim()!=='').sort((a,b)=>Number(b.resultado)-Number(a.resultado));
      else if(test==='TIRO') ordered=ordered.sort((a,b)=>Number(b.resultado||0)-Number(a.resultado||0));
      else ordered=ordered.sort((a,b)=>Number(a.posicion||999)-Number(b.posicion||999));
      let previous=null, rank=0;
      ordered.forEach((p,index)=>{
        const value=timed?pentathlonTimeToMs(p.resultado):distance||test==='TIRO'?Number(p.resultado):Number(p.posicion||index+1);
        if(index===0||value!==previous) rank=index+1;
        const row={posicion:rank,escuelaCodigo:p.escuelaCodigo,participanteId:p.id||null,nombre:p.nombre||'',sexo:p.sexo||rama,resultado:p.resultado,puntosPrueba:Number(p.puntosPrueba||0),tipoResultado:p.tipoResultado||''};
        out.push(row); previous=value;
      });
    }
    return out;
  }
  if (d === 'Tenis' && data?.tipo === 'TENIS') {
    // Nunca generar medallas a partir de un solo encuentro sin cierre de modalidad.
    if (data.modalidadFinalizada !== true) return out;
    const category=String(first(selectedCompetition||{},['categoriaCodigo','categoriaNombre','categoria'])||'').trim().toUpperCase();
    const mode=String(data.modalidad||'Sencillos').trim().toUpperCase();
    const sameGroup=r=>String(r?.disciplinaNombre||'').toUpperCase()==='TENIS' &&
      String(r?.categoriaCodigo||r?.categoriaNombre||'').trim().toUpperCase()===category &&
      String(r?.resultadoDeportivo?.modalidad||r?.modalidadCodigo||'SENCILLOS').trim().toUpperCase()===mode && r?.resultadoDeportivo?.tipo==='TENIS';
    const saved=(typeof getCurrentResults==='function'?getCurrentResults():[]).filter(sameGroup).filter(r=>!editingResultId||String(r.id||'')!==String(editingResultId));
    saved.push({disciplinaNombre:'Tenis',categoriaCodigo:category,modalidadCodigo:mode,resultadoDeportivo:data});
    const winnerOf=rd=>{const side=String(rd?.ganadorLado||'').toUpperCase();if(side==='A')return rd.parejaA?.escuelaCodigo||rd.jugadorA?.escuelaCodigo||'';if(side==='B')return rd.parejaB?.escuelaCodigo||rd.jugadorB?.escuelaCodigo||'';if(Number(rd?.setsGanadosA||0)>=2)return rd.parejaA?.escuelaCodigo||rd.jugadorA?.escuelaCodigo||'';if(Number(rd?.setsGanadosB||0)>=2)return rd.parejaB?.escuelaCodigo||rd.jugadorB?.escuelaCodigo||'';return '';};
    const valid=saved.filter(r=>winnerOf(r.resultadoDeportivo));
    const round=r=>String(r?.resultadoDeportivo?.ronda||r?.resultadoDeportivo?.faseCompetencia||'').trim().toUpperCase();
    const finals=valid.filter(r=>round(r)==='FINAL');
    const semis=valid.filter(r=>round(r)==='SEMIFINAL');
    // En eliminación directa: oro/plata requieren final; bronces requieren las dos semifinales.
    if(finals.length!==1) return out;
    const rd=finals[0].resultadoDeportivo, winner=winnerOf(rd), a=rd.parejaA?.escuelaCodigo||rd.jugadorA?.escuelaCodigo||'', b=rd.parejaB?.escuelaCodigo||rd.jugadorB?.escuelaCodigo||'', loser=winner===a?b:a;
    if(!winner||!loser)return out;
    out.push({posicion:1,escuelaCodigo:winner,participanteId:null,nombre:''},{posicion:2,escuelaCodigo:loser,participanteId:null,nombre:''});
    if(semis.length>=2){const bronze=[];for(const sm of semis){const sr=sm.resultadoDeportivo, sw=winnerOf(sr), sa=sr.parejaA?.escuelaCodigo||sr.jugadorA?.escuelaCodigo||'', sb=sr.parejaB?.escuelaCodigo||sr.jugadorB?.escuelaCodigo||'', sl=sw===sa?sb:sa;if(sl&&sl!==winner&&sl!==loser&&!bronze.includes(sl))bronze.push(sl);}bronze.slice(0,2).forEach(school=>out.push({posicion:3,escuelaCodigo:school,participanteId:null,nombre:''}));}
    return out;
  }
  if (d === 'Taekwondo' && data?.tipo === 'TAEKWONDO' && Array.isArray(data.combates)) {
    // No generar medallas hasta que el responsable cierre explícitamente la medallería.
    if (data.modalidadFinalizada !== true) return out;
    const groups = new Map();
    const valid = data.combates.filter(b => ['A','B'].includes(String(b.ganador||'').toUpperCase()) && b.competidorA?.nombre && b.competidorA?.escuelaCodigo && b.competidorB?.nombre && b.competidorB?.escuelaCodigo);
    for (const b of valid) {
      const groupKey = [String(b.sexo||'SIN_RAMA').trim().toUpperCase(), String(b.categoriaPeso||'PESO_SIN_DEFINIR').trim().toUpperCase()].join('|');
      if (!groups.has(groupKey)) groups.set(groupKey, new Map());
      const players = groups.get(groupKey);
      for (const side of ['A','B']) {
        const p = b[side==='A'?'competidorA':'competidorB'];
        const key = `${String(p.escuelaCodigo).toUpperCase()}|${String(p.nombre).trim().toUpperCase()}`;
        if (!players.has(key)) players.set(key, {nombre:p.nombre, escuelaCodigo:p.escuelaCodigo, sexo:b.sexo||'', categoriaPeso:b.categoriaPeso||'', ganados:0, perdidos:0, combates:0});
        const row=players.get(key); row.combates++; if(String(b.ganador).toUpperCase()===side) row.ganados++; else row.perdidos++;
      }
    }
    for (const [groupKey, players] of groups) {
      const ranked=[...players.values()].sort((a,b)=>b.ganados-a.ganados||a.perdidos-b.perdidos||a.nombre.localeCompare(b.nombre,'es'));
      ranked.forEach((p,i)=>out.push({...p,posicion:i<3?i+1:null,grupo:groupKey}));
    }
    return out;
  }
  if (d === 'Tiro Deportivo' && Array.isArray(data.participantes)) {
    const ordered=[...data.participantes].sort((a,b)=>Number(b.total||0)-Number(a.total||0)||Number(b.xCentros||0)-Number(a.xCentros||0));
    ordered.forEach((p,i)=>out.push({posicion:i+1,escuelaCodigo:p.escuelaCodigo,participanteId:null,nombre:p.nombre||'',resultado:p.total||0}));
    return out;
  }
  if (d === 'Orientación Militar' && Array.isArray(data.participantes)) {
    // La premiación es independiente por género, aunque los participantes estén
    // repartidos entre varias planillas de una misma competencia.
    const valid=data.participantes.filter(p=>String(p.estado||'FINAL').toUpperCase()!=='DESCALIFICADO' && (p.nombre||p.escuelaCodigo) && (p.tiempoDefinitivo||p.tiempoBruto));
    const groups=new Map();
    valid.forEach(p=>{const gender=String(p.genero||p.sexo||'').trim().toUpperCase(); if(!['MASCULINO','FEMENINO'].includes(gender)) return; if(!groups.has(gender)) groups.set(gender,[]); groups.get(gender).push(p);});
    for (const [genero,players] of groups) {
      players.sort((a,b)=>{const ta=orientationTimeMs(a.tiempoDefinitivo||a.tiempoBruto),tb=orientationTimeMs(b.tiempoDefinitivo||b.tiempoBruto);return ta-tb;});
      players.forEach((p,i)=>out.push({posicion:i<3?i+1:null,escuelaCodigo:p.escuelaCodigo,participanteId:p.participanteId||p.id||p.idChip||(p.dorsal!=null?`DORSAL-${p.dorsal}`:null),nombre:p.nombre||'',genero,sexo:genero,resultado:p.tiempoDefinitivo||p.tiempoBruto,tiempoDefinitivo:p.tiempoDefinitivo||p.tiempoBruto,estado:p.estado||'FINAL',puntos:Number(p.puntos||0)}));
    }
    return out;
  }
  if (['Fútbol','Baloncesto','Voleibol'].includes(d)) {
    // En colectivos, solo la FINAL define oro/plata y el partido por TERCER_PUESTO
    // define bronce. Los encuentros de clasificación/semifinal no generan medallas.
    const teams = Array.isArray(data.equipos) ? data.equipos.map(t=>t?.escuelaCodigo).filter(Boolean) : [];
    const winner = data.ganador || '';
    const loser = teams.find(school => school !== winner) || '';
    const currentPhase = String(phase || 'CLASIFICACION').toUpperCase();
    if (currentPhase === 'FINAL' && winner && loser) {
      out.push({posicion:1, escuelaCodigo:winner, participanteId:null, nombre:''});
      out.push({posicion:2, escuelaCodigo:loser, participanteId:null, nombre:''});
      return out;
    }
    if (currentPhase === 'TERCER_PUESTO' && winner) {
      out.push({posicion:3, escuelaCodigo:winner, participanteId:null, nombre:''});
      return out;
    }
    teams.forEach(school=>out.push({posicion:null, escuelaCodigo:school}));
    return out;
  }
  if (d === 'Tenis' && data?.tipo === 'TENIS' && ['Dobles','Dobles mixtos'].includes(String(data.modalidad||'')) && data.modalidadFinalizada === true) {
    const winner=String(data.escuelaGanadora || (data.ganadorLado==='A' ? data.parejaA?.escuelaCodigo : data.ganadorLado==='B' ? data.parejaB?.escuelaCodigo : '') || '').trim();
    const schools=[data.parejaA?.escuelaCodigo,data.parejaB?.escuelaCodigo].filter(Boolean);
    const loser=schools.find(s=>String(s).toUpperCase()!==winner.toUpperCase()) || '';
    if (winner && loser) {
      out.push({posicion:1,escuelaCodigo:winner,participanteId:null,nombre:''});
      out.push({posicion:2,escuelaCodigo:loser,participanteId:null,nombre:''});
    }
    return out;
  }
  if (d === 'Esgrima' && data?.tipo === 'ESGRIMA_EQUIPOS') {
    const llave=data.llave||{}, sf1=llave.semifinal1||{}, sf2=llave.semifinal2||{}, fin=llave.final||{}, third=llave.tercerPuesto||{};
    const teamMap=Object.fromEntries((data.equipos||[]).map(t=>[t.lado,t]));
    const schoolFor=side=>teamMap[side]?.escuelaCodigo||'';
    if (fin.ganador && fin.equipoA && fin.equipoB) {
      const winner=fin.ganador, loser=winner===fin.equipoA?fin.equipoB:fin.equipoA;
      if (schoolFor(winner)) out.push({posicion:1,escuelaCodigo:schoolFor(winner),participanteId:null,nombre:''});
      if (schoolFor(loser)) out.push({posicion:2,escuelaCodigo:schoolFor(loser),participanteId:null,nombre:''});
      if (third.ganador && third.equipoA && third.equipoB && schoolFor(third.ganador)) out.push({posicion:3,escuelaCodigo:schoolFor(third.ganador),participanteId:null,nombre:''});
    }
    return out;
  }
  if (d === 'Esgrima') {
    const ps=Array.isArray(data.participantes)?data.participantes:[];const map=Object.fromEntries(ps.map(p=>[p.id,p]));
    const fin=data.cuadro?.final||{},third=data.cuadro?.tercerPuesto||{},sf1=data.cuadro?.semifinal1||{},sf2=data.cuadro?.semifinal2||{};
    if(fin.ganador && fin.participanteA && fin.participanteB && sf1.ganador && sf2.ganador){
      const loser=fin.ganador===fin.participanteA?fin.participanteB:fin.participanteA;
      // Esgrima individual: los dos perdedores de semifinal reciben bronce.
      // No se utiliza el combate opcional por el tercer puesto para la medallería.
      const semifinalLosers=[sf1,sf2].map(b=>b.ganador===(b.participanteA)?b.participanteB:b.participanteA).filter(Boolean);
      const ranking=[{posicion:1,id:fin.ganador},{posicion:2,id:loser},...semifinalLosers.map(id=>({posicion:3,id}))];
      ranking.forEach(x=>{const p=map[x.id];if(p?.escuelaCodigo)out.push({posicion:x.posicion,escuelaCodigo:p.escuelaCodigo,participanteId:p.id,nombre:p.nombre||''});});return out;
    } return out;
  }
  if (d === 'Atletismo' && Array.isArray(data.participantes)) {
    const withFormat = data.participantes.map(p => ({ ...p, formatoMarca: p.formatoMarca || inferAthleticsFormat(p.marcaTiempo, data.modalidad) }));
    const positions = athleticsPositions(withFormat);
    withFormat.forEach((p, idx) => {
      if (!positions[idx] || !(p.nombre || p.escuelaCodigo)) return;
      out.push({ posicion: positions[idx], escuelaCodigo: p.escuelaCodigo, participanteId: p.participanteId || p.id || null, nombre: p.nombre || '', sexo: p.sexo || '', marca: p.marcaTiempo || '', formatoMarca: p.formatoMarca });
    });
    return out.sort((x, y) => x.posicion - y.posicion);
  }
  if (d === 'Natación' && Array.isArray(data.participantes)) {
    const positions = swimmingPositions(data.participantes);
    data.participantes.forEach((p, idx) => {
      if (!positions[idx] || !(p.nombre || p.escuelaCodigo)) return;
      out.push({ posicion: positions[idx], escuelaCodigo: p.escuelaCodigo, participanteId: p.participanteId || p.id || null, nombre: p.nombre || '', sexo: p.sexo || '', serie: p.serie || 1, tiempoFinal: p.tiempoFinal || '' });
    });
    return out.sort((x, y) => x.posicion - y.posicion);
  }
  if (Array.isArray(data.participantes)) {
    data.participantes.forEach(p=>{
      if (!(p.nombre||p.escuelaCodigo)) return;
      if (d === 'Orientación Militar' && String(p.estado || '').toUpperCase() === 'DESCALIFICADO') return;
      // Preserva un identificador de participante cuando exista. En Orientación
      // Militar se usa el chip o, como respaldo estable dentro de la prueba, el dorsal.
      const participanteId = p.participanteId || p.id || p.idChip ||
        (d === 'Orientación Militar' && p.dorsal != null ? `DORSAL-${p.dorsal}` : null);
      out.push({posicion:p.posicion||null,escuelaCodigo:p.escuelaCodigo,participanteId,nombre:p.nombre||'',
        ...(d === 'Pentatlón' ? {sexo:p.sexo||'', puntosPrueba:Number(p.puntosPrueba||0)} : {}),
        ...(d === 'Orientación Militar' ? {resultado:p.tiempoDefinitivo||p.tiempoBruto||'',tiempoDefinitivo:p.tiempoDefinitivo||p.tiempoBruto||'',estado:p.estado||'',puntos:p.puntos||0} : {})});
    });
  } else if (data.participante) {
    out.push({posicion:data.posicion||null,escuelaCodigo:data.participante.escuelaCodigo,nombre:data.participante.nombre});
  }
  return out;
}

function deriveMedals(classification, discipline = '', resultData = null) {
  const eligible=(classification||[]).filter(x=>[1,2,3].includes(Number(x.posicion)) && x.escuelaCodigo);
  if (discipline === 'Pentatlón') {
    // En Pentatlón se entrega como máximo una medalla por puesto dentro de cada rama
    // (masculina/femenina/mixta). Evita duplicar bronce cuando varias filas tienen Pos. 3.
    // Si el formulario incluye ambas ramas en un solo resultado, cada rama conserva su propio podio.
    const seen=new Set();
    const ordered=[...eligible].sort((a,b)=>Number(a.posicion)-Number(b.posicion)||Number(b.puntosPrueba||0)-Number(a.puntosPrueba||0)||String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
    return ordered.filter(x=>{
      const rama=String(x.sexo||'').trim().toUpperCase()||'SIN_RAMA';
      const key=`${rama}|${Number(x.posicion)}`;
      if(seen.has(key)) return false; seen.add(key); return true;
    }).map(x=>({tipo:['','ORO','PLATA','BRONCE'][Number(x.posicion)],escuelaCodigo:x.escuelaCodigo,participanteId:x.participanteId||null,nombre:x.nombre||'',sexo:x.sexo||'',posicion:Number(x.posicion)}));
  }
  return eligible.map(x=>({tipo:['','ORO','PLATA','BRONCE'][Number(x.posicion)],escuelaCodigo:x.escuelaCodigo,participanteId:x.participanteId||null,nombre:x.nombre||'',posicion:Number(x.posicion)}));
}

const PUNTOS_GENERALES_MEDALLAS = { ORO: 1000, PLATA: 100, BRONCE: 1 };
function deriveGeneralMedalPoints(medals) {
  return (medals || []).map(m => ({
    escuelaCodigo: m.escuelaCodigo,
    participanteId: m.participanteId || null,
    tipoMedalla: m.tipo,
    puntos: PUNTOS_GENERALES_MEDALLAS[m.tipo] || 0,
    concepto: `Puntos generales por medalla de ${String(m.tipo || '').toLowerCase()}`
  })).filter(x => x.escuelaCodigo && x.puntos > 0);
}


const PUNTOS_INDIVIDUALES={1:10,2:7,3:5};
const TABLA_PUNTOS_COLECTIVOS={
  'Fútbol':{victoria:3,empate:1,derrota:0},
  'Baloncesto':{victoria:3,empate:1,derrota:0},
  'Voleibol':{victoria3a0:5,victoria3a1:4,victoria3a2:3,derrota3a2:2,derrota3a1:1,derrota3a0:0}
};
function derivePoints(d,data,classification){
  // Escala de trabajo configurable. Sustituir por la tabla oficial JIE26 cuando sea confirmada.
  if(['Fútbol','Baloncesto','Voleibol'].includes(d)){
    const teams=data.equipos||[]; if(teams.length<2)return [];
    const winner=data.ganador; const tabla=TABLA_PUNTOS_COLECTIVOS[d];
    if(d==='Voleibol'){const aSets=Number(data.setsGanadosLocal||0),bSets=Number(data.setsGanadosVisitante||0);let a=0,b=0;if(aSets>bSets){a=bSets===0?5:bSets===1?4:3;b=bSets===2?2:bSets===1?1:0;}else if(bSets>aSets){b=aSets===0?5:aSets===1?4:3;a=aSets===2?2:aSets===1?1:0;}return [{escuelaCodigo:teams[0].escuelaCodigo,puntos:a,concepto:aSets>bSets?`Victoria ${aSets}-${bSets}`:`Derrota ${aSets}-${bSets}`},{escuelaCodigo:teams[1].escuelaCodigo,puntos:b,concepto:bSets>aSets?`Victoria ${bSets}-${aSets}`:`Derrota ${bSets}-${aSets}`}];}
    let a=0,b=0,ca='Derrota',cb='Derrota';
    if(winner==='A'||winner==='LOCAL'){a=tabla.victoria;b=tabla.derrota;ca='Victoria';}
    else if(winner==='B'||winner==='VISITANTE'){a=tabla.derrota;b=tabla.victoria;cb='Victoria';}
    else {a=tabla.empate;b=tabla.empate;ca='Empate';cb='Empate';}
    return [{escuelaCodigo:teams[0].escuelaCodigo,puntos:a,concepto:ca},{escuelaCodigo:teams[1].escuelaCodigo,puntos:b,concepto:cb}];
  }
  return (classification||[]).filter(x=>PUNTOS_INDIVIDUALES[Number(x.posicion)]!==undefined).map(x=>({escuelaCodigo:x.escuelaCodigo,participanteId:x.participanteId||null,posicion:Number(x.posicion),puntos:PUNTOS_INDIVIDUALES[Number(x.posicion)],concepto:`${Number(x.posicion)}° lugar`}));
}

async function initFormFirebase() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  // No consultar Firestore durante la inicialización del modal: una conexión lenta
  // no debe impedir que aparezca la pantalla de acceso. El catálogo se carga después,
  // cuando ya se haya autenticado el administrador y se necesite renderizar el formulario.
}

function localResults() { try{return JSON.parse(localStorage.getItem('enap_resultados_deportivos')||'[]')}catch{return []} }
function saveLocal(result, id=null) {
  const arr=localResults();
  if (id) { const i=arr.findIndex(x=>x.id===id); if(i<0) throw new Error('No se encontró el resultado local que se intenta corregir.'); arr[i]={...arr[i],...result,id}; }
  else arr.push({...result,id:`local-${Date.now()}`});
  localStorage.setItem('enap_resultados_deportivos',JSON.stringify(arr));
  window.dispatchEvent(new CustomEvent('resultadosLocalesActualizados'));
}
function getCurrentResults() { return $('local-test-mode')?.checked ? localResults() : firebaseResultsCache; }
function compKey(x) { return String(x?.competenciaId || x?.competenciaCodigo || x?.codigo || x?.idSugerido || x?.id || '').trim(); }
function sameCompetition(a,b) { const aid=String(a?.id||a?.competenciaId||''); const bid=String(b?.competenciaId||b?.id||''); const ac=String(first(a,['codigo','idSugerido','competenciaCodigo'])||''); const bc=String(first(b,['competenciaCodigo','codigo','idSugerido'])||''); return (!!aid && aid===bid) || (!!ac && ac===bc); }
function isCompetitionSaved(c, results) { const key=compKey(c); return !!key && results.some(r => compKey(r)===key || String(r?.competenciaId||'')===String(c.id||'')); }
async function loadExistingResults(force=false) {
  if ($('local-test-mode')?.checked) return localResults();
  if (!db || !auth?.currentUser) return firebaseResultsCache;
  if (resultCacheLoaded && !force) return firebaseResultsCache;
  const snap=await getDocs(collection(db,'Resultados'));
  firebaseResultsCache=snap.docs.map(d=>({id:d.id,...d.data(),_source:'firebase'}));
  resultCacheLoaded=true;
  return firebaseResultsCache;
}
function resultDate(r) { const v=r?.actualizadoEn || r?.registradoEn || r?.creadoEn; if(typeof v==='string') return v; if(v?.toDate) return v.toDate().toISOString(); return ''; }
function renderSavedResultsManager() {
  const results=getCurrentResults().slice().sort((a,b)=>resultDate(b).localeCompare(resultDate(a)));
  shell(`<div class="flex items-center justify-between border-b border-slate-700 pb-4"><div><h3 class="text-xl font-bold text-white">Resultados registrados</h3><p class="text-sm text-slate-400">Seleccione un resultado para corregirlo. La edición actualiza el registro existente, no crea uno nuevo.</p></div><button id="back-results-form" class="form-btn secondary">Volver</button></div><div class="text-xs text-amber-200">Fuente: ${$('local-test-mode')?.checked?'modo prueba local (este navegador)':'Firebase · colección Resultados'}</div><div class="space-y-3">${results.length?results.map(r=>`<article class="form-section flex flex-col md:flex-row md:items-center md:justify-between gap-3"><div><div class="font-bold text-white">${esc(r.competenciaDescripcion||r.competenciaCodigo||'Competencia')}</div><div class="text-sm text-slate-300">${esc(r.disciplinaNombre||'')} · Jornada ${esc(r.jornadaNombre||r.jornadaCodigo||'—')}</div><div class="text-xs text-slate-400">${esc(r.estadoCompetenciaNombre||r.estadoCompetencia||r.estado||'')} · ${esc(resultDate(r)||'Sin fecha de registro')}</div></div><button type="button" class="form-btn primary edit-saved-result" data-id="${esc(r.id||'')}" data-source="${$('local-test-mode')?.checked?'local':'firebase'}">Editar resultado</button></article>`).join(''):'<div class="form-summary">No hay resultados registrados en esta fuente.</div>'}</div>`);
  $('back-results-form').onclick=()=>{ renderBaseForm(); $('admin-session-badge').textContent=`Administrador: ${currentAdminProfile.nombre}`; };
  document.querySelectorAll('.edit-saved-result').forEach(btn=>btn.onclick=()=>beginEditResult(btn.dataset.id,btn.dataset.source));
}
async function beginEditResult(id, source) {
  let result;
  if(source==='local') result=localResults().find(r=>r.id===id);
  else { await loadExistingResults(true); result=firebaseResultsCache.find(r=>r.id===id); }
  if(!result) { alert('No se encontró el resultado seleccionado. Actualice la lista e intente nuevamente.'); return; }
  editingResultId=id; editingResultSource=source; editingResultData=result;
  renderBaseForm();
  $('local-test-mode').checked=source==='local'; $('local-test-mode').disabled=true;
  $('admin-session-badge').textContent=`Administrador: ${currentAdminProfile.nombre} · Editando resultado existente`;
  const c=competencias.find(x=>sameCompetition(x,result));
  if(!c) { alert('No se encontró la competencia en el catálogo actual; no se modificó ningún dato.'); editingResultId=null; editingResultSource=null; editingResultData=null; return; }
  $('digital-discipline').value=disciplineName(c); refreshCompetitions();
  $('digital-jornada-select').value=jornadaValue(c)||'__SIN_JORNADA__'; refreshCompetitionOptionsByJornada();
  $('digital-competition').innerHTML += `<option value="${esc(c.id)}">${esc(first(c,['codigo','idSugerido','id']))} · ${esc(first(c,['descripcion','nombre','Nombre'])||'Competencia')} (editando)</option>`;
  $('digital-competition').value=c.id; loadCompetitionDetails();
  hydrateResultForm(result);
  $('digital-status').value=result.estado||'REGISTRADO'; $('digital-responsible').value=result.responsable||''; $('digital-observations').value=result.observaciones||'';
  $('digital-form-status').textContent='Modo edición: al guardar se actualizará el resultado seleccionado.';
  $('digital-result-form').querySelector('button[type=submit]').innerHTML='<i class="fa-solid fa-floppy-disk mr-2"></i>Guardar corrección';
}
function setValue(id,value) { const el=$(id); if(el && value!==undefined && value!==null) el.value=String(value); }
function hydrateResultForm(r) {
  const d=r.disciplinaNombre, x=r.resultadoDeportivo||{};
  setValue('competition-status',r.estadoCompetencia||'COMPETENCIA_FINALIZADA'); setValue('collective-phase',r.faseCompetencia||'CLASIFICACION');
  if(d==='Taekwondo') {
    const list=$('tk-bouts-list'); const bouts=Array.isArray(x.combates)?x.combates:[];
    const poom=x.planillasPoomsae||[];const pl=$('tk-poom-list');if(pl&&poom.length){pl.innerHTML=poom.map((_,i)=>taekwondoPoomsaeCard(i)).join('');poom.forEach((q,i)=>{const p=`tk-p-${i}`;setValue(`${p}-poomsae`,q.poomsae);setValue(`${p}-a-name`,q.competidorA?.nombre);setValue(`${p}-a-school`,q.competidorA?.escuelaCodigo);setValue(`${p}-score-a`,q.puntajeTotalA??q.competidorA?.puntajeTotal);setValue(`${p}-b-name`,q.competidorB?.nombre);setValue(`${p}-b-school`,q.competidorB?.escuelaCodigo);setValue(`${p}-score-b`,q.puntajeTotalB??q.competidorB?.puntajeTotal);setValue(`${p}-winner`,q.ganador);setValue(`${p}-notes`,q.observaciones);});}
    if(!list||!bouts.length) return;
    list.innerHTML=bouts.map((_,i)=>taekwondoBoutCard(i)).join('');
    bouts.forEach((b,i)=>{ const p=`tk-${i}`; setValue(`${p}-sex`,b.sexo); const sexEl=$(`${p}-sex`); if(sexEl) sexEl.dispatchEvent(new Event('change',{bubbles:true})); setValue(`${p}-weight`,b.categoriaPeso); setValue(`${p}-a-name`,b.competidorA?.nombre); setValue(`${p}-a-school`,b.competidorA?.escuelaCodigo); setValue(`${p}-b-name`,b.competidorB?.nombre); setValue(`${p}-b-school`,b.competidorB?.escuelaCodigo); setValue(`${p}-final`,b.resultadoFinal); setValue(`${p}-winner`,b.ganador); setValue(`${p}-end`,b.formaFinalizacion); setValue(`${p}-notes`,b.observaciones); (b.rounds||[]).forEach(q=>{setValue(`${p}-${q.round}-a`,q.puntosA);setValue(`${p}-${q.round}-b`,q.puntosB);setValue(`${p}-${q.round}-ga`,q.gamJeomA);setValue(`${p}-${q.round}-gb`,q.gamJeomB);}); });
  } else if(d==='Tiro Deportivo') {
    const list=$('sh-planillas-list');const sheets=Array.isArray(x.planillas)?x.planillas:[{modalidad:x.modalidad,arma:x.arma,distancia:x.distancia,posicion:x.posicion,participantes:x.participantes||[]}];
    if(!list)return;list.innerHTML=sheets.map((_,i)=>shootingPlanillaCard(i)).join('');
    sheets.forEach((sheet,i)=>{const p=`sh-${i}`;setValue(`${p}-mode`,sheet.modalidad);setValue(`${p}-weapon`,sheet.arma);setValue(`${p}-distance`,sheet.distancia);setValue(`${p}-position`,sheet.posicion);(sheet.participantes||[]).forEach((q,j)=>{const n=Number(q.dorsal)||j+1; if(n<1||n>12)return;setValue(`${p}-${n}-dorsal`,q.dorsal);setValue(`${p}-${n}-name`,q.nombre);setValue(`${p}-${n}-school`,q.escuelaCodigo);setValue(`${p}-${n}-sex`,q.sexo);(q.series||[]).forEach(r=>setValue(`${p}-${n}-s${r.serie}`,r.puntaje));(q.seriesTiroRapido||[]).forEach(r=>setValue(`${p}-${n}-r${r.serie}`,r.puntaje));setValue(`${p}-${n}-total`,q.total);setValue(`${p}-${n}-x`,q.xCentros);setValue(`${p}-${n}-time`,q.tiempoTiroRapido);setValue(`${p}-${n}-obs`,q.observaciones);});});
  } else {
    // Rehidrata los controles que comparten identificadores con la estructura de resultado.
    const map={
      'Pentatlón':()=>{(x.participantes||[]).forEach((p,i)=>{const n=i+1;setValue(`p-${n}-name`,p.nombre);setValue(`p-${n}-team`,p.nombre);setValue(`p-${n}-school`,p.escuelaCodigo);setValue(`p-${n}-sex`,p.sexo);setValue(`p-${n}-result`,p.resultado??p.tiempoResultado??p.distanciaResultado);setValue(`p-${n}-points`,p.puntosPrueba);setValue(`p-${n}-position`,p.posicion);setValue(`p-${n}-obs`,p.observaciones);});},
      'Fútbol':()=>{setValue('team-local',x.equipos?.[0]?.escuelaCodigo);setValue('team-visitor',x.equipos?.[1]?.escuelaCodigo);setValue('f-1t-l',x.marcador?.primerTiempo?.local);setValue('f-1t-v',x.marcador?.primerTiempo?.visitante);setValue('f-2t-l',x.marcador?.segundoTiempo?.local);setValue('f-2t-v',x.marcador?.segundoTiempo?.visitante);setValue('f-te-l',x.marcador?.tiempoExtra?.local);setValue('f-te-v',x.marcador?.tiempoExtra?.visitante);setValue('f-pen-l',x.marcador?.penaltis?.local);setValue('f-pen-v',x.marcador?.penaltis?.visitante);setValue('f-yellow-local',x.tarjetas?.amarillas?.local??x.tarjetasAmarillas?.local??0);setValue('f-yellow-visitor',x.tarjetas?.amarillas?.visitante??x.tarjetasAmarillas?.visitante??0);setValue('f-red-local',x.tarjetas?.rojas?.local??x.tarjetasRojas?.local??0);setValue('f-red-visitor',x.tarjetas?.rojas?.visitante??x.tarjetasRojas?.visitante??0);setValue('f-winner',x.ganador);setValue('f-incidents',x.incidencias);},
      'Baloncesto':()=>{setValue('team-local',x.equipos?.[0]?.escuelaCodigo);setValue('team-visitor',x.equipos?.[1]?.escuelaCodigo);setValue('b-final-l',x.marcador?.local ?? (x.periodos||[]).reduce((a,q)=>a+Number(q.local||0),0));setValue('b-final-v',x.marcador?.visitante ?? (x.periodos||[]).reduce((a,q)=>a+Number(q.visitante||0),0));setValue('b-notes',x.observaciones);},
      'Voleibol':()=>{setValue('team-local',x.equipos?.[0]?.escuelaCodigo);setValue('team-visitor',x.equipos?.[1]?.escuelaCodigo);(x.sets||[]).forEach(q=>{setValue(`v-${q.set}-l`,q.local);setValue(`v-${q.set}-v`,q.visitante)});setValue('v-sets-l',x.setsGanadosLocal);setValue('v-sets-v',x.setsGanadosVisitante);setValue('v-winner',x.ganador);},
      'Natación':()=>{setValue('sw-event',x.prueba);setValue('sw-style',x.estilo);setValue('sw-phase',x.fase);(x.participantes||[]).forEach((p,i)=>{const n=i+1;setValue(`sw-${n}-series`,p.serie||1);setValue(`sw-${n}-lane`,p.carril);setValue(`sw-${n}-grade`,p.grado||p.licencia);setValue(`sw-${n}-name`,p.nombre);setValue(`sw-${n}-school`,p.escuelaCodigo);setValue(`sw-${n}-sex`,p.sexo);setValue(`sw-${n}-final`,p.tiempoFinal);setValue(`sw-${n}-status`,String(p.estado||'FINAL').toUpperCase()==='FINAL'?'FINAL':'DESCALIFICADO');});const pos=swimmingPositions(x.participantes||[]);(x.participantes||[]).forEach((p,i)=>setValue(`sw-${i+1}-pos`,pos[i]??''));},
      'Taekwondo':()=>{if($('tk-modality-finalized'))$('tk-modality-finalized').checked=rd.modalidadFinalizada===true;},
      'Tenis':()=>{setValue('ten-mode',x.modalidad);setValue('ten-round',x.ronda||x.faseCompetencia||'CUADROS');setValue('ten-a',x.jugadorA?.nombre||x.parejaA?.jugadores?.[0]?.nombre);setValue('ten-a-school',x.jugadorA?.escuelaCodigo||x.parejaA?.escuelaCodigo);setValue('ten-a2',x.parejaA?.jugadores?.[1]?.nombre||x.jugadores?.find(j=>j.lado==='A'&&j.nombre!==x.jugadorA?.nombre)?.nombre);setValue('ten-b',x.jugadorB?.nombre||x.parejaB?.jugadores?.[0]?.nombre);setValue('ten-b-school',x.jugadorB?.escuelaCodigo||x.parejaB?.escuelaCodigo);setValue('ten-b2',x.parejaB?.jugadores?.[1]?.nombre||x.jugadores?.find(j=>j.lado==='B'&&j.nombre!==x.jugadorB?.nombre)?.nombre);$('ten-mode')?.dispatchEvent(new Event('change'));(x.sets||[]).forEach(q=>{setValue(`ten-${q.set}-a`,q.gamesA);setValue(`ten-${q.set}-b`,q.gamesB)});setValue('ten-aces-a',x.estadisticas?.acesA);setValue('ten-aces-b',x.estadisticas?.acesB);setValue('ten-df-a',x.estadisticas?.dobleFaltaA);setValue('ten-df-b',x.estadisticas?.dobleFaltaB);if($('ten-modality-finalized'))$('ten-modality-finalized').checked=x.modalidadFinalizada===true;},
      'Atletismo':()=>{setValue('at-mode',x.modalidad);setValue('at-event',x.prueba);setValue('at-phase',x.fase);setValue('at-heat',x.serie);(x.participantes||[]).forEach((p,i)=>{const n=i+1;const fmt=p.formatoMarca||inferAthleticsFormat(p.marcaTiempo,x.modalidad);setValue(`at-${n}-lane`,p.carrilDorsal);setValue(`at-${n}-name`,p.nombre);setValue(`at-${n}-school`,p.escuelaCodigo);setValue(`at-${n}-sex`,p.sexo);setValue(`at-${n}-format`,fmt);setValue(`at-${n}-mark`,p.marcaTiempo);setValue(`at-${n}-points`,p.puntos);setValue(`at-${n}-status`,p.estado||'FINAL');const mk=$(`at-${n}-mark`);if(mk)mk.placeholder=({'SS:MMM':'Ej. 10:250','MM:SS:MMM':'Ej. 1:05:200','METROS':'Ej. 7.85'})[fmt]||'';});},
      'Orientación Militar':()=>{const list=$('or-planillas-list');const ps=Array.isArray(x.participantes)?x.participantes:[];const count=Math.max(1,Number(x.planillas||1),...ps.map(p=>Number(p.planilla||1)));list.innerHTML=Array.from({length:count},(_,i)=>orienteeringPlanilla(i)).join('');ps.forEach((p,idx)=>{const plan=Math.max(0,Number(p.planilla||1)-1);const rowIdx=ps.slice(0,idx+1).filter(q=>Number(q.planilla||1)===plan+1).length;const prefix=`or-${plan}-${rowIdx}`;setValue(`${prefix}-position`,p.posicion);setValue(`${prefix}-dorsal`,p.dorsal);setValue(`${prefix}-chip-count`,p.numeroChips);setValue(`${prefix}-grado`,p.grado);setValue(`${prefix}-name`,p.nombre);setValue(`${prefix}-school`,p.escuelaCodigo);setValue(`${prefix}-chip`,p.idChip);setValue(`${prefix}-sex`,p.genero||p.sexo);setValue(`${prefix}-start`,p.horaSalida);setValue(`${prefix}-arrival`,p.horaLlegada);setValue(`${prefix}-gross`,p.tiempoBruto||p.tiempoCarrera);setValue(`${prefix}-errors`,p.erroresTotal);setValue(`${prefix}-final`,p.tiempoDefinitivo);setValue(`${prefix}-points`,p.puntos);setValue(`${prefix}-status`,p.estado||'FINAL');setValue(`${prefix}-obs`,p.observaciones);});}
    };
    map[d]?.();
  }
}


function sanitizeForFirestore(value) {
  if (Array.isArray(value)) return value.map(sanitizeForFirestore);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {};
    Object.entries(value).forEach(([key, val]) => {
      if (val !== undefined) out[key] = sanitizeForFirestore(val);
    });
    return out;
  }
  return value;
}

async function requireActiveAdmin() {
  if (!db || !auth) await initFormFirebase();
  const user = auth?.currentUser;
  if (!user || user.isAnonymous) {
    throw new Error('La sesión administrativa no está activa. Cierre el formulario e ingrese nuevamente con el usuario administrador.');
  }
  const adminSnap = await getDoc(doc(db, 'Administradores', user.uid));
  if (!adminSnap.exists() || adminSnap.data()?.activo !== true) {
    throw new Error('El usuario autenticado no está autorizado como administrador activo.');
  }
  const adminData = adminSnap.data() || {};
  currentAdminProfile = {
    uid: user.uid,
    nombre: first(adminData, ['nombre','nombreCompleto','nombres','displayName']) || user.displayName || 'Administrador'
  };
  return { user, adminData };
}

function saveErrorMessage(error) {
  const code = error?.code || '';
  if (code === 'permission-denied' || code === 'PERMISSION_DENIED') {
    return 'Firebase rechazó la escritura. Verifique que la cuenta esté en Administradores/{UID} con activo = true y que las reglas de Firestore permitan escribir en Resultados.';
  }
  if (code === 'unavailable') return 'Firebase no está disponible en este momento. Verifique la conexión a Internet e inténtelo nuevamente.';
  if (code === 'failed-precondition') return 'Firebase indicó una condición previa no cumplida. Revise la configuración de Firestore.';
  if (String(error?.message || '').includes('Unsupported field value')) {
    return 'El resultado contiene un dato que Firebase no puede guardar. El sistema intentó limpiar valores indefinidos; revise los campos diligenciados.';
  }
  return error?.message || 'No fue posible guardar el resultado.';
}

async function saveResult(event) {
  event.preventDefault();
  const status=$('digital-form-status');
  const d=disciplineName(selectedCompetition);
  if(!selectedCompetition){status.textContent='Seleccione una competencia.';return;}
  const statusForValidation = getCompetitionStatus();
  if (statusForValidation === 'DQ_PARTICIPANTE') {
    const participantName = val('dq-participant-name').trim();
    const participantSchool = val('dq-participant-school');
    if (!participantName || !participantSchool) {
      status.textContent = 'Para registrar una descalificación, indique el nombre completo del participante y la escuela a la que pertenece.';
      return;
    }
  }
  if (d === 'Taekwondo') {
    const cards=[...document.querySelectorAll('#tk-bouts-list .tk-bout-card')];
    if (!cards.length && !$('tk-poom-list')) { status.textContent='Agregue al menos un combate.'; return; }
    for (let i=0;i<cards.length;i++) {
      const p=`tk-${i}`;
      const a=val(`${p}-a-name`).trim(), b=val(`${p}-b-name`).trim();
      const sa=val(`${p}-a-school`), sb=val(`${p}-b-school`), weight=val(`${p}-weight`), winner=val(`${p}-winner`);
      if (!a || !b || !sa || !sb || !weight || !winner) { status.textContent=`Complete competidores, escuelas, peso y ganador del combate ${i+1}.`; return; }
      if (a.toLowerCase()===b.toLowerCase() && sa===sb) { status.textContent=`El combate ${i+1} no puede enfrentar al mismo participante consigo mismo.`; return; }
    }
  }
  if(d==='Taekwondo'){const cards=[...document.querySelectorAll('#tk-poom-list .tk-poom-card')];for(let i=0;i<cards.length;i++){const p=`tk-p-${i}`;const required=[`${p}-poomsae`,`${p}-a-name`,`${p}-a-school`,`${p}-score-a`,`${p}-b-name`,`${p}-b-school`,`${p}-score-b`];if(required.some(id=>$(id)?.value===undefined||$(id)?.value.trim()==='')){status.textContent=`Complete Poomsae, competidores, escuelas y puntajes totales de la planilla ${i+1}.`;return;}}}
  if (d === 'Tenis') {
    const doubles=['Dobles','Dobles mixtos'].includes(val('ten-mode'));
    const a=val('ten-a').trim(), b=val('ten-b').trim(), sa=val('ten-a-school'), sb=val('ten-b-school');
    if(!a||!b||!sa||!sb){status.textContent='Complete los nombres y las escuelas de ambas partes del encuentro de tenis.';return;}
    if(sa===sb){status.textContent='Las dos parejas/jugadores deben representar escuelas diferentes.';return;}
    if(doubles && (!val('ten-a2').trim()||!val('ten-b2').trim())){status.textContent='En dobles debe registrar los cuatro jugadores: dos por cada escuela.';return;}
    if(doubles && val('ten-a2').trim().toLowerCase()===a.toLowerCase()){status.textContent='La pareja A no puede tener el mismo jugador registrado dos veces.';return;}
    if(doubles && val('ten-b2').trim().toLowerCase()===b.toLowerCase()){status.textContent='La pareja B no puede tener el mismo jugador registrado dos veces.';return;}
    const setsIngresados=[1,2,3].map(n=>({a:val(`ten-${n}-a`),b:val(`ten-${n}-b`)}));
    const setsA=setsIngresados.filter(x=>x.a!==''&&x.b!==''&&Number(x.a)>Number(x.b)).length;
    const setsB=setsIngresados.filter(x=>x.a!==''&&x.b!==''&&Number(x.b)>Number(x.a)).length;
    if(setsA<2&&setsB<2){status.textContent='Registre un marcador que defina el partido: la escuela ganadora se calculará automáticamente al completar los sets necesarios (mejor de tres).';return;}
    if(!['CUADROS','SEMIFINAL','FINAL'].includes(val('ten-round'))){status.textContent='Seleccione la ronda del encuentro.';return;}
  }
  if(d==='Esgrima' && val('e-modality')==='EQUIPOS'){
    if(!teamBracketComplete()){status.textContent='No se puede guardar la competencia: complete las dos semifinales y la final con marcadores válidos y ganadores definidos.';return;}
    for(const side of ['a','b','c','d']){if(!val(`e-team-${side}-school`)){status.textContent='Seleccione la escuela correspondiente a los cuatro equipos.';return;}}
  }
  if(d==='Esgrima' && val('e-modality')!=='EQUIPOS'){
    const missing=Array.from({length:16},(_,i)=>`P${i+1}`).filter(id=>!val(`e-${id.toLowerCase()}-name`).trim()||!val(`e-${id.toLowerCase()}-school`));
    if(missing.length){status.textContent=`Complete nombre y escuela de los 16 tiradores. Pendientes: ${missing.join(', ')}.`;return;}
    if(!IND_FENCING_BOUTS.slice(0,15).every(p=>indBoutWinner(p))){status.textContent='No se puede guardar la competencia: complete los resultados desde octavos hasta la final. El avance de cada ronda depende del ganador seleccionado.';return;}
  }
  if (d === 'Tenis') {
    const modalidad=val('ten-mode'), dobles=['Dobles','Dobles mixtos'].includes(modalidad);
    const required=[['ten-a','Jugador A'],['ten-a-school','Escuela A'],['ten-b','Jugador B'],['ten-b-school','Escuela B']];
    if(dobles) required.push(['ten-a2','Segundo jugador de pareja A'],['ten-b2','Segundo jugador de pareja B']);
    const missing=required.filter(([id])=>!val(id).trim());
    if(missing.length){status.textContent=`Complete los datos obligatorios de tenis: ${missing.map(x=>x[1]).join(', ')}.`;return;}
    if(val('ten-a-school')===val('ten-b-school')){status.textContent='Seleccione dos escuelas diferentes para el encuentro.';return;}
    const entered=[1,2,3].map(n=>({a:num(`ten-${n}-a`),b:num(`ten-${n}-b`)})).filter(x=>x.a>0||x.b>0);
    if(entered.some(x=>x.a<=0||x.b<=0||x.a===x.b)){status.textContent='Cada set registrado debe tener games para ambos lados y un ganador; no se aceptan sets empatados ni parciales.';return;}
    const wonA=entered.filter(x=>x.a>x.b).length, wonB=entered.filter(x=>x.b>x.a).length;
    if(Math.max(wonA,wonB)<2){status.textContent='El marcador aún no define el partido. Registre los sets necesarios para que una escuela gane dos sets.';return;}
    if(wonA>=2&&wonB>=2){status.textContent='El marcador contiene una combinación de sets no válida: ambos lados aparecen con dos sets ganados.';return;}
    if($('ten-modality-finalized')?.checked && String(val('ten-round')).toUpperCase()!=='FINAL'){status.textContent='Para cerrar la modalidad y calcular el podio, el encuentro actual debe ser la FINAL. Registre y guarde primero todos los partidos previos.';return;}
  }
  if (d === 'Natación') {
    for (let i=1;i<=10;i++) {
      if (!val(`sw-${i}-name`).trim()) continue;
      if (!val(`sw-${i}-school`)) { status.textContent=`Seleccione la escuela del participante ${i}.`; return; }
      if ((val(`sw-${i}-status`)||'FINAL')==='FINAL' && swimmingTimeMs(val(`sw-${i}-final`))===null) { status.textContent=`Registre un tiempo final válido (MM:SS.mmm) para el participante ${i} o márquelo como DESCALIFICADO.`; return; }
    }
  }
  if (d === 'Atletismo') {
    const kinds = new Set();
    for (let i=1;i<=12;i++) {
      if (!val(`at-${i}-name`).trim()) continue;
      if (!val(`at-${i}-school`)) { status.textContent=`Seleccione la escuela del participante ${i}.`; return; }
      if (ATHLETICS_STATUS_NO_RANK.includes(val(`at-${i}-status`)||'FINAL')) continue;
      const fmt = val(`at-${i}-format`)||'SS:MMM';
      const parsed = athleticsMarkValue(val(`at-${i}-mark`), fmt);
      if (!parsed) { status.textContent=`La marca del participante ${i} no tiene el formato ${fmt==='METROS'?'MTS (metros, ej. 7.85)':fmt+(fmt==='SS:MMM'?' (ej. 10:250)':' (ej. 1:05:200)')}. Corríjala o cambie su estado.`; return; }
      kinds.add(parsed.kind);
    }
    if (kinds.size > 1) { status.textContent='No se pueden mezclar tiempos y metros en una misma planilla. Registre cada prueba por separado.'; return; }
  }
  const resultadoDeportivo=buildResultData(d);
  const faseActual = d==='Tenis' ? (resultadoDeportivo.ronda || 'CUADROS') : COLECTIVOS.has(d) ? ($('collective-phase')?.value || 'CLASIFICACION') : 'FINAL';
  const clasificacion=deriveClassification(d,resultadoDeportivo,faseActual);
  const medallas=deriveMedals(clasificacion,d,resultadoDeportivo);
  const puntuacionClasificacion=derivePoints(d,resultadoDeportivo,clasificacion);
  const puntosGeneralesMedallas=deriveGeneralMedalPoints(medallas);
  const result={
    competenciaId:selectedCompetition.id || first(selectedCompetition,['idSugerido','competenciaId']),
    competenciaCodigo:first(selectedCompetition,['codigo','idSugerido','id']),
    competenciaDescripcion:first(selectedCompetition,['descripcion','nombre','Nombre','competencia']),
    disciplinaCodigo:first(selectedCompetition,['disciplinaCodigo','DisciplinaCodigo']) || disciplineCode(d),
    disciplinaNombre:d,
    categoriaCodigo:d==='Esgrima' && (val('e-modality')==='EQUIPOS'||fencingModeFromCompetition()==='EQUIPOS') ? 'ESG_EQUIPOS' : first(selectedCompetition,['categoriaCodigo','categoria']),
    modalidadCodigo:d==='Esgrima' ? ((val('e-modality')==='EQUIPOS'||fencingModeFromCompetition()==='EQUIPOS')?'EQUIPOS':'INDIVIDUAL') : d==='Tenis' ? val('ten-mode') : first(selectedCompetition,['modalidadCodigo','modalidad','Modalidad']),
    tipoResultado:d==='Esgrima' && (val('e-modality')==='EQUIPOS'||fencingModeFromCompetition()==='EQUIPOS') ? 'COLECTIVO' : (d==='Tenis' && ['Dobles','Dobles mixtos'].includes(val('ten-mode')) ? 'COLECTIVO' : (COLECTIVOS.has(d)?'COLECTIVO':'INDIVIDUAL')),
    faseCompetencia:d==='Esgrima' ? 'ELIMINACION_DIRECTA' : d==='Tenis' ? (resultadoDeportivo.ronda || 'CUADROS') : COLECTIVOS.has(d) ? ($('collective-phase')?.value || 'CLASIFICACION') : 'FINAL',
    defineMedalleria:d==='Esgrima' ? (val('e-modality')==='EQUIPOS'||fencingModeFromCompetition()==='EQUIPOS' ? teamBracketComplete() : !!indBoutWinner('e-final')) : COLECTIVOS.has(d) ? ($('collective-phase')?.value === 'FINAL') : d==='Tenis' ? ($('ten-modality-finalized')?.checked===true) : d==='Taekwondo' ? ($('tk-modality-finalized')?.checked===true) : true,
    // modalidadFinalizada solo se marca desde el control explícito de Tenis.
    // En pruebas individuales, finalizar una competencia no implica cerrar toda la modalidad.
    modalidadFinalizada:d==='Tenis' ? ($('ten-modality-finalized')?.checked===true) : d==='Taekwondo' ? ($('tk-modality-finalized')?.checked===true) : false,
    fecha:first(selectedCompetition,['fecha','Fecha','date']),
    hora:first(selectedCompetition,['hora','Hora','time']),
    jornadaCodigo:jornadaValue(selectedCompetition),
    jornadaNombre:jornadaValue(selectedCompetition),
    escenarioCodigo:first(selectedCompetition,['escenarioCodigo','escenario','escenarioNombre']),
    estado:$('digital-status').value,
    estadoCompetencia:getCompetitionStatus(),
    estadoCompetenciaNombre:competitionStatusLabel(getCompetitionStatus()),
    participanteDescalificado: getCompetitionStatus()==='DQ_PARTICIPANTE' ? {nombre:val('dq-participant-name').trim(), escuelaCodigo:val('dq-participant-school')} : null,
    resultadoDeportivo,
    clasificacion,
    // Resultado técnico está en resultadoDeportivo; puntos de clasificación son específicos de cada disciplina.
    puntuacionClasificacion,
    puntuacionJIE26:puntuacionClasificacion, // compatibilidad con resultados existentes
    medallas,
    puntosGeneralesMedallas,
    observaciones:$('digital-observations').value,
    responsable:$('digital-responsible').value,
    registradoEn:new Date().toISOString(),
    actualizadoEn:new Date().toISOString(),
    esquemaVersion:'JIE26-RESULTADOS-v1'
  };
  try {
    const local=$('local-test-mode').checked;
    if(local) {
      saveLocal({...result,registradoPor:auth?.currentUser?.uid||'',registradoPorNombre:currentAdminProfile.nombre||'Administrador', ...(editingResultId?{actualizadoPor:currentAdminProfile.uid||''}:{})}, editingResultId && editingResultSource==='local' ? editingResultId : null);
      status.className='text-sm text-emerald-400';
      status.textContent='Resultado guardado en modo prueba local.';
    } else {
      status.className='text-sm text-slate-300';
      status.textContent='Validando sesión administrativa y guardando en Firebase...';
      const { user } = await requireActiveAdmin();
      // Primero limpiamos los datos ordinarios. Los FieldValue de Firestore
      // (serverTimestamp) se agregan DESPUÉS para que sanitizeForFirestore
      // no los convierta en mapas comunes como {_methodName: 'serverTimestamp'}.
      const payload = sanitizeForFirestore({
        ...result,
        registradoPor: editingResultId && editingResultSource==='firebase' ? (editingResultData?.registradoPor||user.uid) : user.uid,
        registradoPorNombre: editingResultData?.registradoPorNombre || currentAdminProfile.nombre,
        actualizadoPor: user.uid
      });
      if (editingResultId && editingResultSource==='firebase') {
        payload.actualizadoEn = serverTimestamp();
      } else {
        payload.creadoEn = serverTimestamp();
        payload.actualizadoEn = serverTimestamp();
      }
      let refId;
      if(editingResultId && editingResultSource==='firebase') { await updateDoc(doc(db,'Resultados',editingResultId),payload); refId=editingResultId; }
      else { const ref=await addDoc(collection(db,'Resultados'),payload); refId=ref.id; }
      result.id=refId;
      firebaseResultsCache=firebaseResultsCache.filter(r=>r.id!==refId); firebaseResultsCache.push({...result,id:refId}); resultCacheLoaded=true;
      window.dispatchEvent(new CustomEvent('resultadoFirebaseGuardado'));
      status.className='text-sm text-emerald-400';
      status.textContent=`${editingResultId?'Corrección actualizada':'Resultado guardado'} correctamente en Firebase. ID: ${refId}`;
    }
    if(d==='Esgrima') { if(val('e-modality')==='EQUIPOS') localStorage.removeItem(teamDraftKey()); else localStorage.removeItem(individualDraftKey()); }
    editingResultId=null; editingResultSource=null; editingResultData=null;
    await loadExistingResults(true).catch(e=>console.warn('No se pudo actualizar la lista de resultados',e));
    setTimeout(()=>window.closeModal('admin-modal'),900);
  } catch(error) {
    console.error('Error guardando Resultado:', error);
    status.className='text-sm text-rose-400';
    status.textContent=`No se pudo guardar: ${saveErrorMessage(error)}`;
  }
}

window.openDigitalResultForm=async function(){
  const modal = $('admin-modal');
  modal?.classList.remove('hidden');
  // Mostrar una interfaz de inmediato; la inicialización de Firebase no debe dejar
  // el modal vacío mientras espera red o lecturas remotas.
  renderAdminLogin('Preparando acceso seguro…');
  try {
    await initFormFirebase();
    if (auth?.currentUser && !auth.currentUser.isAnonymous) {
      const adminSnap = await getDoc(doc(db,'Administradores',auth.currentUser.uid));
      if (adminSnap.exists() && adminSnap.data()?.activo === true) {
        const adminData = adminSnap.data() || {};
        currentAdminProfile = {
          uid: auth.currentUser.uid,
          nombre: first(adminData, ['nombre','nombreCompleto','nombres','displayName']) || auth.currentUser.displayName || 'Administrador'
        };
        renderBaseForm();
        $('admin-session-badge').textContent = `Administrador: ${currentAdminProfile.nombre}`;
        return;
      }
      await signOut(auth);
    }
    renderAdminLogin();
  } catch(e) {
    console.error(e);
    renderAdminLogin('No se pudo inicializar el acceso administrativo: ' + (e?.message || e));
  }
};
window.openModal=function(id){ if(id==='admin-modal') window.openDigitalResultForm(); else $(id)?.classList.remove('hidden'); };
