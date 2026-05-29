/* ============================================================
   ALTOZANO · TABLERO · Checklist interactivo (detalle)
   ============================================================
   URL: checklist-detalle.html?lote=l04-m661&proceso=colado-losa-cimentacion
   - Carga el catalogo del proceso y el catalogo global de lotes
   - Persiste el progreso en localStorage en tiempo real
   - Botones: Reiniciar / Exportar JSON / Generar acta
   ============================================================ */

const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => Array.from(ctx.querySelectorAll(s));

const LS_KEY = (loteId, procesoId) => `chk:${loteId}:${procesoId}`;
const LS_ACTA = (loteId, procesoId) => `chk-acta:${loteId}:${procesoId}`;

let LOTE = null;
let PROCESO = null;
let CATALOGO_PROCESO = null;
let ESTADO = null;  // { items: { itemId: {estado, obs} }, meta: { residente, supervisor, fecha } }

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

function leerEstado() {
  const raw = localStorage.getItem(LS_KEY(LOTE.id, PROCESO.id));
  if (!raw) return { items: {}, meta: {} };
  try { return JSON.parse(raw); }
  catch (_) { return { items: {}, meta: {} }; }
}

function guardarEstado() {
  localStorage.setItem(LS_KEY(LOTE.id, PROCESO.id), JSON.stringify(ESTADO));
}

/* ---------- Calculo de stats ---------- */
function calcularStats() {
  let total = 0, si = 0, no = 0, na = 0, sin = 0;
  let criticosTotal = 0, criticosOk = 0, criticosPend = 0, criticosNo = 0;

  CATALOGO_PROCESO.secciones.forEach(sec => {
    sec.items.forEach(item => {
      total++;
      const est = ESTADO.items[item.id]?.estado;
      if (est === 'si') si++;
      else if (est === 'no') no++;
      else if (est === 'na') na++;
      else sin++;

      if (item.critico) {
        criticosTotal++;
        if (est === 'si') criticosOk++;
        else if (est === 'no') criticosNo++;
        else if (!est) criticosPend++;
      }
    });
  });

  const aplicables = total - na;
  const pendientes = sin + no;
  const avance = aplicables ? Math.round((si / aplicables) * 100) : 0;

  return { total, si, no, na, sin, aplicables, pendientes, avance,
           criticosTotal, criticosOk, criticosPend, criticosNo };
}

/* ---------- Render principal ---------- */
function render() {
  const stats = calcularStats();
  const root = $('#chk-root');

  document.title = `${PROCESO.nombre} · ${LOTE.nombre} ${LOTE.manzana} | Altozano`;

  root.innerHTML = `
    <!-- Cabecera -->
    <section class="chk-detalle-hero">
      <div class="page-hero" style="padding-bottom:0">
        <div class="eyebrow">${escapeHtml(PROCESO.icono || '📋')} ${escapeHtml(PROCESO.etapa || 'Control de calidad')}</div>
        <h1>${escapeHtml(PROCESO.nombre)}</h1>
        <p class="lead">${escapeHtml(CATALOGO_PROCESO.subtitulo || PROCESO.subtitulo || '')}</p>
      </div>
      <div class="chk-detalle-meta">
        <div class="chk-meta-block">
          <div class="lbl">Lote · Manzana</div>
          <div class="val">${escapeHtml(LOTE.nombre)} · ${escapeHtml(LOTE.manzana)}</div>
        </div>
        <div class="chk-meta-block">
          <div class="lbl">Modelo</div>
          <div class="val">${escapeHtml(LOTE.modelo)}</div>
        </div>
        <div class="chk-meta-block">
          <div class="lbl">Residente</div>
          <input type="text" class="chk-meta-input" id="meta-residente" placeholder="Nombre del residente"
                 value="${escapeHtml(ESTADO.meta.residente || '')}">
        </div>
        <div class="chk-meta-block">
          <div class="lbl">Supervisor</div>
          <input type="text" class="chk-meta-input" id="meta-supervisor" placeholder="Nombre del supervisor"
                 value="${escapeHtml(ESTADO.meta.supervisor || '')}">
        </div>
      </div>
    </section>

    <!-- Stats -->
    <section class="quickstats" style="margin-top:0">
      <div class="quickstats-grid chk-stats-grid">
        <div class="quickstat"><div class="lbl">Total ítems</div>
          <div class="val" id="st-total">${stats.total}</div>
          <div class="sub">${stats.criticosTotal} críticos</div></div>
        <div class="quickstat"><div class="lbl">Verificados</div>
          <div class="val accent" id="st-si">${stats.si}</div>
          <div class="sub">${stats.criticosOk}/${stats.criticosTotal} críticos</div></div>
        <div class="quickstat"><div class="lbl">Pendientes</div>
          <div class="val" id="st-pend" style="color:var(--red)">${stats.pendientes}</div>
          <div class="sub">${stats.no} no cumplen · ${stats.sin} sin marcar</div></div>
        <div class="quickstat"><div class="lbl">No aplica</div>
          <div class="val" id="st-na" style="color:var(--ink-mute)">${stats.na}</div>
          <div class="sub">Excluidos del cálculo</div></div>
        <div class="quickstat"><div class="lbl">Avance</div>
          <div class="val gold" id="st-avance">${stats.avance}%</div>
          <div class="sub">Sobre ${stats.aplicables} aplicables</div></div>
      </div>
    </section>

    <!-- Barra de progreso -->
    <section class="section" style="padding-top:1.5rem;padding-bottom:1rem">
      <div class="chk-progress-bar">
        <div class="chk-progress-fill" id="progress-fill" style="width:${stats.avance}%"></div>
      </div>
    </section>

    <!-- Secciones -->
    <section class="section" style="padding-top:0.5rem">
      <div id="secciones-wrap"></div>
    </section>

    <!-- Acciones -->
    <section class="section chk-acciones" style="padding-top:0">
      <button class="chk-btn-secondary" id="btn-reset">🔄 Reiniciar checklist</button>
      <button class="chk-btn-primary" id="btn-acta">📋 Generar acta de calidad</button>
    </section>
  `;

  renderSecciones();
  bindEventos();
}

function renderSecciones() {
  const wrap = $('#secciones-wrap');
  wrap.innerHTML = '';
  CATALOGO_PROCESO.secciones.forEach(sec => {
    const seccionEl = document.createElement('details');
    seccionEl.className = 'chk-seccion';
    seccionEl.open = true;
    seccionEl.dataset.seccion = sec.id;

    const totalSec = sec.items.length;
    const okSec = sec.items.filter(it => ESTADO.items[it.id]?.estado === 'si').length;
    const naSec = sec.items.filter(it => ESTADO.items[it.id]?.estado === 'na').length;
    const denomSec = totalSec - naSec;
    const badgeCls = okSec === 0 ? 'pendiente'
                    : (okSec === denomSec && denomSec > 0) ? 'completo'
                    : 'parcial';

    let html = `
      <summary class="chk-seccion-header">
        <span class="chk-seccion-ico">${escapeHtml(sec.icono || '📋')}</span>
        <span class="chk-seccion-titulo">
          <span class="chk-seccion-num">${sec.numero}.</span>
          ${escapeHtml(sec.titulo)}
        </span>
        <span class="chk-seccion-badge ${badgeCls}" data-badge="${sec.id}">${okSec}/${denomSec || totalSec}</span>
        <span class="chk-seccion-chevron">▾</span>
      </summary>
      <div class="chk-items">
    `;

    sec.items.forEach(item => {
      const itemSt = ESTADO.items[item.id] || {};
      html += `
        <div class="chk-item" data-item="${escapeHtml(item.id)}">
          <div class="chk-item-main">
            <div class="chk-item-texto">
              <div class="chk-item-concepto">
                ${escapeHtml(item.concepto)}
                ${item.critico ? '<span class="chk-pill-critico">CRÍTICO</span>' : ''}
              </div>
              ${item.ayuda ? `<div class="chk-item-ayuda">${escapeHtml(item.ayuda)}</div>` : ''}
            </div>
            <div class="chk-item-radios" role="radiogroup">
              <label class="chk-radio ok ${itemSt.estado === 'si' ? 'selected' : ''}">
                <input type="radio" name="r-${escapeHtml(item.id)}" value="si" ${itemSt.estado === 'si' ? 'checked' : ''}>
                <span>Sí</span>
              </label>
              <label class="chk-radio bad ${itemSt.estado === 'no' ? 'selected' : ''}">
                <input type="radio" name="r-${escapeHtml(item.id)}" value="no" ${itemSt.estado === 'no' ? 'checked' : ''}>
                <span>No</span>
              </label>
              <label class="chk-radio na ${itemSt.estado === 'na' ? 'selected' : ''}">
                <input type="radio" name="r-${escapeHtml(item.id)}" value="na" ${itemSt.estado === 'na' ? 'checked' : ''}>
                <span>N/A</span>
              </label>
            </div>
          </div>
          <input type="text" class="chk-item-obs" placeholder="Observación (opcional)"
                 value="${escapeHtml(itemSt.obs || '')}" data-obs-for="${escapeHtml(item.id)}">
        </div>
      `;
    });

    html += `</div>`;
    seccionEl.innerHTML = html;
    wrap.appendChild(seccionEl);
  });
}

/* ---------- Eventos ---------- */
function bindEventos() {
  // Radios (estado por item)
  $$('.chk-item input[type=radio]').forEach(r => {
    r.addEventListener('change', (e) => {
      const itemEl = e.target.closest('.chk-item');
      const itemId = itemEl.dataset.item;
      const valor = e.target.value;

      ESTADO.items[itemId] = ESTADO.items[itemId] || {};
      ESTADO.items[itemId].estado = valor;
      guardarEstado();

      // Update visual radio selection
      itemEl.querySelectorAll('.chk-radio').forEach(lbl => {
        lbl.classList.toggle('selected', lbl.querySelector('input').checked);
      });

      // Refresca stats + badges
      const stats = calcularStats();
      actualizarStatsLive(stats);
      actualizarBadgesSecciones();
    });
  });

  // Observaciones
  $$('.chk-item-obs').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const id = e.target.dataset.obsFor;
      ESTADO.items[id] = ESTADO.items[id] || {};
      ESTADO.items[id].obs = e.target.value;
      guardarEstado();
    });
  });

  // Metadatos
  ['residente', 'supervisor'].forEach(k => {
    const el = $(`#meta-${k}`);
    if (el) el.addEventListener('input', (e) => {
      ESTADO.meta = ESTADO.meta || {};
      ESTADO.meta[k] = e.target.value;
      guardarEstado();
    });
  });

  // Botones
  $('#btn-reset').addEventListener('click', abrirModalReset);
  $('#btn-acta').addEventListener('click', abrirModalActa);

  // Modal acta
  $('#acta-modal-close')?.addEventListener('click', cerrarModalActa);
  $('#acta-modal-cancel')?.addEventListener('click', cerrarModalActa);
  $('#acta-modal').addEventListener('click', (e) => {
    if (e.target.id === 'acta-modal') cerrarModalActa();
  });
  $('#acta-modal-confirm').addEventListener('click', confirmarYGenerarActa);

  // Modal reset
  $('#reset-modal-close')?.addEventListener('click', cerrarModalReset);
  $('#reset-modal-cancel')?.addEventListener('click', cerrarModalReset);
  $('#reset-modal').addEventListener('click', (e) => {
    if (e.target.id === 'reset-modal') cerrarModalReset();
  });
  $('#reset-modal-confirm').addEventListener('click', confirmarReset);

  // Esc cierra cualquier modal abierto
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#acta-modal').hidden) cerrarModalActa();
    if (!$('#reset-modal').hidden) cerrarModalReset();
  });
}

/* ---------- Update incremental sin reRender completo ---------- */
function actualizarStatsLive(stats) {
  $('#st-total').textContent = stats.total;
  $('#st-si').textContent = stats.si;
  $('#st-pend').textContent = stats.pendientes;
  $('#st-na').textContent = stats.na;
  $('#st-avance').textContent = `${stats.avance}%`;
  $('#progress-fill').style.width = `${stats.avance}%`;

  // Update subs
  const subs = document.querySelectorAll('.chk-stats-grid .quickstat .sub');
  if (subs[0]) subs[0].textContent = `${stats.criticosTotal} críticos`;
  if (subs[1]) subs[1].textContent = `${stats.criticosOk}/${stats.criticosTotal} críticos`;
  if (subs[2]) subs[2].textContent = `${stats.no} no cumplen · ${stats.sin} sin marcar`;
  if (subs[4]) subs[4].textContent = `Sobre ${stats.aplicables} aplicables`;
}

function actualizarBadgesSecciones() {
  CATALOGO_PROCESO.secciones.forEach(sec => {
    const totalSec = sec.items.length;
    const okSec = sec.items.filter(it => ESTADO.items[it.id]?.estado === 'si').length;
    const naSec = sec.items.filter(it => ESTADO.items[it.id]?.estado === 'na').length;
    const denomSec = totalSec - naSec;
    const badge = document.querySelector(`[data-badge="${sec.id}"]`);
    if (!badge) return;
    badge.textContent = `${okSec}/${denomSec || totalSec}`;
    badge.classList.remove('pendiente', 'parcial', 'completo');
    if (okSec === 0) badge.classList.add('pendiente');
    else if (okSec === denomSec && denomSec > 0) badge.classList.add('completo');
    else badge.classList.add('parcial');
  });
}

/* ---------- Modal de confirmacion para generar acta ---------- */
function abrirModalActa() {
  const stats = calcularStats();
  const veredicto = (stats.criticosNo === 0 && stats.criticosPend === 0) ? 'APTO' : 'NO APTO';
  const residente = ESTADO.meta?.residente || '';
  const supervisor = ESTADO.meta?.supervisor || '';

  let advertencias = '';
  if (stats.sin > 0) {
    advertencias += `<div class="chk-modal-warn">⚠ Quedan <strong>${stats.sin}</strong> ítem(s) sin marcar. Se reportarán como pendientes en el acta.</div>`;
  }
  if (stats.criticosNo > 0) {
    advertencias += `<div class="chk-modal-warn">⛔ Hay <strong>${stats.criticosNo}</strong> ítem(s) crítico(s) marcados como <strong>No cumple</strong>. El acta saldrá NO APTO.</div>`;
  }
  if (stats.criticosPend > 0) {
    advertencias += `<div class="chk-modal-warn">⚠ Hay <strong>${stats.criticosPend}</strong> ítem(s) crítico(s) sin marcar. El acta saldrá NO APTO.</div>`;
  }
  if (!residente || !supervisor) {
    advertencias += `<div class="chk-modal-warn">⚠ Faltan datos en la cabecera (residente y/o supervisor). Las firmas saldrán en blanco.</div>`;
  }

  const body = `
    <p class="chk-modal-intro">Estás a punto de generar el acta de calidad para:</p>
    <div class="chk-modal-id">
      <strong>${escapeHtml(PROCESO.nombre)}</strong><br>
      ${escapeHtml(LOTE.nombre)} · ${escapeHtml(LOTE.manzana)} · ${escapeHtml(LOTE.modelo)}
    </div>

    <div class="chk-modal-resumen">
      <div><span class="lbl">Total ítems</span><span class="val">${stats.total}</span></div>
      <div><span class="lbl">Verificados</span><span class="val pos">${stats.si}</span></div>
      <div><span class="lbl">No cumplen</span><span class="val neg">${stats.no}</span></div>
      <div><span class="lbl">No aplica</span><span class="val muted">${stats.na}</span></div>
      <div><span class="lbl">Sin marcar</span><span class="val muted">${stats.sin}</span></div>
      <div><span class="lbl">Críticos OK</span><span class="val">${stats.criticosOk}/${stats.criticosTotal}</span></div>
      <div><span class="lbl">Avance</span><span class="val accent">${stats.avance}%</span></div>
    </div>

    <div class="chk-modal-veredicto ${veredicto === 'APTO' ? 'apto' : 'no-apto'}">
      Veredicto preliminar: <strong>${veredicto === 'APTO' ? '✅ APTO PARA COLAR' : '⛔ NO APTO'}</strong>
    </div>

    ${advertencias}

    <p class="chk-modal-help">Una vez generada el acta, podrás imprimirla o guardarla como PDF. Podrás volver a editar el checklist y regenerar el acta si es necesario.</p>
  `;

  $('#acta-modal-body').innerHTML = body;
  $('#acta-modal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function cerrarModalActa() {
  $('#acta-modal').hidden = true;
  document.body.style.overflow = '';
}

/* ---------- Modal de confirmacion para reiniciar ---------- */
function abrirModalReset() {
  const stats = calcularStats();
  const respondidos = stats.si + stats.no + stats.na;
  const tieneActa = !!localStorage.getItem(LS_ACTA(LOTE.id, PROCESO.id));

  let avisos = '';
  if (respondidos > 0) {
    avisos += `<div class="chk-modal-warn">Se borrarán <strong>${respondidos}</strong> marca(s) y todas las observaciones de este checklist.</div>`;
  }
  if (tieneActa) {
    avisos += `<div class="chk-modal-warn">También se eliminará el <strong>acta generada</strong> para este lote y proceso. El estado en la lista de lotes volverá a “Sin iniciar”.</div>`;
  }
  if (!avisos) {
    avisos = `<div class="chk-modal-warn">No hay marcas registradas; el reinicio dejará el checklist en blanco.</div>`;
  }

  $('#reset-modal-body').innerHTML = `
    <p class="chk-modal-intro">¿Quieres reiniciar el checklist de:</p>
    <div class="chk-modal-id">
      <strong>${escapeHtml(PROCESO.nombre)}</strong><br>
      ${escapeHtml(LOTE.nombre)} · ${escapeHtml(LOTE.manzana)} · ${escapeHtml(LOTE.modelo)}
    </div>
    ${avisos}
    <p class="chk-modal-help">Los datos del residente y supervisor se conservan. Esta acción no se puede deshacer.</p>
  `;
  $('#reset-modal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function cerrarModalReset() {
  $('#reset-modal').hidden = true;
  document.body.style.overflow = '';
}

function confirmarReset() {
  ESTADO = { items: {}, meta: ESTADO.meta || {} };
  guardarEstado();
  localStorage.removeItem(LS_ACTA(LOTE.id, PROCESO.id));
  cerrarModalReset();
  render();
}

function confirmarYGenerarActa() {
  const stats = calcularStats();
  const veredicto = (stats.criticosNo === 0 && stats.criticosPend === 0) ? 'APTO' : 'NO APTO';
  const snapshot = {
    lote: LOTE,
    proceso: PROCESO,
    fecha: new Date().toISOString(),
    residente: ESTADO.meta?.residente || '',
    supervisor: ESTADO.meta?.supervisor || '',
    items: ESTADO.items,
    stats,
    veredicto,
    catalogoVersion: CATALOGO_PROCESO.version || null
  };
  localStorage.setItem(LS_ACTA(LOTE.id, PROCESO.id), JSON.stringify(snapshot));
  window.location.href = `checklist-acta.html?lote=${encodeURIComponent(LOTE.id)}&proceso=${encodeURIComponent(PROCESO.id)}`;
}

/* ---------- Init ---------- */
async function init() {
  const params = new URLSearchParams(window.location.search);
  const loteId = params.get('lote');
  const procesoId = params.get('proceso');

  if (!loteId || !procesoId) {
    $('#chk-root').innerHTML = `
      <div class="empty-state" style="padding:5rem 2rem">
        <div class="icon">⚠️</div>
        <h3>Faltan parámetros</h3>
        <p>Esta página requiere <code>?lote=…&amp;proceso=…</code>.</p>
        <a href="checklist.html" class="back-link">← Volver al índice</a>
      </div>`;
    return;
  }

  const indice = await cargarJSON('data/checklist/index.json');
  if (!indice) {
    $('#chk-root').innerHTML = `<div class="empty-state"><h3>No se pudo cargar el catálogo</h3></div>`;
    return;
  }

  LOTE = indice.lotes.find(l => l.id === loteId);
  PROCESO = indice.procesos.find(p => p.id === procesoId);

  if (!LOTE || !PROCESO) {
    $('#chk-root').innerHTML = `
      <div class="empty-state" style="padding:5rem 2rem">
        <div class="icon">⚠️</div>
        <h3>Lote o proceso no encontrado</h3>
        <p>Verifica los IDs en la URL.</p>
        <a href="checklist.html" class="back-link">← Volver al índice</a>
      </div>`;
    return;
  }

  CATALOGO_PROCESO = await cargarJSON(`data/checklist/${PROCESO.archivo}`);
  if (!CATALOGO_PROCESO) {
    $('#chk-root').innerHTML = `<div class="empty-state"><h3>Catálogo del proceso no disponible</h3></div>`;
    return;
  }

  ESTADO = leerEstado();
  render();
}

document.addEventListener('DOMContentLoaded', init);
