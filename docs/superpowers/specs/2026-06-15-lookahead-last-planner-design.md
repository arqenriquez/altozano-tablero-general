# Módulo 09 · Look Ahead — Last Planner · Diseño

Fecha: 2026-06-15
Estado: aprobado (diseño). Implementación pendiente de iteración local antes de subir al repo.

## Objetivo

Nuevo módulo del tablero que muestra una vista tipo Programa de obra (Gantt) con la
ventana **Look Ahead de 5 semanas**, agregando entre las columnas de tarea y las barras
de Gantt unas **columnas de casillas de verificación** para el análisis de restricciones
de Last Planner. El residente marca las casillas al inicio de su semana y cierra el
módulo cada viernes/sábado, generando un acta PDF y un JSON de cierre.

## Enfoque elegido

**Enfoque A — Módulo nuevo e independiente.** Se reúsa la misma fuente XML
(`data/programa-altozano.xml`) y la lógica de parseo/render del Gantt (adaptada de
`js/gantt.js`), pero en archivos propios. El módulo Programa de obra **no se toca**.
Se acepta cierta duplicación de código (~300 líneas) a cambio de aislamiento y de poder
iterar sin riesgo. Refactor a núcleo compartido (`gantt-core.js`) queda como limpieza
futura, fuera de alcance.

## Archivos

| Archivo | Rol |
|---|---|
| `lookahead.html` | Página del módulo (adaptada de `programa.html`) |
| `js/lookahead.js` | Parseo XML + render Gantt + columnas de casillas + cierre + PDF |
| `css/lookahead.css` | Estilos: extiende `gantt.css`, agrega columnas de casillas y el acta PDF |
| `data/lookahead/index.json` | Registro de semanas cerradas (flujo tipo PPC) |
| `data/lookahead/cierres/semana-NN.json` | Snapshot de cada cierre (se descarga y commitea) |
| `index.html` | +1 tarjeta de módulo **09** debajo del 08 (PPC); contador "8 → 9 módulos" |

## Vista (layout)

Misma estructura del Programa de obra, con la ventana **Look Ahead de 5 semanas activa
por defecto**, anclada a la "fecha de corte" (status date):

```
| Panel IZQUIERDO (fijo)                                            | Panel DERECHO (scroll) |
| Nombre tarea | Mat | M.O. | Proy.Def | Trab.Prev | ESTADO         | timeline + barras Gantt |
```

- Las 5 columnas nuevas van al final del panel izquierdo (fijo), entre las columnas de
  tarea y las barras de Gantt, para no estorbar el scroll horizontal del Gantt.
- Columnas de casillas (checkbox): **Materiales**, **Mano de obra**, **Proyecto Definido**,
  **Trabajos Previos**. Solo en **filas hoja** (actividades reales). Los resúmenes
  (lote/partida) son agrupadores sin casillas.
- Columna **ESTADO** (derivada, solo lectura): **verde + "Listo"** cuando las 4 casillas
  de la tarea están marcadas; gris **"Pendiente"** si falta alguna.
- Se conservan: expandir/contraer, hover-sync vertical entre paneles, y la línea de
  fecha de corte sobre el Gantt.

## Semana en curso

- La **semana en curso** se determina por fecha (lunes–domingo de la semana actual),
  consistente con los demás módulos. El ancla es la "fecha de corte" del encabezado
  (default: hoy / StatusDate del proyecto).
- La ventana Look Ahead = semana en curso + las 4 siguientes (5 semanas).
- Etiqueta de la semana: rango de fechas (p. ej. "Semana del 15 al 21 de junio 2026").
  Si es trivial derivarlo del origen del Gantt, se muestra además el número "Semana NN".

## Datos y persistencia

- **En curso:** progreso en `localStorage`, clave por la semana ancla (lunes):
  `lookahead-prog-<YYYY-MM-DD>` → `{ <uid>: { mat, mo, proy, prev } }`. Solo tareas hoja.
  El estado "Listo" se deriva (los 4 en true), no se almacena.
- Identidad de cada tarea: el **UID** del XML (estable entre exportaciones de MS Project).

## Cierre semanal (viernes/sábado)

Botón **"Cerrar semana"**, patrón PPC:

1. **Acta PDF** vía `window.print()` + CSS de impresión: tabla de las **5 semanas** del
   Look Ahead, agrupada por lote/partida, con las 4 columnas marcadas y el ESTADO
   (Listo/Pendiente). **Sin barras de Gantt.** Encabezado con logo Metta, proyecto,
   periodo y fecha de cierre (estilo acta PPC).
2. **JSON de cierre** descargable (`semana-NN.json`): snapshot con periodo, fecha de
   cierre, y por tarea: nombre, lote/partida, uid, las 4 restricciones, estado listo.
   El usuario lo commitea en `data/lookahead/cierres/` y lo registra en
   `data/lookahead/index.json` (igual que el PPC).
3. **El cierre se permite con tareas pendientes** (norma Last Planner). El JSON y el PDF
   dejan constancia de cuáles quedaron pendientes. No hay validación bloqueante.
4. **Semanas cerradas:** un selector permite ver una semana pasada en **solo lectura como
   tabla** (desde su JSON, sin barras de Gantt, ya que el XML para entonces avanzó).

## Tarjeta en el tablero

Tarjeta **09 · Look Ahead — Last Planner** en `index.html`, debajo del 08 (PPC), con
ícono, descripción y enlace a `lookahead.html`. Actualizar el contador de módulos.

## Fuera de alcance (YAGNI)

- Sin gráfica histórica (a diferencia del PPC) — solo el registro JSON de cierres.
- Sin refactor del núcleo Gantt compartido (Enfoque C) — limpieza futura.
- Las casillas no modifican el XML ni el % de avance del Programa de obra.
- No se versiona aún en el repo: se itera en Live Server local antes de subir.

## Criterios de aceptación

- El módulo carga el XML y muestra por defecto la ventana de 5 semanas (semana en curso
  + 4), con resúmenes y tareas hoja.
- Cada tarea hoja tiene 4 casillas marcables; al marcar las 4, su ESTADO pasa a verde
  "Listo". El avance persiste al recargar (localStorage).
- "Cerrar semana" abre el diálogo de impresión con la tabla de 5 semanas sin barras, y
  descarga el JSON de cierre.
- El módulo Programa de obra sigue funcionando sin cambios.
- Existe la tarjeta 09 en el tablero, debajo del PPC.
