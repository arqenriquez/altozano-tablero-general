/* ============================================================
   ALTOZANO · TABLERO · Editor de catalogo de checklist
   ============================================================
   URL: checklist-editor.html?proceso=colado-losa-cimentacion
   - Carga el catalogo del proceso desde data/checklist/procesos/
   - Permite editar concepto, ayuda y marcar/desmarcar criticos
   - NO modifica la estructura ni la cantidad de items
   - Descarga el JSON actualizado para sustituir manualmente
   ============================================================ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let INDICE = null;
let PROCESO_INFO = null;
let CATALOGO_ORIG = null;   // copia inmutable para "descartar cambios"
let CATALOGO = null;        // version editada en vivo

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ---------- Conteo de cambios + criticos ---------- */
function calcularDiff() {
  let cambios = 0;
  let criticos = 0;
  let totalItems = 0;
  CATALOGO.secciones.forEach((sec, si) => {
    sec.items.forEach((it, ii) => {
      totalItems++;
      if (it.critico) criticos++;
      const orig = CATALOGO_ORIG.secciones[si].items[ii];
      if ((it.concepto || '') !== (orig.concepto || '')) cambios++;
      if ((it.ayuda || '') !== (orig.ayuda || '')) cambios++;
      if (!!it.critico !== !!orig.critico) cambios++;
    });
  });
  return { cambios, criticos, totalItems };
}

function actualizarToolbar() {
  const { cambios, criticos, totalItems } = calcularDiff();
  $('#editor-toolbar').hidden = false;
  const lbl = cambios === 0
    ? `Sin cambios · ${criticos}/${totalItems} críticos`
    : `${cambios} cambio${cambios === 1 ? '' : 's'} sin guardar · ${criticos}/${totalItems} críticos`;
  $('#editor-status').textContent = lbl;
  $('#editor-status').classList.toggle('dirty', cambios > 0);
  $('#btn-descartar').disabled = cambios === 0;
  $('#btn-descargar').disabled = cambios === 0;
}

/* ---------- Render principal ---------- */
function render() {
  const root = $('#editor-root');
  let html = `
    <section class="page-hero">
      <div class="eyebrow">${escapeHtml(CATALOGO.icono || '📋')} Editor de catálogo</div>
      <h1>${escapeHtml(CATALOGO.nombre)}</h1>
      <p class="lead">
        Edita la redacción de los conceptos y ayudas, y marca cuáles son críticos.
        Al terminar, descarga el JSON y sustituye el archivo en
        <code>data/checklist/procesos/</code>.
      </p>
      <div class="editor-meta-bar">
        <div><span class="lbl">Archivo</span><span class="val mono">${escapeHtml(PROCESO_INFO.archivo)}</span></div>
        <div><span class="lbl">Versión actual</span><span class="val mono">${escapeHtml(CATALOGO.version || '—')}</span></div>
        <div><span class="lbl">Secciones</span><span class="val">${CATALOGO.secciones.length}</span></div>
        <div><span class="lbl">Total ítems</span><span class="val" id="meta-total">—</span></div>
      </div>
    </section>

    <section class="section editor-secciones" id="editor-secciones">
  `;

  CATALOGO.secciones.forEach((sec, si) => {
    html += `
      <div class="editor-seccion">
        <header class="editor-seccion-header">
          <span class="editor-seccion-ico">${escapeHtml(sec.icono || '📋')}</span>
          <h3>
            <span class="num">${sec.numero}.</span>
            ${escapeHtml(sec.titulo)}
          </h3>
          <span class="editor-seccion-count" data-count-sec="${si}">${sec.items.length} ítems</span>
        </header>
        <div class="editor-items">
    `;

    sec.items.forEach((it, ii) => {
      html += `
        <div class="editor-item ${it.critico ? 'is-critico' : ''}" data-si="${si}" data-ii="${ii}">
          <div class="editor-item-side">
            <div class="editor-item-num">${ii + 1}</div>
            <label class="editor-critico-toggle">
              <input type="checkbox" data-prop="critico" ${it.critico ? 'checked' : ''}>
              <span class="editor-critico-label">CRÍTICO</span>
            </label>
          </div>
          <div class="editor-item-fields">
            <div class="editor-field">
              <label>Concepto</label>
              <textarea class="editor-input editor-input-concepto" rows="2" data-prop="concepto">${escapeHtml(it.concepto || '')}</textarea>
            </div>
            <div class="editor-field">
              <label>Ayuda <span class="opt">(opcional · cómo verificar / tolerancia)</span></label>
              <textarea class="editor-input editor-input-ayuda" rows="2" data-prop="ayuda" placeholder="Ej. Verificar con cinta y nivel óptico">${escapeHtml(it.ayuda || '')}</textarea>
            </div>
            <div class="editor-item-meta">
              <span class="editor-item-id mono">id: ${escapeHtml(it.id)}</span>
              <button class="editor-revert" data-revert="${si}-${ii}" hidden>↶ Revertir este ítem</button>
            </div>
          </div>
        </div>
      `;
    });

    html += `</div></div>`;
  });

  html += `</section>`;
  root.innerHTML = html;

  // Auto-resize de textareas
  $$('.editor-input').forEach(autoSize);

  bindEventos();
  actualizarToolbar();
  const { totalItems } = calcularDiff();
  $('#meta-total').textContent = totalItems;
}

function autoSize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = (textarea.scrollHeight + 2) + 'px';
}

function marcarItemDirty(itemEl) {
  const si = +itemEl.dataset.si;
  const ii = +itemEl.dataset.ii;
  const item = CATALOGO.secciones[si].items[ii];
  const orig = CATALOGO_ORIG.secciones[si].items[ii];
  const dirty = (item.concepto || '') !== (orig.concepto || '')
             || (item.ayuda || '') !== (orig.ayuda || '')
             || !!item.critico !== !!orig.critico;
  itemEl.classList.toggle('is-dirty', dirty);
  itemEl.querySelector('.editor-revert').hidden = !dirty;
}

function bindEventos() {
  // Inputs concepto / ayuda
  $$('.editor-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const itemEl = e.target.closest('.editor-item');
      const si = +itemEl.dataset.si;
      const ii = +itemEl.dataset.ii;
      const prop = e.target.dataset.prop;
      CATALOGO.secciones[si].items[ii][prop] = e.target.value;
      autoSize(e.target);
      marcarItemDirty(itemEl);
      actualizarToolbar();
    });
  });

  // Checkboxes criticos
  $$('.editor-critico-toggle input').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const itemEl = e.target.closest('.editor-item');
      const si = +itemEl.dataset.si;
      const ii = +itemEl.dataset.ii;
      CATALOGO.secciones[si].items[ii].critico = e.target.checked;
      itemEl.classList.toggle('is-critico', e.target.checked);
      marcarItemDirty(itemEl);
      actualizarToolbar();
    });
  });

  // Revertir item individual
  $$('.editor-revert').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const [si, ii] = e.target.dataset.revert.split('-').map(Number);
      const orig = CATALOGO_ORIG.secciones[si].items[ii];
      CATALOGO.secciones[si].items[ii] = deepClone(orig);
      const itemEl = e.target.closest('.editor-item');
      const conceptoEl = itemEl.querySelector('.editor-input-concepto');
      const ayudaEl = itemEl.querySelector('.editor-input-ayuda');
      const criticoEl = itemEl.querySelector('.editor-critico-toggle input');
      conceptoEl.value = orig.concepto || '';
      ayudaEl.value = orig.ayuda || '';
      criticoEl.checked = !!orig.critico;
      autoSize(conceptoEl); autoSize(ayudaEl);
      itemEl.classList.toggle('is-critico', !!orig.critico);
      marcarItemDirty(itemEl);
      actualizarToolbar();
    });
  });

  // Botones toolbar
  $('#btn-descartar').addEventListener('click', descartarCambios);
  $('#btn-descargar').addEventListener('click', descargarJSON);

  // Modal post-descarga
  $('#pd-close').addEventListener('click', () => $('#post-download-modal').hidden = true);
  $('#pd-ok').addEventListener('click', () => $('#post-download-modal').hidden = true);
  $('#post-download-modal').addEventListener('click', (e) => {
    if (e.target.id === 'post-download-modal') $('#post-download-modal').hidden = true;
  });
}

function descartarCambios() {
  const { cambios } = calcularDiff();
  if (cambios === 0) return;
  if (!confirm(`¿Descartar los ${cambios} cambio(s) sin guardar?`)) return;
  CATALOGO = deepClone(CATALOGO_ORIG);
  render();
}

function descargarJSON() {
  // Actualiza la version al timestamp de hoy para trazabilidad
  const hoy = new Date().toISOString().slice(0, 10);
  CATALOGO.version = hoy;

  // Re-serializa manteniendo el orden original de propiedades
  const ordenado = ordenarPropsCatalogo(CATALOGO);
  const json = JSON.stringify(ordenado, null, 2);
  const blob = new Blob([json + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  // Nombre = mismo archivo original (sin la ruta de carpeta)
  a.href = url;
  a.download = PROCESO_INFO.archivo.split('/').pop();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Actualiza el snapshot original para que los siguientes cambios se midan desde aqui
  CATALOGO_ORIG = deepClone(CATALOGO);
  $$('.editor-item').forEach(el => {
    el.classList.remove('is-dirty');
    el.querySelector('.editor-revert').hidden = true;
  });
  actualizarToolbar();

  // Mostrar instrucciones
  $('#pd-path').textContent = `data/checklist/${PROCESO_INFO.archivo.replace(/[^/]+$/, '')}`;
  $('#pd-file').textContent = PROCESO_INFO.archivo.split('/').pop();
  $('#post-download-modal').hidden = false;
}

// Mantiene el orden canonico de propiedades igual al JSON original
function ordenarPropsCatalogo(cat) {
  const top = ['id', 'nombre', 'subtitulo', 'icono', 'version', 'secciones'];
  const sec = ['id', 'numero', 'titulo', 'icono', 'items'];
  const it  = ['id', 'concepto', 'ayuda', 'critico'];
  const reorder = (obj, keys) => {
    const out = {};
    keys.forEach(k => { if (k in obj) out[k] = obj[k]; });
    Object.keys(obj).forEach(k => { if (!(k in out)) out[k] = obj[k]; });
    return out;
  };
  const result = reorder(cat, top);
  result.secciones = cat.secciones.map(s => {
    const so = reorder(s, sec);
    so.items = s.items.map(i => {
      // Elimina critico:false para no contaminar el JSON (solo se serializa true)
      const cleaned = { ...i };
      if (!cleaned.critico) delete cleaned.critico;
      return reorder(cleaned, it);
    });
    return so;
  });
  return result;
}

/* ---------- Init ---------- */
async function init() {
  INDICE = await cargarJSON('data/checklist/index.json');
  if (!INDICE) {
    $('#editor-root').innerHTML = `<div class="empty-state"><h3>No se pudo cargar el índice de checklists</h3></div>`;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  let procesoId = params.get('proceso');

  // Si no viene proceso en la URL, mostrar selector
  if (!procesoId) {
    renderSelector();
    return;
  }

  PROCESO_INFO = INDICE.procesos.find(p => p.id === procesoId);
  if (!PROCESO_INFO) {
    $('#editor-root').innerHTML = `
      <div class="empty-state" style="padding:5rem 2rem">
        <div class="icon">⚠️</div>
        <h3>Proceso no encontrado</h3>
        <p>El proceso <code>${escapeHtml(procesoId)}</code> no está en el índice.</p>
        <a href="checklist-editor.html" class="back-link">← Ver procesos disponibles</a>
      </div>`;
    return;
  }

  CATALOGO = await cargarJSON(`data/checklist/${PROCESO_INFO.archivo}`);
  if (!CATALOGO) {
    $('#editor-root').innerHTML = `<div class="empty-state"><h3>Catálogo no disponible</h3></div>`;
    return;
  }
  CATALOGO_ORIG = deepClone(CATALOGO);

  document.title = `Editor · ${CATALOGO.nombre} | Altozano`;
  render();
}

function renderSelector() {
  let html = `
    <section class="page-hero">
      <div class="eyebrow">📋 Editor de catálogos</div>
      <h1>Selecciona un proceso para editar</h1>
      <p class="lead">Aquí puedes ajustar la redacción de los ítems y marcar cuáles son críticos.</p>
    </section>
    <section class="section">
      <div class="editor-proceso-grid">
  `;
  INDICE.procesos.forEach(p => {
    html += `
      <a class="editor-proceso-card" href="checklist-editor.html?proceso=${encodeURIComponent(p.id)}">
        <div class="ico">${escapeHtml(p.icono || '📋')}</div>
        <div class="info">
          <h3>${escapeHtml(p.nombre)}</h3>
          <p>${escapeHtml(p.subtitulo || p.etapa || '')}</p>
          <span class="mono">${escapeHtml(p.archivo)}</span>
        </div>
        <span class="cta">Editar →</span>
      </a>
    `;
  });
  html += `</div></section>`;
  $('#editor-root').innerHTML = html;
}

document.addEventListener('DOMContentLoaded', init);
