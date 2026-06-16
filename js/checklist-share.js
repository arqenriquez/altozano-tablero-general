/* ============================================================
   ALTOZANO · TABLERO · Compartir / descargar JSON del checklist
   ============================================================
   Helper compartido por checklist-detalle.js y checklist-acta.js.

   - compartirArchivoJSON: usa la Web Share API (navigator.share) para
     adjuntar el .json REAL al menú nativo del sistema (WhatsApp, correo,
     Drive…). Pensado para llenar el checklist en campo desde el celular.
   - descargarArchivoJSON: descarga clásica con Blob (respaldo / PC).

   Realidad por plataforma: Android/Chrome comparte archivos sin problema;
   iOS/Safari normalmente también; en PC de escritorio casi nunca, por eso
   siempre dejamos la descarga como respaldo.
   ============================================================ */

/* ¿El navegador puede compartir ESTE archivo por el menú nativo? */
function puedeCompartirArchivos(file) {
  return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
}

function _blobJSON(obj) {
  return new Blob([JSON.stringify(obj, null, 2) + '\n'], { type: 'application/json' });
}

function _conExtension(nombre) {
  return String(nombre).endsWith('.json') ? String(nombre) : `${nombre}.json`;
}

/* Descarga el objeto como archivo .json */
function descargarArchivoJSON(nombreArchivo, obj) {
  const fname = _conExtension(nombreArchivo);
  const url = URL.createObjectURL(_blobJSON(obj));
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Comparte el objeto como archivo .json por el menú nativo del sistema.
   Devuelve { via } describiendo el resultado:
   - 'share'             → se abrió el menú de compartir (WhatsApp, etc.)
   - 'cancel'            → el usuario cerró el menú sin enviar
   - 'fallback-descarga' → el navegador no soporta compartir archivos;
                           se descargó el .json como respaldo
*/
async function compartirArchivoJSON(nombreArchivo, obj, opciones = {}) {
  const fname = _conExtension(nombreArchivo);
  const file = new File([_blobJSON(obj)], fname, { type: 'application/json' });

  if (!puedeCompartirArchivos(file)) {
    descargarArchivoJSON(fname, obj);
    return { via: 'fallback-descarga' };
  }
  try {
    await navigator.share({
      files: [file],
      title: opciones.title || fname,
      text: opciones.text || ''
    });
    return { via: 'share' };
  } catch (e) {
    // AbortError = el usuario cerró el menú; no es un error real.
    if (e && e.name === 'AbortError') return { via: 'cancel' };
    // Cualquier otro fallo → respaldo por descarga.
    descargarArchivoJSON(fname, obj);
    return { via: 'fallback-descarga' };
  }
}
