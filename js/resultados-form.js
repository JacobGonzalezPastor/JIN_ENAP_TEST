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

function renderDisciplineForm(d) {
  const container = $('discipline-fields');
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
  return `<div class="form-grid two">
    ${field('Equipo local',select('team-local',optionSchools,true))}${field('Equipo visitante',select('team-visitor',optionSchools,true))}
    ${field('1.er tiempo local',input('f-1t-l','0','number',true,'min="0"'))}${field('1.er tiempo visitante',input('f-1t-v','0','number',true,'min="0"'))}
    ${field('2.º tiempo local',input('f-2t-l','0','number',true,'min="0"'))}${field('2.º tiempo visitante',input('f-2t-v','0','number',true,'min="0"'))}
    ${field('Tiempo extra local',input('f-te-l','0','number',false,'min="0"'))}${field('Tiempo extra visitante',input('f-te-v','0','number',false,'min="0"'))}
    ${field('Penaltis local',input('f-pen-l','0','number',false,'min="0"'))}${field('Penaltis visitante',input('f-pen-v','0','number',false,'min="0"'))}
    ${field('Ganador',select('f-winner','<option value="">Seleccione</option><option value="LOCAL">Local</option><option value="VISITANTE">Visitante</option><option value="EMPATE">Empate</option>',true))}
    ${field('Incidencias',`<textarea id="f-incidents" class="form-control" rows="2"></textarea>`,'wide')}
  </div>`;
}
function renderBasketball() {
  return `<div class="form-grid two">${field('Equipo local',select('team-local',optionSchools,true))}${field('Equipo visitante',select('team-visitor',optionSchools,true))}
    ${[1,2,3,4].map(q=>`${field(`Periodo ${q} local`,input(`b-${q}-l`,'0','number',true,'min="0"'))}${field(`Periodo ${q} visitante`,input(`b-${q}-v`,'0','number',true,'min="0"'))}`).join('')}
    ${field('Prórrogas',input('b-ot','Ej. 8-6'))}${field('Ganador',select('b-winner','<option value="">Seleccione</option><option>LOCAL</option><option>VISITANTE</option>',true))}
    ${field('Observaciones',`<textarea id="b-notes" class="form-control" rows="2"></textarea>`,'wide')}</div>`;
}
function renderVolleyball() {
  return `<div class="form-grid two">${field('Equipo local',select('team-local',optionSchools,true))}${field('Equipo visitante',select('team-visitor',optionSchools,true))}
    ${[1,2,3,4,5].map(s=>`${field(`Set ${s} local`,input(`v-${s}-l`,'0','number',false,'min="0"'))}${field(`Set ${s} visitante`,input(`v-${s}-v`,'0','number',false,'min="0"'))}`).join('')}
    ${field('Sets ganados local',input('v-sets-l','0','number',true,'min="0" max="5"'))}${field('Sets ganados visitante',input('v-sets-v','0','number',true,'min="0" max="5"'))}
    ${field('Ganador',select('v-winner','<option value="">Seleccione</option><option>LOCAL</option><option>VISITANTE</option>',true))}</div>`;
}
function renderFencing() {
  const participantFields = ['A','B','C','D'].map(id =>
    `${field(`Competidor ${id}`,input(`e-p${id.toLowerCase()}-name`,'Nombre','text',true))}${field(`Escuela ${id}`,select(`e-p${id.toLowerCase()}-school`,optionSchools,true))}`
  ).join('');
  const bout = (prefix, title, aLabel, bLabel) => `<div class="border border-slate-700 rounded-2xl p-4 space-y-3 bg-slate-900/50">
    <div class="font-bold text-blue-300">${title}</div>
    <div class="text-xs text-slate-400"><span id="${prefix}-a-label">${aLabel}</span> vs <span id="${prefix}-b-label">${bLabel}</span></div>
    <div class="form-grid two">
      ${field('Participante A',select(`${prefix}-a`,'' ,true))}${field('Participante B',select(`${prefix}-b`,'',true))}
      ${[1,2,3].map(p=>`${field(`Periodo ${p} A`,input(`${prefix}-${p}-a`,'0','number',true,'min="0"'))}${field(`Periodo ${p} B`,input(`${prefix}-${p}-b`,'0','number',true,'min="0"'))}`).join('')}
      ${field('Sanciones A',input(`${prefix}-san-a`,'Separadas por coma'))}${field('Sanciones B',input(`${prefix}-san-b`,'Separadas por coma'))}
      ${field('Ganador',select(`${prefix}-winner`,'<option value="">Seleccione</option>',true))}
    </div>
  </div>`;
  return `<div class="space-y-4">
    <div class="form-summary">Esgrima JIE26: <strong>eliminación directa</strong>. La competencia se registra como un cuadro completo de 4 participantes. El podio se genera automáticamente cuando estén registrados semifinales, final y tercer puesto.</div>
    <div class="form-grid two">${field('Arma',select('e-weapon','<option>Florete</option><option>Espada</option><option>Sable</option>',true))}${field('Formato',input('e-format','Eliminación directa · 4 participantes','text',true))}</div>
    <div class="form-grid two">${participantFields}</div>
    ${bout('e-sf1','Semifinal 1','A','B')}
    ${bout('e-sf2','Semifinal 2','C','D')}
    ${bout('e-final','Final','Ganador SF1','Ganador SF2')}
    ${bout('e-third','Tercer puesto','Perdedor SF1','Perdedor SF2')}
    <div class="form-summary"><strong>Podio automático:</strong> Oro = ganador de la final; Plata = perdedor de la final; Bronce = ganador del tercer puesto.</div>
  </div>`;
}
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
function renderTaekwondo() {
  return `<div class="space-y-4"><div class="form-summary">Registre varios combates de una misma sesión/competencia. Cada combate conserva rama, peso, deportistas, escuelas, marcador por round y ganador. Las categorías de peso mostradas son una referencia de combate senior de World Taekwondo; confirme con la organización si los Juegos usan categorías por edad o pesos adaptados.</div>
    <div id="tk-bouts-list" class="space-y-4">${taekwondoBoutCard(0)}</div>
    <div class="flex flex-wrap gap-3"><button type="button" id="tk-add-bout" class="form-btn secondary">+ Agregar otro combate</button><span class="text-xs text-slate-400 self-center">Puede registrar combates de distintos pesos en una sola jornada de Taekwondo.</span></div>
  </div>`;
}
function renderTennis() {
  return `<div class="form-grid two">${field('Modalidad',select('ten-mode','<option>Sencillos</option><option>Dobles</option><option>Dobles mixtos</option>',true))}
    ${field('Jugador A',input('ten-a','Nombre','text',true))}${field('Escuela A',select('ten-a-school',optionSchools,true))}${field('Jugador B',input('ten-b','Nombre','text',true))}${field('Escuela B',select('ten-b-school',optionSchools,true))}
    ${[1,2,3].map(s=>`${field(`Set ${s} - A`,input(`ten-${s}-a`,'0','number',false,'min="0"'))}${field(`Set ${s} - B`,input(`ten-${s}-b`,'0','number',false,'min="0"'))}`).join('')}
    ${field('Aces A',input('ten-aces-a','0','number'))}${field('Aces B',input('ten-aces-b','0','number'))}${field('Dobles faltas A',input('ten-df-a','0','number'))}${field('Dobles faltas B',input('ten-df-b','0','number'))}
    ${field('Ganador',select('ten-winner','<option value="">Seleccione</option><option>A</option><option>B</option>',true))}
    <div class="form-summary wide mt-2"><label class="flex items-start gap-2"><input id="ten-modality-finalized" type="checkbox" class="mt-1"><span><b>Cerrar modalidad y calcular podio</b><br><small>Marque solo al registrar el último partido de esta categoría/modalidad. El podio se calcula con partidos ganados, porcentaje de sets y porcentaje de games; si persiste un empate, debe resolverse manualmente conforme al reglamento aplicable.</small></span></label></div></div>`;
}
function renderShooting() {
  const cols = ['Dorsal','Nombre','Escuela','Sexo','S1','S2','S3','S4','S5','S6','Total','X','Obs.'];
  const rows = [1,2,3,4,5,6,7,8,9,10].map(i => `<tr><td><input id="sh-${i}-dorsal" class="form-control" inputmode="numeric"></td><td><input id="sh-${i}-name" class="form-control"></td><td><select id="sh-${i}-school" class="form-control">${optionSchools}</select></td><td><select id="sh-${i}-sex" class="form-control"><option value="">Seleccione</option><option value="Masculino">Masculino</option><option value="Femenino">Femenino</option></select></td>${[1,2,3,4,5,6].map(s=>`<td><input id="sh-${i}-s${s}" class="form-control" type="number" min="0" step="0.1" inputmode="decimal"></td>`).join('')}<td><input id="sh-${i}-total" class="form-control" readonly></td><td><input id="sh-${i}-x" class="form-control" type="number" min="0" step="1" inputmode="numeric"></td><td><input id="sh-${i}-obs" class="form-control"></td></tr>`).join('');
  return `<div class="form-grid two">${field('Modalidad',input('sh-mode','Ej. Rifle aire 10m','text',true))}${field('Arma',select('sh-weapon','<option value="">Seleccione</option><option value="Rifle">Rifle</option><option value="Pistola">Pistola</option>',true))}</div><div class="form-summary mb-3">Las columnas están alineadas con la planilla: Dorsal, Nombre, Escuela, Sexo y series S1–S6. El total se calcula automáticamente a partir de S1–S6. La clasificación se ordena por total y luego por X-centros.</div>${tableWrap(cols,rows)}`;
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

function renderPentathlon() {
  const type = pentathlonTestType();
  const c = selectedCompetition || {};
  const desc = first(c,['descripcion','nombre','Nombre']) || 'Prueba de Pentatlón';
  const titleMap = {
    TIRO:'Pentatlón · Tiro', PISTA:'Pentatlón · Paso de pista', NATACION:'Pentatlón · Natación utilitaria',
    GRANADA:'Pentatlón · Lanzamiento de granadas', CROSS:'Pentatlón · Cross Country', RELEVOS:'Pentatlón · Relevos'
  };
  const title = titleMap[type] || 'Pentatlón · Prueba general';
  const resultLabel = type==='TIRO' ? 'Resultado / puntos' : type==='GRANADA' ? 'Distancia / resultado' : type==='RELEVOS' ? 'Resultado / tiempo' : 'Resultado / tiempo';
  const resultPlaceholder = type==='TIRO' ? 'Resultado / puntos' : type==='GRANADA' ? 'Resultado / distancia' : type==='RELEVOS' ? 'Resultado / tiempo' : 'Resultado / tiempo';
  const rows = [1,2,3,4].map(i => {
    const nameField = type==='RELEVOS'
      ? `<input id="p-${i}-team" class="form-control" placeholder="Equipo / relevo">`
      : `<input id="p-${i}-name" class="form-control" placeholder="Nombre participante">`;
    return `<tr>
      <td class="text-center font-semibold">${i}</td>
      <td>${nameField}</td>
      <td><select id="p-${i}-school" class="form-control"><option value="">Seleccione</option>${ESCUELAS.map(s=>`<option value="${s}">${s}</option>`).join('')}</select></td>
      <td><select id="p-${i}-sex" class="form-control"><option value="">Seleccione</option><option>Masculino</option><option>Femenino</option><option>Mixto</option></select></td>
      <td><input id="p-${i}-result" class="form-control" placeholder="${resultPlaceholder}"></td>
      <td><input id="p-${i}-points" class="form-control" type="number" placeholder="Puntos" step="0.1"></td>
      <td><input id="p-${i}-position" class="form-control" type="number" min="1" placeholder="Pos."></td>
      <td><input id="p-${i}-obs" class="form-control" placeholder="Observaciones"></td>
    </tr>`;
  }).join('');
  const participantLabel = type==='RELEVOS' ? 'Equipo / relevo' : 'Participante';
  const phase = field('Prueba / fase',input('p-phase',desc,'text',true),'wide');
  return `<div class="form-summary mb-3">
      <strong>${esc(title)}</strong><br>
      <span class="text-slate-400">${esc(desc)}</span><br>
      <span class="text-blue-300">La competencia admite el registro conjunto de las 4 escuelas: ENAP, EMAVI, ESMIC y ECSAN. Se guarda un solo resultado para la competencia con hasta cuatro participantes/equipos.</span>
    </div>
    <div class="form-grid two mb-4">${phase}${field('Tipo de prueba',input('p-test-type',type,'text',false,'readonly'))}</div>
    ${tableWrap(['#',participantLabel,'Escuela','Sexo','Marca / tiempo / resultado','Puntos','Posición','Observaciones'],rows)}
    <div class="form-summary mt-3">Diligencie una fila por escuela participante. No es necesario crear cuatro resultados separados para la misma competencia. Los puntos y posiciones se registran como datos validados por el juez; no se aplica una fórmula JIE26 no confirmada.</div>`;
}
function renderOrienteering() {
  const cols=['Dorsal','Grado','Nombre','Escuela','Chip','Salida','Llegada','Tiempo bruto','Errores tiro','Errores baliza','Penalización','Tiempo definitivo','Estado'];
  const rows=[1,2,3,4,5,6,7,8,9,10].map(i=>`<tr><td>${i}</td><td><input id="or-${i}-grado" class="form-control"></td><td><input id="or-${i}-name" class="form-control"></td><td><select id="or-${i}-school" class="form-control">${optionSchools}</select></td><td><input id="or-${i}-chip" class="form-control"></td><td><input id="or-${i}-start" class="form-control" type="time" step="1"></td><td><input id="or-${i}-finish" class="form-control" type="time" step="1"></td><td><input id="or-${i}-gross" class="form-control" placeholder="HH:MM:SS"></td><td><input id="or-${i}-shoot" class="form-control" type="number" min="0"></td><td><input id="or-${i}-beacon" class="form-control" type="number" min="0"></td><td><input id="or-${i}-penalty" class="form-control" placeholder="HH:MM:SS"></td><td><input id="or-${i}-final" class="form-control" placeholder="HH:MM:SS"></td><td><select id="or-${i}-status" class="form-control"><option>FINAL</option><option>DNF</option><option>DNS</option><option>DSQ</option></select></td></tr>`).join('');
  return `<div class="form-summary mb-3">La clasificación se determina por el tiempo definitivo, considerando las penalizaciones registradas.</div>${tableWrap(cols,rows)}`;
}
function renderAthletics() {
  return `<div class="form-grid two">${field('Modalidad',select('at-mode','<option>PISTA</option><option>CAMPO</option>',true))}${field('Prueba',input('at-event','Ej. 100 metros / Salto largo','text',true))}${field('Fase',select('at-phase','<option>FINAL</option><option>ELIMINATORIA</option><option>SEMIFINAL</option><option>SERIE</option>'))}${field('Serie',input('at-heat','1','number'))}${field('Cronometraje',select('at-timing','<option>ELECTRONICO</option><option>MANUAL</option>'))}${field('Viento',input('at-wind','Ej. +1.2'))}</div>
    <div class="form-summary mb-3">Para pista se registra tiempo oficial, carril, dorsal, viento y estado. Para campo se registran hasta seis intentos y la mejor marca.</div>
    ${tableWrap(['#','Carril/Dorsal','Nombre','Escuela','Sexo','Marca / tiempo','I1','I2','I3','I4','I5','I6','Estado'],[1,2,3,4,5,6,7,8,9,10,11,12].map(i=>`<tr><td>${i}</td><td><input id="at-${i}-lane" class="form-control"></td><td><input id="at-${i}-name" class="form-control"></td><td><select id="at-${i}-school" class="form-control">${optionSchools}</select></td><td><select id="at-${i}-sex" class="form-control"><option>Masculino</option><option>Femenino</option></select></td><td><input id="at-${i}-mark" class="form-control"></td>${[1,2,3,4,5,6].map(n=>`<td><input id="at-${i}-i${n}" class="form-control"></td>`).join('')}<td><select id="at-${i}-status" class="form-control"><option>FINAL</option><option>DQ</option><option>DNF</option><option>DNS</option><option>NM</option></select></td></tr>`).join(''))}`;
}
function renderSwimming() {
  return `<div class="form-grid two">${field('Prueba',select('sw-event','<option>50 m</option><option>100 m</option><option>200 m</option><option>400 m</option><option>800 m</option><option>1500 m</option><option>Relevos</option>',true))}${field('Estilo',select('sw-style','<option>Libre</option><option>Espalda</option><option>Pecho</option><option>Mariposa</option><option>Combinado</option>',true))}${field('Fase',select('sw-phase','<option>FINAL</option><option>ELIMINATORIA</option><option>SEMIFINAL</option>'))}</div>
    <div class="form-summary mb-3">Registro de Natación: se ingresará un único tiempo por participante en el campo <strong>Tiempo final</strong>. Los parciales y el tiempo de entrada no se utilizan en esta planilla.</div>
    ${tableWrap(['#','Carril','Licencia','Nombre','Escuela','Sexo','Tiempo final','Pos.','Estado'],[1,2,3,4,5,6,7,8,9,10].map(i=>`<tr><td>${i}</td><td><input id="sw-${i}-lane" class="form-control"></td><td><input id="sw-${i}-lic" class="form-control"></td><td><input id="sw-${i}-name" class="form-control"></td><td><select id="sw-${i}-school" class="form-control">${optionSchools}</select></td><td><select id="sw-${i}-sex" class="form-control"><option>Masculino</option><option>Femenino</option></select></td><td><input id="sw-${i}-final" class="form-control" placeholder="mm:ss.mmm"></td><td><input id="sw-${i}-pos" class="form-control" type="number" min="1"></td><td><select id="sw-${i}-status" class="form-control"><option>FINAL</option><option>DQ</option><option>DNF</option><option>DNS</option></select></td></tr>`).join(''))}`;
}

function bindDynamicCalculations(d) {
  if (d === 'Tiro Deportivo') {
    for (let i=1;i<=10;i++) for (let s=1;s<=6;s++) $(`sh-${i}-s${s}`)?.addEventListener('input',()=>{
      const vals=[1,2,3,4,5,6].map(n=>Number($(`sh-${i}-s${n}`)?.value||0));
      $(`sh-${i}-total`).value=vals.reduce((a,b)=>a+b,0);
    });
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
        puntosPrueba: p.puntosPrueba || 0
      }));
  }
  if (d === 'Esgrima') {
    const labels={A:'A',B:'B',C:'C',D:'D'};
    const names=()=>Object.fromEntries(['A','B','C','D'].map(id=>[id,val(`e-p${id.toLowerCase()}-name`)||`Competidor ${id}`]));
    const fill=(id,ids)=>{const el=$(id);if(!el)return;const current=el.value;el.innerHTML='<option value="">Seleccione</option>'+ids.map(x=>`<option value="${x}">${esc(labels[x])} · ${esc(names()[x])}</option>`).join('');if(ids.includes(current))el.value=current;};
    const updateBracket=()=>{
      const n=names();
      ['A','B','C','D'].forEach(id=>{$(`e-p${id.toLowerCase()}-name`)?.addEventListener('input',updateBracket);$(`e-p${id.toLowerCase()}-school`)?.addEventListener('change',updateBracket);});
      fill('e-sf1-a',['A']); fill('e-sf1-b',['B']);
      fill('e-sf2-a',['C']); fill('e-sf2-b',['D']);
      const w1=val('e-sf1-winner'),w2=val('e-sf2-winner');
      fill('e-final-a',w1?[w1]:[]); fill('e-final-b',w2?[w2]:[]);
      const l1=w1?(['A','B'].find(x=>x!==w1)):''; const l2=w2?(['C','D'].find(x=>x!==w2)):'';
      fill('e-third-a',l1?[l1]:[]); fill('e-third-b',l2?[l2]:[]);
      ['e-sf1','e-sf2','e-final','e-third'].forEach(prefix=>{const a=val(`${prefix}-a`),b=val(`${prefix}-b`),winner=val(`${prefix}-winner`);const wa=$(`${prefix}-winner`);if(wa){const opts=[a,b].filter(Boolean);wa.innerHTML='<option value="">Seleccione</option>'+opts.map(x=>`<option value="${x}">${esc(x)} · ${esc(n[x]||'')}</option>`).join('');if(opts.includes(winner))wa.value=winner;}});
      const fA=val('e-final-a'),fB=val('e-final-b'),tA=val('e-third-a'),tB=val('e-third-b');
      if($('e-final-a-label'))$('e-final-a-label').textContent=fA?`${fA} · ${n[fA]}`:'Ganador SF1';
      if($('e-final-b-label'))$('e-final-b-label').textContent=fB?`${fB} · ${n[fB]}`:'Ganador SF2';
      if($('e-third-a-label'))$('e-third-a-label').textContent=tA?`${tA} · ${n[tA]}`:'Perdedor SF1';
      if($('e-third-b-label'))$('e-third-b-label').textContent=tB?`${tB} · ${n[tB]}`:'Perdedor SF2';
    };
    ['e-sf1-winner','e-sf2-winner','e-final-winner','e-third-winner'].forEach(id=>$(id)?.addEventListener('change',updateBracket));
    ['e-sf1-a','e-sf1-b','e-sf2-a','e-sf2-b','e-final-a','e-final-b','e-third-a','e-third-b'].forEach(id=>$(id)?.addEventListener('change',updateBracket));
    updateBracket();
  }
}

function collectRows(prefix, count, mapper) { const out=[]; for(let i=1;i<=count;i++){const row=mapper(i); if(row) out.push(row);} return out; }
function val(id) { return $(id)?.value ?? ''; }
function num(id) { const n=Number(val(id)); return Number.isFinite(n)?n:0; }

function buildResultData(d) {
  if (d === 'Fútbol') return { tipo:'FUTBOL', equipos:[{escuelaCodigo:val('team-local')},{escuelaCodigo:val('team-visitor')}], marcador:{primerTiempo:{local:num('f-1t-l'),visitante:num('f-1t-v')},segundoTiempo:{local:num('f-2t-l'),visitante:num('f-2t-v')},tiempoExtra:{local:num('f-te-l'),visitante:num('f-te-v')},penaltis:{local:num('f-pen-l'),visitante:num('f-pen-v')}}, ganador:val('f-winner'), estado:getCompetitionStatus(), estadoNombre:competitionStatusLabel(getCompetitionStatus()), incidencias:val('f-incidents') };
  if (d === 'Baloncesto') return { tipo:'BALONCESTO', equipos:[{escuelaCodigo:val('team-local')},{escuelaCodigo:val('team-visitor')}], periodos:[1,2,3,4].map(q=>({periodo:q,local:num(`b-${q}-l`),visitante:num(`b-${q}-v`)})), tiempoExtra:val('b-ot'), ganador:val('b-winner'), observaciones:val('b-notes') };
  if (d === 'Voleibol') return { tipo:'VOLEIBOL', equipos:[{escuelaCodigo:val('team-local')},{escuelaCodigo:val('team-visitor')}], sets:[1,2,3,4,5].map(s=>({set:s,local:num(`v-${s}-l`),visitante:num(`v-${s}-v`)})).filter(x=>x.local||x.visitante), setsGanadosLocal:num('v-sets-l'), setsGanadosVisitante:num('v-sets-v'), ganador:val('v-winner') };
  if (d === 'Esgrima') {
    const participants=['A','B','C','D'].map(id=>({id,nombre:val(`e-p${id.toLowerCase()}-name`),escuelaCodigo:val(`e-p${id.toLowerCase()}-school`)}));
    const bout=(prefix)=>({participanteA:val(`${prefix}-a`),participanteB:val(`${prefix}-b`),periodos:[1,2,3].map(p=>({periodo:p,toquesA:num(`${prefix}-${p}-a`),toquesB:num(`${prefix}-${p}-b`)})),sanciones:{A:val(`${prefix}-san-a`),B:val(`${prefix}-san-b`)},ganador:val(`${prefix}-winner`)});
    return {tipo:'ESGRIMA_ELIMINACION_DIRECTA',formato:'4_PARTICIPANTES',arma:val('e-weapon'),participantes,cuadro:{semifinal1:bout('e-sf1'),semifinal2:bout('e-sf2'),final:bout('e-final'),tercerPuesto:bout('e-third')}};
  }
  if (d === 'Taekwondo') {
    const combates = [...document.querySelectorAll('#tk-bouts-list .tk-bout-card')].map((card,idx)=>{
      const p=`tk-${idx}`;
      return { numero:idx+1, sexo:val(`${p}-sex`), categoriaPeso:val(`${p}-weight`), competidorA:{nombre:val(`${p}-a-name`).trim(),escuelaCodigo:val(`${p}-a-school`)}, competidorB:{nombre:val(`${p}-b-name`).trim(),escuelaCodigo:val(`${p}-b-school`)}, rounds:[1,2,3].map(r=>({round:r,puntosA:num(`${p}-${r}-a`),puntosB:num(`${p}-${r}-b`),gamJeomA:num(`${p}-${r}-ga`),gamJeomB:num(`${p}-${r}-gb`)})), resultadoFinal:val(`${p}-final`), ganador:val(`${p}-winner`), formaFinalizacion:val(`${p}-end`), observaciones:val(`${p}-notes`) };
    });
    return { tipo:'TAEKWONDO', formatoRegistro:'MULTIPLES_COMBATES', totalCombates:combates.length, combates, reglaPeso:'REFERENCIA_WORLD_TAEKWONDO_SENIOR_PENDIENTE_VALIDACION_JIE26' };
  }
  if (d === 'Tenis') return { tipo:'TENIS', modalidad:val('ten-mode'), modalidadFinalizada:$('ten-modality-finalized')?.checked===true, jugadorA:{nombre:val('ten-a'),escuelaCodigo:val('ten-a-school')}, jugadorB:{nombre:val('ten-b'),escuelaCodigo:val('ten-b-school')}, sets:[1,2,3].map(s=>({set:s,gamesA:num(`ten-${s}-a`),gamesB:num(`ten-${s}-b`)})), estadisticas:{acesA:num('ten-aces-a'),acesB:num('ten-aces-b'),dobleFaltaA:num('ten-df-a'),dobleFaltaB:num('ten-df-b')}, ganador:val('ten-winner') };
  if (d === 'Tiro Deportivo') return { tipo:'TIRO_DEPORTIVO', modalidad:val('sh-mode'), arma:val('sh-weapon'), participantes:collectRows('sh',10,i=>{const name=val(`sh-${i}-name`); if(!name) return null; return {dorsal:val(`sh-${i}-dorsal`),nombre:name,escuelaCodigo:val(`sh-${i}-school`),sexo:val(`sh-${i}-sex`),series:[1,2,3,4,5,6].map(s=>({serie:s,puntaje:num(`sh-${i}-s${s}`)})),total:num(`sh-${i}-total`),xCentros:num(`sh-${i}-x`),observaciones:val(`sh-${i}-obs`)}})};
  if (d === 'Pentatlón') {
    const tipoPrueba = pentathlonTestType();
    const participantes = collectRows('p',4,i => {
      const name = tipoPrueba === 'RELEVOS' ? val(`p-${i}-team`) : val(`p-${i}-name`);
      const school = val(`p-${i}-school`);
      if (!name && !school) return null;
      return {
        id: String(i),
        nombre: name,
        escuelaCodigo: school,
        sexo: val(`p-${i}-sex`),
        resultado: val(`p-${i}-result`),
        puntosPrueba: num(`p-${i}-points`),
        posicion: num(`p-${i}-position`),
        observaciones: val(`p-${i}-obs`)
      };
    });
    return {
      tipo:'PENTATLON',
      tipoPrueba,
      pruebaFase:val('p-phase'),
      participantes,
      modalidadRegistro:'CUATRO_ESCUELAS',
      escuelasParticipantes:ESCUELAS,
      reglaPuntuacion:'PENDIENTE_CONFIRMACION_REGLAMENTO_JIE26'
    };
  }
  if (d === 'Orientación Militar') return { tipo:'ORIENTACION_MILITAR', participantes:collectRows('or',10,i=>{const name=val(`or-${i}-name`); if(!name) return null; return {dorsal:i,grado:val(`or-${i}-grado`),nombre:name,escuelaCodigo:val(`or-${i}-school`),idChip:val(`or-${i}-chip`),salida:val(`or-${i}-start`),llegada:val(`or-${i}-finish`),tiempoBruto:val(`or-${i}-gross`),erroresTiro:num(`or-${i}-shoot`),erroresBaliza:num(`or-${i}-beacon`),penalizacion:val(`or-${i}-penalty`),tiempoDefinitivo:val(`or-${i}-final`),estado:val(`or-${i}-status`)}})};
  if (d === 'Atletismo') return { tipo:'ATLETISMO', modalidad:val('at-mode'), prueba:val('at-event'), fase:val('at-phase'), serie:num('at-heat'), cronometraje:val('at-timing'), viento:val('at-wind'), participantes:collectRows('at',12,i=>{const name=val(`at-${i}-name`); if(!name) return null; return {carrilDorsal:val(`at-${i}-lane`),nombre:name,escuelaCodigo:val(`at-${i}-school`),sexo:val(`at-${i}-sex`),marcaTiempo:val(`at-${i}-mark`),intentos:[1,2,3,4,5,6].map(n=>val(`at-${i}-i${n}`)),estado:val(`at-${i}-status`)}})};
  if (d === 'Natación') return { tipo:'NATACION', prueba:val('sw-event'), estilo:val('sw-style'), fase:val('sw-phase'), participantes:collectRows('sw',10,i=>{const name=val(`sw-${i}-name`); if(!name) return null; return {carril:val(`sw-${i}-lane`),licencia:val(`sw-${i}-lic`),nombre:name,escuelaCodigo:val(`sw-${i}-school`),sexo:val(`sw-${i}-sex`),tiempoFinal:val(`sw-${i}-final`),posicion:num(`sw-${i}-pos`),estado:val(`sw-${i}-status`)}})};
  return {tipo:d};
}

function deriveClassification(d, data, phase = 'CLASIFICACION') {
  const out=[];
  if (d === 'Tiro Deportivo' && Array.isArray(data.participantes)) {
    const ordered=[...data.participantes].sort((a,b)=>Number(b.total||0)-Number(a.total||0)||Number(b.xCentros||0)-Number(a.xCentros||0));
    ordered.forEach((p,i)=>out.push({posicion:i+1,escuelaCodigo:p.escuelaCodigo,participanteId:null,nombre:p.nombre||'',resultado:p.total||0}));
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
  if (d === 'Esgrima') {
    const ps=Array.isArray(data.participantes)?data.participantes:[];
    const map=Object.fromEntries(ps.map(p=>[p.id,p]));
    const sf1=data.cuadro?.semifinal1||{}, sf2=data.cuadro?.semifinal2||{}, fin=data.cuadro?.final||{}, third=data.cuadro?.tercerPuesto||{};
    if (fin.ganador && fin.participanteA && fin.participanteB && third.ganador && third.participanteA && third.participanteB) {
      const loserFinal=fin.ganador===fin.participanteA?fin.participanteB:fin.participanteA;
      const ranking=[{posicion:1,participantId:fin.ganador},{posicion:2,participantId:loserFinal},{posicion:3,participantId:third.ganador}];
      ranking.forEach(x=>{const p=map[x.participantId];if(p?.escuelaCodigo)out.push({posicion:x.posicion,escuelaCodigo:p.escuelaCodigo,participanteId:p.id,nombre:p.nombre||''});});
      return out;
    }
    return out;
  }
  if (Array.isArray(data.participantes)) {
    data.participantes.forEach(p=>{ if(p.nombre||p.escuelaCodigo) out.push({posicion:p.posicion||null,escuelaCodigo:p.escuelaCodigo,participanteId:p.participanteId||null,nombre:p.nombre||''}); });
  } else if (data.participante) {
    out.push({posicion:data.posicion||null,escuelaCodigo:data.participante.escuelaCodigo,nombre:data.participante.nombre});
  }
  return out;
}

function deriveMedals(classification) {
  return classification.filter(x=>[1,2,3].includes(Number(x.posicion))).map(x=>({tipo:['','ORO','PLATA','BRONCE'][Number(x.posicion)],escuelaCodigo:x.escuelaCodigo,participanteId:x.participanteId||null,nombre:x.nombre||''}));
}

const PUNTOS_GENERALES_MEDALLAS = { ORO: 10, PLATA: 7, BRONCE: 5 };
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
  'Voleibol':{victoria:3,empate:0,derrota:0}
};
function derivePoints(d,data,classification){
  // Escala de trabajo configurable. Sustituir por la tabla oficial JIE26 cuando sea confirmada.
  if(['Fútbol','Baloncesto','Voleibol'].includes(d)){
    const teams=data.equipos||[]; if(teams.length<2)return [];
    const winner=data.ganador; const tabla=TABLA_PUNTOS_COLECTIVOS[d];
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
  // Importante: el formulario NO inicia sesión anónima. La escritura de Resultados
  // requiere una cuenta Firebase Authentication autorizada como administrador.
  await loadCompetenciasIfNeeded();
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
    if(!bouts.length) return;
    list.innerHTML=bouts.map((_,i)=>taekwondoBoutCard(i)).join('');
    bouts.forEach((b,i)=>{ const p=`tk-${i}`; setValue(`${p}-sex`,b.sexo); const sexEl=$(`${p}-sex`); if(sexEl) sexEl.dispatchEvent(new Event('change',{bubbles:true})); setValue(`${p}-weight`,b.categoriaPeso); setValue(`${p}-a-name`,b.competidorA?.nombre); setValue(`${p}-a-school`,b.competidorA?.escuelaCodigo); setValue(`${p}-b-name`,b.competidorB?.nombre); setValue(`${p}-b-school`,b.competidorB?.escuelaCodigo); setValue(`${p}-final`,b.resultadoFinal); setValue(`${p}-winner`,b.ganador); setValue(`${p}-end`,b.formaFinalizacion); setValue(`${p}-notes`,b.observaciones); (b.rounds||[]).forEach(q=>{setValue(`${p}-${q.round}-a`,q.puntosA);setValue(`${p}-${q.round}-b`,q.puntosB);setValue(`${p}-${q.round}-ga`,q.gamJeomA);setValue(`${p}-${q.round}-gb`,q.gamJeomB);}); });
  } else {
    // Rehidrata los controles que comparten identificadores con la estructura de resultado.
    const map={
      'Fútbol':()=>{setValue('team-local',x.equipos?.[0]?.escuelaCodigo);setValue('team-visitor',x.equipos?.[1]?.escuelaCodigo);setValue('f-1t-l',x.marcador?.primerTiempo?.local);setValue('f-1t-v',x.marcador?.primerTiempo?.visitante);setValue('f-2t-l',x.marcador?.segundoTiempo?.local);setValue('f-2t-v',x.marcador?.segundoTiempo?.visitante);setValue('f-te-l',x.marcador?.tiempoExtra?.local);setValue('f-te-v',x.marcador?.tiempoExtra?.visitante);setValue('f-pen-l',x.marcador?.penaltis?.local);setValue('f-pen-v',x.marcador?.penaltis?.visitante);setValue('f-winner',x.ganador);setValue('f-incidents',x.incidencias);},
      'Baloncesto':()=>{setValue('team-local',x.equipos?.[0]?.escuelaCodigo);setValue('team-visitor',x.equipos?.[1]?.escuelaCodigo);(x.periodos||[]).forEach(q=>{setValue(`b-${q.periodo}-l`,q.local);setValue(`b-${q.periodo}-v`,q.visitante)});setValue('b-ot',x.tiempoExtra);setValue('b-winner',x.ganador);setValue('b-notes',x.observaciones);},
      'Voleibol':()=>{setValue('team-local',x.equipos?.[0]?.escuelaCodigo);setValue('team-visitor',x.equipos?.[1]?.escuelaCodigo);(x.sets||[]).forEach(q=>{setValue(`v-${q.set}-l`,q.local);setValue(`v-${q.set}-v`,q.visitante)});setValue('v-sets-l',x.setsGanadosLocal);setValue('v-sets-v',x.setsGanadosVisitante);setValue('v-winner',x.ganador);},
      'Natación':()=>{setValue('sw-event',x.prueba);setValue('sw-style',x.estilo);setValue('sw-phase',x.fase);(x.participantes||[]).forEach((p,i)=>{const n=i+1;setValue(`sw-${n}-lane`,p.carril);setValue(`sw-${n}-lic`,p.licencia);setValue(`sw-${n}-name`,p.nombre);setValue(`sw-${n}-school`,p.escuelaCodigo);setValue(`sw-${n}-sex`,p.sexo);setValue(`sw-${n}-final`,p.tiempoFinal);setValue(`sw-${n}-pos`,p.posicion);setValue(`sw-${n}-status`,p.estado);});},
      'Tenis':()=>{setValue('ten-mode',x.modalidad);setValue('ten-a',x.jugadorA?.nombre);setValue('ten-a-school',x.jugadorA?.escuelaCodigo);setValue('ten-b',x.jugadorB?.nombre);setValue('ten-b-school',x.jugadorB?.escuelaCodigo);(x.sets||[]).forEach(q=>{setValue(`ten-${q.set}-a`,q.gamesA);setValue(`ten-${q.set}-b`,q.gamesB)});setValue('ten-aces-a',x.estadisticas?.acesA);setValue('ten-aces-b',x.estadisticas?.acesB);setValue('ten-df-a',x.estadisticas?.dobleFaltaA);setValue('ten-df-b',x.estadisticas?.dobleFaltaB);setValue('ten-winner',x.ganador);if($('ten-modality-finalized'))$('ten-modality-finalized').checked=x.modalidadFinalizada===true;}
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
    if (!cards.length) { status.textContent='Agregue al menos un combate.'; return; }
    for (let i=0;i<cards.length;i++) {
      const p=`tk-${i}`;
      const a=val(`${p}-a-name`).trim(), b=val(`${p}-b-name`).trim();
      const sa=val(`${p}-a-school`), sb=val(`${p}-b-school`), weight=val(`${p}-weight`), winner=val(`${p}-winner`);
      if (!a || !b || !sa || !sb || !weight || !winner) { status.textContent=`Complete competidores, escuelas, peso y ganador del combate ${i+1}.`; return; }
      if (a.toLowerCase()===b.toLowerCase() && sa===sb) { status.textContent=`El combate ${i+1} no puede enfrentar al mismo participante consigo mismo.`; return; }
    }
  }
  const resultadoDeportivo=buildResultData(d);
  const faseActual = COLECTIVOS.has(d) ? ($('collective-phase')?.value || 'CLASIFICACION') : 'FINAL';
  const clasificacion=deriveClassification(d,resultadoDeportivo,faseActual);
  const medallas=deriveMedals(clasificacion);
  const puntuacionClasificacion=derivePoints(d,resultadoDeportivo,clasificacion);
  const puntosGeneralesMedallas=deriveGeneralMedalPoints(medallas);
  const result={
    competenciaId:selectedCompetition.id || first(selectedCompetition,['idSugerido','competenciaId']),
    competenciaCodigo:first(selectedCompetition,['codigo','idSugerido','id']),
    competenciaDescripcion:first(selectedCompetition,['descripcion','nombre','Nombre','competencia']),
    disciplinaCodigo:first(selectedCompetition,['disciplinaCodigo','DisciplinaCodigo']) || disciplineCode(d),
    disciplinaNombre:d,
    categoriaCodigo:first(selectedCompetition,['categoriaCodigo','categoria']),
    modalidadCodigo:first(selectedCompetition,['modalidadCodigo','modalidad','Modalidad']),
    tipoResultado:COLECTIVOS.has(d)?'COLECTIVO':'INDIVIDUAL',
    faseCompetencia:COLECTIVOS.has(d) ? ($('collective-phase')?.value || 'CLASIFICACION') : (d==='Esgrima'?'ELIMINACION_DIRECTA':'FINAL'),
    defineMedalleria:COLECTIVOS.has(d) ? ($('collective-phase')?.value === 'FINAL') : d==='Tenis' ? ($('ten-modality-finalized')?.checked===true) : d!=='Esgrima',
    modalidadFinalizada:d==='Tenis' ? ($('ten-modality-finalized')?.checked===true) : false,
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
      const payload = sanitizeForFirestore({
        ...result,
        registradoPor: editingResultId && editingResultSource==='firebase' ? (editingResultData?.registradoPor||user.uid) : user.uid,
        registradoPorNombre: editingResultData?.registradoPorNombre || currentAdminProfile.nombre,
        actualizadoPor: user.uid,
        ...(editingResultId && editingResultSource==='firebase' ? {actualizadoEn:serverTimestamp()} : {creadoEn:serverTimestamp(),actualizadoEn:serverTimestamp()})
      });
      let refId;
      if(editingResultId && editingResultSource==='firebase') { await updateDoc(doc(db,'Resultados',editingResultId),payload); refId=editingResultId; }
      else { const ref=await addDoc(collection(db,'Resultados'),payload); refId=ref.id; }
      result.id=refId;
      firebaseResultsCache=firebaseResultsCache.filter(r=>r.id!==refId); firebaseResultsCache.push({...result,id:refId}); resultCacheLoaded=true;
      window.dispatchEvent(new CustomEvent('resultadoFirebaseGuardado'));
      status.className='text-sm text-emerald-400';
      status.textContent=`${editingResultId?'Corrección actualizada':'Resultado guardado'} correctamente en Firebase. ID: ${refId}`;
    }
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
  $('admin-modal')?.classList.remove('hidden');
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
