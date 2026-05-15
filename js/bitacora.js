/* ============================================================
   ALTOZANO · TABLERO · Bitácora de obra
   Un solo archivo que sirve a dos páginas:
     - bitacora.html        → listado de notas (#bitacora-grid)
     - bitacora-nota.html   → detalle de una nota (#nota-detail, ?id=XXX)
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

/* ============ LISTADO (bitacora.html) ============ */
async function initListado() {
  const indice = await cargarJSON('data/bitacora/index.json');
  const grid = $('#bitacora-grid');
  const countEl = $('#notas-count');

  if (!indice || !indice.notas) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><h3>No se pudo cargar la bitácora</h3><p>Verifica que exista <code>data/bitacora/index.json</code></p></div>';
    countEl.textContent = '—';
    return;
  }
  if (!indice.notas.length) {
    grid.innerHTML = '<div class="empty-state"><div class="icon">📓</div><h3>Aún no hay notas de bitácora</h3><p>Las notas aparecerán aquí conforme se registren.</p></div>';
    countEl.textContent = '0 notas';
    return;
  }

  // Orden: más reciente primero (mayor número de nota)
  const notasOrden = [...indice.notas].sort((a, b) => parseInt(b) - parseInt(a));
  countEl.textContent = `${indice.notas.length} ${indice.notas.length === 1 ? 'nota' : 'notas'}`;

  // Validación de consecutividad
  const nums = [...indice.notas].map(n => parseInt(n)).sort((a, b) => a - b);
  const huecos = [];
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1) {
      for (let j = nums[i - 1] + 1; j < nums[i]; j++) huecos.push(j);
    }
  }
  if (nums.length && nums[0] !== 1) {
    $('#aviso-consecutivo').innerHTML =
      `<div class="empty-state" style="padding:1rem 1.5rem;text-align:left;margin-bottom:1rem;background:var(--gold-soft)">
        <p style="color:var(--gold-dark);font-weight:600">⚠ La numeración no inicia en 001. Las notas de bitácora deben ser consecutivas.</p>
      </div>`;
  } else if (huecos.length) {
    $('#aviso-consecutivo').innerHTML =
      `<div class="empty-state" style="padding:1rem 1.5rem;text-align:left;margin-bottom:1rem;background:var(--gold-soft)">
        <p style="color:var(--gold-dark);font-weight:600">⚠ Faltan notas en la secuencia: ${huecos.map(h => String(h).padStart(3, '0')).join(', ')}. La bitácora debe ser consecutiva.</p>
      </div>`;
  }

  const datos = await Promise.all(notasOrden.map(n => cargarJSON(`data/bitacora/nota-${n}.json`)));

  grid.innerHTML = '';
  notasOrden.forEach((n, i) => {
    const d = datos[i];
    if (!d) return;
    const tieneFoto = d.foto_fisica && d.foto_fisica.trim();
    const card = document.createElement('a');
    card.className = 'bitacora-card fade-up';
    card.href = `bitacora-nota.html?id=${n}`;
    card.innerHTML = `
      <div class="bitacora-card-num">${d.numero}<small>Nota</small></div>
      <div class="bitacora-card-body">
        <div class="fecha">${fechaLarga(d.fecha)}</div>
        <div class="desc">${escapeHtml(d.descripcion)}</div>
        ${d.responsable ? `<div class="resp">Registró: ${escapeHtml(d.responsable)}</div>` : ''}
      </div>
      <div class="bitacora-card-side">
        ${tieneFoto
          ? `<img class="bitacora-thumb" src="${d.foto_fisica}" alt="Bitácora física nota ${d.numero}" onerror="this.outerHTML='<div class=\\'bitacora-thumb-empty\\'>📷</div>'">`
          : `<div class="bitacora-thumb-empty" title="Sin foto física">📷</div>`}
      </div>
    `;
    grid.appendChild(card);
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.fade-up').forEach(el => io.observe(el));
}

/* ============ DETALLE (bitacora-nota.html) ============ */
async function initDetalle() {
  const id = new URLSearchParams(window.location.search).get('id');
  const cont = $('#nota-detail');

  if (!id) {
    cont.innerHTML = '<div class="empty-state"><div class="icon">📄</div><h3>Nota no especificada</h3><p><a href="bitacora.html" style="color:var(--accent);font-weight:600">← Volver al índice</a></p></div>';
    return;
  }

  const d = await cargarJSON(`data/bitacora/nota-${id}.json`);
  if (!d) {
    cont.innerHTML = `<div class="empty-state"><div class="icon">📄</div><h3>No se encontró la nota ${id}</h3><p><a href="bitacora.html" style="color:var(--accent);font-weight:600">← Volver al índice</a></p></div>`;
    return;
  }

  document.title = `Bitácora · Nota ${d.numero} | Altozano`;
  const tieneFoto = d.foto_fisica && d.foto_fisica.trim();

  cont.innerHTML = `
    <div class="nota-detail-head">
      <div class="nota-detail-num">${d.numero}<small>Nota de bitácora</small></div>
      <div class="nota-detail-meta">
        <div class="fecha">${fechaLarga(d.fecha)}</div>
        ${d.responsable ? `<div class="resp">Registró: <strong>${escapeHtml(d.responsable)}</strong></div>` : ''}
        ${d.lote ? `<div class="resp">Lote / área: <strong>${escapeHtml(d.lote)}</strong></div>` : ''}
      </div>
    </div>
    <div class="nota-body">${escapeHtml(d.descripcion)}</div>
    <div class="nota-foto-fisica">
      <h3>Bitácora física</h3>
      ${tieneFoto
        ? `<img id="foto-fisica" src="${d.foto_fisica}" alt="Bitácora física nota ${d.numero}" onerror="this.outerHTML='<div class=\\'nota-foto-empty\\'>No se encontró la imagen <code>'+this.getAttribute('src')+'</code></div>'">`
        : `<div class="nota-foto-empty">Esta nota no tiene imagen de la bitácora física.</div>`}
    </div>
  `;

  // Lightbox para la foto física
  if (tieneFoto) {
    const foto = $('#foto-fisica');
    if (foto) {
      foto.addEventListener('click', () => {
        $('#lightbox-img').src = foto.src;
        $('#lightbox').classList.add('open');
      });
    }
  }
  $('#lightbox-close').addEventListener('click', () => $('#lightbox').classList.remove('open'));
  $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') $('#lightbox').classList.remove('open'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#lightbox').classList.remove('open'); });
}

/* ============ ROUTER ============ */
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('bitacora-grid')) initListado();
  else if (document.getElementById('nota-detail')) initDetalle();
});
