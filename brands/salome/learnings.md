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

## Ciclo 2 — POST-OP ref. 3003 (testimonio de la modelo)
- **Investigar el producto en la web ANTES de escribir**: la ref. 3003 es
  "Postquirúrgica Etapa 1: Lipo y BBL", compresión fuerte, busto abierto, forma
  pre-adaptada, ~$229.000 COP. El precio/ángulo del copy salen de ahí (no inventar).
  El video del ciclo 1 era la ref. **5503** (producto distinto).
- **Voz = grabación de la modelo con lip-sync visible → cadencia BLOQUEADA.** No se
  puede acelerar/ralentizar (atempo) sin desincronizar labios. `voice_analyze.py`
  sirve como **lectura de QC** (el hook salió a 245 WPM, enérgico), no como algo a
  corregir. La voz clonada solo aplica cuando NO hay cara hablando (B-roll).
- **Reconstruir el VO desde los clips originales** por escena (mismo inFrame/lenF que
  el render) → sync perfecto con lo que se ve; nivelar cada línea a −18 LUFS antes de
  mezclar, luego comprimir + duckear música (sidechain) + master −14 LUFS 2 pasadas.
- **Producto médico postquirúrgico = bandera sensible Meta** aunque policy-check dé
  verde. Claims factuales/educativos, sin garantizar resultados, sin cirugía gráfica.
- **ACE-Step cloud tiene cuota ZeroGPU** (Space anónimo): se agota y bloquea. Fallback
  usado: derivar una cama del track original propio (atempo 0.72 + lowpass + reverb)
  al mood íntimo. Swap por generación fresca cuando libere (o token HF).
- El sistema demostró **consistencia**: mismo AdCopy (círculo a mano en 3003 y precio),
  colores pág.35, tapa con wordmark real, cortes duros + flash en el giro.

## Performance (histórico previo)
- Ganchos ganadores: `ps-teha-pasado`, `ugc-dejede`. Ramas: problema-solución, ugc-testimonio.
