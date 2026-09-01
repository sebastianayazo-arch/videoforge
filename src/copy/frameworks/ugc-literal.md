# UGC-literal

**Enum:** `CopyFramework = "ugc-literal"` · **Rama principal:** `ugc-testimonio`

## Qué es

El anti-framework publicitario. El mensaje es **el habla real de una persona
real**, tal cual, sin guion pulido ni producción de estudio. Cámara en mano,
luz natural, jump cuts naturales. El copy no se "escribe": se **captura** y se
subtitula literal.

## Cuándo usarlo

- Rama `ugc-testimonio`.
- Cuando la **autenticidad** es el argumento de venta y la audiencia desconfía
  de lo demasiado producido.
- Narración **`recorded`** obligatoria (voz a cámara real, `voz_modelo_a_camara`
  ⇒ subtítulos sincronizados). **No** se clona el testimonio: perdería su valor.

## Reglas duras

- Verificar `authorizedForPaid` del modelo/invitada antes de usar en pauta
  (una invitada sin autorización dispara la alerta de imageRights).
- Budget de transiciones vistosas **0**: cualquier efecto rompe la autenticidad.
- Compliant: el testimonio **no puede** afirmar pérdida de peso ni mostrar
  "antes/después" con vergüenza corporal.

## Ejemplo shapewear + transform beneficio-sobre-feature

- **Literal (lo que la persona dice):** "Dejé de acomodarme la faja todo el día,
  en serio... la uso para trabajar y ni la siento."
- **La feature aparece contada, no listada (feature → beneficio):**
  - Feature: *"tela transpirable de compresión graduada"*
  - Beneficio dicho en primera persona: **"llego a las 6 de la tarde y sigue
    cómoda, ya no llego a quitármela apenas entro a la casa"**
- **CTA suave y natural:** "Si les pasa lo mismo, se las recomiendo un montón."
