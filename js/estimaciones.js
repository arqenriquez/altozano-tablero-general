/* ============================================================
   ALTOZANO · TABLERO · Estimaciones
   Sirve a dos páginas:
     - estimaciones.html        → listado (#estimaciones-grid)
     - estimacion-detalle.html  → detalle (#estimacion-detail, ?id=XXX)
   ============================================================ */

const $ = (sel) => document.querySelector(sel);

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];

function fechaLarga(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MESES[m - 1]}, ${y}`;
}

function fechaCorta(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${dd}/${mm}/${y}`;
}

function fmtMXN(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
}

function fmtMXNcompact(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `${n.toFixed(2)}%`;
}

const ESTADOS = {
  revision:  { label: 'En revisión', cls: 'est-revision' },
  ingresada: { label: 'Ingresada',   cls: 'est-ingresada' },
  facturada: { label: 'Facturada',   cls: 'est-facturada' },
  pagada:    { label: 'Pagada',      cls: 'est-pagada' }
};

function badgeEstado(estado) {
  const e = ESTADOS[estado] || { label: estado || '—', cls: 'est-revision' };
  return `<span class="est-badge ${e.cls}">${e.label}</span>`;
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
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ============ LISTADO (estimaciones.html) ============ */
async function initListado() {
  const indice = await cargarJSON('data/estimaciones/index.json');
  const grid = $('#estimaciones-grid');
  const countEl = $('#estimaciones-count');

  if (!indice || !indice.estimaciones) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><h3>No se pudo cargar el índice de estimaciones</h3><p>Verifica que exista <code>data/estimaciones/index.json</code></p></div>';
    countEl.textContent = '—';
    return;
  }
  if (!indice.estimaciones.length) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">💰</div><h3>Aún no hay estimaciones</h3><p>Las estimaciones aparecerán aquí conforme se registren.</p></div>';
    countEl.textContent = '0 estimaciones';
    return;
  }

  const orden = [...indice.estimaciones].sort((a, b) => parseInt(b) - parseInt(a));
  countEl.textContent = `${indice.estimaciones.length} ${indice.estimaciones.length === 1 ? 'estimación' : 'estimaciones'}`;

  // Validación de consecutividad
  const nums = [...indice.estimaciones].map(n => parseInt(n)).sort((a, b) => a - b);
  const huecos = [];
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1) {
      for (let j = nums[i - 1] + 1; j < nums[i]; j++) huecos.push(j);
    }
  }
  if (nums.length && nums[0] !== 1) {
    $('#aviso-consecutivo').innerHTML =
      `<div class="empty-state" style="padding:1rem 1.5rem;text-align:left;margin-bottom:1rem;background:var(--gold-soft)">
        <p style="color:var(--gold-dark);font-weight:600">⚠ La numeración no inicia en 001. Las estimaciones deben ser consecutivas.</p>
      </div>`;
  } else if (huecos.length) {
    $('#aviso-consecutivo').innerHTML =
      `<div class="empty-state" style="padding:1rem 1.5rem;text-align:left;margin-bottom:1rem;background:var(--gold-soft)">
        <p style="color:var(--gold-dark);font-weight:600">⚠ Faltan estimaciones en la secuencia: ${huecos.map(h => String(h).padStart(3, '0')).join(', ')}.</p>
      </div>`;
  }

  const datos = await Promise.all(orden.map(n => cargarJSON(`data/estimaciones/estimacion-${n}.json`)));

  // Resumen del encabezado: estimado acumulado de la estimación más reciente
  const masReciente = datos.find(d => d && d.caratula);
  if (masReciente) {
    const acum = masReciente.caratula.total_estimado_mxn;
    const contrato = masReciente.caratula.nuevo_valor_contrato_mxn || masReciente.caratula.contrato_original_mxn;
    const pct = contrato ? (acum / contrato) * 100 : null;
    $('#sum-acumulado').textContent = fmtMXN(acum);
    $('#sum-sub').innerHTML = `Al corte de la <strong>estimación ${masReciente.numero}</strong>${pct != null ? ` · ${pct.toFixed(2)}% del contrato` : ''}`;
    $('#estimaciones-summary').hidden = false;
  }

  grid.innerHTML = '';
  orden.forEach((n, i) => {
    const d = datos[i];
    if (!d) return;
    const c = d.caratula || {};
    const periodoTxt = d.periodo
      ? `${fechaCorta(d.periodo.del)} – ${fechaCorta(d.periodo.al)}`
      : '—';

    const card = document.createElement('a');
    card.className = 'estimacion-card fade-up';
    card.href = `estimacion-detalle.html?id=${n}`;
    card.innerHTML = `
      <div class="estimacion-card-num">${d.numero}<small>Estimación</small></div>
      <div class="estimacion-card-body">
        <div class="estimacion-card-period">${periodoTxt}</div>
        <div class="estimacion-card-monto">${fmtMXN(c.importe_esta_estimacion_mxn)}</div>
        <div class="estimacion-card-sub">
          Avance físico acumulado: <strong>${fmtPct(c.avance_fisico_pct)}</strong>
          · Líquido: <strong>${fmtMXN(c.importe_liquido_total_mxn)}</strong>
        </div>
      </div>
      <div class="estimacion-card-side">
        ${badgeEstado(d.estado)}
        <div class="estimacion-card-arrow">Ver detalle →</div>
      </div>
    `;
    grid.appendChild(card);
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-up').forEach(el => io.observe(el));
}

/* ============ DETALLE (estimacion-detalle.html) ============ */
function renderCaratula(c) {
  const filas = [
    ['Contrato original',           fmtMXN(c.contrato_original_mxn)],
    ['Conceptos adicionales',       fmtMXN(c.conceptos_adicionales_mxn)],
    ['Conceptos restantes',         fmtMXN(c.conceptos_restantes_mxn)],
    ['Nuevo valor del contrato',    fmtMXN(c.nuevo_valor_contrato_mxn), 'strong'],
    ['Estimado acumulado anterior', fmtMXN(c.estimado_acumulado_anterior_mxn)],
    ['Importe de esta estimación',  fmtMXN(c.importe_esta_estimacion_mxn), 'accent'],
    ['Total estimado',              fmtMXN(c.total_estimado_mxn), 'strong'],
    ['Saldo por ejercer',           fmtMXN(c.saldo_por_ejercer_mxn)],
    ['Avance físico',               fmtPct(c.avance_fisico_pct), 'gold']
  ];
  return filas.map(([k, v, cls]) => `
    <div class="caratula-row${cls ? ' ' + cls : ''}">
      <span class="k">${k}</span><span class="v">${v}</span>
    </div>`).join('');
}

function renderResumenFinanciero(c) {
  const filas = [
    ['Subtotal',             fmtMXN(c.subtotal_mxn)],
    ['IVA',                  fmtMXN(c.iva_mxn)],
    ['Retención IVA',        fmtMXN(c.ret_iva_mxn)],
    ['Retención ISR',        fmtMXN(c.ret_isr_mxn)],
    ['Retención en garantía (5%)', fmtMXN(c.retencion_esta_estimacion_mxn)],
    ['Importe líquido total', fmtMXN(c.importe_liquido_total_mxn), 'accent'],
    ['Bueno por',             fmtMXN(c.bueno_por_mxn), 'strong']
  ];
  return filas.map(([k, v, cls]) => `
    <div class="caratula-row${cls ? ' ' + cls : ''}">
      <span class="k">${k}</span><span class="v">${v}</span>
    </div>`).join('');
}

function renderTablaPartidas(lotes, partidas) {
  const headers = lotes.map(l =>
    `<th><div class="lote-th">${escapeHtml(l.lote)}<small>${escapeHtml(l.modelo || '')}</small></div></th>`
  ).join('');

  // Totales por lote desde subconceptos (suma de partidas)
  const totalesLote = new Array(lotes.length).fill(0);

  const filas = partidas.map(p => {
    // Suma de subconceptos por lote dentro de la partida
    const sumPartida = new Array(lotes.length).fill(0);
    (p.subconceptos || []).forEach(s => {
      (s.por_lote || []).forEach((v, i) => { sumPartida[i] += (v || 0); });
    });
    sumPartida.forEach((v, i) => { totalesLote[i] += v; });

    const totalPartida = sumPartida.reduce((a, b) => a + b, 0);
    const tieneSub = (p.subconceptos || []).length > 0;

    const filaPartida = `
      <tr class="row-partida${tieneSub ? '' : ' row-vacia'}">
        <td class="td-concepto"><strong>${escapeHtml(p.nombre)}</strong></td>
        ${sumPartida.map(v => `<td class="td-num">${v > 0 ? fmtMXNcompact(v) : '—'}</td>`).join('')}
        <td class="td-num td-total">${totalPartida > 0 ? fmtMXNcompact(totalPartida) : '—'}</td>
      </tr>`;

    const filasSub = (p.subconceptos || []).map(s => {
      const totalSub = (s.por_lote || []).reduce((a, b) => a + (b || 0), 0);
      return `
      <tr class="row-sub">
        <td class="td-concepto td-sub">${escapeHtml(s.nombre)}</td>
        ${(s.por_lote || []).map(v => `<td class="td-num">${v > 0 ? fmtMXNcompact(v) : '—'}</td>`).join('')}
        <td class="td-num">${totalSub > 0 ? fmtMXNcompact(totalSub) : '—'}</td>
      </tr>`;
    }).join('');

    return filaPartida + filasSub;
  }).join('');

  const totalGeneral = totalesLote.reduce((a, b) => a + b, 0);
  const filaTotal = `
    <tr class="row-total">
      <td class="td-concepto"><strong>Total estimación</strong></td>
      ${totalesLote.map(v => `<td class="td-num"><strong>${v > 0 ? fmtMXNcompact(v) : '—'}</strong></td>`).join('')}
      <td class="td-num"><strong>${fmtMXNcompact(totalGeneral)}</strong></td>
    </tr>`;

  return `
    <div class="partidas-table-wrap">
      <table class="partidas-table">
        <thead>
          <tr>
            <th class="th-concepto">Concepto</th>
            ${headers}
            <th class="th-total">Total</th>
          </tr>
        </thead>
        <tbody>
          ${filas}
          ${filaTotal}
        </tbody>
      </table>
    </div>`;
}

async function initDetalle() {
  const id = new URLSearchParams(window.location.search).get('id');
  const cont = $('#estimacion-detail');

  if (!id) {
    cont.innerHTML = '<div class="empty-state"><div class="icon">📄</div><h3>Estimación no especificada</h3><p><a href="estimaciones.html" style="color:var(--accent);font-weight:600">← Volver al índice</a></p></div>';
    return;
  }

  const d = await cargarJSON(`data/estimaciones/estimacion-${id}.json`);
  if (!d) {
    cont.innerHTML = `<div class="empty-state"><div class="icon">📄</div><h3>No se encontró la estimación ${id}</h3><p><a href="estimaciones.html" style="color:var(--accent);font-weight:600">← Volver al índice</a></p></div>`;
    return;
  }

  document.title = `Estimación ${d.numero} | Altozano`;

  const c = d.caratula || {};
  const periodoTxt = d.periodo
    ? `${fechaLarga(d.periodo.del)} al ${fechaLarga(d.periodo.al)}`
    : '—';

  const pdfBtn = d.fuente_pdf
    ? `<a class="pdf-btn" href="${escapeHtml(d.fuente_pdf)}" target="_blank" rel="noopener">📄 Ver PDF original</a>`
    : '';

  cont.innerHTML = `
    <div class="estimacion-detail-head">
      <div class="estimacion-detail-num">${d.numero}<small>Estimación</small></div>
      <div class="estimacion-detail-meta">
        <div class="estado-line">${badgeEstado(d.estado)}</div>
        <div class="periodo">${periodoTxt}</div>
        <div class="resp">Contrato: <strong>${escapeHtml(d.contrato)}</strong></div>
        <div class="resp">Proveedor: <strong>${escapeHtml(d.proveedor)}</strong></div>
        ${d.periodo && d.periodo.fecha_estimacion ? `<div class="resp">Fecha de estimación: <strong>${fechaLarga(d.periodo.fecha_estimacion)}</strong></div>` : ''}
      </div>
      <div class="estimacion-detail-action">${pdfBtn}</div>
    </div>

    <div class="estimacion-section">
      <h3 class="estimacion-section-title">Carátula · Contrato y avance</h3>
      <div class="caratula-grid">
        <div class="caratula-col">${renderCaratula(c)}</div>
        <div class="caratula-col">${renderResumenFinanciero(c)}</div>
      </div>
    </div>

    <div class="estimacion-section">
      <h3 class="estimacion-section-title">Resumen por partida y lote</h3>
      ${renderTablaPartidas(d.lotes || [], d.partidas || [])}
    </div>
  `;
}

/* ============ ROUTER ============ */
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('estimaciones-grid')) initListado();
  else if (document.getElementById('estimacion-detail')) initDetalle();
});
