/* ================================================================
   ALTOZANO · TABLERO · Módulo 08 · PPC (Last Planner System)
   Porcentaje de Plan Completado semanal.

   Fuentes de datos (todas estáticas, sin backend):
     - data/proyecto.json            (nombre del proyecto, footer)
     - data/ppc/index.json           (semanas registradas)
     - data/ppc/metas/semana-NN.xlsx (metas de la semana — las sube el usuario)
     - data/ppc/cierres/semana-NN.json (cierre commiteado de cada semana)

   Estado del marcado en vivo: localStorage del navegador
     - ppc-prog-NN   → progreso de la semana abierta {idx:{c:bool,m:str}}
     - ppc-cierre-NN → snapshot del cierre local (antes de commitear)

   Flujo:
     1) Entra → detecta la semana en curso por fecha y la selecciona.
     2) Semana abierta → lee el Excel de metas, marca casillas (se guarda en vivo).
     3) "Cerrar semana" → valida motivos, genera acta imprimible (PDF) y el JSON
        de cierre para commitear. La gráfica acumula el PPC de cada semana cerrada.
   ================================================================ */

/* ---- Helpers base (mismo patrón que el resto del tablero) ---- */
const $ = (sel) => document.querySelector(sel);
const PPC_BASE = 'data/ppc/';

async function cargarJSON(ruta) {
  try {
    const resp = await fetch(`${ruta}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    console.warn('No se pudo cargar', ruta, e.message);
    return null;
  }
}

async function cargarXLSX(ruta) {
  const resp = await fetch(`${ruta}?t=${Date.now()}`, { cache: 'no-cache' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false, defval: '' });
  // Detecta fila de encabezado (la que contiene "actividad")
  let inicio = 0;
  for (let i = 0; i < Math.min(filas.length, 5); i++) {
    const txt = (filas[i] || []).join(' ').toLowerCase();
    if (txt.includes('actividad') || txt.includes('meta')) { inicio = i + 1; break; }
  }
  const metas = [];
  for (let i = inicio; i < filas.length; i++) {
    const f = filas[i] || [];
    const actividad = String(f[0] == null ? '' : f[0]).trim();
    if (!actividad) continue;
    metas.push({
      actividad,
      responsable: String(f[1] == null ? '' : f[1]).trim(),
      lote: String(f[2] == null ? '' : f[2]).trim()
    });
  }
  return metas;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const fmtFecha = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${d} de ${MESES[m - 1]} de ${y}`;
};

const hoyISO = () => new Date().toISOString().slice(0, 10);

/* ---- Clasificación de color del PPC ----
   verde ≥ 80 · amarillo 60–79 · rojo < 60 */
function ppcClase(pct) {
  if (pct >= 80) return 'ok';
  if (pct >= 60) return 'warn';
  return 'bad';
}

/* ---- Estado global del módulo ---- */
const S = {
  proyecto: null,
  index: null,
  semanaCurso: null,   // número de la semana en curso por fecha (o null)
  sel: null,           // entrada de semana seleccionada
  metas: [],           // metas de la semana seleccionada (con {c, m})
  cerrada: false,      // true si la semana seleccionada ya tiene cierre
  chart: null,
  chartMode: 'cerradas', // 'cerradas' | 'proyecto'
  responsables: [],    // catálogo configurable por proyecto (data/ppc/responsables.json)
  logoData: ''         // logo Metta como data URI (para que imprima en el PDF)
};

/* Carga el logo y lo convierte a data URI (se incrusta en el acta para imprimir sin depender de la red) */
async function cargarLogoData(ruta) {
  try {
    const resp = await fetch(ruta, { cache: 'force-cache' });
    if (!resp.ok) return '';
    const blob = await resp.blob();
    return await new Promise((res) => {
      const r = new FileReader();
      r.onloadend = () => res(r.result || '');
      r.onerror = () => res('');
      r.readAsDataURL(blob);
    });
  } catch (e) { return ''; }
}

/* ---- Detección de la semana en curso por fecha ---- */
function detectarSemanaCurso(index) {
  const hoy = new Date(hoyISO() + 'T12:00:00');
  for (const s of index.semanas) {
    if (!s.inicio) continue;
    const ini = new Date(s.inicio + 'T00:00:00');
    const fin = new Date(ini); fin.setDate(fin.getDate() + 6); fin.setHours(23, 59, 59);
    if (hoy >= ini && hoy <= fin) return s.semana;
  }
  return null;
}

/* ---- localStorage del progreso en vivo ---- */
const keyProg = (sem) => `ppc-prog-${sem}`;

function leerProg(sem) {
  try { return JSON.parse(localStorage.getItem(keyProg(sem))) || {}; }
  catch { return {}; }
}
function guardarProg(sem, metas) {
  const obj = {};
  metas.forEach((m, i) => { obj[i] = { c: !!m.c, m: m.m || '', r: m.responsable || '' }; });
  try { localStorage.setItem(keyProg(sem), JSON.stringify(obj)); } catch (e) { /* ignora */ }
}

/* Normaliza un responsable al nombre canónico del catálogo (ignora mayúsculas/minúsculas) */
function normResponsable(nombre) {
  if (!nombre) return '';
  const limpia = (s) => s.toString().trim().toLowerCase().replace(/\s+/g, ' ');
  const objetivo = limpia(nombre);
  const match = (S.responsables || []).find((r) => limpia(r) === objetivo);
  return match || nombre.toString().trim();
}

/* Opciones del desplegable de responsable (conserva valores fuera del catálogo) */
function optsResponsable(sel) {
  const lista = [...(S.responsables || [])];
  if (sel && !lista.includes(sel)) lista.unshift(sel);
  return ['<option value="">— Responsable —</option>']
    .concat(lista.map((r) => `<option value="${escapeHtml(r)}"${r === sel ? ' selected' : ''}>${escapeHtml(r)}</option>`))
    .join('');
}

/* ============================================================
   CÁLCULO DE PPC
   ============================================================ */
function calcPPC(metas) {
  const total = metas.length;
  const cumplidas = metas.filter((m) => m.c).length;
  const pct = total ? Math.round((cumplidas / total) * 100) : 0;
  return { total, cumplidas, fallidas: total - cumplidas, pct };
}

/* ============================================================
   RENDER · KPIs y tabla de metas
   ============================================================ */
function renderKPIs() {
  const r = calcPPC(S.metas);
  $('#kpi-total').textContent = r.total || '—';
  $('#kpi-cumplidas').textContent = r.cumplidas;
  $('#kpi-cumplidas-sub').textContent = r.total ? `de ${r.total} metas` : '—';
  $('#kpi-fallidas').textContent = r.fallidas;
  const ppcEl = $('#kpi-ppc');
  ppcEl.textContent = r.total ? r.pct + '%' : '—';
  ppcEl.className = 'val big ' + ppcClase(r.pct);

  // Barra de progreso en vivo
  const cls = ppcClase(r.pct);
  const pctEl = $('#ppc-prog-pct');
  const fillEl = $('#ppc-prog-fill');
  const subEl = $('#ppc-prog-sub');
  if (pctEl && fillEl && subEl) {
    pctEl.textContent = r.total ? r.pct + '%' : '—';
    pctEl.className = 'ppc-progress-pct ' + cls;
    fillEl.className = 'ppc-progress-fill ' + cls;
    fillEl.style.width = (r.total ? r.pct : 0) + '%';
    subEl.textContent = r.total
      ? `${r.cumplidas} de ${r.total} metas cumplidas · ${r.fallidas} pendiente(s)`
      : 'Sin metas cargadas para esta semana.';
  }
}

function renderTabla() {
  const host = $('#ppc-table-host');
  if (!S.metas.length) {
    host.innerHTML = `<div class="empty-state"><div class="icon">📋</div>
      <h3>Sin metas para esta semana</h3>
      <p>Sube el Excel de metas a <code>data/ppc/metas/semana-${S.sel.semana}.xlsx</code> y commitea.</p></div>`;
    return;
  }
  const ro = S.cerrada;
  const rows = S.metas.map((m, i) => {
    const cumplida = m.c;
    const trClass = cumplida ? 'is-cumplida' : (ro || m.m ? 'is-fallida' : '');
    const motivoVis = !cumplida;
    return `
    <tr class="${trClass}" data-idx="${i}">
      <td class="col-act">
        <div class="ppc-actividad">${escapeHtml(m.actividad)}</div>
        <textarea class="ppc-motivo" data-idx="${i}" rows="1"
          placeholder="Motivo del incumplimiento (obligatorio)…"
          ${ro ? 'readonly' : ''} ${motivoVis ? '' : 'hidden'}>${escapeHtml(m.m || '')}</textarea>
      </td>
      <td class="ppc-resp" data-label="Responsable">${ro
        ? (escapeHtml(m.responsable) || '—')
        : `<select class="ppc-resp-select" data-idx="${i}">${optsResponsable(m.responsable)}</select>`}</td>
      <td class="col-lote" data-label="Lote">${m.lote ? `<span class="ppc-lote-tag">${escapeHtml(m.lote)}</span>` : '—'}</td>
      <td class="col-check" data-label="Cumplida">
        <label class="ppc-check">
          <input type="checkbox" data-idx="${i}" ${cumplida ? 'checked' : ''} ${ro ? 'disabled' : ''}>
          <span class="slider"></span>
        </label>
      </td>
    </tr>`;
  }).join('');

  host.innerHTML = `
    <div class="ppc-table-wrap">
      <table class="ppc-table">
        <thead><tr>
          <th>Actividad / Meta</th><th>Responsable</th><th class="col-lote">Lote</th><th class="col-check">Cumplida</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  if (!ro) {
    host.querySelectorAll('input[type=checkbox]').forEach((chk) => {
      chk.addEventListener('change', onToggle);
    });
    host.querySelectorAll('.ppc-motivo').forEach((ta) => {
      ta.addEventListener('input', onMotivo);
    });
    host.querySelectorAll('.ppc-resp-select').forEach((s) => {
      s.addEventListener('change', onResp);
    });
  }
}

function onResp(e) {
  const i = +e.target.dataset.idx;
  S.metas[i].responsable = e.target.value;
  guardarProg(S.sel.semana, S.metas);
}

function onToggle(e) {
  const i = +e.target.dataset.idx;
  S.metas[i].c = e.target.checked;
  if (e.target.checked) S.metas[i].m = '';
  guardarProg(S.sel.semana, S.metas);
  // refresca fila + KPIs sin re-render completo (mantiene foco)
  const tr = e.target.closest('tr');
  const ta = tr.querySelector('.ppc-motivo');
  if (e.target.checked) {
    tr.classList.add('is-cumplida'); tr.classList.remove('is-fallida');
    if (ta) { ta.hidden = true; ta.value = ''; }
  } else {
    tr.classList.remove('is-cumplida'); tr.classList.add('is-fallida');
    if (ta) ta.hidden = false;
  }
  renderKPIs();
}

function onMotivo(e) {
  const i = +e.target.dataset.idx;
  S.metas[i].m = e.target.value;
  guardarProg(S.sel.semana, S.metas);
}

/* ============================================================
   CARGA DE UNA SEMANA
   ============================================================ */
async function cargarSemana(entrada) {
  S.sel = entrada;
  S.cerrada = false;
  const host = $('#ppc-table-host');
  host.innerHTML = '<div class="loading">Cargando metas…</div>';
  $('#ppc-cierre-bar').hidden = true;
  $('#ppc-cierre-hint').innerHTML = '';

  // Solo lectura ÚNICAMENTE si hay cierre COMMITEADO en index.json.
  // (El snapshot local NO bloquea la semana; solo alimenta la gráfica.)
  let cierre = null;
  if (entrada.cierre) cierre = await cargarJSON(PPC_BASE + entrada.cierre);

  if (cierre) {
    S.cerrada = true;
    S.metas = (cierre.metas || []).map((m) => ({
      actividad: m.actividad, responsable: m.responsable, lote: m.lote,
      c: !!m.cumplida, m: m.motivo || ''
    }));
  } else {
    // Semana abierta → lee el Excel de metas + progreso local
    try {
      const metas = await cargarXLSX(PPC_BASE + entrada.metas);
      const prog = leerProg(entrada.semana);
      S.metas = metas.map((m, i) => ({
        ...m,
        c: prog[i] ? !!prog[i].c : false,
        m: prog[i] ? (prog[i].m || '') : '',
        responsable: normResponsable((prog[i] && prog[i].r) ? prog[i].r : (m.responsable || ''))
      }));
    } catch (e) {
      S.metas = [];
      host.innerHTML = `<div class="empty-state"><div class="icon">📋</div>
        <h3>Sin Excel de metas</h3>
        <p>No se encontró <code>data/ppc/${escapeHtml(entrada.metas)}</code>. Súbelo y commitea para iniciar la semana.</p></div>`;
    }
  }

  // Badge de estado de la semana
  const esCurso = entrada.semana === S.semanaCurso;
  const badge = $('#ppc-week-badge');
  if (S.cerrada) {
    badge.innerHTML = '<span class="ppc-badge-curso ppc-badge-cerrada"><span class="dot"></span>Semana cerrada</span>';
  } else if (esCurso) {
    badge.innerHTML = '<span class="ppc-badge-curso"><span class="dot"></span>Semana en curso</span>';
  } else {
    badge.innerHTML = '<span class="ppc-badge-curso ppc-badge-cerrada"><span class="dot"></span>Abierta</span>';
  }
  $('#ppc-week-periodo').textContent = entrada.periodo ? '· ' + entrada.periodo : '';
  $('#ppc-modo').textContent = S.cerrada
    ? 'Semana cerrada — vista de solo lectura.'
    : 'Marca cada meta cumplida; el avance se guarda en este navegador. Documenta el motivo de las no cumplidas.';

  renderTabla();
  renderKPIs();
  $('#ppc-cierre-bar').hidden = S.cerrada || !S.metas.length;
  if (!S.cerrada && S.metas.length) {
    $('#ppc-cierre-hint').innerHTML = 'Al cerrar se abrirá el diálogo de impresión (guarda como PDF) y podrás descargar el <code>JSON de cierre</code> para commitearlo.';
  }
}

/* ============================================================
   CIERRE DE SEMANA → acta PDF + JSON
   ============================================================ */
function construirCierre() {
  const r = calcPPC(S.metas);
  return {
    semana: S.sel.semana,
    periodo: S.sel.periodo || '',
    fecha_cierre: hoyISO(),
    responsable: 'Arq. Jorge Enríquez',
    total: r.total,
    cumplidas: r.cumplidas,
    no_cumplidas: r.fallidas,
    ppc_pct: r.pct,
    metas: S.metas.map((m) => ({
      actividad: m.actividad, responsable: m.responsable, lote: m.lote,
      cumplida: !!m.c, motivo: m.c ? '' : (m.m || '')
    }))
  };
}

function validarCierre() {
  const faltan = [];
  S.metas.forEach((m, i) => { if (!m.c && !(m.m || '').trim()) faltan.push(i); });
  return faltan;
}

function renderActa(cierre) {
  const nombreProy = S.proyecto?.proyecto?.nombre || 'Altozano';
  const cls = ppcClase(cierre.ppc_pct);
  const color = cls === 'ok' ? 'var(--green)' : cls === 'warn' ? 'var(--orange)' : 'var(--red)';
  const filas = cierre.metas.map((m) => `
    <tr>
      <td>${escapeHtml(m.actividad)}</td>
      <td>${escapeHtml(m.responsable) || '—'}</td>
      <td>${escapeHtml(m.lote) || '—'}</td>
      <td class="c ${m.cumplida ? 'acta-si' : 'acta-no'}">${m.cumplida ? '✔ Sí' : '✘ No'}</td>
      <td>${m.cumplida ? '' : escapeHtml(m.motivo)}</td>
    </tr>`).join('');

  $('#ppc-print').innerHTML = `
    <div class="acta-head">
      <div class="acta-head-left">
        ${S.logoData ? `<img src="${S.logoData}" class="acta-logo" alt="Metta">` : ''}
        <div>
          <h2>Acta de cierre semanal · PPC</h2>
          <div class="sub">${escapeHtml(nombreProy)} · 6 Viviendas · Last Planner System</div>
          <div class="sub">Semana ${cierre.semana} · ${escapeHtml(cierre.periodo)}</div>
        </div>
      </div>
      <div class="acta-ppc">
        <div class="num" style="color:${color}">${cierre.ppc_pct}%</div>
        <div class="lbl">PPC de la semana</div>
      </div>
    </div>
    <div class="acta-meta-grid">
      <div><b>Metas comprometidas</b>${cierre.total}</div>
      <div><b>Cumplidas</b>${cierre.cumplidas}</div>
      <div><b>No cumplidas</b>${cierre.no_cumplidas}</div>
      <div><b>Fecha de cierre</b>${fmtFecha(cierre.fecha_cierre)}</div>
    </div>
    <table class="acta-table">
      <thead><tr><th>Actividad / Meta</th><th>Responsable</th><th>Lote</th><th>Cumplida</th><th>Motivo de incumplimiento</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="acta-firmas">
      <div class="acta-firma"><div class="line">&nbsp;</div>Residente de obra</div>
      <div class="acta-firma"><div class="line">&nbsp;</div>${escapeHtml(cierre.responsable)}<br>Gerencia de proyecto</div>
    </div>`;
}

function descargarJSON(cierre) {
  const blob = new Blob([JSON.stringify(cierre, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `semana-${cierre.semana}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

let cierreActual = null;

async function onCerrar() {
  const faltan = validarCierre();
  if (faltan.length) {
    alert(`Faltan ${faltan.length} motivo(s) por documentar.\n\nEn Last Planner System, toda meta no cumplida debe registrar la causa de no cumplimiento (CNC). Complétalas antes de cerrar la semana.`);
    // resalta el primero
    const ta = document.querySelector(`.ppc-motivo[data-idx="${faltan[0]}"]`);
    if (ta) { ta.hidden = false; ta.focus(); ta.style.borderColor = 'var(--red)'; }
    return;
  }
  cierreActual = construirCierre();
  renderActa(cierreActual);
  $('#ppc-cierre-hint').innerHTML = '✅ Acta generada. <strong>Descarga el JSON</strong> y commitéalo en <code>data/ppc/cierres/semana-' + cierreActual.semana + '.json</code> (y registra el <code>cierre</code> en <code>index.json</code>). La semana aparecerá en la gráfica una vez publicada.';
  $('#btn-json').disabled = false;
  window.print();
}

function onDescargarJSON() {
  if (!cierreActual) cierreActual = construirCierre();
  descargarJSON(cierreActual);
}

/* ============================================================
   HISTÓRICO · gráfica + tabla
   ============================================================ */
async function recopilarHistorico() {
  // Solo semanas con cierre COMMITEADO (la semana activa/abierta no se grafica).
  const puntos = [];
  for (const s of S.index.semanas) {
    if (!s.cierre) continue;
    const c = await cargarJSON(PPC_BASE + s.cierre);
    if (c && typeof c.cumplidas === 'number') {
      puntos.push({
        semana: s.semana,
        cumplidas: c.cumplidas,
        total: c.total != null ? c.total : (c.cumplidas + (c.no_cumplidas || 0)),
        pct: c.ppc_pct != null ? c.ppc_pct : Math.round(c.cumplidas / (c.total || 1) * 100),
        local: false
      });
    }
  }
  puntos.sort((a, b) => parseInt(a.semana) - parseInt(b.semana));
  // Acumulado
  let accCump = 0, accTot = 0;
  puntos.forEach((p) => {
    accCump += p.cumplidas; accTot += p.total;
    p.acum = accTot ? Math.round((accCump / accTot) * 100) : 0;
  });
  return puntos;
}

let HIST_CACHE = null;   // puntos de semanas con datos (cerradas / en curso)

/* Lista de todas las semanas del proyecto (de inicio a fin) */
function listaSemanasProyecto() {
  const p = S.proyecto?.proyecto || {};
  const weeks = [];
  const ini = p.fecha_inicio ? new Date(p.fecha_inicio + 'T00:00:00') : null;
  const fin = p.fecha_fin ? new Date(p.fecha_fin + 'T00:00:00') : null;
  if (ini && fin) {
    let cur = new Date(ini), i = 1;
    while (cur <= fin) {
      weeks.push({ num: String(i).padStart(2, '0') });
      cur.setDate(cur.getDate() + 7); i++;
    }
  }
  if (!weeks.length && S.index) S.index.semanas.forEach((s) => weeks.push({ num: s.semana }));
  return weeks;
}

/* Serie de todo el proyecto: cada semana de inicio a fin, futuras en blanco */
function dataProyecto(cerradas) {
  // Solo semanas cerradas (commiteadas). La semana activa no se grafica hasta cerrarse.
  const byNum = {};
  cerradas.forEach((p) => { byNum[p.semana] = p; });
  let accC = 0, accT = 0;
  return listaSemanasProyecto().map((w) => {
    const p = byNum[w.num];
    if (p) { accC += p.cumplidas; accT += p.total; }
    return {
      semana: w.num,
      pct: p ? p.pct : null,
      cumplidas: p ? p.cumplidas : null,
      total: p ? p.total : null,
      acum: p && accT ? Math.round((accC / accT) * 100) : null,
      esCurso: w.num === S.semanaCurso,
      enCurso: p ? !!p.enCurso : false,
      local: p ? !!p.local : false,
      vacia: !p
    };
  });
}

function pintarChart(puntos, modo) {
  const labels = puntos.map((p) => 'S' + p.semana);
  const semanal = puntos.map((p) => p.pct);
  const acum = puntos.map((p) => p.acum);
  const meta = puntos.map(() => 80);
  const minimo = puntos.map(() => 60);
  const conDatos = puntos.filter((p) => p.pct != null);

  const ultAcum = [...puntos].reverse().find((p) => p.acum != null);
  $('#ppc-chart-title').textContent = modo === 'proyecto'
    ? 'Plan completado · proyecto completo (inicio → fin)'
    : 'Histórico de cumplimiento';
  $('#ppc-chart-sub').textContent = conDatos.length
    ? (modo === 'proyecto'
        ? `${puntos.length} semanas de proyecto · ${conDatos.length} con datos · PPC acumulado ${ultAcum ? ultAcum.acum : 0}%`
        : `${conDatos.length} semana(s) cerrada(s) · PPC acumulado ${ultAcum ? ultAcum.acum : 0}%`)
    : 'Aún no hay semanas con datos.';

  if (S.chart) { S.chart.destroy(); S.chart = null; }
  if (!puntos.length) return;

  const muchas = puntos.length > 16;
  S.chart = new Chart($('#ppcChart').getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'PPC semanal', data: semanal, borderColor: '#2f5d54', backgroundColor: 'rgba(47,93,84,0.06)', borderWidth: 2.5, tension: 0.3, fill: true, spanGaps: false, pointRadius: muchas ? 3 : 4, pointBackgroundColor: '#2f5d54' },
        { label: 'PPC acumulado', data: acum, borderColor: '#a6a95e', borderDash: [6, 4], backgroundColor: 'transparent', borderWidth: 2.5, tension: 0.3, fill: false, spanGaps: false, pointRadius: muchas ? 2 : 3, pointBackgroundColor: '#a6a95e' },
        { label: 'Meta 80%', data: meta, borderColor: '#9aa39f', borderDash: [4, 4], borderWidth: 1.5, fill: false, pointRadius: 0, pointHoverRadius: 0 },
        { label: 'Mín. 60%', data: minimo, borderColor: '#d6a8a0', borderDash: [3, 3], borderWidth: 1.5, fill: false, pointRadius: 0, pointHoverRadius: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { font: { family: 'Inter', size: 11, weight: '500' }, boxWidth: 10, boxHeight: 10, usePointStyle: true, color: '#4a4f4d' } },
        tooltip: { backgroundColor: '#232726', titleFont: { family: 'Inter', size: 12, weight: '600' }, bodyFont: { family: 'JetBrains Mono', size: 11 }, padding: 10, cornerRadius: 8,
          callbacks: { label: (ctx) => ctx.parsed.y == null ? null : ctx.dataset.label + ': ' + ctx.parsed.y + '%' } }
      },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%', font: { family: 'JetBrains Mono', size: 10 }, color: '#8a8f8c', stepSize: 20 }, grid: { color: '#f0efeb' } },
        x: { ticks: { font: { family: 'JetBrains Mono', size: muchas ? 9 : 10 }, color: '#8a8f8c', autoSkip: false, maxRotation: 0 }, grid: { display: false } }
      }
    }
  });
}

function pintarTablaHist(puntos, modo) {
  const body = $('#ppc-hist-body');
  const conDatos = puntos.filter((p) => p.pct != null);
  if (!conDatos.length && modo !== 'proyecto') {
    body.innerHTML = '<tr><td colspan="5" style="color:var(--ink-mute)">Sin semanas cerradas todavía.</td></tr>';
    return;
  }
  body.innerHTML = puntos.map((p) => {
    const curso = p.esCurso ? ' class="row-curso"' : '';
    if (p.pct == null) {
      return `<tr${curso}>
        <td class="sem">Semana ${p.semana}</td>
        <td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
    }
    return `<tr${curso}>
      <td class="sem">Semana ${p.semana}${p.enCurso ? ' (en curso)' : (p.local ? ' •' : '')}</td>
      <td>${p.cumplidas}</td>
      <td>${p.total - p.cumplidas}</td>
      <td class="ppc-pct-cell ${ppcClase(p.pct)}">${p.pct}%</td>
      <td class="ppc-pct-cell ${ppcClase(p.acum)}">${p.acum}%</td>
    </tr>`;
  }).join('');
}

function pintarHistorico() {
  const puntos = S.chartMode === 'proyecto' ? dataProyecto(HIST_CACHE || []) : (HIST_CACHE || []);
  pintarChart(puntos, S.chartMode);
  pintarTablaHist(puntos, S.chartMode);
}

function setChartMode(modo) {
  S.chartMode = modo;
  document.querySelectorAll('.ppc-seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === modo));
  pintarHistorico();
}

async function renderHistorico() {
  HIST_CACHE = await recopilarHistorico();
  pintarHistorico();
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */
/* Reaparición de elementos .fade-up (mismo patrón que el resto del tablero) */
function animar() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.fade-up').forEach((el) => io.observe(el));
}

async function init() {
  S.proyecto = await cargarJSON('data/proyecto.json');
  S.index = await cargarJSON(PPC_BASE + 'index.json');
  const cfgResp = await cargarJSON(PPC_BASE + 'responsables.json');
  S.responsables = (cfgResp && Array.isArray(cfgResp.responsables)) ? cfgResp.responsables : [];
  S.logoData = await cargarLogoData('assets/logo-metta.png');

  if (S.proyecto?.proyecto) {
    $('#ppc-footer').textContent = `${S.proyecto.proyecto.gerencia || 'Metta'} · Gerencia de Proyecto`;
  }

  if (!S.index || !Array.isArray(S.index.semanas) || !S.index.semanas.length) {
    $('#ppc-table-host').innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>
      <h3>Sin semanas registradas</h3>
      <p>Crea <code>data/ppc/index.json</code> y sube el primer Excel de metas.</p></div>`;
    return;
  }

  S.semanaCurso = detectarSemanaCurso(S.index);

  // Selector de semanas (orden descendente: la más reciente arriba)
  const ordenadas = [...S.index.semanas].sort((a, b) => parseInt(b.semana) - parseInt(a.semana));
  const sel = $('#ppc-week');
  sel.innerHTML = ordenadas.map((s) => {
    const marca = s.semana === S.semanaCurso ? ' — en curso' : '';
    return `<option value="${s.semana}">Semana ${s.semana}${marca}</option>`;
  }).join('');

  // Selección inicial: semana en curso si existe en el índice; si no, la más reciente.
  const inicial = S.semanaCurso && S.index.semanas.find((s) => s.semana === S.semanaCurso)
    ? S.semanaCurso : ordenadas[0].semana;
  sel.value = inicial;

  sel.addEventListener('change', () => {
    const entrada = S.index.semanas.find((s) => s.semana === sel.value);
    if (entrada) cargarSemana(entrada);
  });

  $('#btn-cerrar').addEventListener('click', onCerrar);
  $('#btn-json').addEventListener('click', onDescargarJSON);

  // Toggle de vista de la gráfica (semanas cerradas / proyecto completo)
  document.querySelectorAll('.ppc-seg-btn').forEach((b) => {
    b.addEventListener('click', () => setChartMode(b.dataset.mode));
  });

  const entradaInicial = S.index.semanas.find((s) => s.semana === inicial);
  await cargarSemana(entradaInicial);
  await renderHistorico();
  animar();
}

document.addEventListener('DOMContentLoaded', init);
