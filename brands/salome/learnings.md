# Salomé — Learning log (Módulo 12)

Aprendizajes del primer ciclo de producción (Reels body moldeador) + estudio del
brand book. El próximo video debe arrancar con esto ya aplicado.

## Marca (ver `brand-system.md` — estudio completo del brand book)
- **Colores reales** (pág. 35): primario **crimson #C03353** (el del logo), coral
  #DA5539/#F9A498, peach #F6E7D2, crema #F9F4EA, negro #121212. (Antes usábamos
  rose/plum aproximados — corregido.)
- **Fuentes reales** (pág. 38): **Causten** (títulos) + **Benton Modern itálica**
  (complementaria). Comerciales → el render usa stand-ins (Montserrat + Playfair +
  Inter). Sustituir por las licenciadas cuando lleguen.
- **Tono real:** audaz, femenino, seguro y **provocador** — pero cálido/cercano.
  Celebra curvas/sensualidad/poder sin pedir permiso ("sexy por naturaleza,
  poderosa por decisión"). No es el tono tímido "sin culpas/comodidad" que
  asumimos. Sigue prohibido para pauta: claims médicos/pérdida de peso y vergüenza corporal.
- **Logo/isotipo:** wordmark script "Salome" con el **cisne** integrado. Nunca
  sombras/efectos/rotación. Assets: `public/brand/salome-logo.png` (versión solo Salome).

## Tratamientos de copy (los captions son el producto)
- El copy es **headline diseñado, NO subtítulo en caja negra**. Patrón de marca:
  **CAPS sans + palabra en script itálica** ("LUCE TUS *curvas*"), palabra hero en crimson.
- **Círculo dibujado a mano** alrededor de la palabra/número clave (ya implementado:
  `CopyLine.highlight="circle"` en `AdCopy`). Ideal para descuentos/números.
- **Callouts de feature**: línea fina + punto que señala una parte del producto con
  label corto. (Pendiente de implementar como componente — usar para el demo.)
- Colocar el copy en el **espacio negativo/arriba**, no tapando el cuerpo.

## Edición / montaje
- **Ideas completas > pacing**: no recortar una escena por debajo de la duración de
  su idea hablada (se cortó "costuras… ilusión de cintura más pequeña"; se arregló
  dando la escena completa).
- **Transformación bata→body**: match-cut en el **descenso** (ambos lados en
  motion-blur), corte instantáneo + flash de 3 frames que esconde el seam. El slide
  del zoom-punch se ve raro → preferir **corte limpio**.
- **Hook sonoro** de transformación: whoosh suave + sub sutil (sin riser tonal ni
  tremolo, que sonaban artificiales).
- **Hook de voz al inicio** (voz clonada) para no arrancar sin llamado de atención.
- **Voz para marketing** (ver `references/voice/marketing-voice.md` + herramienta
  `integrations/voice_analyze.py`): la VO debe **empatar la cadencia de la modelo**
  (medir pal/s, pitch, % silencio). Target short-form: 2.5–3.3 pal/s (150–200 WPM),
  silencio <15%, pitch-std 20–45 Hz. Chatterbox: exaggeration 0.5–0.6 (no >0.7),
  cfg_weight 0.5–0.65; post: silenceremove + atempo para clavar el ritmo. La VO
  clonada tiende a salir lenta/pausada → siempre validar con voice_analyze.py.
- **Voz de dirección vs modelo**: mutear los tramos con `voz_direccion` (audio de
  la directora en las tomas). Automatizar con el clasificador de transcribe.ts.
- **Ángulo del producto**: es prenda **exterior** (es el outfit) que además moldea —
  nunca "invisible/no se nota/bajo la ropa" (eso es faja interior).

## Técnicos / infraestructura
- **Loudness**: medir + ganancia exacta + `alimiter=level=disabled` clava −14 LUFS y
  true-peak ≤ −1 mejor que loudnorm one-pass (que hace overshoot variable).
- **Rotación en ingest**: baked + metadato stale → OffthreadVideo re-rota. Regenerar
  desde original con autorotate.
- **Remotion + assets nuevos en public/**: 404 por caché de bundle → **embeber como
  data URI** (así se hizo con el logo).
- **Pixel format**: master a `yuv420p` limited-range (Remotion rinde yuvj420p full).

## Performance (histórico previo)
- Ganchos ganadores: `ps-teha-pasado`, `ugc-dejede`. Ramas: problema-solución, ugc-testimonio.
