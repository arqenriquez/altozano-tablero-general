#!/usr/bin/env python3
"""
Aligera un .xlsx de reporte quitando SOLO las fotos incrustadas, conservando
gráficas, hojas, celdas y el caché de fórmulas (no re-guarda con openpyxl, así
que los valores siguen siendo legibles con data_only=True).

Trabaja a nivel ZIP/XML:
  - Elimina xl/media/* (las imágenes)
  - Quita de xl/drawings/drawingN.xml los anclajes que contienen <xdr:pic>
    (deja los <xdr:graphicFrame> = gráficas)
  - Quita de los _rels del drawing las relaciones de tipo image

Uso:  python tools/aligerar-xlsx.py data/reportes/semana-04-fuente.xlsx [salida.xlsx]
Si no se da salida, sobrescribe el archivo de entrada.
"""
import sys, zipfile, re, shutil, tempfile, os

ANCHOR_TAGS = ("twoCellAnchor", "oneCellAnchor", "absoluteAnchor")

def strip_pics_from_drawing(xml: str) -> str:
    for tag in ANCHOR_TAGS:
        pattern = re.compile(r"<xdr:%s\b.*?</xdr:%s>" % (tag, tag), re.S)
        xml = pattern.sub(lambda m: "" if "<xdr:pic>" in m.group(0) else m.group(0), xml)
    return xml

def strip_image_rels(xml: str) -> str:
    return re.sub(r'<Relationship\b[^>]*Type="[^"]*relationships/image"[^>]*/>', "", xml)

def aligerar(src: str, dst: str) -> None:
    zin = zipfile.ZipFile(src, "r")
    tmp = dst + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            name = item.filename
            if name.startswith("xl/media/"):
                continue  # descarta imágenes
            data = zin.read(name)
            if name.startswith("xl/drawings/drawing") and name.endswith(".xml"):
                data = strip_pics_from_drawing(data.decode("utf-8")).encode("utf-8")
            elif re.match(r"xl/drawings/_rels/drawing\d+\.xml\.rels$", name):
                data = strip_image_rels(data.decode("utf-8")).encode("utf-8")
            zout.writestr(item, data)
    zin.close()
    os.replace(tmp, dst)

if __name__ == "__main__":
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src
    antes = os.path.getsize(src)
    aligerar(src, dst)
    despues = os.path.getsize(dst)
    print(f"{src}: {antes/1e6:.2f} MB -> {despues/1e6:.2f} MB")
