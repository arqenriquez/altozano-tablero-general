# Manual de actualización · Altozano Tablero

Guía paso a paso para mantener el tablero al día. **No se edita código** — solo archivos de datos (`.json`, `.xml`, `.xlsx`) e imágenes. Después de cada cambio: `commit` + `push` y GitHub Pages se actualiza solo.

> Edita siempre en **VS Code**. Los archivos `.json` son sensibles a comas y comillas: si el sitio deja de cargar un módulo, casi siempre es una coma de más o de menos en el JSON. VS Code te marca el error en rojo.

---

## 0. Datos generales del proyecto

Archivo: **`data/proyecto.json`**

Aquí está el nombre, ubicación, número de viviendas, fechas de inicio/término y el **valor del contrato**. Cuando tengas el monto del contrato, escríbelo en `valor_contrato_mxn` (solo el número, sin comas ni símbolos). Eso activa el cálculo de "monto ejercido / por ejercer" en el Resumen Global.

---

## 1. Resumen general global

**No requiere mantenimiento.** Se calcula automáticamente con el último reporte semanal publicado. Si actualizas los reportes, el resumen se actualiza solo.

---

## 2. Programa de obra (Gantt)

1. En MS Project: **Archivo → Guardar como → tipo "XML (*.xml)"**.
2. Renombra el archivo a `programa-altozano.xml`.
3. Reemplaza `data/programa-altozano.xml` con el nuevo.
4. Commit + push.

El Gantt lee fechas, % de avance, ruta crítica e hitos directamente del XML.

---

## 3. Reportes semanales

Para publicar la **semana N**:

1. Copia `data/reportes/_plantilla-semana.json`.
2. Renómbralo a `data/reportes/semana-NN.json` (dos dígitos: `semana-02.json`).
3. Llena los datos: avance global, actividades, problemas, lotes, curva financiera, abastecimientos.
4. Abre `data/reportes/index.json` y agrega el número al arreglo `semanas_publicadas`:
   ```json
   "semanas_publicadas": ["01", "02"]
   ```
5. (Opcional) Sube las fotos a `fotos/reportes/semana-NN/lote-X/` con el nombre
   `img-loteX-semNN-0M.jpg` (ver `fotos/reportes/README.txt`).
6. Commit + push.

> La **curva financiera**: `programado` es el arreglo completo de todas las semanas del proyecto; `real` solo crece con las semanas ya reportadas.

---

## 4. Bitácora de obra

Para registrar una **nota nueva**:

1. Copia `data/bitacora/_plantilla-nota.json`.
2. Renómbralo a `data/bitacora/nota-XXX.json` (tres dígitos, **consecutivo**: `nota-002.json`).
3. Llena: `numero`, `fecha`, `responsable`, `lote`, `descripcion`.
4. Si tienes foto de la bitácora física, súbela a `fotos/bitacora/` y pon la ruta en `foto_fisica`.
   Si no hay foto, deja `"foto_fisica": ""`.
5. Agrega el número al arreglo `notas` de `data/bitacora/index.json`.
6. Commit + push.

> Las notas **deben ser consecutivas** (001, 002, 003…). Si falta un número, el sitio muestra una advertencia.

---

## 5. Checklist de calidad

Para agregar un **checklist nuevo**:

1. Sube tu formato de Excel (`.xlsx`) a la carpeta `data/checklist/`.
2. Abre `data/checklist/index.json` y agrega una entrada al arreglo `checklists`:
   ```json
   {
     "archivo": "checklist-estructura-lote2.xlsx",
     "nombre": "Checklist de Estructura — Lote 2",
     "proceso": "Estructura",
     "vivienda": "Lote 2",
     "fecha": "2026-06-15"
   }
   ```
3. Commit + push.

El sitio lee el `.xlsx` y lo muestra como tabla automáticamente — **no conviertas nada a mano**. El campo `proceso` alimenta los filtros.

---

## 6. Galería fotográfica

Para agregar **fotos**:

1. Sube las imágenes a `fotos/galeria/` (cualquier nombre).
2. Abre `data/galeria.json` y agrega una entrada por foto al arreglo `fotos`:
   ```json
   {
     "archivo": "fotos/galeria/2026-06-10-lote3.jpg",
     "titulo": "Colado de losa de cimentación",
     "fecha": "2026-06-10",
     "semana": "05",
     "vivienda": "Lote 3"
   }
   ```
3. Commit + push.

Los filtros de **Semana** y **Vivienda** se generan solos con los valores que escribas. El orden "reciente / antiguo" usa el campo `fecha`.

---

## Logos

Coloca `logo-altozano.png` en la carpeta `assets/`. Si no existe, el sitio muestra el texto "ALTOZANO" como respaldo (ver `assets/README.txt`).

---

## Resumen del flujo

```
Editar archivo en data/ (o subir foto)  →  git add  →  git commit  →  git push
                                                                         ↓
                                          GitHub Pages se actualiza en ~1 min
```
