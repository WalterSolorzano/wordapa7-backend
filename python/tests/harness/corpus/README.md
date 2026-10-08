# Corpus de Evaluación — Engine V2

Guardá acá los `.docx` reales que querés medir (ideal: los que fallaron como `pcp 4m1`).

## Estructura por documento

Cada documento necesita DOS archivos en este directorio:

```
corpus/
  mi_documento.docx           ← el archivo original del estudiante
  mi_documento.expected.json  ← lo que ESPERAMOS que el motor produzca
```

## Formato de `expected.json`

```json
{
  "file_name": "mi_documento.docx",
  "expected": {
    "cover_element_count": 15,
    "heading_count": 22,
    "heading_levels": { "1": 5, "2": 12, "3": 5 },
    "paragraph_count": 120,
    "table_count": 4,
    "image_count": 8,
    "reference_count": 12,
    "has_body_start_idx": true,
    "has_portada_fields": true
  },
  "tolerances": {
    "heading_count": 2,
    "paragraph_count": 5
  }
}
```

## Cómo agregar un nuevo documento

1. Copiá el `.docx` a este directorio.
2. Creá el `.expected.json` con los valores REALES del documento (contá a mano).
3. Corré `python -m pytest python/tests/test_harness.py -v`.
4. Revisá el reporte de métricas.
