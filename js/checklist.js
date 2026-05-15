/* ============================================================
   ALTOZANO · TABLERO · Checklist de calidad
   Lee data/checklist/index.json y muestra cada checklist como
   tarjeta. Al abrir uno, descarga el .xlsx y lo digitaliza como
   tabla estilo Notion usando SheetJS (librería XLSX global).
   ============================================================ */

const $ = (sel) => document.querySelector(sel);

let CHECKLISTS = [];
let filtroActivo = 'todos';

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];
function fechaLarga(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MESES[m - 1]}, ${y}`;
}

async function cargarJSON(ruta) {
  try {
    const resp = await fetch(`${ruta}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    return null;
  }
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---- Filtros por proceso ---- */
function renderToolbar() {
  const procesos = [...new Set(CHECKLISTS.map(c => c.proceso).filter(Boolean))].sort();
  const toolbar = $('#chk-toolbar');
  toolbar.innerHTML = '';
  const chips = [['todos', 'Todos'], ...procesos.map(p => [p, p])];
  chips.forEach(([val, label]) => {
    const btn = document.createElement('button');
    btn.className = 'chk-filter' + (val === filtroActivo ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      filtroActivo = val;
      renderToolbar();
      renderGrid();
    });
    toolbar.appendChild(btn);
  });
}

/* ---- Grid de tarjetas ---- */
function renderGrid() {
  const grid = $('#checklist-grid');
  const lista = filtroActivo === 'todos'
    ? CHECKLISTS
    : CHECKLISTS.filter(c => c.proceso === filtroActivo);

  if (!lista.length) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">✅</div><h3>Sin checklists en este filtro</h3><p>Selecciona otro proceso.</p></div>';
    return;
  }

  grid.innerHTML = '';
  lista.forEach((c, i) => {
    const card = document.createElement('button');
    card.className = `checklist-card fade-up delay-${i % 3}`;
    card.innerHTML = `
      <div class="checklist-card-icon">📋</div>
      <h3>${escapeHtml(c.nombre)}</h3>
      <div class="meta">
        ${c.proceso ? `<span class="tag">${escapeHtml(c.proceso)}</span>` : ''}
        ${c.vivienda ? `<span class="tag">${escapeHtml(c.vivienda)}</span>` : ''}
      </div>
      <div class="meta">
        ${c.fecha ? `<span>📅 ${fechaLarga(c.fecha)}</span>` : ''}
        <span class="mono" style="font-size:0.7rem">${escapeHtml(c.archivo)}</span>
      </div>
    `;
    card.addEventListener('click', () => abrirChecklist(c));
    grid.appendChild(card);
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-up').forEach(el => io.observe(el));
}

/* ---- Abre el panel y digitaliza el .xlsx ---- */
async function abrirChecklist(c) {
  $('#panel-eyebrow').textContent = [c.proceso, c.vivienda].filter(Boolean).join(' · ') || 'Checklist';
  $('#panel-title').textContent = c.nombre;
  $('#panel-body').innerHTML = '<div class="loading">Digitalizando archivo de Excel...</div>';
  $('#panel').classList.add('open');
  $('#overlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  try {
    const resp = await fetch(`data/checklist/${c.archivo}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = await resp.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });

    let html = '';
    if (c.fecha) html += `<div class="panel-section-title">Registrado el ${fechaLarga(c.fecha)}</div>`;

    // Renderiza cada hoja del libro
    wb.SheetNames.forEach((nombreHoja) => {
      const hoja = wb.Sheets[nombreHoja];
      const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false, defval: '' });
      if (!filas.length) return;
      if (wb.SheetNames.length > 1) {
        html += `<div class="panel-section-title">Hoja: ${escapeHtml(nombreHoja)}</div>`;
      }
      html += '<div class="xlsx-table-wrap"><table class="xlsx-table"><tbody>';
      filas.forEach((fila) => {
        html += '<tr>';
        fila.forEach((celda) => {
          html += `<td>${escapeHtml(celda)}</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    });

    html += `<div style="margin-top:1.5rem">
      <a href="data/checklist/${encodeURIComponent(c.archivo)}" download
         style="color:var(--accent);font-weight:600;text-decoration:none;font-size:0.88rem">
        ↓ Descargar archivo original (${escapeHtml(c.archivo)})
      </a></div>`;

    $('#panel-body').innerHTML = html || '<div class="empty-state"><p>El archivo no contiene datos legibles.</p></div>';
  } catch (e) {
    $('#panel-body').innerHTML = `
      <div class="empty-state">
        <div class="icon">⚠️</div>
        <h3>No se pudo leer el archivo</h3>
        <p>Verifica que exista <code>data/checklist/${escapeHtml(c.archivo)}</code> y sea un .xlsx válido.</p>
        <p style="font-size:0.8rem;margin-top:0.5rem">${escapeHtml(e.message)}</p>
      </div>`;
  }
}

function cerrarPanel() {
  $('#panel').classList.remove('open');
  $('#overlay').classList.remove('open');
  document.body.style.overflow = '';
}

async function init() {
  const indice = await cargarJSON('data/checklist/index.json');
  const grid = $('#checklist-grid');

  if (!indice || !indice.checklists) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><h3>No se pudo cargar el repositorio</h3><p>Verifica que exista <code>data/checklist/index.json</code></p></div>';
    $('#chk-count').textContent = '—';
    return;
  }

  CHECKLISTS = indice.checklists;
  $('#chk-count').textContent = `${CHECKLISTS.length} ${CHECKLISTS.length === 1 ? 'checklist' : 'checklists'}`;

  if (!CHECKLISTS.length) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">✅</div><h3>Aún no hay checklists</h3><p>Sube tus formatos .xlsx a <code>data/checklist/</code> y regístralos en <code>index.json</code>.</p></div>';
    return;
  }

  renderToolbar();
  renderGrid();

  $('#panel-close').addEventListener('click', cerrarPanel);
  $('#overlay').addEventListener('click', cerrarPanel);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarPanel(); });
}

document.addEventListener('DOMContentLoaded', init);
