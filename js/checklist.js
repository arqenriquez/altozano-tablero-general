/* ============================================================
   ALTOZANO · TABLERO · Checklist de calidad (pantalla principal)
   Muestra la matriz Lote x Proceso. Cada lote tiene su lista de
   procesos con estado (no iniciado / en progreso / acta generada).
   El click navega a checklist-detalle.html?lote=X&proceso=Y
   ============================================================ */

const $ = (sel) => document.querySelector(sel);

const LS_PROGRESO = (loteId, procesoId) => `chk:${loteId}:${procesoId}`;
const LS_ACTA     = (loteId, procesoId) => `chk-acta:${loteId}:${procesoId}`;

let CATALOGO = null;
let filtroProceso = 'todos';

async function cargarJSON(ruta) {
  try {
    const resp = await fetch(`${ruta}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    console.error('Error cargando', ruta, e);
    return null;
  }
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- Estado por celda Lote x Proceso ----------
   Se calcula a partir de:
   - localStorage[chk:<lote>:<proceso>]      → progreso en vivo
   - localStorage[chk-acta:<lote>:<proceso>] → snapshot del acta
*/
function estadoCelda(loteId, procesoId, totalItems) {
  const acta = localStorage.getItem(LS_ACTA(loteId, procesoId));
  if (acta) {
    try {
      const data = JSON.parse(acta);
      return {
        tipo: data.veredicto === 'APTO' ? 'apto' : 'no-apto',
        avance: 100,
        verificados: data.stats?.verificados || 0,
        total: data.stats?.total || totalItems
      };
    } catch (_) { /* fall through */ }
  }
  const raw = localStorage.getItem(LS_PROGRESO(loteId, procesoId));
  if (!raw) return { tipo: 'no-iniciado', avance: 0, verificados: 0, total: totalItems };
  try {
    const data = JSON.parse(raw);
    const items = data.items || {};
    const verif       = Object.values(items).filter(v => v.estado === 'si').length;
    const naCount     = Object.values(items).filter(v => v.estado === 'na').length;
    const respondidos = Object.values(items).filter(v => v.estado).length;
    if (respondidos === 0) return { tipo: 'no-iniciado', avance: 0, verificados: 0, total: totalItems };
    const denom = Math.max(totalItems - naCount, 1);
    const avance = Math.round((verif / denom) * 100);
    return { tipo: 'en-progreso', avance, verificados: verif, total: totalItems };
  } catch (_) {
    return { tipo: 'no-iniciado', avance: 0, verificados: 0, total: totalItems };
  }
}

/* ---------- Chips de procesos (filtro) ---------- */
function renderChips() {
  const wrap = $('#proceso-chips');
  wrap.innerHTML = '';
  const chips = [{ id: 'todos', nombre: 'Todos los procesos', icono: '📋' }, ...CATALOGO.procesos];
  chips.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'proceso-chip' + (p.id === filtroProceso ? ' active' : '');
    btn.innerHTML = `<span class="ico">${escapeHtml(p.icono || '📋')}</span><span>${escapeHtml(p.nombre)}</span>`;
    btn.addEventListener('click', () => {
      filtroProceso = p.id;
      renderChips();
      renderLotes();
    });
    wrap.appendChild(btn);
  });
}

/* ---------- Grid de lotes ---------- */
function renderLotes() {
  const grid = $('#lotes-grid');
  grid.innerHTML = '';
  const procesos = filtroProceso === 'todos'
    ? CATALOGO.procesos
    : CATALOGO.procesos.filter(p => p.id === filtroProceso);

  CATALOGO.lotes.forEach((lote, idx) => {
    const card = document.createElement('div');
    card.className = `chk-lote-card fade-up delay-${idx % 3}`;
    let html = `
      <header class="chk-lote-header">
        <div>
          <div class="chk-lote-mza">${escapeHtml(lote.manzana)}</div>
          <div class="chk-lote-nombre">${escapeHtml(lote.nombre)}</div>
        </div>
        <div class="chk-lote-modelo">${escapeHtml(lote.modelo)}</div>
      </header>
      <div class="chk-lote-procesos">
    `;

    procesos.forEach(p => {
      const total = CATALOGO._totales[p.id] || 0;
      const est = estadoCelda(lote.id, p.id, total);
      const url = `checklist-detalle.html?lote=${encodeURIComponent(lote.id)}&proceso=${encodeURIComponent(p.id)}`;

      let estadoLbl, estadoCls, accionTxt;
      switch (est.tipo) {
        case 'apto':       estadoLbl = 'APTO';        estadoCls = 'apto';    accionTxt = 'Ver acta';      break;
        case 'no-apto':    estadoLbl = 'NO APTO';     estadoCls = 'no-apto'; accionTxt = 'Ver acta';      break;
        case 'en-progreso':estadoLbl = `${est.avance}%`; estadoCls = 'progreso'; accionTxt = 'Continuar';  break;
        default:           estadoLbl = 'Sin iniciar'; estadoCls = 'pendiente'; accionTxt = 'Iniciar';     break;
      }

      html += `
        <a class="chk-proceso-row" href="${url}">
          <div class="chk-proceso-ico">${escapeHtml(p.icono || '📋')}</div>
          <div class="chk-proceso-info">
            <div class="chk-proceso-nombre">${escapeHtml(p.nombre)}</div>
            <div class="chk-proceso-sub">${escapeHtml(p.etapa || '')} · ${total} ítems</div>
          </div>
          <div class="chk-proceso-estado">
            <span class="chk-estado-badge ${estadoCls}">${estadoLbl}</span>
            <span class="chk-proceso-cta">${accionTxt} →</span>
          </div>
        </a>
      `;
    });

    html += `</div>`;
    card.innerHTML = html;
    grid.appendChild(card);
  });

  // Animacion fade-up
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-up').forEach(el => io.observe(el));
}

/* ---------- KPIs ---------- */
function renderKPIs() {
  const totalLotes = CATALOGO.lotes.length;
  const totalProcesos = CATALOGO.procesos.length;
  const totalCeldas = totalLotes * totalProcesos;

  let progreso = 0, actas = 0;
  CATALOGO.lotes.forEach(l => {
    CATALOGO.procesos.forEach(p => {
      const est = estadoCelda(l.id, p.id, CATALOGO._totales[p.id] || 0);
      if (est.tipo === 'apto' || est.tipo === 'no-apto') actas++;
      else if (est.tipo === 'en-progreso') progreso++;
    });
  });

  $('#kpi-total').textContent = totalCeldas;
  $('#kpi-progreso').textContent = progreso;
  $('#kpi-actas').textContent = actas;
  $('#kpi-procesos').textContent = totalProcesos;
}

/* ---------- Carga totales de items por proceso ----------
   Para mostrar "65 ítems" en cada card sin pedir varias veces el catalogo.
*/
async function precargarTotales() {
  CATALOGO._totales = {};
  for (const p of CATALOGO.procesos) {
    const cat = await cargarJSON(`data/checklist/${p.archivo}`);
    if (!cat) { CATALOGO._totales[p.id] = 0; continue; }
    let total = 0;
    (cat.secciones || []).forEach(s => total += (s.items || []).length);
    CATALOGO._totales[p.id] = total;
  }
}

/* ---------- Borrar todas las actas generadas ---------- */
function contarActas() {
  let n = 0;
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i).startsWith('chk-acta:')) n++;
  }
  return n;
}

function borrarTodasLasActas() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('chk-acta:')) keys.push(k);
  }
  keys.forEach(k => localStorage.removeItem(k));
  return keys.length;
}

function abrirModalBorrarActas() {
  const n = contarActas();
  const body = n === 0
    ? `<p class="chk-modal-intro">No hay actas guardadas. No hay nada que borrar.</p>`
    : `
      <p class="chk-modal-intro">Estás a punto de borrar <strong>${n}</strong> acta(s) generada(s).</p>
      <div class="chk-modal-warn">Esto eliminará todas las actas almacenadas en este navegador. Los checklists con su avance en curso <strong>no</strong> se borran (solo las actas finales).</div>
      <p class="chk-modal-help">Útil para limpiar actas de prueba antes de empezar a registrar actas reales. Esta acción no se puede deshacer.</p>
    `;
  $('#borrar-actas-body').innerHTML = body;
  $('#borrar-actas-confirm').disabled = n === 0;
  $('#borrar-actas-confirm').textContent = n === 0 ? 'No hay actas' : `Sí, borrar ${n} acta${n === 1 ? '' : 's'}`;
  $('#borrar-actas-modal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function cerrarModalBorrarActas() {
  $('#borrar-actas-modal').hidden = true;
  document.body.style.overflow = '';
}

function confirmarBorrarActas() {
  borrarTodasLasActas();
  cerrarModalBorrarActas();
  renderLotes();
  renderKPIs();
}

function bindEventosGlobales() {
  $('#btn-borrar-actas')?.addEventListener('click', abrirModalBorrarActas);
  $('#borrar-actas-close')?.addEventListener('click', cerrarModalBorrarActas);
  $('#borrar-actas-cancel')?.addEventListener('click', cerrarModalBorrarActas);
  $('#borrar-actas-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'borrar-actas-modal') cerrarModalBorrarActas();
  });
  $('#borrar-actas-confirm')?.addEventListener('click', confirmarBorrarActas);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#borrar-actas-modal').hidden) cerrarModalBorrarActas();
  });
}

async function init() {
  CATALOGO = await cargarJSON('data/checklist/index.json');
  if (!CATALOGO || !CATALOGO.lotes || !CATALOGO.procesos) {
    $('#lotes-grid').innerHTML = `
      <div class="empty-state">
        <div class="icon">⚠️</div>
        <h3>No se pudo cargar el catálogo</h3>
        <p>Verifica que exista <code>data/checklist/index.json</code> con <code>lotes</code> y <code>procesos</code>.</p>
      </div>`;
    return;
  }

  await precargarTotales();
  renderChips();
  renderLotes();
  renderKPIs();
  bindEventosGlobales();
}

document.addEventListener('DOMContentLoaded', init);

// Fix bfcache: al volver con la flecha "atrás", el navegador puede servir
// la página desde cache sin re-ejecutar init. Re-renderizamos para reflejar
// cambios hechos en otras pantallas (reset / generar acta / borrar actas).
window.addEventListener('pageshow', (e) => {
  if (e.persisted && CATALOGO) {
    renderLotes();
    renderKPIs();
  }
});
