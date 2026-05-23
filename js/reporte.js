/* ============================================================
   ALTOZANO · TABLERO · Lógica del reporte semanal
   Carga data/reportes/semana-XX.json según ?num=XX y lo renderiza
   ============================================================ */

const $ = (sel) => document.querySelector(sel);
const fmt = (n, d = 2) => Number(n).toFixed(d);
const fmtMoney = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tieneMonto = (data) => data && data.curva_financiera && data.curva_financiera.valor_total_mxn > 0;

function obtenerNumSemana() {
  const num = new URLSearchParams(window.location.search).get('num');
  return num ? num.padStart(2, '0') : null;
}

async function cargarReporte(numSemana) {
  try {
    const resp = await fetch(`data/reportes/semana-${numSemana}.json?t=${Date.now()}`, { cache: 'no-cache' });
    if (!resp.ok) throw new Error('Reporte no encontrado');
    return await resp.json();
  } catch (e) {
    console.error('Error cargando reporte:', e);
    return null;
  }
}

function renderHero(data) {
  $('#hero-semana-num').textContent = data.semana.numero;
  $('#hero-proyecto').textContent = data.proyecto.nombre;
  $('#hero-ubicacion').textContent = data.proyecto.ubicacion;
  $('#hero-gerencia').textContent = data.proyecto.gerencia;
  $('#hero-periodo').textContent = data.semana.periodo;
  document.title = `${data.proyecto.nombre_corto} · Semana ${data.semana.numero} | Altozano`;
}

function renderKPIs(data) {
  const g = data.avance_global;
  $('#kpi-programado').dataset.target = g.programado_pct;
  $('#kpi-real').dataset.target = g.real_pct;
  $('#kpi-variacion').dataset.target = Math.abs(g.variacion_pct);

  if (tieneMonto(data)) {
    $('#kpi-programado-money').textContent = fmtMoney(g.programado_mxn) + ' MXN';
    $('#kpi-real-money').textContent = fmtMoney(g.real_mxn) + ' MXN';
    const diff = g.real_mxn - g.programado_mxn;
    $('#kpi-variacion-money').textContent = fmtMoney(Math.abs(diff)) + (diff >= 0 ? ' adelanto' : ' atraso');
  } else {
    $('#kpi-programado-money').textContent = 'Avance físico';
    $('#kpi-real-money').textContent = 'Avance físico';
    $('#kpi-variacion-money').textContent = g.variacion_pct >= 0 ? 'Adelanto sobre programa' : 'Atraso respecto a programa';
  }

  const varParent = $('#kpi-variacion').parentElement;
  varParent.classList.remove('positive', 'negative');
  varParent.classList.add(g.variacion_pct >= 0 ? 'positive' : 'negative');

  const realParent = $('#kpi-real').parentElement;
  realParent.classList.remove('positive', 'negative');
  if (g.variacion_pct > 0) realParent.classList.add('positive');
  if (g.variacion_pct < 0) realParent.classList.add('negative');

  $('#kpi-variacion-sign').textContent = g.variacion_pct >= 0 ? '+' : '-';
}

function renderActividades(data) {
  const semActual = data.semana.numero;
  const semSig = String(parseInt(semActual) + 1).padStart(2, '0');
  $('#act-realizadas-sub').textContent = `Semana ${semActual}`;
  $('#act-programadas-sub').textContent = `Semana ${semSig}`;

  $('#act-realizadas-list').innerHTML = data.actividades.realizadas.length
    ? data.actividades.realizadas.map(a => `<li>${a}</li>`).join('')
    : '<li style="color:var(--ink-mute);font-style:italic">Sin actividades registradas</li>';
  $('#act-programadas-list').innerHTML = data.actividades.programadas.length
    ? data.actividades.programadas.map(a => `<li>${a}</li>`).join('')
    : '<li style="color:var(--ink-mute);font-style:italic">Sin actividades programadas</li>';
}

function renderProblemas(data) {
  const tbody = $('#problemas-tbody');
  if (!data.problemas || !data.problemas.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--ink-mute);font-style:italic;padding:2rem">Sin problemas críticos registrados esta semana</td></tr>';
    return;
  }
  tbody.innerHTML = data.problemas.map(p => {
    const statusClass = p.estatus.toLowerCase().includes('observ') ? 'status-observado' : 'status-tramitado';
    return `<tr>
      <td>${p.descripcion}</td>
      <td><span class="status-badge ${statusClass}">${p.estatus}</span></td>
      <td class="mono">${p.fecha_limite || '—'}</td>
      <td>${p.responsable}</td>
    </tr>`;
  }).join('');
}

function renderAvanceLotes(data) {
  const lista = $('#lotes-list');
  lista.innerHTML = '';
  const orden = data.orden_lotes || Object.keys(data.lotes);
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

function renderGraficas(data) {
  const g = data.avance_global;
  const cf = data.curva_financiera;

  $('#dona-programado').textContent = fmt(g.programado_pct) + '%';
  $('#dona-real').textContent = fmt(g.real_pct) + '%';
  const varSign = g.variacion_pct >= 0 ? '+' : '';
  const adelantoEl = $('#dona-adelanto');
  adelantoEl.textContent = `${varSign}${fmt(g.variacion_pct)}%`;
  adelantoEl.classList.remove('green', 'negative');
  adelantoEl.classList.add(g.variacion_pct >= 0 ? 'green' : 'negative');

  const totalSemanas = cf.programado.length - 1;
  $('#curvaS-sub').textContent = tieneMonto(data)
    ? `${totalSemanas} semanas · ${fmtMoney(cf.valor_total_mxn)} MXN`
    : `${totalSemanas} semanas · avance físico %`;
  $('#dona-sub').textContent = `Semana ${data.semana.numero} de ${totalSemanas}`;

  const labels = ['Inicio', ...Array.from({ length: totalSemanas }, (_, i) => `S${i + 1}`)];

  const lastValueLabels = {
    id: 'lastValueLabels',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      const placed = [];
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        let lastIdx = -1;
        for (let j = ds.data.length - 1; j >= 0; j--) {
          if (ds.data[j] != null && !isNaN(ds.data[j])) { lastIdx = j; break; }
        }
        if (lastIdx < 0) return;
        const pt = meta.data[lastIdx];
        if (!pt) return;
        const text = Number(ds.data[lastIdx]).toFixed(2) + '%';
        const color = ds.borderColor;
        ctx.save();
        ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
        const padX = 6, boxH = 18;
        const boxW = ctx.measureText(text).width + padX * 2;
        let x = pt.x + 8;
        let y = pt.y - boxH / 2;
        if (x + boxW > chartArea.right) x = pt.x - boxW - 8;
        for (const p of placed) {
          if (Math.abs(p.y - y) < boxH + 2 && Math.abs(p.x - x) < Math.max(p.w, boxW) + 4) {
            y = (y < p.y) ? p.y - boxH - 4 : p.y + boxH + 4;
          }
        }
        placed.push({ x, y, w: boxW });
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(x, y, boxW, boxH, 4);
        } else {
          ctx.beginPath();
          ctx.rect(x, y, boxW, boxH);
        }
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + padX, y + boxH / 2);
        ctx.restore();
      });
    }
  };

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
      layout: { padding: { right: 56 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { font: { family: 'Inter', size: 11, weight: '500' }, boxWidth: 10, boxHeight: 10, usePointStyle: true, color: '#4a4f4d' } },
        tooltip: { backgroundColor: '#232726', titleFont: { family: 'Inter', size: 12, weight: '600' }, bodyFont: { family: 'JetBrains Mono', size: 11 }, padding: 10, cornerRadius: 8,
          callbacks: { label: (ctx) => ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2) + '%' } }
      },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { callback: (v) => v + '%', font: { family: 'JetBrains Mono', size: 10 }, color: '#8a8f8c' }, grid: { color: '#f0efeb' } },
        x: { ticks: { font: { family: 'JetBrains Mono', size: 9 }, color: '#8a8f8c', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } }
      }
    },
    plugins: [lastValueLabels]
  });

  const donutCenter = {
    id: 'donutCenter',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea } = chart;
      const cx = (chartArea.left + chartArea.right) / 2;
      const cy = (chartArea.top + chartArea.bottom) / 2;
      const val = chart.data.datasets[0].data[0];
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#2f5d54';
      ctx.font = '700 22px "Poppins", system-ui, sans-serif';
      ctx.fillText(Number(val).toFixed(2) + '%', cx, cy - 6);
      ctx.fillStyle = '#8a8f8c';
      ctx.font = '500 9px "Inter", system-ui, sans-serif';
      ctx.fillText('REAL EJECUTADO', cx, cy + 14);
      ctx.restore();
    }
  };

  new Chart($('#donaChart').getContext('2d'), {
    type: 'doughnut',
    data: { labels: ['Ejecutado', 'Por ejecutar'], datasets: [{ data: [g.real_pct, Math.max(0, 100 - g.real_pct)], backgroundColor: ['#2f5d54', '#e6e4df'], borderWidth: 0, cutout: '78%' }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { backgroundColor: '#232726', padding: 10, cornerRadius: 8, callbacks: { label: (ctx) => ctx.label + ': ' + ctx.parsed.toFixed(2) + '%' } } } },
    plugins: [donutCenter]
  });
}

function renderAbastecimientos(data) {
  const tbody = $('#abast-tbody');
  const semActual = data.semana.numero;
  const semPrev = String(parseInt(semActual) - 1).padStart(2, '0');
  tbody.innerHTML = '';

  const statusClass = (s) => {
    const l = s.toLowerCase();
    if (l.includes('suministrado')) return 'status-sum';
    if (l.includes('proceso')) return 'status-proc';
    return 'status-sol';
  };
  const impClass = (i) => {
    const l = (i || '').toLowerCase();
    if (l === 'alta') return 'importance-alta';
    if (l === 'media') return 'importance-media';
    return 'importance-baja';
  };

  const ab = data.abastecimientos || {};
  if (ab.entregados && ab.entregados.length) {
    tbody.innerHTML += `<tr><td colspan="4" class="abast-subheader">Semana ${semPrev} · Entregados</td></tr>`;
    tbody.innerHTML += `<tr><th>Concepto</th><th>Fecha requerida</th><th>Estatus</th><th>Importancia</th></tr>`;
    ab.entregados.forEach(a => {
      tbody.innerHTML += `<tr>
        <td>${a.concepto}</td>
        <td class="mono">${a.fecha_requerida}</td>
        <td><span class="${statusClass(a.estatus)}">${a.estatus}</span></td>
        <td class="${impClass(a.importancia)}">${a.importancia}</td>
      </tr>`;
    });
  }
  if (ab.programados && ab.programados.length) {
    tbody.innerHTML += `<tr><td colspan="4" class="abast-subheader">Programados para siguientes semanas</td></tr>`;
    tbody.innerHTML += `<tr><th>Concepto</th><th>Fecha requerida</th><th>Estatus</th><th>Importancia</th></tr>`;
    ab.programados.forEach(a => {
      tbody.innerHTML += `<tr>
        <td>${a.concepto}</td>
        <td class="mono">${a.fecha_requerida}</td>
        <td><span class="${statusClass(a.estatus)}">${a.estatus}</span></td>
        <td class="${impClass(a.importancia)}">${a.importancia}</td>
      </tr>`;
    });
  }
  if (!tbody.innerHTML) {
    tbody.innerHTML = '<tr><td style="text-align:center;color:var(--ink-mute);font-style:italic;padding:2rem">Sin abastecimientos registrados</td></tr>';
  }
}

function renderBotonesLote(data) {
  const grid = $('#lotes-grid-btns');
  grid.innerHTML = '';
  const orden = data.orden_lotes || Object.keys(data.lotes);
  orden.forEach((num, i) => {
    const d = data.lotes[num];
    if (!d) return;
    const btn = document.createElement('button');
    btn.className = `lote-btn fade-up delay-${i % 3}`;
    btn.dataset.lote = num;
    btn.innerHTML = `
      <div class="lote-btn-header">
        <div class="lote-btn-num">${num}<small>Lote · Mza ${d.mza}</small></div>
        <div class="lote-btn-modelo">${d.modelo}</div>
      </div>
      <div class="lote-btn-stats">
        <div class="lote-btn-stat"><span class="lote-btn-stat-lbl">Programado</span><span class="lote-btn-stat-val">${fmt(d.programado)}%</span></div>
        <div class="lote-btn-stat"><span class="lote-btn-stat-lbl">Real</span><span class="lote-btn-stat-val accent">${fmt(d.real)}%</span></div>
      </div>
      <div class="lote-btn-arrow">→</div>
    `;
    btn.addEventListener('click', () => abrirPanel(num, data));
    grid.appendChild(btn);
  });
}

/* ============ PANEL LATERAL + LIGHTBOX ============ */
let currentPhotos = [];
let currentPhotoIdx = 0;

function abrirPanel(num, data) {
  const d = data.lotes[num];
  if (!d) return;
  const varSign = d.variacion > 0 ? '+' : '';
  const varColor = d.variacion > 0 ? 'pos' : d.variacion < 0 ? 'neg' : 'neutral';
  const semNum = data.semana.numero;

  $('#panel-eyebrow').textContent = `${d.modelo} · Manzana ${d.mza}`;
  $('#panel-title').textContent = `Lote ${num}`;

  const actividadesLote = d.actividades || [];
  const actividadesHtml = actividadesLote.length
    ? `<ul class="panel-activities">${actividadesLote.map(a => `<li>${a}</li>`).join('')}</ul>`
    : `<div class="panel-activities empty">Sin actividades importantes registradas esta semana</div>`;

  // Fotos: fotos/reportes/semana-XX/lote-X/img-loteX-semXX-0N.jpg
  const photos = [1, 2, 3, 4].map(i => {
    const fn = `img-lote${num}-sem${semNum}-0${i}.jpg`;
    return { src: `fotos/reportes/semana-${semNum}/lote-${num}/${fn}`, filename: fn };
  });

  $('#panel-body').innerHTML = `
    <div class="panel-stats">
      <div class="panel-stat"><div class="lbl">Programado</div><div class="val">${fmt(d.programado)}%</div></div>
      <div class="panel-stat"><div class="lbl">Real</div><div class="val accent">${fmt(d.real)}%</div></div>
      <div class="panel-stat"><div class="lbl">Variación</div><div class="val ${varColor}">${varSign}${fmt(d.variacion)}%</div></div>
    </div>
    <div class="panel-section-title">Actividades importantes</div>
    ${actividadesHtml}
    <div class="panel-section-title">Reporte fotográfico</div>
    <div class="photos-col">
      ${photos.map((p, idx) => `
        <div class="photo-slot" data-idx="${idx}">
          <img src="${p.src}" alt="Lote ${num} - foto ${idx + 1}" onload="this.nextElementSibling.style.display='none'" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="photo-placeholder" style="display:flex">
            <div class="icon">📷</div>
            <div class="filename">${p.filename}</div>
            <div class="note">Pendiente de carga</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  $('#panel-body').querySelectorAll('.photo-slot').forEach(slot => {
    slot.addEventListener('click', () => {
      const img = slot.querySelector('img');
      if (img && img.complete && img.naturalHeight > 0) {
        currentPhotos = photos;
        currentPhotoIdx = parseInt(slot.dataset.idx);
        actualizarLightbox();
        $('#lightbox').classList.add('open');
      }
    });
  });

  $('#panel').classList.add('open');
  $('#overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function cerrarPanel() {
  $('#panel').classList.remove('open');
  $('#overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function actualizarLightbox() {
  $('#lightbox-img').src = currentPhotos[currentPhotoIdx].src;
  $('#lightbox-counter').textContent = `${currentPhotoIdx + 1} / ${currentPhotos.length}`;
}
function cerrarLightbox() { $('#lightbox').classList.remove('open'); }

function configurarAnimaciones() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        entry.target.querySelectorAll('.bar-fill').forEach(bar => {
          setTimeout(() => { bar.style.width = bar.dataset.width + '%'; }, 150);
        });
        entry.target.querySelectorAll('.counter').forEach(el => {
          if (el.dataset.animated) return;
          el.dataset.animated = 'true';
          const target = parseFloat(el.dataset.target);
          const decimals = parseInt(el.dataset.decimals || '2');
          const start = performance.now();
          const animate = (now) => {
            const t = Math.min((now - start) / 1400, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = (target * eased).toFixed(decimals);
            if (t < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        });
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.fade-up').forEach(el => io.observe(el));
}

async function init() {
  const num = obtenerNumSemana();
  if (!num) {
    document.body.innerHTML = '<div class="loading">Parámetro ?num= no especificado. Redirigiendo...</div>';
    setTimeout(() => { window.location.href = 'reportes.html'; }, 1500);
    return;
  }

  const data = await cargarReporte(num);
  if (!data) {
    document.body.innerHTML = `
      <div class="loading" style="flex-direction:column;gap:1rem;padding:6rem 2rem">
        <div style="font-size:2rem">📄</div>
        <div>No se encontró el reporte de la semana ${num}</div>
        <a href="reportes.html" style="color:var(--accent);text-decoration:none;font-weight:600">← Volver al índice</a>
      </div>`;
    return;
  }

  renderHero(data);
  renderKPIs(data);
  renderActividades(data);
  renderProblemas(data);
  renderAvanceLotes(data);
  renderGraficas(data);
  renderAbastecimientos(data);
  renderBotonesLote(data);
  configurarAnimaciones();

  $('#footer-info').textContent = `Reporte Semana ${data.semana.numero} · ${data.proyecto.nombre_corto} · Generado ${data.semana.fecha_generacion || ''}`;

  $('#panel-close').addEventListener('click', cerrarPanel);
  $('#overlay').addEventListener('click', cerrarPanel);
  $('#lightbox-close').addEventListener('click', cerrarLightbox);
  $('#lightbox-prev').addEventListener('click', () => {
    currentPhotoIdx = (currentPhotoIdx - 1 + currentPhotos.length) % currentPhotos.length;
    actualizarLightbox();
  });
  $('#lightbox-next').addEventListener('click', () => {
    currentPhotoIdx = (currentPhotoIdx + 1) % currentPhotos.length;
    actualizarLightbox();
  });
  $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') cerrarLightbox(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('#lightbox').classList.contains('open')) cerrarLightbox();
      else cerrarPanel();
    }
    if ($('#lightbox').classList.contains('open')) {
      if (e.key === 'ArrowLeft') $('#lightbox-prev').click();
      if (e.key === 'ArrowRight') $('#lightbox-next').click();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
