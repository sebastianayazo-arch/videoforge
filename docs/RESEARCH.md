# VideoForge — RESEARCH (Fase 0)

> Investigación del último trimestre (verificada 2026‑09‑01). Las políticas de
> pauta **cambian**; la sección de compliance trae fecha de verificación y debe
> re‑verificarse antes de cada campaña. Cierra con **Decisiones de diseño**
> accionables que alimentan el código.

---

## 1. Tendencias de edición short‑form por plataforma (Q3 2026)

- **El estándar 2026 es "footage casual, edición invisiblemente profesional"**:
  encuadre a mano y luz natural por fuera, pero cortes quirúrgicos, audio
  limpio y captions perfectamente sincronizados por dentro. Lo pulido‑publicitario
  rinde peor que lo auténtico‑bien‑editado en DTC.
- **9:16 nativo** recibe prioridad de distribución; los captions se **queman**
  (burned‑in), no se confía en el autogenerado de la plataforma.
- **Ritmo:** interrupción de patrón (corte / entrada de texto / zoom) cada
  **2–3 s**; jump cuts para eliminar aire muerto; speed ramps puntuales.
- **El hook en el primer frame**: la primera línea del hook va como texto en
  pantalla desde el frame 0, legible en mute.

Fuentes: [OpusClip — Short‑Form Trends 2026](https://www.opus.pro/blog/short-form-video-trends-reshaping-creator-marketing-2026),
[Jetfuel — Optimize Short‑Form 2026](https://jetfuel.agency/how-to-optimize-short-form-video-content-for-success/),
[Vortex Xcel — TikTok Editing Trends 2026](https://vortexxcel.com/tiktok-editing-trends-2026/).

## 2. Diseño de captions y kinetic typography

- **Los captions estáticos murieron.** El caption 2026 se mueve: karaoke
  palabra‑por‑palabra, **pop de escala en la keyword**, cambio de color en el
  giro/beneficio.
- **Pacing validado por retención:** bloques de **2–4 palabras** sostenidos
  **600–900 ms** — el ojo alcanza a leer antes de que desaparezca.
- Moves tipográficos vigentes: hooks sobredimensionados centrados en sans
  pesada, capas de anotación "escrita a mano", texto que escala/rota al beat
  del voiceover.
- **70–85% del consumo es en mute** → el caption ES el producto.

Fuentes: [FontMirror — Typography Trends Short‑Form AI Video](https://www.fontmirror.com/en/typography-trends-shaping-short-form-ai-video-content/),
[OpusClip](https://www.opus.pro/blog/short-form-video-trends-reshaping-creator-marketing-2026).

## 3. Taxonomía y gramática de transiciones (+ referentes del nicho)

Taxonomía adoptada (implementada en `src/transitions/decision-engine.ts`):
corte duro (default, en beat/acción) · corte en la acción + whip (con whoosh,
dirección coincidente) · match cut · corte invisible · crossfade (solo baja
energía) · luma matte / máscara con forma (reveals brandeados) · zoom punch /
speed ramp (énfasis, en beat) · glitch (solo si el nicho lo valida).

**Referentes del vertical (shapewear/beauty):** el análisis con
`mcp-video-analyzer` de 5–10 videos de marcas grandes del nicho vive en
`references/shapewear/grammar.md`. Patrón dominante detectado (típico del
vertical, pendiente de confirmar con el análisis real por marca): cortes duros
en beat, 1 whip ocasional en la transición de "problema→demo", **antes/después
manejado de forma compliant** (demo de ajuste, no comparación corporal),
captions de 2–4 palabras con pop de keyword, color cálido con alta fidelidad
de piel.

> ⚠️ La gramática por marca se **debe** extraer con el analyzer sobre los
> referentes reales; `references/` trae la plantilla estructurada y patrones
> por defecto marcados como placeholder.

## 4. Audios en tendencia por nicho/región

- El trend audio es **inteligencia, no material**: se extrae BPM, energía,
  estructura y vibe de lo que funciona ahora en el nicho/región y se usa para
  **generar** música original con el mismo perfil (ver `scripts/trend-audio.ts`
  → `scripts/music.ts`). Nunca se usa el sonido trending directamente en pauta.
- Rango útil DTC confianza: **100–140 BPM** para energía; calmado‑rítmico para
  confianza; urgencia = tempo alto + riser al CTA.

## 5. Licenciamiento de música en ads (muro legal) — **verificado 2026‑09**

- **TikTok Commercial Music Library (CML):** catálogo pre‑autorizado para
  marcas; gratis para cuentas Business. **Cubre solo TikTok** (orgánico y
  pauta). **No** se traslada a YouTube/Instagram/web.
- **Sonidos generales de TikTok:** solo uso personal/orgánico; las cuentas
  Business ven únicamente el CML en el editor. **La licencia se invalida al
  pautar** (incluye boosts y **Spark Ads**: si la marca amplifica el contenido,
  debe verificar los derechos de música directamente).
- **Meta Sound Collection** → solo Meta. **YouTube Audio Library** → solo
  YouTube. Todas son **por‑plataforma**.
- **Regla dura para VideoForge:** si `pauta = sí`, la única ruta multi‑plataforma
  limpia es **audio propio generado (ACE‑Step)** con el mismo BPM/energía/vibe
  de la tendencia, o **biblioteca libre con licencia multi‑plataforma
  verificada**. Registro de fuente+licencia por pista en `report.md`.
  Implementado como `assertPaidSafe()` en `scripts/music.ts`.

Fuentes: [TikTok — About the Commercial Music Library](https://ads.tiktok.com/resources/help/article/commercial-music-library?lang=en),
[Soundstripe — TikTok Music Licensing Rules](https://www.soundstripe.com/blogs/tiktok-music-licensing-rules),
[Third Chair — CML: What Brands Can Really Use](https://usethirdchair.com/blog/tiktok-commercial-library-what-brands-can-really-use).

## 6. Políticas de ads por categoría (shapewear/belleza) — **verificado 2026‑09**

### Meta (Facebook/Instagram) — evaluación **basada en claims**
- El **antes/después** ya no se rechaza automático en general, pero **sigue
  prohibido específicamente** para pérdida de peso y anti‑edad/arrugas.
- **Viola** si el mensaje: implica **auto‑percepción negativa** ("deja de
  avergonzarte de tu cuerpo"), **declara un tipo de cuerpo ideal**, **asume/implica
  conocer un atributo personal** vía 2ª persona ("baja tu abdomen"), o hace
  **promesas de eficacia engañosas**.
- La imagen **pinched‑fat** (pellizcar la grasa) sigue **prohibida**.
- Los anuncios de imagen corporal/peso **no pueden segmentar a menores de 18**.
- Fix confiable: **enfocar el producto y el "después" aspiracional**, nunca el
  cuerpo del espectador como problema.

Fuentes: [Meta Business Help — Personal Health](https://www.facebook.com/business/help/2489235377779939),
[auditsocials — Meta Beauty & Cosmetics Ads 2026](https://www.auditsocials.com/blog/meta-beauty-cosmetics-ads-2026-before-after-photos-appearance-claims-policy),
[auditsocials — Meta Health/Wellness Restricted 2026](https://www.auditsocials.com/blog/meta-health-wellness-restricted-ads-2026-supplements-body-image-medical-claim-rules).

### TikTok — Weight Management & Body Image (actualización con **enforcement 2026‑08‑08**)
- Shapewear: **puede** describir efecto de **moldeado/suavizado**, **no** puede
  describirse como causante de **pérdida de peso real**.
- **Prohibido**: resultados rápidos/garantizados/cuantificados ("baja X en Y
  días") e **imágenes de comparación antes/después del cuerpo** para probar
  resultados.
- Ropa interior/shapewear **restringida o no permitida** en ciertos mercados
  (lista específica de países) y **18+** en algunos mercados.

Fuentes: [TikTok Ads — Weight Management](https://ads.tiktok.com/help/article/tiktok-ads-policy-weight-management),
[TikTok Ads — Update to Weight Management & Body Image Policy (2026)](https://ads.tiktok.com/help/article/update-to-weight-management-and-body-image-policy-may-2026).

### Línea médica (fajas post‑quirúrgicas)
Los claims post‑quirúrgicos son **claims de salud**: el sistema exige sustento
documentado o **degrada** a lenguaje de confort/soporte. Implementado en
`checkMedical()` de `scripts/policy-check.ts`.

---

## Decisiones de diseño (accionables)

1. **Captions = producto.** Karaoke palabra‑por‑palabra, bloques 2–4 palabras /
   600–900 ms, **máx. 1 palabra resaltada por bloque**, keyword con pop de
   escala. Quemados, no autogenerados. → `src/captions/*`.
2. **Compliance ANTES de escribir.** El motor de copy conoce el léxico prohibido
   de la categoría; `scripts/policy-check.ts` es la reja pre‑render con semáforo
   por plataforma. Ángulo **positivo‑aspiracional** por defecto; nunca vergüenza,
   nunca claim de peso para shapewear, nunca antes/después corporal como prueba.
   **Un rojo bloquea el render.**
3. **Muro legal de audio.** `pauta = sí` ⇒ solo audio propio generado (ACE‑Step)
   o libre multi‑plataforma verificado. CML/Meta/YouTube son por‑plataforma y no
   sirven cross‑platform. `assertPaidSafe()` lo hace cumplir en código.
4. **Trend audio = inteligencia, no material.** Se copia el perfil (BPM/energía/
   estructura), se genera original.
5. **Transiciones motivadas y presupuestadas.** Hard‑cut default; máx. 2
   llamativas por video <60 s; cada llamativa con su SFX; crossfade solo en baja
   energía. → `decision-engine.ts`.
6. **Retención diseñada.** Interrupción de patrón cada 2–3 s; eliminación de aire
   muerto >400 ms; re‑hooks en post‑hook ~3 s / mitad / pre‑CTA. → `retention.ts`.
7. **Color = una sola producción.** Match entre clips antes de componer; grade de
   marca sutil; **protección de tonos de piel** siempre. → `color.ts`.
8. **Variantes de hook para pauta.** 2–3 versiones que difieren solo en los
   primeros ~3 s; el resto del render se reutiliza. → `variants.ts`.
9. **Loudness −14 LUFS / TP ≤ −1 dBTP**, verificado con `loudnorm` en dos
   pasadas. → `qc.ts`.
10. **El sistema aprende.** `brand-profile.performance` + `learnings.md`: hooks/
    ramas/estilos ganadores se vuelven default. → Módulo 12.
