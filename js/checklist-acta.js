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

  // Texto del veredicto, configurable por proceso (catalogo .veredicto).
  // Fallback al texto de colado de losa para no romper procesos antiguos.
  const cv = catalogoProceso.veredicto || {};
  const vTxt = {
    apto:   escapeHtml(cv.apto   || 'APTO PARA COLAR'),
    noApto: escapeHtml(cv.noApto || 'NO APTO'),
    accion: escapeHtml(cv.accion || 'colar')
  };

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
          <img src="assets/logo-metta.png" alt="Metta" style="height:48px">
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
      <div class="acta-veredicto-valor">${veredicto === 'APTO' ? '✅ ' + vTxt.apto : '⛔ ' + vTxt.noApto}</div>
      <div class="acta-veredicto-sub">
        ${veredicto === 'APTO'
          ? `Todos los ítems críticos verificados (${stats.criticosOk}/${stats.criticosTotal}).`
          : `${criticosFallidos.length} ítem(s) crítico(s) sin cumplir. Resolver antes de ${vTxt.accion}.`}
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
  const archivo = params.get('archivo');     // acta commiteada al repo
  const loteId = params.get('lote');
  const procesoId = params.get('proceso');

  let snapshot = null;

  if (archivo) {
    // Cargar acta desde el repo
    snapshot = await cargarJSON(`data/checklist/registros/${archivo}.json`);
    if (!snapshot) {
      $('#acta-root').innerHTML = `
        <div class="empty-state" style="padding:5rem 2rem;text-align:center">
          <div class="icon">⚠️</div>
          <h3>No se encontró el acta <code>${archivo}.json</code></h3>
          <p>Verifica que exista en <code>data/checklist/registros/</code> y esté listada en <code>data/checklist/index.json</code>.</p>
          <a href="checklist.html" class="back-link">← Volver al índice</a>
        </div>`;
      return;
    }
  } else if (loteId && procesoId) {
    // Cargar acta desde localStorage
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
    try { snapshot = JSON.parse(raw); }
    catch (_) {
      $('#acta-root').innerHTML = `<div class="empty-state"><h3>Acta corrupta en localStorage</h3></div>`;
      return;
    }
  } else {
    $('#acta-root').innerHTML = `<div class="empty-state"><h3>Faltan parámetros en la URL</h3></div>`;
    return;
  }

  const procesoIdResuelto = snapshot.proceso?.id || procesoId;
  const indice = await cargarJSON('data/checklist/index.json');
  const procInfo = indice?.procesos?.find(p => p.id === procesoIdResuelto);
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

  // Los botones de envío solo aparecen si el acta NO viene del repo
  // (es decir, si fue generada en este dispositivo y aun no se ha publicado)
  const btnWhatsapp = $('#btn-whatsapp');
  const btnDescargar = $('#btn-descargar');
  if (!archivo) {
    if (btnWhatsapp) {
      btnWhatsapp.hidden = false;
      btnWhatsapp.addEventListener('click', () => enviarActaPorWhatsApp(snapshot));
    }
    if (btnDescargar) {
      btnDescargar.hidden = false;
      btnDescargar.addEventListener('click', () => descargarActa(snapshot));
    }
  }

  $('#enviar-modal-close')?.addEventListener('click', cerrarModalEnviar);
  $('#enviar-modal-ok')?.addEventListener('click', cerrarModalEnviar);
  $('#enviar-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'enviar-modal') cerrarModalEnviar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#enviar-modal').hidden) cerrarModalEnviar();
  });
}

function nombreArchivoActa(snapshot) {
  return snapshot.archivo
    || `${snapshot.lote.id}-${snapshot.proceso.id}-${(snapshot.fecha || '').slice(0, 10)}`;
}

function mostrarModalEnvioActa(via, nombreArchivo) {
  if (via === 'cancel') return;  // el usuario cerró el menú nativo
  const msg = via === 'share'
    ? 'Se abrió el menú para compartir. Elige <strong>WhatsApp</strong> y envíalo a tu supervisor u oficina.'
    : `Se descargó <code>${escapeHtml(nombreArchivo)}.json</code>. Compártelo por <strong>WhatsApp</strong> o <strong>correo</strong> con tu supervisor u oficina.`;
  $('#enviar-modal-body').innerHTML = `
    <p class="chk-modal-intro">✅ Acta lista para enviar.</p>
    <div class="chk-modal-id">
      <code>${escapeHtml(nombreArchivo)}.json</code>
    </div>
    <p style="font-size:0.95rem;color:var(--ink);margin-top:0.9rem;line-height:1.55">${msg}</p>
    <p class="chk-modal-help">En oficina lo colocan en <code>data/checklist/registros/</code> y lo registran en <code>index.json</code> para que el acta quede en el tablero general.</p>
  `;
  $('#enviar-modal').hidden = false;
  document.body.style.overflow = 'hidden';
}

async function enviarActaPorWhatsApp(snapshot) {
  const nombreArchivo = nombreArchivoActa(snapshot);
  const { via } = await compartirArchivoJSON(nombreArchivo, snapshot, {
    title: `Acta ${snapshot.proceso?.nombre || ''} · ${snapshot.lote?.nombre || ''}`,
    text: `Acta de calidad (${snapshot.veredicto || ''}) de ${snapshot.proceso?.nombre || ''} — ${snapshot.lote?.nombre || ''} ${snapshot.lote?.manzana || ''}.`
  });
  mostrarModalEnvioActa(via, nombreArchivo);
}

function descargarActa(snapshot) {
  const nombreArchivo = nombreArchivoActa(snapshot);
  descargarArchivoJSON(nombreArchivo, snapshot);
  mostrarModalEnvioActa('fallback-descarga', nombreArchivo);
}

function cerrarModalEnviar() {
  $('#enviar-modal').hidden = true;
  document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', init);
