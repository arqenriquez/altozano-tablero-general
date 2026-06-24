# Línea base vs. avance real en barras de Gantt — Diseño

**Fecha:** 2026-06-24
**Proyecto:** Altozano — Tablero General (Metta)
**Módulos afectados:** Programa de Obra (`programa.html` / `js/gantt.js`) y Look Ahead (`lookahead.html` / `js/lookahead.js`)

## 1. Objetivo

Visualizar, en las barras de Gantt, la **línea base** (lo programado) junto al **estado real de hoy**, de forma muy visual y entendible. El programa de obra ya sufre desviaciones (a la fecha, todo el programa va atrasado con distinta gravedad), y se busca leer de un vistazo **dónde** están los atrasos más serios.

## 2. Contexto y hallazgos

- Ambos módulos cargan el mismo archivo `data/programa-altozano.xml` (export de MS Project) y comparten estructura de dibujo de barras.
- Hoy cada tarea dibuja **una sola barra** (inicio→fin real) con un relleno interno de `% de avance` (`PercentComplete`).
- El XML **ya contiene la línea base**: cada `<Task>` tiene un bloque `<Baseline><Number>0</Number><Start>…</Start><Finish>…</Finish>…</Baseline>`. No se requiere capturar datos nuevos ni cambiar el flujo de actualización: basta con leerlo.
- Verificación del XML vigente (24-jun-2026, 09:45): 1,748 tareas, las 1,748 con línea base intacta; 1,672 difieren de su base.
- **Distribución de desviación (fin real − fin base):** todo el programa va atrasado, ninguna adelantada.

  | Severidad | Condición | Tareas |
  |---|---|---|
  | En tiempo o mejor | ≤ 0 d | 76 |
  | Atraso leve | 1–7 d | 234 |
  | Atraso moderado | 8–14 d | 536 |
  | Atraso grave | > 14 d | 902 |

  Por eso un semáforo binario rojo/verde pintaría casi todo rojo; se adopta una **escala de severidad (mapa de calor)** que sí discrimina la gravedad.

## 3. Flujo de datos (del lado del usuario)

En MS Project el usuario mantiene la **línea base guardada** (snapshot que NO se vuelve a re-guardar) y mueve solo las fechas reales/programadas conforme avanza la obra. Al exportar el XML, base y realidad viajan juntas y el tablero las compara. Regla operativa: **al reprogramar, solo se reemplaza/commitea `data/programa-altozano.xml`**; nunca re-guardar la línea base (la igualaría a la realidad y borraría las desviaciones).

## 4. Lectura de datos (parseTasks)

Extender el parseo de cada `<Task>` para leer el bloque `<Baseline>` con `<Number>0</Number>`:

- `baselineStart` = `<Baseline><Start>` parseada con el parser de fechas actual.
- `baselineFinish` = `<Baseline><Finish>` parseada igual.
- Si una tarea no tuviera base (ninguna hoy, pero por robustez): no se dibuja barra base ni color de severidad — esa fila cae al comportamiento actual (una sola barra).
- Derivado: `desviacionDias = round((finReal − finBase) / día)`.

Aplica idénticamente en `gantt.js` y `lookahead.js`.

## 5. Dibujo de cada fila (con toggle activado)

Cada tarea muestra dos barras dentro de la misma fila:

```
Colado Losa Entrepiso
  ▭▭▭▭▭▭▭▭                ← línea base: barra fina, gris neutro, sin relleno
  🟧████████▓▓▓▓          ← real: barra gruesa, color por severidad + relleno = % avance
```

- **Base (arriba):** barra delgada, gris neutro, sin relleno. Posición/ancho según `baselineStart`/`baselineFinish`.
- **Real (abajo):** barra gruesa con:
  - **Color por severidad** del atraso (ver §6).
  - **Relleno interno** = `% de avance` (se conserva el `bar-progress` actual).
- **Resúmenes (tareas padre / lotes):** también muestran base + color de severidad, para leer el atraso acumulado del lote.
- **Hitos (milestones):** rombo real (color por severidad) + rombo hueco gris en la fecha de la base.
- La altura de fila crece ligeramente solo cuando el toggle está **ON**; con **OFF** la vista queda idéntica a hoy.

## 6. Modelo de color (escala de severidad)

Color de la barra real según `desviacionDias` (fin real − fin base):

| Color | Condición |
|---|---|
| 🟩 Verde | En tiempo o mejor (≤ 0 d) |
| 🟨 Amarillo | Atraso leve (1–7 d) |
| 🟧 Naranja | Atraso moderado (8–14 d) |
| 🟥 Rojo | Atraso grave (> 14 d) |

- Los umbrales (`7` y `14` días) se definen como **constantes nombradas** en el código, fáciles de ajustar.
- El esquema soporta naturalmente futuros adelantos: si una tarea termina antes que su base (≤ 0 d) se pinta verde.

## 7. Controles e interfaz

- **Botón toggle "Línea base"** en el encabezado de ambos módulos:
  - `programa.html`: junto a los botones existentes (Look Ahead / Desglosar / Resumen).
  - `lookahead.html`: en su encabezado.
  - Por defecto **OFF** (vista idéntica a hoy).
  - Estado persistido en `localStorage` (si se deja activado, sigue activo al recargar).
- **Leyenda** (visible solo con toggle ON), compacta:
  `▭ Programado (línea base)   🟩 En tiempo   🟨 Leve ≤7d   🟧 Moderado 8–14d   🟥 Grave >14d`
- **Tooltip enriquecido** sobre la barra real:
  ```
  Colado de Losa de Entrepiso
  Programado:  08-jul → 08-jul
  Real:        15-jul → 15-jul
  Desviación:  +12 días (atraso moderado)
  Avance:      60%
  ```

## 8. Alcance y reutilización

- Misma lógica compartida en los dos módulos: lectura de base, cálculo de desviación, regla de severidad y construcción de las dos barras deben vivir en código reutilizable para no duplicar la regla del semáforo entre `gantt.js` y `lookahead.js`.
- No se modifica el flujo de actualización semanal ni los snapshots inmutables de semanas previas.

## 9. Fuera de alcance (YAGNI)

- No se captura ni edita la línea base desde el tablero (sigue viniendo del XML de MS Project).
- No se comparan múltiples líneas base (solo Baseline Número 0).
- No se calcula desviación por "% de avance esperado vs real" (se descartó en favor de fin vs fin de base).
- No se añade exportación/PDF específica de esta vista en esta iteración.

## 10. Criterios de éxito

1. Con el toggle OFF, ambos módulos se ven y comportan exactamente como hoy.
2. Con el toggle ON, cada tarea (incl. resúmenes e hitos) muestra base gris + barra real coloreada por severidad.
3. Los colores reflejan correctamente la distribución verificada en §2 (mayoría naranja/rojo hoy).
4. El estado del toggle persiste entre recargas.
5. El tooltip muestra fechas programadas, reales, desviación en días con etiqueta y % de avance.
6. La regla de severidad y la lectura de base no están duplicadas entre los dos módulos.
