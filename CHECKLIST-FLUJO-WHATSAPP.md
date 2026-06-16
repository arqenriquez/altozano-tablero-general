# Checklist de Calidad · Flujo de campo (WhatsApp) y avance en curso

Guía del **módulo 06 · Checklist de Calidad** enfocada en el flujo correcto para
llenar checklists **en campo desde el celular**, mandarlos por **WhatsApp** y
publicar tanto el **avance en curso** como el **acta final** en el tablero
general (visible desde cualquier dispositivo).

> Tablero **Altozano** (2026-06). El sitio es estático (sin backend): todo lo que
> ve “todo el mundo” sale de archivos JSON **commiteados** en `data/`. El navegador
> guarda el avance en vivo solo en ese dispositivo.

---

## 1. Las dos cosas que se pueden enviar

| Tipo | Cuándo | Veredicto | Nombre del archivo | ¿Desbloquea el siguiente proceso? |
|---|---|---|---|---|
| **Avance en curso** | El proceso va a medias y quieres que todos vean el progreso | `EN PROGRESO` (`tipo: "en-curso"`) | `{lote}-{proceso}-en-curso.json` | ❌ No |
| **Acta final** | El proceso terminó y se firma | `APTO` o `NO APTO` | `{lote}-{proceso}-{fecha}.json` | ✅ Solo si es `APTO` |

Ambos se publican igual (ver §4). En el tablero, el avance en curso pinta
**“En progreso · X%”** y el acta pinta **APTO / NO APTO**. **El acta final
siempre gana** sobre un avance en curso del mismo proceso.

---

## 2. Botones nuevos (qué hace cada uno)

**En la pantalla del checklist (`checklist-detalle.html`):**

- **🔄 Reiniciar checklist** — borra las marcas (como antes).
- **🔄 Actualizar checklist** — *nuevo*. Empaqueta el avance actual como
  `…-en-curso.json` y abre un cuadro con dos botones:
  - **📲 Enviar por WhatsApp** — abre el menú nativo del celular para mandar el
    archivo.
  - **⬇ Descargar JSON** — respaldo (PC o si el teléfono no soporta compartir).
  - **No genera el acta** ni desbloquea el siguiente proceso.
- **📋 Generar acta de calidad** — genera el acta final (como antes).

**En el acta final (`checklist-acta.html`):**

- **📲 Enviar por WhatsApp** y **⬇ Descargar JSON** (antes era un solo
  “Enviar al supervisor” que solo descargaba).

---

## 3. Cómo funciona el “Enviar por WhatsApp”

Usa la **Web Share API** del navegador (`navigator.share`), que **adjunta el
archivo `.json` real** al menú de compartir del sistema. El residente toca
compartir → elige **WhatsApp** → elige el chat → se manda el archivo.

- ✅ **Android / Chrome:** funciona fluido.
- ✅ **iPhone / Safari:** funciona, aunque a veces es más quisquilloso.
- ➡️ **PC de escritorio** o navegador sin soporte: cae automáticamente a
  **descarga** del `.json` (por eso el botón de descargar siempre está como
  respaldo).

> ⚠️ Un enlace `wa.me` NO sirve aquí: solo prellena texto, no adjunta archivos.
> Por eso usamos la Web Share API, no un link de WhatsApp.

---

## 4. Flujo correcto, paso a paso

**En obra (residente, celular):**
1. Llena las casillas del checklist (se guardan solas en su teléfono).
2. Si va a medias y quiere que se vea el avance → **Actualizar checklist →
   Enviar por WhatsApp**.
3. Si ya terminó → **Generar acta → Enviar por WhatsApp**.

**En oficina (quien administra el repo):**
1. Recibe el `.json` por WhatsApp y lo guarda en
   `data/checklist/registros/`.
2. Agrega su nombre (sin `.json`) al arreglo **`registros`** de
   `data/checklist/index.json`.
3. `git commit` + `git push`.
4. El tablero ya muestra el estado para todos al recargar.

**Cuando llega el acta final de un proceso que tenía avance en curso:**
- Agrega el acta a `registros` (gana automáticamente).
- Quita del arreglo el `…-en-curso` y borra ese archivo (ya no aporta).

---

## 5. Nombres de archivo

- **Avance en curso:** `l02-m661-colado-losa-cimentacion-en-curso.json`
  → **se reemplaza** en cada actualización (no se acumulan versiones).
- **Acta final:** `l02-m661-colado-losa-cimentacion-2026-06-16.json`
  → lleva la fecha; pueden coexistir varias y gana la más reciente.

---

## 6. Archivos del código (para mantenimiento)

| Archivo | Rol |
|---|---|
| `js/checklist-share.js` | **Helper compartido.** `compartirArchivoJSON()` (Web Share API) y `descargarArchivoJSON()` (Blob). Lo usan el detalle y el acta. |
| `js/checklist-detalle.js` | Botón **Actualizar checklist**, snapshot `en-curso` y su modal. |
| `js/checklist-acta.js` | Botones **WhatsApp / Descargar** del acta final. |
| `js/checklist.js` | El tablero: `estadoCelda()` reconoce los registros `en-curso` del repo y pinta “En progreso · X%”. |
| `data/checklist/index.json` | Arreglo `registros` con actas y avances; `_INSTRUCCIONES` documenta el flujo. |

---

## 7. Límite conocido (por diseño)

El avance en curso commiteado es para **visibilidad en el tablero**, no para
*continuar* el llenado en otro dispositivo: si abres el checklist en un teléfono
distinto al que lo llenó, empieza en blanco (igual que el “en curso” de Look
Ahead). Las marcas en vivo viven en el navegador que las capturó.
