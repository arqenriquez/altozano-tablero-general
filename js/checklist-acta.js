/* ============================================================
   ALTOZANO · TABLERO · Acta de calidad (imprimible)
   ============================================================
   URL: checklist-acta.html?lote=l04-m661&proceso=colado-losa-cimentacion
   Lee el snapshot guardado en localStorage[chk-acta:<lote>:<proceso>]
   y renderiza un acta lista para imprimir o exportar a PDF.
   ============================================================ */

const $ = (s) => document.querySelector(s);
const LS_ACTA = (loteId, procesoId) => `chk-acta:${loteId}:${procesoId}`;

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fechaLarga(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
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

function renderActa(snapshot, catalogoProceso) {
  const root = $('#acta-root');
  const { lote, proceso, fecha, residente, supervisor, items, stats, veredicto } = snapshot;

  document.title = `Acta ${proceso.nombre} · ${lote.nombre} ${lote.manzana} | Altozano`;

  // Lista de criticos no completos
  const criticosFallidos = [];
  catalogoProceso.secciones.forEach(sec => {
    sec.items.filter(it => it.critico).forEach(it => {
      const est = items[it.id]?.estado;
      if (est !== 'si') {
        criticosFallidos.push({
          seccion: sec.titulo,
          concepto: it.concepto,
          estado: est === 'no' ? 'No cumple' : (est === 'na' ? 'No aplica' : 'Sin verificar'),
          obs: items[it.id]?.obs || ''
        });
      }
    });
  });

  let html = `
    <header class="acta-header">
      <div class="acta-brand">
        <div class="acta-logo">
          <img src="assets/logo-metta.png" alt="Metta" style="height:32px">
        </div>
        <div class="acta-brand-text">
          <div class="acta-brand-empresa">Metta Arquitectura y Construcción</div>
          <div class="acta-brand-sub">Gerencia de Proyecto · Altozano · Hermosillo, Sonora</div>
        </div>
      </div>
      <div class="acta-doc-meta">
        <div class="lbl">Documento</div>
        <div class="val">Acta de Calidad ${escapeHtml(proceso.icono || '')}</div>
        <div class="sub">${escapeHtml(proceso.nombre)}</div>
      </div>
    </header>

    <section class="acta-veredicto ${veredicto === 'APTO' ? 'apto' : 'no-apto'}">
      <div class="acta-veredicto-label">Veredicto</div>
      <div class="acta-veredicto-valor">${veredicto === 'APTO' ? '✅ APTO PARA COLAR' : '⛔ NO APTO'}</div>
      <div class="acta-veredicto-sub">
        ${veredicto === 'APTO'
          ? `Todos los ítems críticos verificados (${stats.criticosOk}/${stats.criticosTotal}).`
          : `${criticosFallidos.length} ítem(s) crítico(s) sin cumplir. Resolver antes de colar.`}
      </div>
    </section>

    <section class="acta-meta-grid">
      <div class="acta-meta-cell">
        <div class="lbl">Proyecto</div>
        <div class="val">Altozano</div>
      </div>
      <div class="acta-meta-cell">
        <div class="lbl">Lote · Manzana</div>
        <div class="val">${escapeHtml(lote.nombre)} · ${escapeHtml(lote.manzana)}</div>
      </div>
      <div class="acta-meta-cell">
        <div class="lbl">Modelo</div>
        <div class="val">${escapeHtml(lote.modelo)}</div>
      </div>
      <div class="acta-meta-cell">
        <div class="lbl">Proceso</div>
        <div class="val">${escapeHtml(proceso.nombre)}</div>
      </div>
      <div class="acta-meta-cell">
        <div class="lbl">Fecha de verificación</div>
        <div class="val">${escapeHtml(fechaLarga(fecha))}</div>
      </div>
      <div class="acta-meta-cell">
        <div class="lbl">Residente</div>
        <div class="val">${escapeHtml(residente || '—')}</div>
      </div>
      <div class="acta-meta-cell">
        <div class="lbl">Supervisor</div>
        <div class="val">${escapeHtml(supervisor || '—')}</div>
      </div>
      <div class="acta-meta-cell">
        <div class="lbl">Versión catálogo</div>
        <div class="val mono">${escapeHtml(snapshot.catalogoVersion || '—')}</div>
      </div>
    </section>

    <section class="acta-stats">
      <div class="acta-stat"><div class="lbl">Total ítems</div><div class="val">${stats.total}</div></div>
      <div class="acta-stat"><div class="lbl">Verificados</div><div class="val pos">${stats.si}</div></div>
      <div class="acta-stat"><div class="lbl">No cumplen</div><div class="val neg">${stats.no}</div></div>
      <div class="acta-stat"><div class="lbl">No aplica</div><div class="val muted">${stats.na}</div></div>
      <div class="acta-stat"><div class="lbl">Sin marcar</div><div class="val muted">${stats.sin}</div></div>
      <div class="acta-stat"><div class="lbl">Críticos OK</div><div class="val pos">${stats.criticosOk}/${stats.criticosTotal}</div></div>
      <div class="acta-stat"><div class="lbl">% Avance</div><div class="val accent">${stats.avance}%</div></div>
    </section>
  `;

  // Alerta de criticos fallidos
  if (criticosFallidos.length) {
    html += `
      <section class="acta-alerta">
        <h3>⚠️ Ítems críticos sin cumplir</h3>
        <table class="acta-table">
          <thead><tr><th>Sección</th><th>Concepto</th><th>Estado</th><th>Observación</th></tr></thead>
          <tbody>
            ${criticosFallidos.map(c => `
              <tr>
                <td>${escapeHtml(c.seccion)}</td>
                <td>${escapeHtml(c.concepto)}</td>
                <td><strong>${escapeHtml(c.estado)}</strong></td>
                <td>${escapeHtml(c.obs)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </section>
    `;
  }

  // Lista completa por seccion
  html += `<section class="acta-detalle"><h3>Detalle por sección</h3>`;

  catalogoProceso.secciones.forEach(sec => {
    const itemsSec = sec.items;
    const okSec = itemsSec.filter(it => items[it.id]?.estado === 'si').length;
    const noSec = itemsSec.filter(it => items[it.id]?.estado === 'no').length;
    const naSec = itemsSec.filter(it => items[it.id]?.estado === 'na').length;

    html += `
      <div class="acta-seccion">
        <div class="acta-seccion-header">
          <h4>${sec.numero}. ${escapeHtml(sec.titulo)}</h4>
          <div class="acta-seccion-mini">${okSec} Sí · ${noSec} No · ${naSec} N/A</div>
        </div>
        <table class="acta-table">
          <thead><tr><th style="width:40px">#</th><th>Concepto</th><th style="width:80px">Estado</th><th>Observación</th></tr></thead>
          <tbody>
            ${itemsSec.map((it, i) => {
              const est = items[it.id]?.estado;
              const lbl = est === 'si' ? 'Sí' : (est === 'no' ? 'No' : (est === 'na' ? 'N/A' : '—'));
              const cls = est === 'si' ? 'estado-si' : (est === 'no' ? 'estado-no' : (est === 'na' ? 'estado-na' : 'estado-sin'));
              return `
                <tr>
                  <td class="mono">${i + 1}</td>
                  <td>${escapeHtml(it.concepto)}${it.critico ? ' <span class="acta-pill-critico">CRÍTICO</span>' : ''}</td>
                  <td><span class="acta-estado-pill ${cls}">${lbl}</span></td>
                  <td>${escapeHtml(items[it.id]?.obs || '')}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  });

  html += `</section>`;

  // Firmas
  html += `
    <section class="acta-firmas">
      <div class="acta-firma">
        <div class="acta-firma-linea"></div>
        <div class="acta-firma-nombre">${escapeHtml(residente || 'Residente')}</div>
        <div class="acta-firma-cargo">Residente de obra</div>
      </div>
      <div class="acta-firma">
        <div class="acta-firma-linea"></div>
        <div class="acta-firma-nombre">${escapeHtml(supervisor || 'Supervisor')}</div>
        <div class="acta-firma-cargo">Supervisor de calidad</div>
      </div>
    </section>

    <footer class="acta-footer">
      <div>Altozano · Metta Arquitectura y Construcción · Hermosillo, Sonora</div>
      <div class="mono">Generado el ${escapeHtml(fechaLarga(fecha))}</div>
    </footer>
  `;

  root.innerHTML = html;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const loteId = params.get('lote');
  const procesoId = params.get('proceso');

  if (!loteId || !procesoId) {
    $('#acta-root').innerHTML = `<div class="empty-state"><h3>Faltan parámetros en la URL</h3></div>`;
    return;
  }

  const raw = localStorage.getItem(LS_ACTA(loteId, procesoId));
  if (!raw) {
    $('#acta-root').innerHTML = `
      <div class="empty-state" style="padding:5rem 2rem;text-align:center">
        <div class="icon">⚠️</div>
        <h3>No hay acta generada para este lote y proceso</h3>
        <p>Vuelve al checklist y genera el acta.</p>
        <a href="checklist-detalle.html?lote=${encodeURIComponent(loteId)}&proceso=${encodeURIComponent(procesoId)}" class="back-link">← Ir al checklist</a>
      </div>`;
    return;
  }

  let snapshot;
  try { snapshot = JSON.parse(raw); }
  catch (_) {
    $('#acta-root').innerHTML = `<div class="empty-state"><h3>Acta corrupta en localStorage</h3></div>`;
    return;
  }

  const indice = await cargarJSON('data/checklist/index.json');
  const procInfo = indice?.procesos?.find(p => p.id === procesoId);
  if (!procInfo) {
    $('#acta-root').innerHTML = `<div class="empty-state"><h3>Proceso no encontrado en catálogo</h3></div>`;
    return;
  }
  const catalogoProceso = await cargarJSON(`data/checklist/${procInfo.archivo}`);
  if (!catalogoProceso) {
    $('#acta-root').innerHTML = `<div class="empty-state"><h3>Catálogo del proceso no disponible</h3></div>`;
    return;
  }

  renderActa(snapshot, catalogoProceso);

  $('#btn-imprimir')?.addEventListener('click', () => window.print());
}

document.addEventListener('DOMContentLoaded', init);
