# Línea base vs. avance real en barras de Gantt — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar en el Gantt de Programa de Obra y Look Ahead la línea base (programado) junto al estado real, con un mapa de calor por severidad del atraso, activable con un botón.

**Architecture:** Sitio estático vanilla (sin build). `lookahead.css` hace `@import url('gantt.css')`, así que los estilos de barra son compartidos. `js/gantt.js` y `js/lookahead.js` tienen parsers y `buildBar` casi idénticos; la lógica pura de desviación/severidad se extrae a un nuevo `js/baseline.js` compartido por ambos (cargado por script tag, y exportable vía CommonJS para tests con `node:test`). El render dibuja una barra base fina (gris) y la barra real coloreada por severidad; un botón añade la clase `baseline-mode` al `<body>` y persiste el estado en `localStorage`.

**Tech Stack:** HTML/CSS/JS vanilla, DOMParser del navegador, `node:test` + `node:assert` (Node v24) para la lógica pura.

## Global Constraints

- Sin sistema de build ni framework: JS de scripts globales cargados con `document.write('<script src="js/X.js?v=' + Date.now() + '">')`.
- `css/lookahead.css` hace `@import url('gantt.css')`: los estilos nuevos de barra/leyenda/severidad van en `css/gantt.css` (una sola vez).
- `getChildText(node, tag)` recorre SOLO hijos directos (`node.children` + `localName`). Existe idéntica en `gantt.js` y `lookahead.js`.
- La línea base vive en el XML como `<Baseline><Number>0</Number><Start>…</Start><Finish>…</Finish></Baseline>`, hijo directo de cada `<Task>`. El flujo de actualización NO cambia (no re-guardar la base en MS Project).
- Umbrales de severidad: leve = 7 días, moderado = 14 días (constantes nombradas).
- Por defecto el toggle está OFF: con OFF, ambos módulos se ven y comportan exactamente como hoy.
- Comportamiento idéntico en `programa.html`/`js/gantt.js` y `lookahead.html`/`js/lookahead.js`.

---

## File Structure

- **Create** `js/baseline.js` — lógica pura: `baselineDeviationDays`, `baselineSeverityClass`, `baselineSeverityLabel`, `SEVERITY_THRESHOLDS`, y helper DOM `getBaselineDates`. Compartido por ambos módulos.
- **Create** `tests/baseline.test.js` — tests `node:test` de la lógica pura.
- **Modify** `js/gantt.js` — parsear base; dibujar barra base + severidad; tooltip; estado del toggle + leyenda.
- **Modify** `js/lookahead.js` — mismas integraciones.
- **Modify** `css/gantt.css` — barra base, colores de severidad, layout de dos barras, leyenda (heredado por lookahead vía @import).
- **Modify** `programa.html` — cargar `baseline.js`; botón toggle + contenedor de leyenda.
- **Modify** `lookahead.html` — cargar `baseline.js`; botón toggle + contenedor de leyenda.

---

## Task 1: Lógica pura de desviación y severidad (`js/baseline.js`)

**Files:**
- Create: `js/baseline.js`
- Test: `tests/baseline.test.js`

**Interfaces:**
- Consumes: nada.
- Produces (globales en navegador / `module.exports` en Node):
  - `SEVERITY_THRESHOLDS = { leve: 7, moderado: 14 }`
  - `baselineDeviationDays(finishReal: Date|null, finishBase: Date|null) -> number|null` (días, redondeado; `null` si falta alguna)
  - `baselineSeverityClass(devDays: number|null) -> 'sev-ontime'|'sev-leve'|'sev-moderado'|'sev-grave'|null`
  - `baselineSeverityLabel(devDays: number|null) -> 'adelantada'|'en tiempo'|'atraso leve'|'atraso moderado'|'atraso grave'|''`

- [ ] **Step 1: Write the failing test**

Create `tests/baseline.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SEVERITY_THRESHOLDS,
  baselineDeviationDays,
  baselineSeverityClass,
  baselineSeverityLabel
} = require('../js/baseline.js');

const d = (s) => new Date(s + 'T00:00:00');

test('umbrales esperados', () => {
  assert.equal(SEVERITY_THRESHOLDS.leve, 7);
  assert.equal(SEVERITY_THRESHOLDS.moderado, 14);
});

test('deviationDays redondea diferencia en días', () => {
  assert.equal(baselineDeviationDays(d('2026-07-15'), d('2026-07-08')), 7);
  assert.equal(baselineDeviationDays(d('2026-07-08'), d('2026-07-08')), 0);
  assert.equal(baselineDeviationDays(d('2026-07-05'), d('2026-07-08')), -3);
});

test('deviationDays null si falta una fecha', () => {
  assert.equal(baselineDeviationDays(null, d('2026-07-08')), null);
  assert.equal(baselineDeviationDays(d('2026-07-08'), null), null);
});

test('severityClass por umbrales', () => {
  assert.equal(baselineSeverityClass(-3), 'sev-ontime');
  assert.equal(baselineSeverityClass(0), 'sev-ontime');
  assert.equal(baselineSeverityClass(1), 'sev-leve');
  assert.equal(baselineSeverityClass(7), 'sev-leve');
  assert.equal(baselineSeverityClass(8), 'sev-moderado');
  assert.equal(baselineSeverityClass(14), 'sev-moderado');
  assert.equal(baselineSeverityClass(15), 'sev-grave');
  assert.equal(baselineSeverityClass(null), null);
});

test('severityLabel por umbrales', () => {
  assert.equal(baselineSeverityLabel(-3), 'adelantada');
  assert.equal(baselineSeverityLabel(0), 'en tiempo');
  assert.equal(baselineSeverityLabel(5), 'atraso leve');
  assert.equal(baselineSeverityLabel(10), 'atraso moderado');
  assert.equal(baselineSeverityLabel(40), 'atraso grave');
  assert.equal(baselineSeverityLabel(null), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/baseline.test.js`
Expected: FAIL — `Cannot find module '../js/baseline.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `js/baseline.js`:

```js
/* Lógica de línea base vs. avance real (compartida por gantt.js y lookahead.js).
   Cargada como script global en el navegador; exportada para tests en Node. */

var SEVERITY_THRESHOLDS = { leve: 7, moderado: 14 }; // días de atraso

function baselineDeviationDays(finishReal, finishBase) {
  if (!finishReal || !finishBase) return null;
  return Math.round((finishReal.getTime() - finishBase.getTime()) / 86400000);
}

function baselineSeverityClass(devDays) {
  if (devDays === null || devDays === undefined) return null;
  if (devDays <= 0) return 'sev-ontime';
  if (devDays <= SEVERITY_THRESHOLDS.leve) return 'sev-leve';
  if (devDays <= SEVERITY_THRESHOLDS.moderado) return 'sev-moderado';
  return 'sev-grave';
}

function baselineSeverityLabel(devDays) {
  if (devDays === null || devDays === undefined) return '';
  if (devDays < 0) return 'adelantada';
  if (devDays === 0) return 'en tiempo';
  if (devDays <= SEVERITY_THRESHOLDS.leve) return 'atraso leve';
  if (devDays <= SEVERITY_THRESHOLDS.moderado) return 'atraso moderado';
  return 'atraso grave';
}

/* Lee la línea base (Baseline Número 0) de un nodo <Task> del DOM.
   Requiere un getChildText(node, tag) y parseDate(str) en el ámbito global
   (ambos existen en gantt.js y lookahead.js). Devuelve {start, finish} (Date|null). */
function getBaselineDates(taskNode) {
  for (const c of taskNode.children) {
    if (c.localName === 'Baseline' && getChildText(c, 'Number') === '0') {
      return {
        start: parseDate(getChildText(c, 'Start')),
        finish: parseDate(getChildText(c, 'Finish'))
      };
    }
  }
  return { start: null, finish: null };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SEVERITY_THRESHOLDS,
    baselineDeviationDays,
    baselineSeverityClass,
    baselineSeverityLabel
  };
}
```

> Nota: `getBaselineDates` no se testea en Node (depende del DOM); se verifica en navegador en la Task 2. No se exporta para evitar fallos de `getChildText` indefinido en Node.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/baseline.test.js`
Expected: PASS — 5 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add js/baseline.js tests/baseline.test.js
git commit -m "feat(gantt): lógica pura de desviación y severidad vs línea base"
```

---

## Task 2: Cargar baseline.js y parsear la línea base en ambos módulos

**Files:**
- Modify: `programa.html` (bloque de scripts al final, ~líneas 139-141)
- Modify: `lookahead.html` (bloque de scripts al final, ~líneas 143-145)
- Modify: `js/gantt.js` (objeto `tasks.push({...})`, ~líneas 91-107)
- Modify: `js/lookahead.js` (objeto `tasks.push({...})`, ~líneas 92-103)

**Interfaces:**
- Consumes: `getBaselineDates(taskNode)`, `baselineDeviationDays(...)` de `js/baseline.js`.
- Produces: cada `task` ahora tiene `baselineStart: Date|null`, `baselineFinish: Date|null`, `deviationDays: number|null`.

- [ ] **Step 1: Cargar `baseline.js` antes de `gantt.js` en `programa.html`**

En `programa.html`, reemplazar el bloque de script final (el `<head>` ya inyecta `gantt.css`; NO tocar el CSS):

```html
  <script>
    document.write('<script src="js/gantt.js?v=' + Date.now() + '"><\/script>');
  </script>
```

por:

```html
  <script>
    var __v = Date.now();
    document.write('<script src="js/baseline.js?v=' + __v + '"><\/script>');
    document.write('<script src="js/gantt.js?v=' + __v + '"><\/script>');
  </script>
```

- [ ] **Step 2: Cargar `baseline.js` antes de `lookahead.js` en `lookahead.html`**

En `lookahead.html`, reemplazar:

```html
  <script>
    document.write('<script src="js/lookahead.js?v=' + Date.now() + '"><\/script>');
  </script>
```

por:

```html
  <script>
    var __v = Date.now();
    document.write('<script src="js/baseline.js?v=' + __v + '"><\/script>');
    document.write('<script src="js/lookahead.js?v=' + __v + '"><\/script>');
  </script>
```

- [ ] **Step 3: Parsear base en `js/gantt.js`**

En el objeto `tasks.push({...})` (dentro del bucle de `<Task>`, ~línea 91), añadir tras `percentComplete` / `durationDays` un bloque que lea la base. Reemplazar:

```js
      percentComplete: Math.max(0, Math.min(100, parseInt(getChildText(node, 'PercentComplete'), 10) || 0)),
      durationDays: parseDurationDays(getChildText(node, 'Duration')),
      children: [],
      parent: null,
      isCollapsed: false,
      isHidden: false
    });
```

por:

```js
      percentComplete: Math.max(0, Math.min(100, parseInt(getChildText(node, 'PercentComplete'), 10) || 0)),
      durationDays: parseDurationDays(getChildText(node, 'Duration')),
      baselineStart: null,
      baselineFinish: null,
      deviationDays: null,
      children: [],
      parent: null,
      isCollapsed: false,
      isHidden: false
    });
    const __t = tasks[tasks.length - 1];
    const __bl = getBaselineDates(node);
    __t.baselineStart = __bl.start;
    __t.baselineFinish = __bl.finish;
    __t.deviationDays = baselineDeviationDays(__t.finish, __t.baselineFinish);
```

- [ ] **Step 4: Parsear base en `js/lookahead.js`**

En el objeto `tasks.push({...})` (~línea 92), reemplazar:

```js
      percentComplete: Math.max(0, Math.min(100, parseInt(getChildText(node, 'PercentComplete'), 10) || 0)),
      durationDays: parseDurationDays(getChildText(node, 'Duration')),
      children: [], parent: null, isCollapsed: false
    });
```

por:

```js
      percentComplete: Math.max(0, Math.min(100, parseInt(getChildText(node, 'PercentComplete'), 10) || 0)),
      durationDays: parseDurationDays(getChildText(node, 'Duration')),
      baselineStart: null,
      baselineFinish: null,
      deviationDays: null,
      children: [], parent: null, isCollapsed: false
    });
    const __t = tasks[tasks.length - 1];
    const __bl = getBaselineDates(node);
    __t.baselineStart = __bl.start;
    __t.baselineFinish = __bl.finish;
    __t.deviationDays = baselineDeviationDays(__t.finish, __t.baselineFinish);
```

- [ ] **Step 5: Verificar en navegador (Programa de Obra)**

Servir el sitio (Live Server / `python -m http.server`) y abrir `programa.html`. En la consola del navegador:

```js
const t = window.state ? state.tasksFlat.find(x => x.name.includes('Losa de Entrepiso')) : null;
console.log(t.baselineStart, t.baselineFinish, t.deviationDays);
```

Expected: imprime dos `Date` válidas y un `deviationDays` ≈ +6/+7 (no `null`, no `NaN`). Si `state` no es global, inspeccionar vía `parseTasks` o agregar `console.log` temporal en el parser.

> Si `state` no está expuesto en `window`, verificar añadiendo temporalmente `console.log(tasks[0].baselineFinish)` al final del parser y recargar; quitarlo antes de commitear.

- [ ] **Step 6: Verificar en navegador (Look Ahead)**

Abrir `lookahead.html`, repetir la verificación de consola. Expected: igual, fechas base y `deviationDays` válidos.

- [ ] **Step 7: Commit**

```bash
git add programa.html lookahead.html js/gantt.js js/lookahead.js
git commit -m "feat(gantt): leer línea base y desviación por tarea en ambos módulos"
```

---

## Task 3: Render de dos barras + severidad + tooltip + CSS

**Files:**
- Modify: `css/gantt.css` (sección BARRAS, ~líneas 249-282)
- Modify: `js/gantt.js` (`buildBar`, ~líneas 278-306; bucle de render, ~líneas 258-265)
- Modify: `js/lookahead.js` (`buildBar`, ~líneas 180-201; su bucle de render)

**Interfaces:**
- Consumes: `task.baselineStart`, `task.baselineFinish`, `task.deviationDays`; `baselineSeverityClass`, `baselineSeverityLabel`.
- Produces: función `buildBaselineBar(task, sc) -> HTMLElement`; `buildBar` añade clase de severidad y tooltip enriquecido cuando hay base. El render se activa con `document.body.classList.contains('baseline-mode')`.

> Verificación de esta tarea: como el botón aún no existe (Task 4), activar el modo manualmente en la consola con `document.body.classList.add('baseline-mode')` y volver a renderizar (recargar la página tras setear la clase, o llamar al render si está expuesto). Para facilitar, en esta tarea se lee la clase del body en cada `buildBar`, por lo que basta con: en consola `document.body.classList.add('baseline-mode')` y luego recargar NO sirve (se pierde la clase). En su lugar, durante la verificación, añade temporalmente `document.body.classList.add('baseline-mode');` al inicio del arranque del módulo, verifica, y retíralo antes de commitear (la Task 4 lo controla con el botón).

- [ ] **Step 1: CSS — variables, barra base y colores de severidad**

En `css/gantt.css`, al final de la sección BARRAS (después de la línea `.bar.critical { ... }`, ~línea 282), añadir:

```css
/* ---------- LÍNEA BASE vs REAL ---------- */
:root {
  --sev-ontime:   #1f8f3e;  /* verde — en tiempo o adelantada */
  --sev-leve:     #e0b53a;  /* amarillo — atraso leve (1–7 d) */
  --sev-moderado: #d98428;  /* naranja — atraso moderado (8–14 d) */
  --sev-grave:    #c0392b;  /* rojo — atraso grave (>14 d) */
  --baseline-gray:#b7b9b4;  /* barra de línea base */
}

/* Con el modo activado, la fila crece para alojar base (arriba) + real (abajo). */
body.baseline-mode { --row-h: 36px; }

/* Barra de línea base: fina, gris, sin relleno, encima del carril. */
.bar-baseline {
  position: absolute; top: 6px; height: 5px; border-radius: 1px;
  background: var(--baseline-gray); border: 1px solid #9aa19a;
  min-width: 4px; z-index: 1; opacity: 0.9;
}
/* En modo base, la barra real baja para quedar debajo de la base. */
body.baseline-mode .bar { top: 16px; height: 14px; z-index: 2; }
body.baseline-mode .bar.summary { top: 18px; }
body.baseline-mode .bar.milestone { top: 16px; }

/* Mapa de calor: el color de severidad manda sobre el color de estado. */
body.baseline-mode .bar.sev-ontime   { background: var(--sev-ontime);   border-color: #1a7a35; }
body.baseline-mode .bar.sev-leve     { background: var(--sev-leve);     border-color: #b9942b; }
body.baseline-mode .bar.sev-moderado { background: var(--sev-moderado); border-color: #b86d1f; }
body.baseline-mode .bar.sev-grave    { background: var(--sev-grave);    border-color: #9c2c20; }
/* El relleno de avance se mantiene; oscurecerlo levemente para contraste. */
body.baseline-mode .bar.sev-leve .bar-progress,
body.baseline-mode .bar.sev-ontime .bar-progress,
body.baseline-mode .bar.sev-moderado .bar-progress,
body.baseline-mode .bar.sev-grave .bar-progress { background: rgba(0,0,0,0.22); }
/* Hito con severidad (rombo). */
body.baseline-mode .bar.milestone.sev-ontime   { background: var(--sev-ontime); }
body.baseline-mode .bar.milestone.sev-leve     { background: var(--sev-leve); }
body.baseline-mode .bar.milestone.sev-moderado { background: var(--sev-moderado); }
body.baseline-mode .bar.milestone.sev-grave    { background: var(--sev-grave); }
/* Rombo de base para hitos. */
.bar-baseline.milestone {
  width: 9px; height: 9px; top: 4px; background: transparent;
  border: 1.5px solid var(--baseline-gray);
  transform: translateX(-4px) rotate(45deg); border-radius: 1px;
}
```

- [ ] **Step 2: `js/gantt.js` — añadir `buildBaselineBar` y severidad en `buildBar`**

Tras la función `buildBar` (después de su `return bar;`, ~línea 306), añadir:

```js
function buildBaselineBar(task, sc) {
  const bb = document.createElement('div');
  bb.className = 'bar-baseline';
  if (task.isMilestone) {
    bb.classList.add('milestone');
    const offD = (task.baselineFinish - sc.origin) / MS_PER_DAY;
    bb.style.left = `${offD * sc.pxPerDay}px`;
    return bb;
  }
  const startOff = (task.baselineStart - sc.origin) / MS_PER_DAY;
  const durD = Math.max(0, (task.baselineFinish - task.baselineStart) / MS_PER_DAY);
  bb.style.left = `${startOff * sc.pxPerDay}px`;
  bb.style.width = `${Math.max(4, durD * sc.pxPerDay)}px`;
  return bb;
}
```

En `buildBar` de `js/gantt.js`, justo antes de la línea `bar.dataset.tooltip =` (~línea 299), insertar la aplicación de severidad y tooltip enriquecido. Reemplazar el bloque:

```js
  bar.dataset.tooltip =
    `${task.name}\n` +
    `Inicio: ${formatDate(task.start)}\n` +
    `Fin:    ${formatDate(task.finish)}\n` +
    `Avance: ${task.percentComplete}%  •  ${task.durationDays}d` +
    (task.isCritical ? '\n(Ruta crítica)' : '');
  return bar;
```

por:

```js
  const baselineMode = document.body.classList.contains('baseline-mode');
  if (baselineMode && task.baselineFinish) {
    const sevClass = baselineSeverityClass(task.deviationDays);
    if (sevClass) bar.classList.add(sevClass);
  }

  if (baselineMode && task.baselineFinish) {
    const dev = task.deviationDays;
    const signo = dev > 0 ? '+' : '';
    bar.dataset.tooltip =
      `${task.name}\n` +
      `Programado: ${formatDate(task.baselineStart)} → ${formatDate(task.baselineFinish)}\n` +
      `Real:       ${formatDate(task.start)} → ${formatDate(task.finish)}\n` +
      `Desviación: ${signo}${dev} días (${baselineSeverityLabel(dev)})\n` +
      `Avance:     ${task.percentComplete}%` +
      (task.isCritical ? '\n(Ruta crítica)' : '');
  } else {
    bar.dataset.tooltip =
      `${task.name}\n` +
      `Inicio: ${formatDate(task.start)}\n` +
      `Fin:    ${formatDate(task.finish)}\n` +
      `Avance: ${task.percentComplete}%  •  ${task.durationDays}d` +
      (task.isCritical ? '\n(Ruta crítica)' : '');
  }
  return bar;
```

- [ ] **Step 3: `js/gantt.js` — dibujar la barra base en el bucle de render**

En `renderGantt` (~líneas 258-265), reemplazar:

```js
  state.tasksFlat.forEach((task) => {
    const row = document.createElement('div');
    row.className = 'gantt-row';
    if (task.isHidden) row.classList.add('is-hidden');
    row.dataset.uid = task.uid;
    if (task.start && task.finish) row.appendChild(buildBar(task, sc));
    frag.appendChild(row);
  });
```

por:

```js
  const baselineMode = document.body.classList.contains('baseline-mode');
  state.tasksFlat.forEach((task) => {
    const row = document.createElement('div');
    row.className = 'gantt-row';
    if (task.isHidden) row.classList.add('is-hidden');
    row.dataset.uid = task.uid;
    if (baselineMode && task.baselineStart && task.baselineFinish) {
      row.appendChild(buildBaselineBar(task, sc));
    }
    if (task.start && task.finish) row.appendChild(buildBar(task, sc));
    frag.appendChild(row);
  });
```

- [ ] **Step 4: `js/lookahead.js` — replicar `buildBaselineBar`, severidad y tooltip**

Aplicar los MISMOS cambios en `js/lookahead.js`:

(a) Añadir `buildBaselineBar` (idéntica a la de gantt.js) tras su `buildBar`.

(b) En su `buildBar`, reemplazar la línea de tooltip:

```js
  bar.dataset.tooltip = `${task.name}\nInicio: ${formatDate(task.start)}\nFin: ${formatDate(task.finish)}\nAvance: ${task.percentComplete}%`;
```

por:

```js
  const baselineMode = document.body.classList.contains('baseline-mode');
  if (baselineMode && task.baselineFinish) {
    const sevClass = baselineSeverityClass(task.deviationDays);
    if (sevClass) bar.classList.add(sevClass);
    const dev = task.deviationDays;
    const signo = dev > 0 ? '+' : '';
    bar.dataset.tooltip =
      `${task.name}\n` +
      `Programado: ${formatDate(task.baselineStart)} → ${formatDate(task.baselineFinish)}\n` +
      `Real:       ${formatDate(task.start)} → ${formatDate(task.finish)}\n` +
      `Desviación: ${signo}${dev} días (${baselineSeverityLabel(dev)})\n` +
      `Avance:     ${task.percentComplete}%`;
  } else {
    bar.dataset.tooltip = `${task.name}\nInicio: ${formatDate(task.start)}\nFin: ${formatDate(task.finish)}\nAvance: ${task.percentComplete}%`;
  }
```

(c) En el bucle de render de `lookahead.js` (donde hace `row.appendChild(buildBar(...))`), añadir antes la barra base:

```js
    if (document.body.classList.contains('baseline-mode') && task.baselineStart && task.baselineFinish) {
      row.appendChild(buildBaselineBar(task, sc));
    }
```

> Localizar el bucle buscando `appendChild(buildBar` en `lookahead.js` y aplicar el mismo patrón que en gantt.js Step 3.

- [ ] **Step 5: Verificar visualmente (modo forzado)**

Añadir temporalmente `document.body.classList.add('baseline-mode');` al inicio del arranque de `gantt.js` (antes del primer render). Servir y abrir `programa.html`.
Expected: cada fila muestra una barra gris fina arriba y la barra real debajo; las barras reales se ven amarillas/naranjas/rojas según atraso (mayoría naranja/rojo, casi ninguna verde, acorde a los datos). Tooltip muestra Programado/Real/Desviación/Avance. Repetir en `lookahead.html` (forzando la clase en `lookahead.js`).
Quitar las líneas temporales `document.body.classList.add('baseline-mode')` de ambos JS antes de commitear.

- [ ] **Step 6: Commit**

```bash
git add css/gantt.css js/gantt.js js/lookahead.js
git commit -m "feat(gantt): render de barra base + mapa de calor de severidad y tooltip"
```

---

## Task 4: Botón toggle, persistencia y leyenda

**Files:**
- Modify: `programa.html` (`header-controls`, ~líneas 53-64; tras `</header>` para la leyenda)
- Modify: `lookahead.html` (`header-controls`, ~líneas 53-62; tras `</header>` para la leyenda)
- Modify: `css/gantt.css` (estilos de la leyenda)
- Modify: `js/gantt.js` (cableado del botón + `localStorage` + re-render + leyenda)
- Modify: `js/lookahead.js` (mismo cableado)

**Interfaces:**
- Consumes: clase `baseline-mode` en `<body>` (leída por el render de la Task 3).
- Produces: botón `#btnBaseline`, contenedor `#baselineLegend`; función `applyBaselineMode(on)` que conmuta la clase, persiste en `localStorage('altozano.baselineMode')` y re-renderiza.

- [ ] **Step 1: Botón y leyenda en `programa.html`**

En `programa.html`, dentro de `.header-controls`, tras el botón `#btnLookAhead` (~línea 57), añadir:

```html
        <button class="btn btn-baseline" id="btnBaseline"
                title="Compara la línea base (programado) con el avance real; colorea por atraso">
          Línea base
        </button>
```

Y justo después de `</header>` (~línea 76), añadir el contenedor de leyenda:

```html
  <div class="baseline-legend" id="baselineLegend" hidden>
    <span class="bl-item"><span class="bl-swatch bl-base"></span> Programado (línea base)</span>
    <span class="bl-item"><span class="bl-swatch bl-ontime"></span> En tiempo</span>
    <span class="bl-item"><span class="bl-swatch bl-leve"></span> Atraso leve (≤7d)</span>
    <span class="bl-item"><span class="bl-swatch bl-moderado"></span> Atraso moderado (8–14d)</span>
    <span class="bl-item"><span class="bl-swatch bl-grave"></span> Atraso grave (&gt;14d)</span>
  </div>
```

- [ ] **Step 2: Botón y leyenda en `lookahead.html`**

En `lookahead.html`, dentro de `.header-controls` (~línea 53), antes del bloque "Última actualización", añadir el mismo botón:

```html
        <button class="btn btn-baseline" id="btnBaseline"
                title="Compara la línea base (programado) con el avance real; colorea por atraso">
          Línea base
        </button>
```

Y tras `</header>` (~línea 64), añadir el MISMO contenedor `#baselineLegend` que en el Step 1.

- [ ] **Step 3: CSS de la leyenda**

En `css/gantt.css`, tras los estilos de severidad (final de la sección añadida en Task 3), agregar:

```css
.baseline-legend {
  display: flex; flex-wrap: wrap; gap: 16px; align-items: center;
  padding: 6px 20px; background: var(--bg-headerbar);
  border-bottom: 1px solid var(--border-strong);
  font-size: 11px; color: var(--text-secondary);
}
.baseline-legend[hidden] { display: none; }
.bl-item { display: inline-flex; align-items: center; gap: 6px; }
.bl-swatch { width: 14px; height: 10px; border-radius: 2px; display: inline-block; border: 1px solid rgba(0,0,0,0.15); }
.bl-base     { background: var(--baseline-gray); height: 5px; }
.bl-ontime   { background: var(--sev-ontime); }
.bl-leve     { background: var(--sev-leve); }
.bl-moderado { background: var(--sev-moderado); }
.bl-grave    { background: var(--sev-grave); }
.btn-baseline.active { background: var(--bar-summary); color: #fff; border-color: var(--bar-summary); font-weight: 600; }
```

- [ ] **Step 4: Cableado en `js/gantt.js`**

(a) Cerca del registro de otros botones en el init (~líneas 531-553, donde se asignan `dom.btnExpandAll` etc.), añadir el cableado del botón. Tras `if (btnLookAhead) btnLookAhead.addEventListener('click', toggleLookAhead);` (~línea 553), insertar:

```js
  const btnBaseline = document.getElementById('btnBaseline');
  const legend = document.getElementById('baselineLegend');
  function applyBaselineMode(on) {
    document.body.classList.toggle('baseline-mode', on);
    if (btnBaseline) btnBaseline.classList.toggle('active', on);
    if (legend) legend.hidden = !on;
    try { localStorage.setItem('altozano.baselineMode', on ? '1' : '0'); } catch (e) {}
    renderGantt();
    renderStatusLine();
  }
  if (btnBaseline) {
    btnBaseline.addEventListener('click', () => {
      applyBaselineMode(!document.body.classList.contains('baseline-mode'));
    });
  }
  let __blInit = false;
  try { __blInit = localStorage.getItem('altozano.baselineMode') === '1'; } catch (e) {}
  if (__blInit) applyBaselineMode(true);
```

> Si `renderGantt`/`renderStatusLine` no están en el ámbito del init, llamar a la rutina de render existente del módulo (la misma que se invoca al cargar el XML). Localizar buscando `renderGantt(` y reutilizar esa llamada.

- [ ] **Step 5: Cableado en `js/lookahead.js`**

Replicar el mismo bloque en el init de `js/lookahead.js`, usando la función de render propia del módulo (buscar cómo se llama el render — p. ej. `renderGantt()` o equivalente — y usarla en `applyBaselineMode`). El resto (botón `#btnBaseline`, `#baselineLegend`, clave `localStorage`) es idéntico.

- [ ] **Step 6: Verificación funcional completa**

Servir y abrir `programa.html`:
1. Carga inicial: SIN línea base (vista igual a hoy). Expected: una sola barra por fila, leyenda oculta.
2. Click en "Línea base": Expected: aparecen barras base grises + reales coloreadas, botón queda `active`, leyenda visible, filas más altas.
3. Recargar la página: Expected: el modo sigue activado (persistencia `localStorage`).
4. Click de nuevo: Expected: vuelve a la vista normal, leyenda oculta.
5. Repetir los 4 pasos en `lookahead.html`.

- [ ] **Step 7: Commit**

```bash
git add programa.html lookahead.html css/gantt.css js/gantt.js js/lookahead.js
git commit -m "feat(gantt): botón Línea base con persistencia y leyenda en ambos módulos"
```

---

## Self-Review (cobertura del spec)

- §4 Lectura de datos → Task 1 (`getBaselineDates`) + Task 2 (parseo en ambos módulos). ✔
- §5 Dibujo de fila (base arriba, real abajo, resúmenes, hitos) → Task 3 (CSS + `buildBaselineBar` + render). ✔
- §6 Mapa de calor de severidad (umbrales 7/14, constantes) → Task 1 (`baselineSeverityClass`, `SEVERITY_THRESHOLDS`) + Task 3 (CSS + aplicación). ✔
- §7 Botón toggle + `localStorage` + leyenda + tooltip → Task 4 (botón/persistencia/leyenda) + Task 3 (tooltip). ✔
- §8 Reutilización (no duplicar la regla) → lógica pura compartida en `js/baseline.js`. ✔
- §10 Criterios de éxito → verificaciones en Tasks 2, 3 y 4 (OFF idéntico a hoy; ON con base+severidad; persistencia; tooltip). ✔

Tipos consistentes: `baselineDeviationDays`, `baselineSeverityClass`, `baselineSeverityLabel`, `getBaselineDates`, `buildBaselineBar`, `applyBaselineMode`, clase `baseline-mode`, clave `altozano.baselineMode` — usados con el mismo nombre en todas las tasks.
