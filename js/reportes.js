/* ============================================================
   ALTOZANO · TABLERO · Índice de reportes semanales
   Lista todas las semanas publicadas leyendo data/reportes/index.json
   ============================================================ */

const $ = (sel) => document.querySelector(sel);
const fmt = (n, d = 2) => Number(n).toFixed(d);

async function cargarJSON(ruta) {
  try {
    const resp = await fetch(`${ruta}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (e) {
    return null;
  }
}

async function init() {
  const indice = await cargarJSON('data/reportes/index.json');
  const grid = $('#weeks-grid');
  const countEl = $('#weeks-count');

  if (!indice) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><h3>No se pudo cargar el índice</h3><p>Verifica que exista el archivo <code>data/reportes/index.json</code></p></div>';
    countEl.textContent = '—';
    return;
  }

  if (!indice.semanas_publicadas || indice.semanas_publicadas.length === 0) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">📋</div><h3>Aún no hay reportes publicados</h3><p>Los reportes semanales aparecerán aquí conforme se publiquen.</p></div>';
    countEl.textContent = `0 de ${indice.proyecto?.total_semanas || '—'} publicadas`;
    return;
  }

  countEl.textContent = `${indice.semanas_publicadas.length} de ${indice.proyecto?.total_semanas || '—'} publicadas`;

  // Cargar datos de cada semana — antigua primero
  const semanas = [...indice.semanas_publicadas].sort((a, b) => parseInt(a) - parseInt(b));
  const datos = await Promise.all(semanas.map(num => cargarJSON(`data/reportes/semana-${num}.json`)));

  grid.innerHTML = '';
  semanas.forEach((num, i) => {
    const data = datos[i];
    if (!data) return;
    const g = data.avance_global;
    const esUltima = i === semanas.length - 1;
    const signo = g.variacion_pct >= 0 ? '+' : '';
    const varClass = g.variacion_pct >= 0 ? 'positive' : 'negative';

    const card = document.createElement('a');
    card.className = 'week-card fade-up';
    card.href = `semana.html?num=${num}`;
    card.innerHTML = `
      <div class="week-card-top">
        <div class="week-card-num">${num}<small>Semana</small></div>
        ${esUltima ? '<div class="week-card-badge">Reciente</div>' : ''}
      </div>
      <div class="week-card-date">${data.semana.periodo}</div>
      <div class="week-card-stats">
        <div class="week-card-stat"><span class="lbl">Programado</span><span class="val">${fmt(g.programado_pct)}%</span></div>
        <div class="week-card-stat"><span class="lbl">Real</span><span class="val accent">${fmt(g.real_pct)}%</span></div>
        <div class="week-card-stat"><span class="lbl">Var.</span><span class="val ${varClass}">${signo}${fmt(g.variacion_pct)}%</span></div>
      </div>
      <div class="week-card-arrow">→</div>
    `;
    grid.appendChild(card);
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-up').forEach(el => io.observe(el));
}

document.addEventListener('DOMContentLoaded', init);
