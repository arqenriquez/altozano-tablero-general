/* ============================================================
   ALTOZANO · TABLERO · Galería fotográfica
   Lee data/galeria.json y muestra las fotos con filtros
   (orden, semana, vivienda). Los filtros se llenan
   automáticamente con los valores presentes en los datos.
   ============================================================ */

const $ = (sel) => document.querySelector(sel);

let FOTOS = [];
let FOTOS_VISIBLES = [];

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];
function fechaLarga(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MESES[m - 1]} ${y}`;
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

/* Llena un <select> con las opciones únicas de un campo */
function llenarFiltro(selectId, campo, etiqueta) {
  const valores = [...new Set(FOTOS.map(f => f[campo]).filter(v => v != null && v !== ''))];
  // Orden numérico si parecen números, alfabético si no
  valores.sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
  const sel = $(selectId);
  valores.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = campo === 'semana' ? `Semana ${v}` : v;
    sel.appendChild(opt);
  });
}

function aplicarFiltros() {
  const orden = $('#f-orden').value;
  const semana = $('#f-semana').value;
  const vivienda = $('#f-vivienda').value;

  FOTOS_VISIBLES = FOTOS.filter(f => {
    if (semana !== 'todas' && String(f.semana) !== semana) return false;
    if (vivienda !== 'todas' && String(f.vivienda) !== vivienda) return false;
    return true;
  });

  FOTOS_VISIBLES.sort((a, b) => {
    const fa = a.fecha || '', fb = b.fecha || '';
    return orden === 'reciente' ? fb.localeCompare(fa) : fa.localeCompare(fb);
  });

  renderGrid();
}

function renderGrid() {
  const grid = $('#galeria-grid');
  $('#galeria-count').textContent =
    `${FOTOS_VISIBLES.length} de ${FOTOS.length} ${FOTOS.length === 1 ? 'foto' : 'fotos'}`;

  if (!FOTOS_VISIBLES.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">📷</div><h3>Sin fotos en este filtro</h3><p>Ajusta los filtros para ver más resultados.</p></div>';
    return;
  }

  grid.innerHTML = '';
  FOTOS_VISIBLES.forEach((f, idx) => {
    const item = document.createElement('div');
    item.className = 'galeria-item';
    item.dataset.idx = idx;
    item.innerHTML = `
      <img src="${f.archivo}" alt="${escapeHtml(f.titulo)}" loading="lazy"
           onerror="this.parentElement.style.opacity='0.4';this.parentElement.title='No se encontró: ${escapeHtml(f.archivo)}'">
      <div class="galeria-item-overlay">
        <div class="cap">${escapeHtml(f.titulo || '')}</div>
        <div class="tags">
          ${f.fecha ? `<span>${fechaLarga(f.fecha)}</span>` : ''}
          ${f.semana ? `<span>Sem ${escapeHtml(f.semana)}</span>` : ''}
          ${f.vivienda ? `<span>${escapeHtml(f.vivienda)}</span>` : ''}
        </div>
      </div>
    `;
    item.addEventListener('click', () => abrirLightbox(idx));
    grid.appendChild(item);
  });
}

/* ---- Lightbox ---- */
let lbIdx = 0;
function abrirLightbox(idx) {
  lbIdx = idx;
  actualizarLightbox();
  $('#lightbox').classList.add('open');
}
function actualizarLightbox() {
  const f = FOTOS_VISIBLES[lbIdx];
  $('#lightbox-img').src = f.archivo;
  $('#lightbox-img').alt = f.titulo || '';
  $('#lightbox-counter').textContent = `${lbIdx + 1} / ${FOTOS_VISIBLES.length}`;
}
function cerrarLightbox() { $('#lightbox').classList.remove('open'); }
function navLightbox(dir) {
  lbIdx = (lbIdx + dir + FOTOS_VISIBLES.length) % FOTOS_VISIBLES.length;
  actualizarLightbox();
}

async function init() {
  const data = await cargarJSON('data/galeria.json');
  const grid = $('#galeria-grid');

  if (!data || !data.fotos) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">⚠️</div><h3>No se pudo cargar la galería</h3><p>Verifica que exista <code>data/galeria.json</code></p></div>';
    $('#galeria-count').textContent = '—';
    return;
  }

  FOTOS = data.fotos;
  if (!FOTOS.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">📷</div><h3>Aún no hay fotos cargadas</h3><p>Sube las imágenes a <code>fotos/galeria/</code> y regístralas en <code>data/galeria.json</code>.</p></div>';
    $('#galeria-count').textContent = '0 fotos';
    return;
  }

  llenarFiltro('#f-semana', 'semana');
  llenarFiltro('#f-vivienda', 'vivienda');

  $('#f-orden').addEventListener('change', aplicarFiltros);
  $('#f-semana').addEventListener('change', aplicarFiltros);
  $('#f-vivienda').addEventListener('change', aplicarFiltros);

  aplicarFiltros();

  $('#lightbox-close').addEventListener('click', cerrarLightbox);
  $('#lightbox-prev').addEventListener('click', () => navLightbox(-1));
  $('#lightbox-next').addEventListener('click', () => navLightbox(1));
  $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') cerrarLightbox(); });
  document.addEventListener('keydown', (e) => {
    if (!$('#lightbox').classList.contains('open')) return;
    if (e.key === 'Escape') cerrarLightbox();
    if (e.key === 'ArrowLeft') navLightbox(-1);
    if (e.key === 'ArrowRight') navLightbox(1);
  });
}

document.addEventListener('DOMContentLoaded', init);
