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
