# Módulo PPC · Last Planner System — Guía de referencia y portabilidad

Documento de referencia del **módulo 08 · PPC** (Porcentaje de Plan Completado, metodología *Last Planner System* de Lean Construction). Sirve para entender cómo funciona y para **reimplementarlo en otros tableros/proyectos**.

> Creado para el tablero **Altozano** (2026-06). Pensado para portarse a otros proyectos cambiando solo datos y configuración — **no requiere tocar código**.

---

## 1. Qué hace

- Lista las **metas/compromisos** de cada semana (el equipo se compromete a objetivos semanales).
- Permite **marcar cumplidas** con un switch y documentar el **motivo** (Causa de No Cumplimiento) de las no cumplidas.
- Calcula el **PPC** de la semana (cumplidas / total) con barra de progreso **en vivo**.
- Al cerrar la semana genera un **acta en PDF** (con logo) y un **JSON de cierre** para publicar.
- Grafica el **PPC semanal y acumulado** (Chart.js), con vistas *Semanas cerradas* y *Proyecto completo* (de inicio a fin del proyecto).
- Detecta y marca sola la **semana en curso** por fecha.

**Nivel actual: 1** (operación + cierre + PDF + gráfica, todo con archivos estáticos).
**Nivel 2 (futuro):** llenado colaborativo en vivo (obra ↔ oficina) — ver §8.

---

## 2. Arquitectura

Sitio **estático** (GitHub Pages / Vercel): todo se lee de archivos en `data/`, sin backend. El estado de marcado en vivo vive en `localStorage` del navegador; **la gráfica y el modo de solo lectura usan solo cierres commiteados** (no el navegador).

**Dependencias** (CDN, ya incluidas en `ppc.html`):
- [Chart.js 4.4.0](https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js) — gráfica.
- [SheetJS (xlsx) 0.18.5](https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js) — lectura del Excel de metas.

---

## 3. Archivos del módulo

| Archivo | Rol |
|---|---|
| `ppc.html` | Vista del módulo. Estilos propios autocontenidos (no toca `css/styles.css`). |
| `js/ppc.js` | Lógica: semana en curso, lectura de Excel, marcado, cálculo PPC, gráfica, acta PDF. |
| `data/ppc/index.json` | Registro de semanas y su estado (abierta/cerrada). |
| `data/ppc/responsables.json` | **Catálogo de responsables** del desplegable (configurable por proyecto). |
| `data/ppc/metas/semana-NN.xlsx` | Metas de cada semana (las sube el usuario). |
| `data/ppc/cierres/semana-NN.json` | Cierre de cada semana (lo genera el módulo, se commitea). |
| `data/ppc/_plantilla-metas.xlsx` | Plantilla en blanco para las metas. |
| `tools/gen-ppc-xlsx.py` | (Opcional) Generador de los Excel de ejemplo/plantilla con `openpyxl`. |
| `assets/logo-metta.png` | Logo que se incrusta en el acta PDF. |
| Tarjeta en `index.html` | Acceso al módulo desde el tablero. |

---

## 4. Formatos de datos

### `data/ppc/index.json`
```json
{
  "semanas": [
    { "semana": "02", "periodo": "18 al 24 de mayo 2026", "inicio": "2026-05-18",
      "metas": "metas/semana-02.xlsx", "cierre": "cierres/semana-02.json" },
    { "semana": "05", "periodo": "8 al 14 de junio 2026", "inicio": "2026-06-08",
      "metas": "metas/semana-05.xlsx", "cierre": null }
  ]
}
```
- `inicio` = **lunes** de la semana → con esto se detecta la "semana en curso".
- `cierre`: `null` = abierta (editable, no se grafica); ruta al JSON = cerrada (solo lectura, se grafica).

### `data/ppc/metas/semana-NN.xlsx`
Primera hoja, fila de encabezado con `Actividad`. Tres columnas:

| Actividad | Responsable | Lote |
|---|---|---|
| Colado de losa de cimentación L02 | Ing. Luis Santacruz | L02 |
| Suministro de acero de la semana | Metta Admin. | General |

El parser detecta el encabezado y filtra filas vacías. `Responsable` y `Lote` son opcionales.

### `data/ppc/cierres/semana-NN.json` (lo genera el módulo)
```json
{
  "semana": "02", "periodo": "18 al 24 de mayo 2026", "fecha_cierre": "2026-06-11",
  "responsable": "Arq. Jorge Enríquez",
  "total": 5, "cumplidas": 2, "no_cumplidas": 3, "ppc_pct": 40,
  "metas": [
    { "actividad": "…", "responsable": "…", "lote": "L20", "cumplida": true, "motivo": "" },
    { "actividad": "…", "responsable": "…", "lote": "General", "cumplida": false, "motivo": "…" }
  ]
}
```

### `data/ppc/responsables.json`
```json
{ "responsables": ["Ing. Luis Santacruz", "Ing. Marco De la Cruz", "Arq. Jorge E. Enríquez", "Metta Admin."] }
```
El desplegable ignora mayúsculas/minúsculas al casar nombres; si un Excel trae un responsable fuera del catálogo, **se conserva**.

---

## 5. Lógica clave (referencia)

- **Semana en curso:** la entrada de `index.json` cuyo rango `[inicio, inicio+6 días]` contiene la fecha de hoy.
- **Horizonte "Proyecto completo":** todas las semanas de `fecha_inicio` a `fecha_fin` de `data/proyecto.json` (semanas futuras en blanco).
- **PPC:** `round(cumplidas / total * 100)`.
- **Umbrales de color:** 🟢 verde ≥ 80 · 🟡 amarillo 60–79 · 🔴 rojo < 60. Líneas de referencia en la gráfica a **60%** y **80%**.
- **Acta PDF:** impresión aislada (`@media print`) con el logo incrustado como data URI (para que imprima sin depender de la red).
- **Responsivo (celular):** en pantallas ≤ 640px la tabla de metas se convierte en **tarjetas apiladas** (Actividad como título que envuelve, y debajo Responsable / Lote / Cumplida con su etiqueta). El desplegable de Responsable va a todo el ancho. ⚠️ Las reglas móviles usan el prefijo `table.ppc-table …` para ganar especificidad sobre la regla base `table.ppc-table { min-width: 720px }`; si se edita el CSS, conservar ese prefijo o el layout móvil se rompe.

---

## 6. Cómo portarlo a otro proyecto

1. **Copia** estos archivos al nuevo tablero:
   `ppc.html`, `js/ppc.js`, la carpeta `data/ppc/` (con `index.json`, `responsables.json`, `_plantilla-metas.xlsx` y carpetas `metas/` y `cierres/` vacías), y `tools/gen-ppc-xlsx.py` (opcional).
2. **Configura los responsables:** edita `data/ppc/responsables.json` con los del nuevo proyecto.
3. **Verifica las fechas del proyecto:** `data/proyecto.json` debe tener `fecha_inicio` y `fecha_fin` correctas (definen el horizonte de la vista *Proyecto completo* y la numeración de semanas).
4. **Logo del acta:** coloca el logo en `assets/` y, si cambia el nombre, ajusta la ruta en `js/ppc.js` (`cargarLogoData('assets/logo-metta.png')`).
5. **Vacía los datos de ejemplo:** deja `index.json` con tus semanas reales y `cierres/` vacío.
6. **Agrega la tarjeta** del módulo en el `index.html` del nuevo tablero (copiar el bloque `<a href="ppc.html" …>`).
7. Commit + push.

**Puntos de configuración por proyecto (resumen):** `responsables.json` · `proyecto.json` (fechas) · logo en `assets/` · semanas en `index.json`.

---

## 7. Flujo de uso semanal

1. **Subir metas:** copia `_plantilla-metas.xlsx` → `metas/semana-NN.xlsx`, llénalo, y registra la semana en `index.json` (`cierre: null`). Commit.
2. **Durante la semana:** marca cumplidas (se guarda en el navegador); documenta motivos de las no cumplidas.
3. **Cerrar:** botón *Cerrar semana y generar PDF* → guarda el PDF y descarga `semana-NN.json`.
4. **Publicar:** coloca el JSON en `cierres/` y cambia su `cierre` en `index.json` de `null` a la ruta. Commit → la gráfica acumula esa semana.

---

## 8. Nivel 2 (upgrade futuro): llenado colaborativo en vivo

Para que los residentes marquen desde la obra y se vea en vivo desde oficina hace falta un **almacén compartido con escritura** (un sitio estático no puede escribir sobre sí mismo). Se haría **cambiando solo la capa de datos de este módulo** (de archivos a Firebase/Supabase), sin tocar el resto del tablero:
- **Firebase Firestore / Supabase** (recomendado): realtime nativo, capa gratuita, login simple por residente o código por obra.
- El modelo de datos del Nivel 1 (metas + cumplido/motivo + PPC) es el mismo que usaría el Nivel 2 → la migración es incremental y aislada.

---

## 9. Notas / cosas a revisar al reutilizar

- Las CDNs (Chart.js, SheetJS) requieren internet; si el tablero debe correr offline, habría que alojarlas localmente.
- El marcado en vivo es **por navegador/dispositivo** (Nivel 1). El estado compartido llega con el Nivel 2.
- Al migrar de proyecto, revisar que la **numeración de semanas** (`inicio` en `index.json`) sea consistente con `fecha_inicio` de `proyecto.json`.
