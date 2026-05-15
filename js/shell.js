/* ============================================================
   ALTOZANO · TABLERO · Lógica de la página principal (index.html)
   - Llena el hero con datos de data/proyecto.json
   - Llena la banda de indicadores rápidos leyendo el ÚLTIMO
     reporte semanal publicado (data/reportes/...)
   ============================================================ */

const $ = (sel) => document.querySelector(sel);
const fmt = (n, d = 2) => Number(n).toFixed(d);

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];

/* Convierte "2026-05-11" a "11 de mayo, 2026" */
function fechaLarga(iso) {
  if (!iso) return '—';
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
    console.warn(`No se pudo cargar ${ruta}:`, e.message);
    return null;
  }
}

/* Llena el hero y la meta del proyecto */
function renderProyecto(proy) {
  if (!proy) return;
  const p = proy.proyecto;
  $('#hero-nombre').textContent = p.nombre || 'Altozano';
  if (p.descripcion) $('#hero-descripcion').textContent = p.descripcion;
  $('#meta-ubicacion').textContent = p.ubicacion || '—';
  $('#meta-viviendas').textContent = p.viviendas != null ? `${p.viviendas} viviendas` : '—';
  $('#meta-inicio').textContent = fechaLarga(p.fecha_inicio);
  $('#meta-fin').textContent = fechaLarga(p.fecha_fin);
  document.title = `${p.nombre || 'Altozano'} · Tablero de Control | Metta`;

  // Días restantes para el término de obra
  if (p.fecha_fin) {
    const hoy = new Date();
    const fin = new Date(p.fecha_fin + 'T00:00:00');
    const dias = Math.round((fin - hoy) / (1000 * 60 * 60 * 24));
    const el = $('#qs-dias');
    if (dias > 0) {
      el.textContent = dias;
      $('#qs-dias-sub').textContent = `Para el ${fechaLarga(p.fecha_fin)}`;
    } else if (dias === 0) {
      el.textContent = 'Hoy';
    } else {
      el.textContent = `+${Math.abs(dias)}`;
      $('#qs-dias-sub').textContent = 'Días vencidos del plazo';
    }
  }
}

/* Llena la banda de indicadores con el último reporte semanal */
async function renderQuickstats() {
  const indice = await cargarJSON('data/reportes/index.json');
  if (!indice || !indice.semanas_publicadas || !indice.semanas_publicadas.length) {
    ['#qs-real', '#qs-prog', '#qs-var'].forEach(s => $(s).textContent = '—');
    $('#qs-real-sub').textContent = 'Sin reportes aún';
    return;
  }

  // Semana más reciente (mayor número)
  const semanas = [...indice.semanas_publicadas].sort((a, b) => parseInt(b) - parseInt(a));
  const ultima = semanas[0];
  const data = await cargarJSON(`data/reportes/semana-${ultima}.json`);
  if (!data || !data.avance_global) {
    $('#qs-real-sub').textContent = 'Reporte no disponible';
    return;
  }

  const g = data.avance_global;
  $('#qs-real').textContent = fmt(g.real_pct) + '%';
  $('#qs-prog').textContent = fmt(g.programado_pct) + '%';
  $('#qs-real-sub').textContent = `Semana ${ultima} · ${data.semana?.periodo || ''}`;

  const varEl = $('#qs-var');
  const signo = g.variacion_pct >= 0 ? '+' : '';
  varEl.textContent = `${signo}${fmt(g.variacion_pct)}%`;
  varEl.classList.add(g.variacion_pct >= 0 ? 'pos' : 'neg');
  $('#qs-var-sub').textContent = g.variacion_pct >= 0 ? 'Adelanto sobre el programa' : 'Atraso respecto al programa';
}

/* Animaciones on-scroll */
function animar() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-up').forEach(el => io.observe(el));
}

async function init() {
  const proy = await cargarJSON('data/proyecto.json');
  renderProyecto(proy);
  await renderQuickstats();
  animar();
}

document.addEventListener('DOMContentLoaded', init);
