/* ================================================================
   ALTOZANO · TABLERO · Módulo 09 · Look Ahead — Last Planner
   Vista tipo Programa de Obra (Gantt) acotada a la ventana de 5
   semanas (semana en curso + 4), con columnas de análisis de
   restricciones (casillas) entre las tareas y las barras de Gantt.

   Reúsa la misma fuente XML del Programa de Obra (no la modifica).
   El parseo/escala/barras están adaptados de js/gantt.js (Enfoque A:
   módulo independiente, sin tocar el Programa de Obra).

   Secciones:
     1) Constantes y estado
     2) Parser XML + árbol  (adaptado de gantt.js)
     3) Ventana Look Ahead + filas visibles
     4) Escala + barras de Gantt
     5) Render (panel izquierdo con casillas, timeline, gantt)
     6) Restricciones: localStorage, estado "Listo"
     7) Cierre semanal: acta PDF + JSON
     8) Semanas cerradas (solo lectura)
     9) Bootstrap
   ================================================================ */

/* ---- 1) CONSTANTES Y ESTADO ---- */
const XML_PATH = 'data/programa-altozano.xml';
const LA_INDEX_PATH = 'data/lookahead/index.json';
const LA_ENCURSO_PATH = 'data/lookahead/en-curso.json';
const LA_BASE = 'data/lookahead/';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HOURS_PER_WORKDAY = 8;
const COLLAPSE_KEY = 'altozanoLookAheadCollapse';
const LOOKAHEAD_WEEKS = 5;
const CONSTRAINTS = ['mat', 'mo', 'proy', 'prev'];

const state = {
  project: { name: '', start: null, finish: null, statusDate: null },
  tasksFlat: [],
  window: null,        // { start, end } de la ventana Look Ahead
  rows: [],            // tareas dentro de la ventana (orden de esquema)
  scale: null,
  collapsed: new Set(),
  prog: {},            // { uid: {mat,mo,proy,prev} } de la semana en curso
  cerrada: false,      // true si se está viendo una semana cerrada (solo lectura)
  indexSemanas: [],    // semanas cerradas registradas
  enCurso: null,       // avance publicado de la semana en curso (data/lookahead/en-curso.json)
  cierreActual: null
};

const $ = (id) => document.getElementById(id);
const dom = {};

/* ---- 2) PARSER XML + ÁRBOL (adaptado de gantt.js) ---- */
function parseXmlText(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error('El XML está mal formado: ' + err.textContent.slice(0, 200));
  return doc;
}
function getChildText(node, tag) {
  for (const c of node.children) if (c.localName === tag) return c.textContent;
  return null;
}
function parseDurationDays(iso) {
  if (!iso) return 0;
  const mD = iso.match(/P(?:(\d+)D)?/);
  const mT = iso.match(/T(?:(\d+)H)?(?:(\d+)M)?/);
  const days = mD && mD[1] ? parseInt(mD[1], 10) : 0;
  const hours = mT && mT[1] ? parseInt(mT[1], 10) : 0;
  const mins = mT && mT[2] ? parseInt(mT[2], 10) : 0;
  return Math.max(0, Math.round((days * HOURS_PER_WORKDAY + hours + mins / 60) / HOURS_PER_WORKDAY));
}
function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
function extractProjectMeta(doc) {
  const root = doc.documentElement;
  return {
    name: getChildText(root, 'Name') || getChildText(root, 'Title') || 'Proyecto',
    start: parseDate(getChildText(root, 'StartDate')),
    finish: parseDate(getChildText(root, 'FinishDate')),
    statusDate: parseDate(getChildText(root, 'StatusDate')) || new Date()
  };
}
function xmlToTasks(doc) {
  const tasks = [];
  for (const node of doc.getElementsByTagName('Task')) {
    const uid = parseInt(getChildText(node, 'UID'), 10);
    if (Number.isNaN(uid) || uid === 0) continue;
    const name = getChildText(node, 'Name');
    if (!name) continue;
    tasks.push({
      uid, name,
      outlineLevel: parseInt(getChildText(node, 'OutlineLevel'), 10) || 1,
      isSummary: getChildText(node, 'Summary') === '1',
      isMilestone: getChildText(node, 'Milestone') === '1',
      isCritical: getChildText(node, 'Critical') === '1',
      start: parseDate(getChildText(node, 'Start')),
      finish: parseDate(getChildText(node, 'Finish')),
      percentComplete: Math.max(0, Math.min(100, parseInt(getChildText(node, 'PercentComplete'), 10) || 0)),
      durationDays: parseDurationDays(getChildText(node, 'Duration')),
      baselineStart: null,
      baselineFinish: null,
      deviationDays: null,
      children: [], parent: null, isCollapsed: false
    });
    const __t = tasks[tasks.length - 1];
    const __bl = getBaselineDates(node);
    __t.baselineStart = __bl.start;
    __t.baselineFinish = __bl.finish;
    __t.deviationDays = baselineDeviationDays(__t.finish, __t.baselineFinish);
  }
  return tasks;
}
function buildTree(flat) {
  const stack = [];
  flat.forEach((t) => {
    t.parent = stack[t.outlineLevel - 1] || null;
    if (t.parent) t.parent.children.push(t);
    stack[t.outlineLevel] = t;
    for (let i = t.outlineLevel + 1; i < stack.length; i++) stack[i] = undefined;
  });
}
const isLeaf = (t) => !t.isSummary && t.children.length === 0;
function grupoLote(t) {                       // ancestro de nivel 1 (lote/partida)
  let cur = t;
  while (cur.parent) cur = cur.parent;
  return cur.name;
}

/* ---- 3) VENTANA LOOK AHEAD + FILAS VISIBLES ---- */
function mondayOf(date) {
  const d = new Date(date);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  d.setHours(0, 0, 0, 0);
  return d;
}
function computeWindow(fromDate, weeks) {
  const start = mondayOf(fromDate);
  const end = new Date(start);
  end.setDate(end.getDate() + weeks * 7);
  return { start, end };
}
/* Filas dentro de la ventana: hojas que inician en la ventana + sus ancestros */
function buildWindowRows() {
  const { start: ws, end: we } = state.window;
  const inWin = new Set();
  state.tasksFlat.forEach((t) => {
    if (isLeaf(t) && t.start && t.start >= ws && t.start < we) {
      let cur = t;
      while (cur) { inWin.add(cur.uid); cur = cur.parent; }
    }
  });
  state.rows = state.tasksFlat.filter((t) => inWin.has(t.uid));
}
/* Filas a pintar (respeta contraído): oculta descendientes de un resumen contraído */
function visibleRows() {
  return state.rows.filter((t) => {
    let p = t.parent;
    while (p) { if (p.isCollapsed) return false; p = p.parent; }
    return true;
  });
}

/* ---- 4) ESCALA + BARRAS (acotada a la ventana) ---- */
function computeScale(winStart, winEnd, colWidth) {
  colWidth = colWidth || 20;
  const origin = mondayOf(winStart);
  const cells = [];
  let cursor = new Date(origin);
  while (cursor < winEnd) {
    const next = new Date(cursor); next.setDate(next.getDate() + 1);
    cells.push({ start: new Date(cursor), end: next });
    cursor = next;
  }
  return { colWidth, origin, cells, pxPerDay: colWidth, totalWidth: cells.length * colWidth, totalDays: cells.length };
}
function computeStatus(task, statusDate) {
  if (task.isSummary) return 'summary';
  const pct = task.percentComplete;
  if (pct >= 100) return 'completed';
  if (task.finish && task.finish < statusDate && pct < 100) return 'delayed';
  if (task.start && task.start <= statusDate && task.finish && task.finish >= statusDate) return 'in-progress';
  if (task.start && task.start < statusDate && pct === 0) return 'overdue';
  return 'not-started';
}
function buildBar(task, sc) {
  const bar = document.createElement('div');
  bar.className = 'bar';
  // Recorta la barra a la ventana visible [0, totalDays] (evita barras "volando" fuera del Look Ahead)
  const s = (task.start - sc.origin) / MS_PER_DAY;
  const e = (task.finish - sc.origin) / MS_PER_DAY;
  const left = Math.max(0, s);
  const right = Math.min(sc.totalDays, e);
  bar.style.left = `${left * sc.pxPerDay}px`;
  bar.style.width = `${Math.max(4, (right - left) * sc.pxPerDay)}px`;
  bar.classList.add(computeStatus(task, state.project.statusDate));
  if (task.isSummary) bar.classList.add('summary');
  if (task.isMilestone) bar.classList.add('milestone');
  if (task.isCritical) bar.classList.add('critical');
  if (!task.isSummary && !task.isMilestone) {
    const p = document.createElement('div');
    p.className = 'bar-progress';
    p.style.width = `${task.percentComplete}%`;
    bar.appendChild(p);
  }
  const baselineMode = document.body.classList.contains('baseline-mode');
  if (baselineMode && task.baselineFinish) {
    const sevClass = baselineSeverityClass(task.deviationDays);
    if (sevClass) bar.classList.add(sevClass);
    const dev = task.deviationDays;
    const signo = dev > 0 ? '+' : '';
    bar.dataset.tooltip =
      `${task.name}\n` +
      `Programado: ${formatDate(task.baselineStart)} → ${formatDate(task.baselineFinish)}\n` +
      `Real:       ${formatDate(task.start)} → ${formatDate(task.finish)}\n` +
      `Desviación: ${signo}${dev} días (${baselineSeverityLabel(dev)})\n` +
      `Avance:     ${task.percentComplete}%`;
  } else {
    bar.dataset.tooltip = `${task.name}\nInicio: ${formatDate(task.start)}\nFin: ${formatDate(task.finish)}\nAvance: ${task.percentComplete}%`;
  }
  return bar;
}

function buildBaselineBar(task, sc) {
  const bb = document.createElement('div');
  bb.className = 'bar-baseline';
  if (task.isMilestone) {
    bb.classList.add('milestone');
    const offD = (task.baselineFinish - sc.origin) / MS_PER_DAY;
    bb.style.left = `${offD * sc.pxPerDay}px`;
    return bb;
  }
  const startOff = (task.baselineStart - sc.origin) / MS_PER_DAY;
  const durD = Math.max(0, (task.baselineFinish - task.baselineStart) / MS_PER_DAY);
  bb.style.left = `${startOff * sc.pxPerDay}px`;
  bb.style.width = `${Math.max(4, durD * sc.pxPerDay)}px`;
  return bb;
}

/* ---- 5) RENDER ---- */
function renderApp() {
  dom.projectStart.textContent = formatDate(state.project.start);
  dom.projectFinish.textContent = formatDate(state.project.finish);
  dom.statusDateInput.valueAsDate = state.project.statusDate;
  dom.lastUpdate.textContent = formatDate(new Date(document.lastModified || Date.now()));
  if (state.project.name) dom.projectName.textContent = state.project.name;

  state.window = computeWindow(state.project.statusDate, LOOKAHEAD_WEEKS);
  buildWindowRows();

  dom.dropzone.hidden = true;
  dom.errorPanel.hidden = true;
  if (dom.loading) dom.loading.hidden = true;
  document.body.classList.remove('la-readonly');

  if (!state.rows.length) {
    dom.viewer.hidden = true;
    dom.emptyState.hidden = false;
    dom.cierreBar.hidden = true;
    return;
  }
  // Visible primero, para medir el ancho real del panel derecho
  dom.viewer.hidden = false;
  dom.emptyState.hidden = true;

  // Ancho de columna ajustado para que las 5 semanas llenen el panel (vista centrada, sin scroll horizontal)
  state.scale = computeScale(state.window.start, state.window.end, currentColWidth());
  renderLeftPanel(visibleRows(), false);
  renderTimeline();
  renderGantt(visibleRows());
  renderStatusLine();
  renderCierreBar();
}

/* Nº de semana del proyecto (igual a Programa de Obra: S01 = semana del inicio) */
function semanaProyecto(monday) {
  const projMon = mondayOf(state.project.start || monday);
  return Math.round((monday - projMon) / (7 * MS_PER_DAY)) + 1;
}
function currentColWidth() {
  const avail = (dom.panelRight && dom.panelRight.clientWidth) || (window.innerWidth - 900);
  return Math.max(16, Math.floor(avail / (LOOKAHEAD_WEEKS * 7)));
}

/* rows: tareas a pintar; ro: solo lectura (semana cerrada, sin guardar) */
function renderLeftPanel(rows, ro) {
  const frag = document.createDocumentFragment();
  rows.forEach((task) => {
    const row = document.createElement('div');
    row.className = `task-row level-${Math.min(task.outlineLevel, 6)}`;
    if (task.isSummary) row.classList.add('summary');
    if (ro) row.classList.add('is-readonly');
    row.dataset.uid = task.uid;
    const indent = (task.outlineLevel - 1) * 14;
    const hasChildren = task.children.length > 0;
    const toggleSym = hasChildren ? (task.isCollapsed ? '▶' : '▼') : '';

    let checksHtml = '';
    if (isLeaf(task)) {
      const p = state.prog[task.uid] || {};
      checksHtml = CONSTRAINTS.map((c) =>
        `<div class="la-check"><input type="checkbox" data-uid="${task.uid}" data-c="${c}" ${p[c] ? 'checked' : ''} ${ro ? 'disabled' : ''}></div>`
      ).join('');
      checksHtml += `<div class="la-estado">${estadoPill(esListo(task.uid))}</div>`;
      if (esListo(task.uid)) row.classList.add('is-listo');
    } else {
      checksHtml = '<div class="la-check"></div>'.repeat(4) + '<div class="la-estado"></div>';
    }

    row.innerHTML = `
      <div class="task-toggle ${hasChildren ? '' : 'empty'}">${toggleSym}</div>
      <div class="task-name" title="${escapeHtml(task.name)}">
        <span class="task-name-text" style="padding-left:${indent}px">
          ${task.isMilestone ? '<span class="task-milestone-icon">◆</span>' : ''}${escapeHtml(task.name)}
        </span>
      </div>
      <div class="task-start">${formatDateShort(task.start)}</div>
      <div class="task-finish">${formatDateShort(task.finish)}</div>
      ${checksHtml}`;
    frag.appendChild(row);
  });
  dom.taskList.replaceChildren(frag);
}

function renderTimeline() {
  const sc = state.scale;
  const major = document.createElement('div');
  const minor = document.createElement('div');
  major.className = 'timeline-row'; minor.className = 'timeline-row';
  const weeks = Math.ceil(sc.cells.length / 7);
  const baseWeek = semanaProyecto(sc.origin);   // numeración igual a Programa de Obra (S01 = inicio del proyecto)
  for (let w = 0; w < weeks; w++) {
    const cell = document.createElement('div');
    cell.className = 'timeline-cell major';
    cell.style.width = `${7 * sc.colWidth}px`;
    cell.textContent = 'S' + String(baseWeek + w).padStart(2, '0');
    major.appendChild(cell);
  }
  const DAY = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  sc.cells.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'timeline-cell day';
    el.style.width = `${sc.colWidth}px`;
    el.textContent = DAY[c.start.getDay()];
    if (c.start.getDay() === 0 || c.start.getDay() === 6) el.classList.add('weekend');
    minor.appendChild(el);
  });
  dom.timelineHeader.replaceChildren(major, minor);
  dom.timelineHeader.style.width = `${sc.totalWidth}px`;
}

function renderGantt(rows) {
  const sc = state.scale;
  const frag = document.createDocumentFragment();
  sc.cells.forEach((cell, i) => {
    const line = document.createElement('div');
    line.className = 'gantt-grid-line';
    if (i > 0 && i % 7 === 0) line.classList.add('week-boundary');
    line.style.left = `${i * sc.colWidth}px`;
    frag.appendChild(line);
    const dow = cell.start.getDay();
    if (dow === 0 || dow === 6) {
      const band = document.createElement('div');
      band.className = 'gantt-weekend-band';
      band.style.left = `${i * sc.colWidth}px`;
      band.style.width = `${sc.colWidth}px`;
      frag.appendChild(band);
    }
  });
  rows.forEach((task) => {
    const row = document.createElement('div');
    row.className = 'gantt-row';
    row.dataset.uid = task.uid;
    if (document.body.classList.contains('baseline-mode') && task.baselineStart && task.baselineFinish) {
      row.appendChild(buildBaselineBar(task, sc));
    }
    if (task.start && task.finish) row.appendChild(buildBar(task, sc));
    frag.appendChild(row);
  });
  dom.ganttBody.replaceChildren(frag);
  dom.ganttBody.style.width = `${sc.totalWidth}px`;
  const sl = document.createElement('div');
  sl.className = 'status-line'; sl.id = 'statusLine';
  dom.ganttBody.appendChild(sl);
  dom.statusLine = sl;
}

function renderStatusLine() {
  const sc = state.scale, sl = dom.statusLine;
  if (!sc || !state.project.statusDate || !sl) return;
  const off = (state.project.statusDate - sc.origin) / MS_PER_DAY;
  if (off < 0 || off > sc.totalDays) { sl.hidden = true; return; }
  sl.hidden = false;
  sl.style.left = `${off * sc.pxPerDay}px`;
  sl.innerHTML = `<span class="status-line-label">${formatDate(state.project.statusDate)}</span>`;
}

/* ---- 6) RESTRICCIONES: localStorage + estado "Listo" ---- */
const progKey = () => `lookahead-prog-${toISO(state.window.start)}`;
function leerProg() {
  try { return JSON.parse(localStorage.getItem(progKey())) || {}; } catch { return {}; }
}
function guardarProg() {
  try { localStorage.setItem(progKey(), JSON.stringify(state.prog)); } catch (e) { /* ignora */ }
}
/* Progreso de la semana en curso: si hay borrador local úsalo; si no, siembra del
   avance publicado (en-curso.json) para que cualquiera vea las marcas del equipo.
   No se persiste la siembra: así un visor siempre toma la última versión publicada. */
function progSemanaEnCurso() {
  const local = leerProg();
  if (Object.keys(local).length) return local;
  if (state.enCurso && state.enCurso.inicio === toISO(state.window.start)) {
    const seed = {};
    (state.enCurso.tasks || []).forEach((t) => {
      seed[t.uid] = { mat: !!t.mat, mo: !!t.mo, proy: !!t.proy, prev: !!t.prev };
    });
    return seed;
  }
  return local;
}
function esListo(uid) {
  const p = state.prog[uid];
  return !!p && CONSTRAINTS.every((c) => !!p[c]);
}
function estadoPill(listo) {
  return listo
    ? '<span class="la-estado-pill listo">✓ Listo</span>'
    : '<span class="la-estado-pill pendiente">Pendiente</span>';
}
function onCheck(e) {
  const cb = e.target;
  if (!cb.matches('input[type="checkbox"][data-uid]')) return;
  const uid = cb.dataset.uid, c = cb.dataset.c;
  if (!state.prog[uid]) state.prog[uid] = {};
  state.prog[uid][c] = cb.checked;
  guardarProg();
  // Actualiza la fila sin re-render completo
  const row = dom.taskList.querySelector(`.task-row[data-uid="${uid}"]`);
  const listo = esListo(uid);
  if (row) {
    row.classList.toggle('is-listo', listo);
    const est = row.querySelector('.la-estado');
    if (est) est.innerHTML = estadoPill(listo);
  }
  updateProgreso();
}
function updateProgreso() {
  const leaves = state.rows.filter(isLeaf);
  const listas = leaves.filter((t) => esListo(t.uid)).length;
  dom.cierreProgress.innerHTML = `<b>${listas}</b> de <b>${leaves.length}</b> tareas listas en la ventana`;
}

/* ---- 7) CIERRE SEMANAL: acta PDF + JSON ---- */
function periodoTexto() {
  const ini = state.window.start;
  const fin = new Date(state.window.start); fin.setDate(fin.getDate() + 6);
  return `${ini.getDate()} de ${MESES[ini.getMonth()]} al ${fin.getDate()} de ${MESES[fin.getMonth()]} ${fin.getFullYear()}`;
}
function construirCierre() {
  const tasks = state.rows.map((t) => {
    const base = { uid: t.uid, name: t.name, nivel: t.outlineLevel, resumen: t.isSummary, hoja: isLeaf(t), grupo: grupoLote(t) };
    if (isLeaf(t)) {
      const p = state.prog[t.uid] || {};
      CONSTRAINTS.forEach((c) => base[c] = !!p[c]);
      base.listo = esListo(t.uid);
    }
    return base;
  });
  const leaves = tasks.filter((t) => t.hoja);
  return {
    inicio: toISO(state.window.start),
    periodo: periodoTexto(),
    semanas_ventana: LOOKAHEAD_WEEKS,
    fecha_cierre: toISO(new Date()),
    total_tareas: leaves.length,
    listas: leaves.filter((t) => t.listo).length,
    pendientes: leaves.filter((t) => !t.listo).length,
    tasks
  };
}
function renderActa(cierre) {
  const filas = cierre.tasks.map((t) => {
    if (t.resumen) {
      return `<tr class="grupo"><td colspan="6">${escapeHtml(t.name)}</td></tr>`;
    }
    const mk = (b) => b ? '<span class="acta-si">✔</span>' : '<span class="acta-no">—</span>';
    const indent = '&nbsp;'.repeat((t.nivel - 1) * 3);
    return `<tr>
      <td>${indent}${escapeHtml(t.name)}</td>
      <td class="c">${mk(t.mat)}</td>
      <td class="c">${mk(t.mo)}</td>
      <td class="c">${mk(t.proy)}</td>
      <td class="c">${mk(t.prev)}</td>
      <td class="c">${t.listo ? '<span class="acta-estado-listo">LISTO</span>' : '<span class="acta-estado-pend">Pendiente</span>'}</td>
    </tr>`;
  }).join('');

  dom.print.innerHTML = `
    <div class="acta-head">
      <div class="acta-head-left">
        <img src="assets/logo-metta.png" class="acta-logo" alt="Metta" onerror="this.style.display='none'">
        <div>
          <h2>Look Ahead · Análisis de restricciones</h2>
          <div class="sub">${escapeHtml(state.project.name || 'Altozano')} · Last Planner System</div>
          <div class="sub">Ventana de ${cierre.semanas_ventana} semanas · ${escapeHtml(cierre.periodo)}</div>
        </div>
      </div>
      <div class="acta-meta">
        <div><b>${cierre.listas}</b> listas / <b>${cierre.pendientes}</b> pendientes</div>
        <div>de ${cierre.total_tareas} tareas</div>
        <div>Cierre: <b>${formatDate(new Date(cierre.fecha_cierre + 'T12:00:00'))}</b></div>
      </div>
    </div>
    <table class="acta-table">
      <thead><tr>
        <th>Tarea</th><th>Materiales</th><th>Mano de obra</th><th>Proyecto def.</th><th>Trab. previos</th><th>Estado</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="acta-firmas">
      <div class="acta-firma"><div class="line">&nbsp;</div>Residente de obra</div>
      <div class="acta-firma"><div class="line">&nbsp;</div>Arq. Jorge Enríquez<br>Gerencia de proyecto</div>
    </div>`;
}
function onCerrar() {
  if (state.cerrada) return;
  state.cierreActual = construirCierre();
  renderActa(state.cierreActual);
  dom.btnJson.disabled = false;
  const nn = String(siguienteNumeroSemana()).padStart(2, '0');
  dom.cierreHint.innerHTML = `Acta generada. <strong>Descarga el JSON</strong> y commitéalo en <code>data/lookahead/cierres/semana-${nn}.json</code>, luego regístralo en <code>index.json</code>.`;
  window.print();
}
function siguienteNumeroSemana() {
  const nums = state.indexSemanas.map((s) => parseInt(s.semana, 10)).filter((n) => !isNaN(n));
  return (nums.length ? Math.max(...nums) : 0) + 1;
}
function descargarArchivo(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}
function descargarJSON() {
  if (!state.cierreActual) state.cierreActual = construirCierre();
  const nn = String(siguienteNumeroSemana()).padStart(2, '0');
  descargarArchivo(`semana-${nn}.json`, { semana: nn, ...state.cierreActual });
}

/* Avance intermedio: publica las marcas de la semana en curso SIN cerrarla */
function onActualizar() {
  if (state.cerrada) return;
  const marks = state.rows.filter(isLeaf)
    .filter((t) => state.prog[t.uid] && CONSTRAINTS.some((c) => state.prog[t.uid][c]))
    .map((t) => {
      const p = state.prog[t.uid];
      return { uid: t.uid, mat: !!p.mat, mo: !!p.mo, proy: !!p.proy, prev: !!p.prev };
    });
  const payload = {
    inicio: toISO(state.window.start),
    periodo: periodoTexto(),
    semana: String(semanaProyecto(state.window.start)).padStart(2, '0'),
    actualizado: toISO(new Date()),
    tasks: marks
  };
  descargarArchivo('en-curso.json', payload);
  dom.cierreHint.innerHTML = 'Avance exportado. Reemplaza <code>data/lookahead/en-curso.json</code> con el archivo descargado y commitéalo; el equipo verá las marcas al recargar. La semana sigue <strong>abierta</strong>.';
}

/* ---- 8) SEMANAS CERRADAS (solo lectura) ---- */
function renderCierreBar() {
  dom.cierreBar.hidden = false;
  const wk = String(semanaProyecto(state.window.start)).padStart(2, '0');
  dom.weekBadge.innerHTML = `<span class="la-badge"><span class="dot"></span>Semana ${wk} en curso</span>`;
  dom.weekPeriodo.textContent = '· ' + periodoTexto();
  updateProgreso();
  // Selector de semanas
  const opts = ['<option value="curso">Semana en curso</option>']
    .concat(state.indexSemanas
      .slice().sort((a, b) => parseInt(b.semana) - parseInt(a.semana))
      .map((s) => `<option value="${s.semana}">Semana ${s.semana} (cerrada)</option>`));
  dom.weekSelect.innerHTML = opts.join('');
  dom.weekSelect.value = 'curso';
}
async function verSemana(val) {
  if (val === 'curso') { state.cerrada = false; state.prog = leerProg(); renderApp(); return; }
  const entrada = state.indexSemanas.find((s) => s.semana === val);
  if (!entrada || !entrada.cierre) return;
  const cierre = await cargarJSON(LA_BASE + entrada.cierre);
  if (!cierre) return;
  state.cerrada = true;
  // Render solo lectura como tabla (sin barras): reusa el panel izquierdo
  document.body.classList.add('la-readonly');
  const rows = (cierre.tasks || []).map((t) => ({
    uid: t.uid, name: t.name, outlineLevel: t.nivel, isSummary: t.resumen,
    isMilestone: false, children: t.resumen ? [{}] : [], parent: null, isCollapsed: false,
    start: null, finish: null
  }));
  // estado/restricciones desde el snapshot
  state.prog = {};
  (cierre.tasks || []).forEach((t) => { if (t.hoja) state.prog[t.uid] = { mat: t.mat, mo: t.mo, proy: t.proy, prev: t.prev }; });
  renderLeftPanel(rows, true);
  dom.weekBadge.innerHTML = '<span class="la-badge cerrada"><span class="dot"></span>Semana cerrada</span>';
  dom.weekPeriodo.textContent = '· ' + (cierre.periodo || '');
  dom.cierreProgress.innerHTML = `<b>${cierre.listas}</b> de <b>${cierre.total_tareas}</b> tareas listas`;
  dom.viewer.hidden = false;
  dom.emptyState.hidden = true;
}

/* ---- COLAPSO ---- */
function toggleCollapse(uid) {
  const task = state.tasksFlat.find((t) => t.uid === uid);
  if (!task || !task.children.length) return;
  task.isCollapsed = !task.isCollapsed;
  if (task.isCollapsed) state.collapsed.add(uid); else state.collapsed.delete(uid);
  try { sessionStorage.setItem(COLLAPSE_KEY, JSON.stringify([...state.collapsed])); } catch (e) {}
  renderLeftPanel(visibleRows(), false);
  renderGantt(visibleRows());
  renderStatusLine();
}
function applyCollapseState() {
  try {
    const raw = sessionStorage.getItem(COLLAPSE_KEY);
    if (!raw) return;
    state.collapsed = new Set(JSON.parse(raw));
    state.tasksFlat.forEach((t) => { if (state.collapsed.has(t.uid)) t.isCollapsed = true; });
  } catch (e) {}
}
/* ---- SYNC scroll/hover entre paneles ---- */
function setupScrollSync() {
  let lock = false;
  const l = dom.panelLeftBody, r = dom.panelRight;
  const sync = (src, dst) => { if (lock) return; lock = true; dst.scrollTop = src.scrollTop; requestAnimationFrame(() => lock = false); };
  l.addEventListener('scroll', () => sync(l, r));
  r.addEventListener('scroll', () => sync(r, l));
}
function setupHoverSync() {
  const on = (sel) => (e) => {
    const row = e.target.closest(sel); if (!row) return;
    const uid = row.dataset.uid; if (!uid) return;
    document.querySelectorAll(`.task-row[data-uid="${uid}"], .gantt-row[data-uid="${uid}"]`).forEach((el) => el.classList.add('hover'));
  };
  const off = (e) => {
    const row = e.target.closest('.task-row, .gantt-row'); if (!row) return;
    const uid = row.dataset.uid;
    document.querySelectorAll(`.task-row[data-uid="${uid}"], .gantt-row[data-uid="${uid}"]`).forEach((el) => el.classList.remove('hover'));
  };
  dom.taskList.addEventListener('mouseover', on('.task-row'));
  dom.taskList.addEventListener('mouseout', off);
  dom.ganttBody.addEventListener('mouseover', on('.gantt-row'));
  dom.ganttBody.addEventListener('mouseout', off);
}

/* ---- 9) BOOTSTRAP ---- */
async function init() {
  dom.projectName = $('projectName');
  dom.projectStart = $('projectStart');
  dom.projectFinish = $('projectFinish');
  dom.statusDateInput = $('statusDate');
  dom.lastUpdate = $('lastUpdate');
  dom.viewer = $('viewer');
  dom.dropzone = $('dropzone');
  dom.errorPanel = $('errorPanel');
  dom.errorMessage = $('errorMessage');
  dom.emptyState = $('emptyState');
  dom.loading = $('ganttLoading');
  dom.taskList = $('taskList');
  dom.timelineHeader = $('timelineHeader');
  dom.ganttBody = $('ganttBody');
  dom.panelLeftBody = document.querySelector('.panel-left-body');
  dom.panelRight = $('panelRight');
  dom.statusLine = $('statusLine');
  dom.fileInput = $('fileInput');
  dom.btnFilePicker = $('btnFilePicker');
  dom.cierreBar = $('laCierreBar');
  dom.weekBadge = $('laWeekBadge');
  dom.weekPeriodo = $('laWeekPeriodo');
  dom.cierreProgress = $('laCierreProgress');
  dom.weekSelect = $('laWeekSelect');
  dom.btnActualizar = $('btnActualizar');
  dom.btnCerrar = $('btnCerrar');
  dom.btnJson = $('btnJson');
  dom.cierreHint = $('laCierreHint');
  dom.print = $('la-print');

  const bhc = $('btnHeaderCollapse');
  if (bhc) bhc.addEventListener('click', () => document.body.classList.toggle('header-compact'));
  const btnBaseline = $('btnBaseline');
  const legend = $('baselineLegend');
  function applyBaselineMode(on) {
    document.body.classList.toggle('baseline-mode', on);
    if (btnBaseline) btnBaseline.classList.toggle('active', on);
    if (legend) legend.hidden = !on;
    try { localStorage.setItem('altozano.baselineMode', on ? '1' : '0'); } catch (e) {}
    renderGantt(visibleRows());
    renderStatusLine();
  }
  if (btnBaseline) {
    btnBaseline.addEventListener('click', () => {
      applyBaselineMode(!document.body.classList.contains('baseline-mode'));
    });
  }
  let __blInit = false;
  try { __blInit = localStorage.getItem('altozano.baselineMode') === '1'; } catch (e) {}
  if (__blInit) applyBaselineMode(true);
  dom.taskList.addEventListener('click', (e) => {
    const tog = e.target.closest('.task-toggle');
    if (!tog || tog.classList.contains('empty')) return;
    const row = tog.closest('.task-row');
    if (row) toggleCollapse(parseInt(row.dataset.uid, 10));
  });
  dom.taskList.addEventListener('change', onCheck);
  dom.btnActualizar.addEventListener('click', onActualizar);
  dom.btnCerrar.addEventListener('click', onCerrar);
  dom.btnJson.addEventListener('click', descargarJSON);
  dom.weekSelect.addEventListener('change', () => verSemana(dom.weekSelect.value));
  dom.statusDateInput.addEventListener('change', () => {
    const d = dom.statusDateInput.valueAsDate;
    if (!d) return;
    state.project.statusDate = d;
    state.window = computeWindow(d, LOOKAHEAD_WEEKS);
    state.prog = progSemanaEnCurso();
    renderApp();
  });

  setupScrollSync();
  setupHoverSync();
  setupDropzone();

  // Recalcula el ancho de columna al redimensionar (mantiene el Gantt llenando el panel)
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (state.cerrada || !state.rows.length) return;
      state.scale = computeScale(state.window.start, state.window.end, currentColWidth());
      renderTimeline();
      renderGantt(visibleRows());
      renderStatusLine();
    }, 150);
  });

  const idx = await cargarJSON(LA_INDEX_PATH);
  state.indexSemanas = (idx && Array.isArray(idx.semanas)) ? idx.semanas : [];
  const ec = await cargarJSON(LA_ENCURSO_PATH);
  state.enCurso = (ec && ec.inicio) ? ec : null;

  try {
    const resp = await fetch(`${XML_PATH}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    loadFromText(await resp.text());
  } catch (err) {
    console.warn('Fetch XML falló:', err);
    showDropzone();
  }
}
function loadFromText(xmlText) {
  try {
    const doc = parseXmlText(xmlText);
    const meta = extractProjectMeta(doc);
    // La "semana en curso" se ancla en HOY (como los demás módulos del tablero),
    // no en el StatusDate del XML. La fecha de corte queda editable para planear otra semana.
    meta.statusDate = new Date();
    const flat = xmlToTasks(doc);
    if (!flat.length) throw new Error('El XML no contiene tareas válidas.');
    buildTree(flat);
    if (!meta.start) meta.start = flat.reduce((m, t) => t.start && (!m || t.start < m) ? t.start : m, null);
    if (!meta.finish) meta.finish = flat.reduce((m, t) => t.finish && (!m || t.finish > m) ? t.finish : m, null);
    state.project = meta;
    state.tasksFlat = flat;
    applyCollapseState();
    // Ventana provisional para la clave de progreso
    state.window = computeWindow(state.project.statusDate, LOOKAHEAD_WEEKS);
    state.prog = progSemanaEnCurso();
    renderApp();
  } catch (err) {
    console.error(err);
    showError(err.message || String(err));
  }
}
function showDropzone() {
  dom.viewer.hidden = true; dom.errorPanel.hidden = true; dom.emptyState.hidden = true;
  dom.dropzone.hidden = false; if (dom.loading) dom.loading.hidden = true;
  dom.cierreBar.hidden = true;
}
function showError(msg) {
  dom.viewer.hidden = true; dom.dropzone.hidden = true; dom.emptyState.hidden = true;
  dom.errorPanel.hidden = false; dom.errorMessage.textContent = msg;
  if (dom.loading) dom.loading.hidden = true; dom.cierreBar.hidden = true;
}
function setupDropzone() {
  const dz = dom.dropzone;
  dom.btnFilePicker.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) readFile(f); });
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
  dz.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });
}
function readFile(file) {
  const r = new FileReader();
  r.onload = () => loadFromText(r.result);
  r.onerror = () => showError('No se pudo leer el archivo.');
  r.readAsText(file);
}

/* ---- HELPERS ---- */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatDate(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
const SHORT_DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function formatDateShort(d) {
  if (!d) return '—';
  return `${SHORT_DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
async function cargarJSON(ruta) {
  try {
    const resp = await fetch(`${ruta}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) { console.warn('No se pudo cargar', ruta, e.message); return null; }
}

document.addEventListener('DOMContentLoaded', init);
