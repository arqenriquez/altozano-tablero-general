/* ================================================================
   ALTOZANO · TABLERO · Programa de Obra (Gantt Viewer)
   Visualizador de archivos XML de MS Project en HTML/JS Vanilla.

   Flujo de actualización semanal:
     1) Exportar el .mpp como .xml desde MS Project (Archivo → Guardar como → XML)
     2) Reemplazar data/programa-altozano.xml con el nuevo export
     3) Commit + push a GitHub — el equipo ve el programa actualizado

   Secciones:
     1) Constantes y estado global
     2) Parser XML
     3) Builder de árbol
     4) Cálculo de escala de timeline
     5) Render DOM
     6) Lógica de estados y colores
     7) Event handlers
     8) Bootstrap (fetch + dropzone)
   ================================================================ */

/* ---- 1) CONSTANTES Y ESTADO GLOBAL ---- */
const XML_PATH = 'data/programa-altozano.xml';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HOURS_PER_WORKDAY = 8;
const COLLAPSE_STORAGE_KEY = 'altozanoGanttCollapseState';

const state = {
  project: { name: '', start: null, finish: null, statusDate: null },
  tasksFlat: [],
  tasksTree: [],
  scale: null,
  collapsed: new Set(),
  lookAheadActive: false,
  lookAheadWindow: null,
  lookAheadWeeks: 5
};

const $ = (id) => document.getElementById(id);
const dom = {};

/* ---- 2) PARSER XML ---- */
function parseXmlText(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  const errNode = doc.querySelector('parsererror');
  if (errNode) throw new Error('El archivo XML está mal formado: ' + errNode.textContent.slice(0, 200));
  return doc;
}

function getChildText(node, tagName) {
  for (const c of node.children) {
    if (c.localName === tagName) return c.textContent;
  }
  return null;
}

function parseDurationDays(iso) {
  if (!iso) return 0;
  const mD = iso.match(/P(?:(\d+)D)?/);
  const mT = iso.match(/T(?:(\d+)H)?(?:(\d+)M)?/);
  const days = mD && mD[1] ? parseInt(mD[1], 10) : 0;
  const hours = mT && mT[1] ? parseInt(mT[1], 10) : 0;
  const mins = mT && mT[2] ? parseInt(mT[2], 10) : 0;
  const totalHours = days * HOURS_PER_WORKDAY + hours + mins / 60;
  return Math.max(0, Math.round(totalHours / HOURS_PER_WORKDAY));
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function extractProjectMeta(doc) {
  const root = doc.documentElement;
  const name = getChildText(root, 'Name') || getChildText(root, 'Title') || 'Proyecto sin nombre';
  const start = parseDate(getChildText(root, 'StartDate'));
  const finish = parseDate(getChildText(root, 'FinishDate'));
  const statusDate = parseDate(getChildText(root, 'StatusDate')) || new Date();
  return { name, start, finish, statusDate };
}

function xmlToTasks(doc) {
  const taskNodes = doc.getElementsByTagName('Task');
  const tasks = [];
  for (const node of taskNodes) {
    const uid = parseInt(getChildText(node, 'UID'), 10);
    if (Number.isNaN(uid) || uid === 0) continue;
    const name = getChildText(node, 'Name');
    if (!name) continue;
    tasks.push({
      uid,
      name,
      outlineLevel: parseInt(getChildText(node, 'OutlineLevel'), 10) || 1,
      isSummary: getChildText(node, 'Summary') === '1',
      isMilestone: getChildText(node, 'Milestone') === '1',
      isCritical: getChildText(node, 'Critical') === '1',
      wbs: getChildText(node, 'WBS') || '',
      start: parseDate(getChildText(node, 'Start')),
      finish: parseDate(getChildText(node, 'Finish')),
      percentComplete: Math.max(0, Math.min(100, parseInt(getChildText(node, 'PercentComplete'), 10) || 0)),
      durationDays: parseDurationDays(getChildText(node, 'Duration')),
      children: [],
      parent: null,
      isCollapsed: false,
      isHidden: false
    });
  }
  return tasks;
}

/* ---- 3) BUILDER DE ÁRBOL ---- */
function buildTree(flatTasks) {
  const stack = [];
  flatTasks.forEach((task) => {
    task.parent = stack[task.outlineLevel - 1] || null;
    if (task.parent) task.parent.children.push(task);
    stack[task.outlineLevel] = task;
    for (let i = task.outlineLevel + 1; i < stack.length; i++) stack[i] = undefined;
  });
  return flatTasks.filter((t) => t.outlineLevel === 1);
}

/* ---- 4) ESCALA DE TIMELINE ---- */
function computeScale(projectStart, projectFinish) {
  const mode = 'daily';
  const colWidth = 18;
  const origin = new Date(projectStart);
  const dow = origin.getDay();
  origin.setDate(origin.getDate() + (dow === 0 ? -6 : 1 - dow));
  origin.setHours(0, 0, 0, 0);

  const cells = [];
  let cursor = new Date(origin);
  while (cursor <= projectFinish) {
    const next = new Date(cursor);
    next.setDate(next.getDate() + 1);
    cells.push({ start: new Date(cursor), end: new Date(next) });
    cursor = next;
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const next = new Date(last.end);
    next.setDate(next.getDate() + 1);
    cells.push({ start: new Date(last.end), end: next });
  }
  return { mode, colWidth, origin, cells, pxPerDay: colWidth, totalWidth: cells.length * colWidth, totalProjectDays: cells.length };
}

/* ---- 5) RENDER DOM ---- */
function renderApp() {
  if (!state.tasksFlat.length) {
    dom.viewer.hidden = true;
    dom.emptyState.hidden = false;
    return;
  }
  dom.projectStart.textContent = formatDate(state.project.start);
  dom.projectFinish.textContent = formatDate(state.project.finish);
  dom.statusDateInput.valueAsDate = state.project.statusDate;
  dom.lastUpdate.textContent = formatDate(new Date(document.lastModified || Date.now()));
  if (state.project.name) dom.projectName.textContent = state.project.name;

  applyCollapseState();
  recomputeHiddenFlags();

  state.scale = computeScale(state.project.start, state.project.finish);
  renderLeftPanel();
  renderTimeline();
  renderGantt();
  renderStatusLine();

  dom.viewer.hidden = false;
  dom.emptyState.hidden = true;
  dom.dropzone.hidden = true;
  dom.errorPanel.hidden = true;
}

function renderLeftPanel() {
  const frag = document.createDocumentFragment();
  state.tasksFlat.forEach((task) => {
    const row = document.createElement('div');
    row.className = `task-row level-${Math.min(task.outlineLevel, 6)}`;
    if (task.isSummary) row.classList.add('summary');
    if (task.isHidden) row.classList.add('is-hidden');
    row.dataset.uid = task.uid;
    const indent = (task.outlineLevel - 1) * 14;
    const hasChildren = task.children.length > 0;
    const toggleSym = hasChildren ? (task.isCollapsed ? '▶' : '▼') : '';
    row.innerHTML = `
      <div class="task-toggle ${hasChildren ? '' : 'empty'}">${toggleSym}</div>
      <div class="task-name" title="${escapeHtml(task.name)}">
        <span class="task-name-text" style="padding-left:${indent}px">
          ${task.isMilestone ? '<span class="task-milestone-icon">◆</span>' : ''}${escapeHtml(task.name)}
        </span>
      </div>
      <div class="task-dur">${formatDuration(task.durationDays)}</div>
      <div class="task-start">${formatDateShort(task.start)}</div>
      <div class="task-finish">${formatDateShort(task.finish)}</div>
    `;
    frag.appendChild(row);
  });
  dom.taskList.replaceChildren(frag);
}

function renderTimeline() {
  const sc = state.scale;
  const major = document.createElement('div');
  const minor = document.createElement('div');
  major.className = 'timeline-row';
  minor.className = 'timeline-row';

  const weekCount = Math.ceil(sc.cells.length / 7);
  for (let w = 0; w < weekCount; w++) {
    const cell = document.createElement('div');
    cell.className = 'timeline-cell major';
    cell.style.width = `${7 * sc.colWidth}px`;
    cell.textContent = `S${String(w + 1).padStart(2, '0')}`;
    major.appendChild(cell);
  }

  const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  sc.cells.forEach((cell) => {
    const c = document.createElement('div');
    c.className = 'timeline-cell day';
    c.style.width = `${sc.colWidth}px`;
    const dow = cell.start.getDay();
    c.textContent = DAY_LETTERS[dow];
    if (dow === 0 || dow === 6) c.classList.add('weekend');
    minor.appendChild(c);
  });

  dom.timelineHeader.replaceChildren(major, minor);
  dom.timelineHeader.style.width = `${sc.totalWidth}px`;
}

function renderGantt() {
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

  state.tasksFlat.forEach((task) => {
    const row = document.createElement('div');
    row.className = 'gantt-row';
    if (task.isHidden) row.classList.add('is-hidden');
    row.dataset.uid = task.uid;
    if (task.start && task.finish) row.appendChild(buildBar(task, sc));
    frag.appendChild(row);
  });

  const ganttBody = dom.ganttBody;
  ganttBody.replaceChildren(frag);
  ganttBody.style.width = `${sc.totalWidth}px`;

  const statusLine = document.createElement('div');
  statusLine.className = 'status-line';
  statusLine.id = 'statusLine';
  ganttBody.appendChild(statusLine);
  dom.statusLine = statusLine;
}

function buildBar(task, sc) {
  const bar = document.createElement('div');
  bar.className = 'bar';
  const startOffsetDays = (task.start - sc.origin) / MS_PER_DAY;
  const durDays = Math.max(0, (task.finish - task.start) / MS_PER_DAY);
  bar.style.left = `${startOffsetDays * sc.pxPerDay}px`;
  bar.style.width = `${Math.max(4, durDays * sc.pxPerDay)}px`;

  const status = computeStatus(task, state.project.statusDate);
  bar.classList.add(status);
  if (task.isSummary) bar.classList.add('summary');
  if (task.isMilestone) bar.classList.add('milestone');
  if (task.isCritical) bar.classList.add('critical');

  if (!task.isSummary && !task.isMilestone) {
    const progress = document.createElement('div');
    progress.className = 'bar-progress';
    progress.style.width = `${task.percentComplete}%`;
    bar.appendChild(progress);
  }

  bar.dataset.tooltip =
    `${task.name}\n` +
    `Inicio: ${formatDate(task.start)}\n` +
    `Fin:    ${formatDate(task.finish)}\n` +
    `Avance: ${task.percentComplete}%  •  ${task.durationDays}d` +
    (task.isCritical ? '\n(Ruta crítica)' : '');
  return bar;
}

function renderStatusLine() {
  const sc = state.scale;
  if (!sc || !state.project.statusDate) return;
  const statusLine = dom.statusLine;
  if (!statusLine) return;
  const offsetDays = (state.project.statusDate - sc.origin) / MS_PER_DAY;
  if (offsetDays < 0 || offsetDays > sc.totalProjectDays) {
    statusLine.hidden = true;
    return;
  }
  statusLine.hidden = false;
  statusLine.style.left = `${offsetDays * sc.pxPerDay}px`;
  statusLine.innerHTML = `<span class="status-line-label">${formatDate(state.project.statusDate)}</span>`;
}

/* ---- 6) LÓGICA DE ESTADOS Y COLORES ---- */
function computeStatus(task, statusDate) {
  if (task.isSummary) return 'summary';
  const pct = task.percentComplete;
  const finish = task.finish;
  const start = task.start;
  if (pct >= 100) return 'completed';
  if (finish && finish < statusDate && pct < 100) return 'delayed';
  if (start && start <= statusDate && finish && finish >= statusDate) {
    const totalSpanDays = Math.max(1, (finish - start) / MS_PER_DAY);
    const elapsed = Math.max(0, (statusDate - start) / MS_PER_DAY);
    const pctExpected = (elapsed / totalSpanDays) * 100;
    if (pct < pctExpected - 10) return 'delayed';
    return 'in-progress';
  }
  if (start && start < statusDate && pct === 0) return 'overdue';
  return 'not-started';
}

/* ---- 7) EVENT HANDLERS ---- */
function toggleCollapse(uid) {
  const task = state.tasksFlat.find((t) => t.uid === uid);
  if (!task || !task.children.length) return;
  task.isCollapsed = !task.isCollapsed;
  if (task.isCollapsed) state.collapsed.add(uid);
  else state.collapsed.delete(uid);
  persistCollapseState();
  recomputeHiddenFlags();
  applyHiddenToDom();
  const toggleEl = dom.taskList.querySelector(`.task-row[data-uid="${uid}"] .task-toggle`);
  if (toggleEl) toggleEl.textContent = task.isCollapsed ? '▶' : '▼';
}

function recomputeHiddenFlags() {
  let inLookAhead = null;
  if (state.lookAheadActive && state.lookAheadWindow) {
    const { start: ws, end: we } = state.lookAheadWindow;
    inLookAhead = new Set();
    state.tasksFlat.forEach((t) => {
      if (!t.start) return;
      if (t.start >= ws && t.start < we) {
        let cur = t;
        while (cur) { inLookAhead.add(cur.uid); cur = cur.parent; }
      }
    });
  }
  state.tasksFlat.forEach((t) => {
    if (inLookAhead && !inLookAhead.has(t.uid)) {
      t.isHidden = true;
      return;
    }
    let p = t.parent;
    let hidden = false;
    while (p) {
      if (p.isCollapsed) { hidden = true; break; }
      p = p.parent;
    }
    t.isHidden = hidden;
  });
}

function computeLookAheadWindow(fromDate, weeks) {
  const monday = new Date(fromDate);
  const dow = monday.getDay();
  monday.setDate(monday.getDate() + (dow === 0 ? -6 : 1 - dow));
  monday.setHours(0, 0, 0, 0);
  const end = new Date(monday);
  end.setDate(end.getDate() + weeks * 7);
  return { start: monday, end };
}

function toggleLookAhead() {
  state.lookAheadActive = !state.lookAheadActive;
  state.lookAheadWindow = state.lookAheadActive
    ? computeLookAheadWindow(state.project.statusDate, state.lookAheadWeeks)
    : null;
  const btn = $('btnLookAhead');
  if (btn) btn.classList.toggle('active', state.lookAheadActive);
  recomputeHiddenFlags();
  applyHiddenToDom();
  if (state.lookAheadActive && state.scale && dom.panelRight) {
    const offsetDays = (state.lookAheadWindow.start - state.scale.origin) / MS_PER_DAY;
    dom.panelRight.scrollLeft = Math.max(0, offsetDays * state.scale.pxPerDay - 20);
  }
}

function applyHiddenToDom() {
  state.tasksFlat.forEach((t) => {
    const rowL = dom.taskList.querySelector(`.task-row[data-uid="${t.uid}"]`);
    const rowR = dom.ganttBody.querySelector(`.gantt-row[data-uid="${t.uid}"]`);
    if (rowL) rowL.classList.toggle('is-hidden', t.isHidden);
    if (rowR) rowR.classList.toggle('is-hidden', t.isHidden);
  });
}

function applyCollapseState() {
  try {
    const raw = sessionStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (!raw) return;
    state.collapsed = new Set(JSON.parse(raw));
    state.tasksFlat.forEach((t) => { if (state.collapsed.has(t.uid)) t.isCollapsed = true; });
  } catch (e) { /* ignorar */ }
}

function persistCollapseState() {
  try {
    sessionStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...state.collapsed]));
  } catch (e) { /* ignorar */ }
}

function expandAll() {
  state.tasksFlat.forEach((t) => { t.isCollapsed = false; });
  state.collapsed.clear();
  persistCollapseState();
  recomputeHiddenFlags();
  renderLeftPanel();
  applyHiddenToDom();
}

function collapseAll() {
  state.tasksFlat.forEach((t) => {
    if (!t.isSummary || !t.children.length) return;
    if (t.outlineLevel === 1) {
      t.isCollapsed = false;
      state.collapsed.delete(t.uid);
    } else {
      t.isCollapsed = true;
      state.collapsed.add(t.uid);
    }
  });
  persistCollapseState();
  recomputeHiddenFlags();
  renderLeftPanel();
  applyHiddenToDom();
}

function setupScrollSync() {
  let isSyncing = false;
  const left = dom.panelLeftBody;
  const right = dom.panelRight;
  left.addEventListener('scroll', () => {
    if (isSyncing) return;
    isSyncing = true;
    right.scrollTop = left.scrollTop;
    requestAnimationFrame(() => { isSyncing = false; });
  });
  right.addEventListener('scroll', () => {
    if (isSyncing) return;
    isSyncing = true;
    left.scrollTop = right.scrollTop;
    requestAnimationFrame(() => { isSyncing = false; });
  });
}

function setupHoverSync() {
  const handler = (selector) => (e) => {
    const row = e.target.closest(selector);
    if (!row) return;
    const uid = row.dataset.uid;
    if (!uid) return;
    document.querySelectorAll(`.task-row[data-uid="${uid}"], .gantt-row[data-uid="${uid}"]`)
      .forEach((el) => el.classList.add('hover'));
  };
  const leave = (e) => {
    const row = e.target.closest('.task-row, .gantt-row');
    if (!row) return;
    const uid = row.dataset.uid;
    document.querySelectorAll(`.task-row[data-uid="${uid}"], .gantt-row[data-uid="${uid}"]`)
      .forEach((el) => el.classList.remove('hover'));
  };
  dom.taskList.addEventListener('mouseover', handler('.task-row'));
  dom.taskList.addEventListener('mouseout', leave);
  dom.ganttBody.addEventListener('mouseover', handler('.gantt-row'));
  dom.ganttBody.addEventListener('mouseout', leave);
}

function setupToggleHandler() {
  dom.taskList.addEventListener('click', (e) => {
    const tog = e.target.closest('.task-toggle');
    if (!tog || tog.classList.contains('empty')) return;
    const row = tog.closest('.task-row');
    if (!row) return;
    toggleCollapse(parseInt(row.dataset.uid, 10));
  });
}

function setupStatusDateHandler() {
  dom.statusDateInput.addEventListener('change', () => {
    const d = dom.statusDateInput.valueAsDate;
    if (!d) return;
    state.project.statusDate = d;
    if (state.lookAheadActive) {
      state.lookAheadWindow = computeLookAheadWindow(state.project.statusDate, state.lookAheadWeeks);
      recomputeHiddenFlags();
      applyHiddenToDom();
    }
    renderGantt();
    renderStatusLine();
  });
}

/* ---- 8) BOOTSTRAP ---- */
async function init() {
  dom.projectName = $('projectName');
  dom.projectStart = $('projectStart');
  dom.projectFinish = $('projectFinish');
  dom.statusDateInput = $('statusDate');
  dom.lastUpdate = $('lastUpdate');
  dom.btnExpandAll = $('btnExpandAll');
  dom.btnCollapseAll = $('btnCollapseAll');
  dom.viewer = $('viewer');
  dom.dropzone = $('dropzone');
  dom.errorPanel = $('errorPanel');
  dom.errorMessage = $('errorMessage');
  dom.emptyState = $('emptyState');
  dom.taskList = $('taskList');
  dom.timelineHeader = $('timelineHeader');
  dom.ganttBody = $('ganttBody');
  dom.panelLeftBody = document.querySelector('.panel-left-body');
  dom.panelRight = $('panelRight');
  dom.statusLine = $('statusLine');
  dom.fileInput = $('fileInput');
  dom.btnFilePicker = $('btnFilePicker');

  dom.btnExpandAll.addEventListener('click', expandAll);
  dom.btnCollapseAll.addEventListener('click', collapseAll);
  const btnDetailsToggle = $('btnDetailsToggle');
  if (btnDetailsToggle) btnDetailsToggle.addEventListener('click', () => document.body.classList.toggle('details-mode'));
  const btnLookAhead = $('btnLookAhead');
  if (btnLookAhead) btnLookAhead.addEventListener('click', toggleLookAhead);
  const btnHeaderCollapse = $('btnHeaderCollapse');
  if (btnHeaderCollapse) btnHeaderCollapse.addEventListener('click', () => document.body.classList.toggle('header-compact'));
  const btnNameShrink = $('btnNameShrink');
  if (btnNameShrink) btnNameShrink.addEventListener('click', () => document.body.classList.toggle('left-compact'));

  setupToggleHandler();
  setupScrollSync();
  setupHoverSync();
  setupStatusDateHandler();
  setupDropzone();

  try {
    const resp = await fetch(`${XML_PATH}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    loadFromText(await resp.text());
  } catch (err) {
    console.warn('Fetch del XML falló, mostrando dropzone:', err);
    showDropzone();
  }
}

function loadFromText(xmlText) {
  try {
    const doc = parseXmlText(xmlText);
    const meta = extractProjectMeta(doc);
    const flat = xmlToTasks(doc);
    if (!flat.length) throw new Error('El XML no contiene tareas válidas.');
    buildTree(flat);
    if (!meta.start) meta.start = flat.reduce((m, t) => t.start && (!m || t.start < m) ? t.start : m, null);
    if (!meta.finish) meta.finish = flat.reduce((m, t) => t.finish && (!m || t.finish > m) ? t.finish : m, null);
    state.project = meta;
    state.tasksFlat = flat;
    state.tasksTree = flat.filter((t) => t.outlineLevel === 1);
    renderApp();
  } catch (err) {
    console.error(err);
    showError(err.message || String(err));
  }
}

function showDropzone() {
  dom.viewer.hidden = true;
  dom.errorPanel.hidden = true;
  dom.emptyState.hidden = true;
  dom.dropzone.hidden = false;
}

function showError(msg) {
  dom.viewer.hidden = true;
  dom.dropzone.hidden = true;
  dom.emptyState.hidden = true;
  dom.errorPanel.hidden = false;
  dom.errorMessage.textContent = msg;
}

function setupDropzone() {
  const dz = dom.dropzone;
  dom.btnFilePicker.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) readFile(f);
  });
  ['dragenter', 'dragover'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
  dz.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files[0];
    if (f) readFile(f);
  });
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = () => loadFromText(reader.result);
  reader.onerror = () => showError('No se pudo leer el archivo seleccionado.');
  reader.readAsText(file);
}

/* ---- HELPERS ---- */
function formatDate(d) {
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const SHORT_DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function formatDateShort(d) {
  if (!d) return '—';
  return `${SHORT_DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
}

function formatDuration(days) {
  if (days === 0) return '0 días';
  if (days === 1) return '1 día';
  return `${days} días`;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', init);
