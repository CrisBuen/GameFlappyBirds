# Monetizacion para Adventure Bird

Documento creado para guardar las decisiones conversadas sobre como monetizar Adventure Bird sin volver agresiva la experiencia del jugador.

## Objetivo

Monetizar el juego con anuncios recompensados y cosmeticos, manteniendo una sensacion justa: el jugador debe sentir que puede avanzar, desbloquear contenido y disfrutar el juego sin pagar.

La regla principal es:

**El dinero compra identidad visual y comodidad, no victoria.**

## Estrategia recomendada

La monetizacion principal deberia apoyarse en tres pilares:

1. Anuncios recompensados voluntarios.
2. Cosmeticos visuales para el pajaro.
3. Recompensas gratuitas por logros y constancia.

No se recomienda meter banners durante gameplay ni anuncios automaticos al morir. El juego es de reflejos, asi que cualquier interrupcion durante una partida puede sentirse injusta.

## Revivir con anuncios

La idea de permitir revivir al morir es buena, siempre que sea opt-in.

Propuesta:

- Maximo 3 revives por partida.
- Cada revive requiere ver 1 anuncio recompensado.
- El anuncio se muestra solo si el jugador toca un boton claro, por ejemplo: `REVIVIR - Ver anuncio`.
- Si el jugador no quiere anuncio, puede tocar `Terminar`.
- Al revivir, dar 2 o 3 segundos de invulnerabilidad.
- El pajaro deberia reaparecer en una posicion segura, no justo encima de un tubo/rayo.
- El revive no deberia contar como logro perfecto.

Esto permite monetizar momentos de alta intencion: el jugador acaba de perder y quiere continuar.

## Limites para que no se sienta abusivo

Evitar:

- Anuncio automatico al morir.
- Anuncio al iniciar una partida.
- Anuncio durante gameplay.
- Anuncio despues de cada boton.
- Mas de 3 revives por partida.
- Recompensas que obliguen al jugador a ver anuncios para progresar.

La experiencia debe sentirse asi:

**"Puedo ver un anuncio si quiero una ayuda extra."**

No asi:

**"El juego me obliga a ver anuncios para poder jugar."**

## Cosmeticos

Los cosmeticos son una buena base porque no rompen el balance. Deben ser puramente visuales.

Tipos de cosmeticos:

- Gorros para el pajaro.
- Trajes o skins completos.
- Estelas que deja el pajaro al volar.
- Efectos especiales de muerte o victoria.
- Variantes visuales ganadas por derrotar jefes.

Reglas tecnicas importantes:

- No cambiar la hitbox del pajaro.
- No tapar ojos, pico ni alas de forma confusa.
- Deben verse bien cuando el pajaro rota.
- Deben funcionar con las skins actuales del pajaro.
- Deben mantener estilo pixel art.
- Deben estar optimizados para no bajar FPS.

## Rarezas

Se recomienda separar cosmeticos por rareza:

- Normal: desbloqueos faciles, primeros logros.
- Raro: desafios moderados, puntos altos.
- Epico: jefes, rachas de dias, logros dificiles.
- Premium: cosmeticos de pago.
- Jefe: recompensas por derrotar o dominar jefes.

Importante: tambien deben existir cosmeticos gratis que se vean buenos. Si solo lo premium se ve bien, el jugador sentira que todo es de pago.

## Desbloqueos gratis recomendados

Ideas conversadas:

- Llegar a 100 puntos: desbloquear gorro o estela.
- Llegar a 150 puntos: desbloquear cosmetico relacionado al jefe.
- Derrotar al jefe: desbloquear skin especial.
- Derrotar al jefe sin revivir: desbloquear cosmetico raro o epico.
- Jugar 5 dias reales: desbloquear traje.
- Jugar 10 dias reales: desbloquear estela especial.
- Ver creditos o primera victoria: desbloquear insignia/cosmetico simple.

Esto crea una ruta clara para jugadores gratuitos.

## Premium sin romper el juego

Se pueden vender packs premium, pero deben ser esteticos.

Buenas opciones:

- Pack de gorros premium.
- Pack de estelas premium.
- Pack de trajes tematicos.
- Pack de cosmeticos del jefe.
- Pack fundador de lanzamiento.

Evitar vender:

- Menos gravedad.
- Mas vidas base.
- Tubos mas faciles.
- Jefe mas lento.
- Invulnerabilidad permanente.
- Ventajas fuertes que hagan el juego pay-to-win.

## Moneda del juego

Una moneda interna puede ayudar, pero debe ser simple.

Posible sistema:

- Monedas ganadas por partida segun puntos.
- Bonus por vencer jefe.
- Bonus diario.
- Bonus opcional por anuncio al final de la partida.
- Tienda con cosmeticos comprables por monedas.

Ejemplo:

- 0 a 49 puntos: pocas monedas.
- 50 a 99 puntos: monedas moderadas.
- 100+ puntos: bonus.
- Derrotar jefe: gran bonus.

Tambien podria existir moneda premium, pero para el lanzamiento conviene mantenerlo simple.

## Anuncio para duplicar recompensa

Ademas del revive, se puede usar un anuncio recompensado al final de la partida:

- Boton: `Duplicar monedas - Ver anuncio`.
- Solo despues de terminar la partida.
- No obligatorio.
- No mostrar si el usuario ya vio muchos anuncios en poco tiempo.

Este tipo de anuncio suele sentirse justo porque el jugador ya obtuvo una recompensa y decide si quiere mejorarla.

## Politicas y cuidado con Google Play

Puntos importantes para revisar antes de lanzar:

- Las compras digitales dentro de la app deben usar Google Play Billing.
- Los anuncios recompensados deben ser voluntarios.
- Los anuncios no deben simular botones del juego ni confundir al jugador.
- Evitar anuncios inesperados durante gameplay.
- Si el juego apunta a ninos o publico familiar, revisar reglas de Families Ads y SDKs permitidos.

Links utiles:

- Google Play Monetization and Ads Policy: https://support.google.com/googleplay/android-developer/answer/15604226
- AdMob Rewarded Ads Overview: https://support.google.com/admob/answer/7372450
- AdMob Rewarded Ads Policies: https://support.google.com/admob/answer/7313578

## Recomendacion para la primera version publica

Para no complicar demasiado el lanzamiento:

1. Implementar revives con anuncio recompensado.
2. Implementar cosmeticos basicos: gorros, trajes y estelas.
3. Crear 8 a 12 cosmeticos gratis por logros.
4. Crear 4 a 6 cosmeticos premium.
5. Agregar recompensa diaria simple.
6. Agregar logro por derrotar al jefe.
7. Dejar la moneda interna para una segunda etapa si retrasa mucho el lanzamiento.

## Prioridad de implementacion

Orden recomendado:

1. Sistema de inventario de cosmeticos.
2. Sistema de equipar cosmetico.
3. Dibujo seguro de gorros/trajes/estelas sin tocar hitbox.
4. Logros gratis.
5. Revive por anuncio.
6. Tienda.
7. Compras premium.
8. Balance de recompensas.

## Decision actual

La estrategia es buena si se mantiene este principio:

**Adventure Bird debe ser divertido gratis, y premium debe hacerlo mas personal, no mas facil.**

Si el jugador siente que puede conseguir cosas buenas jugando, aceptara mejor los anuncios y los cosmeticos premium.
