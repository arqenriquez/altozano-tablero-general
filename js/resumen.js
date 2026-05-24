/* ============================================================
   ALTOZANO · TABLERO · Resumen general global
   Calcula el estado del proyecto leyendo:
     - data/proyecto.json              (datos base y valor de contrato)
     - data/reportes/index.json        (semanas publicadas)
     - data/reportes/semana-XX.json    (reporte MÁS RECIENTE → avance físico)
     - data/estimaciones/index.json    (estimaciones publicadas)
     - data/estimaciones/estimacion-XXX.json (estimación MÁS RECIENTE → estado financiero)
   ============================================================ */

const $ = (sel) => document.querySelector(sel);
const fmt = (n, d = 2) => Number(n).toFixed(d);
const fmtMoney = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MXN';

const MESES_RES = ['enero','febrero','marzo','abril','mayo','junio',
                   'julio','agosto','septiembre','octubre','noviembre','diciembre'];
function fechaCortaRes(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MESES_RES[m - 1]}`;
}
const ESTADOS_ETIQ = {
  revision:  'En revisión',
  ingresada: 'Ingresada',
  facturada: 'Facturada',
  pagada:    'Pagada'
};

async function cargarJSON(ruta) {
  try {
    const resp = await fetch(`${ruta}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    return null;
  }
}

function renderAvanceLotes(data) {
  const lista = $('#lotes-list');
  lista.innerHTML = '';
  const orden = data.orden_lotes || Object.keys(data.lotes || {});
  if (!orden.length) {
    lista.innerHTML = '<div class="empty-state"><p>Sin datos de lotes en el último reporte.</p></div>';
    return;
  }
  orden.forEach(num => {
    const d = data.lotes[num];
    if (!d) return;
    const varClass = d.variacion > 0 ? 'pos' : d.variacion < 0 ? 'neg' : 'neutral';
    const varSign = d.variacion > 0 ? '+' : '';
    const card = document.createElement('div');
    card.className = 'lote-card fade-up';
    card.innerHTML = `
      <div class="lote-identity">
        <div class="name">Lote ${num}</div>
        <div class="modelo">${d.modelo}</div>
        <div class="mza">Manzana ${d.mza}</div>
      </div>
      <div class="bars-stack">
        <div class="bar-row">
          <span class="bar-tag">Programado</span>
          <div class="bar-container"><div class="bar-fill prog" data-width="${d.programado}"></div></div>
          <span class="bar-value">${fmt(d.programado)}%</span>
        </div>
        <div class="bar-row">
          <span class="bar-tag">Real</span>
          <div class="bar-container"><div class="bar-fill real" data-width="${d.real}"></div></div>
          <span class="bar-value">${fmt(d.real)}%</span>
        </div>
      </div>
      <div class="variation-pill">
        <div class="lbl">Variación</div>
        <div class="val ${varClass}">${varSign}${fmt(d.variacion)}%</div>
      </div>
    `;
    lista.appendChild(card);
  });
}

async function renderEstadoFinanciero(valorContrato) {
  const refEl = $('#estimaciones-ref');
  const indice = await cargarJSON('data/estimaciones/index.json');

  if (!indice || !indice.estimaciones || !indice.estimaciones.length) {
    $('#kf-estimado').textContent = '—';
    $('#kf-estimado-pct').textContent = '—';
    $('#kf-avance').textContent = '—';
    $('#kf-saldo').textContent = '—';
    $('#kf-saldo-pct').textContent = '—';
    refEl.innerHTML = 'Aún no hay estimaciones publicadas. Los montos se activarán al registrar la primera en <a href="estimaciones.html" style="color:var(--accent);font-weight:600">Estimaciones</a>.';
    return;
  }

  // Última estimación (mayor número)
  const ultima = [...indice.estimaciones].sort((a, b) => parseInt(b) - parseInt(a))[0];
  const est = await cargarJSON(`data/estimaciones/estimacion-${ultima}.json`);
  if (!est) {
    refEl.textContent = `No se pudo cargar la estimación ${ultima}.`;
    return;
  }

  const c = est.caratula || {};
  const total = c.total_estimado_mxn || 0;
  const saldo = c.saldo_por_ejercer_mxn || 0;
  const contrato = c.nuevo_valor_contrato_mxn || valorContrato || 0;
  const pctEstimado = contrato > 0 ? (total / contrato) * 100 : 0;
  const pctSaldo    = contrato > 0 ? (saldo / contrato) * 100 : 0;

  $('#kf-estimado').textContent = fmtMoney(total);
  $('#kf-estimado-pct').textContent = contrato > 0 ? fmt(pctEstimado) + '%' : '—';

  $('#kf-avance').textContent = contrato > 0 ? fmt(pctEstimado) + '%' : '—';

  $('#kf-saldo').textContent = fmtMoney(saldo);
  $('#kf-saldo-pct').textContent = contrato > 0 ? fmt(pctSaldo) + '%' : '—';

  const estadoEtiq = ESTADOS_ETIQ[est.estado] || est.estado || '—';
  const periodoTxt = est.periodo
    ? `${fechaCortaRes(est.periodo.del)} al ${fechaCortaRes(est.periodo.al)}`
    : '';
  refEl.innerHTML =
    `Datos al cierre de la <a href="estimacion-detalle.html?id=${ultima}" style="color:var(--accent);font-weight:600">estimación #${est.numero}</a> · ${estadoEtiq}${periodoTxt ? ' · ' + periodoTxt : ''}.`;
}

function renderCurva(data) {
  const cf = data.curva_financiera;
  if (!cf || !cf.programado) return;
  const totalSemanas = cf.programado.length - 1;
  $('#curva-sub').textContent = `Proyectado a ${totalSemanas} semanas · ${cf.real.length - 1} semanas reportadas`;
  const labels = ['Inicio', ...Array.from({ length: totalSemanas }, (_, i) => `S${i + 1}`)];

  new Chart($('#curvaS').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Programado', data: cf.programado, borderColor: '#232726', backgroundColor: 'rgba(35,39,38,0.05)', borderWidth: 2, tension: 0.35, fill: true, pointRadius: 0, pointHoverRadius: 5 },
        { label: 'Real', data: cf.real, borderColor: '#2f5d54', backgroundColor: 'transparent', borderWidth: 2.5, tension: 0.3, fill: false, pointRadius: 4, pointBackgroundColor: '#2f5d54' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { font: { family: 'Inter', size: 11, weight: '500' }, boxWidth: 10, boxHeight: 10, usePointStyle: true, color: '#4a4f4d' } },
        tooltip: { backgroundColor: '#232726', titleFont: { family: 'Inter', size: 12, weight: '600' }, bodyFont: { family: 'JetBrains Mono', size: 11 }, padding: 10, cornerRadius: 8,
          callbacks: { label: (ctx) => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2) + '%' } }
      },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%', font: { family: 'JetBrains Mono', size: 10 }, color: '#8a8f8c' }, grid: { color: '#f0efeb' } },
        x: { ticks: { font: { family: 'JetBrains Mono', size: 9 }, color: '#8a8f8c', maxRotation: 0, autoSkip: true, maxTicksLimit: 14 }, grid: { display: false } }
      }
    }
  });
}

function animar() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        e.target.querySelectorAll('.bar-fill').forEach(bar => {
          setTimeout(() => { bar.style.width = bar.dataset.width + '%'; }, 150);
        });
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.fade-up').forEach(el => io.observe(el));
}

async function init() {
  const proy = await cargarJSON('data/proyecto.json');
  const indice = await cargarJSON('data/reportes/index.json');

  if (!indice || !indice.semanas_publicadas || !indice.semanas_publicadas.length) {
    $('#resumen-lead').innerHTML = '<strong>Aún no hay reportes semanales publicados.</strong> El resumen global se activará en cuanto publiques el primer reporte en el módulo de Reportes Semanales.';
    animar();
    return;
  }

  // Reporte más reciente
  const ultima = [...indice.semanas_publicadas].sort((a, b) => parseInt(b) - parseInt(a))[0];
  const data = await cargarJSON(`data/reportes/semana-${ultima}.json`);
  if (!data) {
    $('#resumen-lead').textContent = `No se pudo cargar el reporte de la semana ${ultima}.`;
    animar();
    return;
  }

  const g = data.avance_global;
  $('#resumen-lead').textContent = `Estado del proyecto al cierre de la Semana ${ultima} (${data.semana.periodo}). Los indicadores se calculan con el último reporte semanal publicado.`;

  // ---- 01 Avance global ----
  $('#k-prog').textContent = fmt(g.programado_pct) + '%';
  $('#k-real').textContent = fmt(g.real_pct) + '%';
  $('#k-real-sub').textContent = `Semana ${ultima} · ${data.semana.periodo}`;
  const varEl = $('#k-var');
  const signo = g.variacion_pct >= 0 ? '+' : '';
  varEl.textContent = `${signo}${fmt(g.variacion_pct)}%`;
  varEl.classList.add(g.variacion_pct >= 0 ? 'positive' : 'negative');
  $('#k-var-sub').textContent = g.variacion_pct >= 0 ? 'El proyecto va adelantado' : 'El proyecto va atrasado';

  // ---- 02 Avance físico (jerarquía: MXN pequeño · % grande) ----
  const valorContrato = proy?.proyecto?.valor_contrato_mxn
    || (indice.proyecto && indice.proyecto.valor_total_mxn)
    || (data.curva_financiera && data.curva_financiera.valor_total_mxn)
    || 0;

  if (valorContrato > 0) {
    const ejercido = valorContrato * (g.real_pct / 100);
    const porEjercer = valorContrato - ejercido;
    const pctPorEjercer = Math.max(0, 100 - g.real_pct);
    $('#k-total').textContent = fmtMoney(valorContrato);
    $('#k-ejercido').textContent = fmtMoney(ejercido);
    $('#k-pct-ejercido').textContent = fmt(g.real_pct) + '%';
    $('#k-porejercer').textContent = fmtMoney(porEjercer);
    $('#k-pct-porejercer').textContent = fmt(pctPorEjercer) + '%';
  } else {
    $('#k-total').textContent = 'Pendiente';
    $('#k-ejercido').textContent = '—';
    $('#k-pct-ejercido').textContent = fmt(g.real_pct) + '%';
    $('#k-porejercer').textContent = '—';
    $('#k-pct-porejercer').textContent = fmt(Math.max(0, 100 - g.real_pct)) + '%';
    $('#financiero-nota').style.display = 'block';
  }

  // Leyenda al pie de la sección 02
  const fechaRep = data.semana?.fecha_generacion ? ` con fecha ${data.semana.fecha_generacion}` : '';
  const periodoRep = data.semana?.periodo ? ` · ${data.semana.periodo}` : '';
  $('#fisico-ref').innerHTML =
    `Datos al cierre del <a href="semana.html?num=${ultima}" style="color:var(--accent);font-weight:600">Reporte Semanal ${ultima}</a>${fechaRep}${periodoRep}.`;

  // ---- 03 Estado financiero (última estimación) ----
  await renderEstadoFinanciero(valorContrato);

  // ---- 04 Curva S ----
  renderCurva(data);

  // ---- 05 Avance por lote ----
  renderAvanceLotes(data);

  $('#footer-info').textContent = `Resumen al cierre de Semana ${ultima} · ${data.proyecto.nombre_corto} · ${data.semana.fecha_generacion || ''}`;

  animar();
}

document.addEventListener('DOMContentLoaded', init);
