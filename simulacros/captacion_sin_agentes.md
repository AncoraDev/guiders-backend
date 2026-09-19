# Simulacro: Captación sin agentes

Probar a mano el asistente que recoge datos cuando **no hay ningún comercial conectado**.
Piezas implicadas: Console `/captacion` (rol `admin`), widget SDK y Console `/atencion`.

## Antes de empezar

- [ ] Backend arriba (`npm run start:dev`, `:3000`), Console (`:4200`), demo PHP (`:8083`).
- [ ] Migraciones al día: `npm run typeorm:migrate:run`. Ojo con el doble Postgres (ver `docker/README.md`): `localhost` resuelve al Postgres nativo, no al del compose.
- [ ] Bundle del SDK actualizado en la demo: `npm run build && cp dist/index.js demo/app/guiders-sdk.js` en `guiders-sdk`.
- [ ] Todos los comerciales de la empresa **Desconectados** (el toggle de `/atencion` en Console). La captación solo se dispara con `onlineCount === 0`.

## 1. Sin guion configurado: nada cambia

- [ ] Con `/captacion` vacío (o el guion desactivado), abrir el widget en la demo.
- [ ] El chat se comporta **exactamente como hoy**: cabecera con `No hay nadie ahora. Si escribes, avisamos al equipo.`, sin tarjeta de inicio ni pasos.
- [ ] El visitante puede escribir y su mensaje llega a **Pendientes** como siempre.

## 2. El admin monta el guion

- [ ] Entrar en Console con un usuario `admin` y abrir **Captación** en el nav. Con un usuario `commercial` la ruta no aparece y `/captacion` redirige a `/atencion`.
- [ ] Rellenar la tarjeta de inicio (título, texto y botón) y añadir pasos:
  - un paso de **opciones** (`¿Qué te interesa?` → `Coche nuevo` / `Km 0`),
  - un paso de **pregunta abierta** guardado en un dato extra (`¿Qué modelo buscas?` → `interes`),
  - un paso de **mensaje** de cierre.
- [ ] Comprobar la validación en vivo: al apuntar dos pasos entre sí sale el aviso de **bucle**; al borrar un paso referenciado, el desplegable queda en `Terminar y pedir datos` y no en una referencia colgando; un paso de opciones sin opciones o una pregunta abierta sin campo también bloquean el guardado.
- [ ] Con errores, el botón **Guardar** está deshabilitado. Al arreglarlos, guarda y sale el toast `Guion guardado`.
- [ ] La **vista previa** de la derecha recorre el guion eligiendo siempre la primera opción y acaba con la tarjeta fija de datos + privacidad.
- [ ] Activar el toggle **Guion activo** y guardar.
- [ ] Recargar `/captacion`: el guion se carga tal cual se guardó.

## 3. El visitante completa el asistente

- [ ] Recargar la demo (`:8083`) con todos los comerciales desconectados y abrir el widget.
- [ ] Aparece la **tarjeta de inicio** con el CTA configurado. El visitante puede ignorarla y escribir un mensaje normal: eso sigue funcionando.
- [ ] Pulsar el CTA y recorrer los pasos: botones en los de opciones, input validado en los de texto (email y teléfono se validan antes de continuar).
- [ ] **Recargar la página a mitad del recorrido**: el asistente vuelve al mismo paso (progreso en `sessionStorage` por `chatId`), no empieza de cero.
- [ ] El último paso es el **fijo**: nombre, email o teléfono, población y la casilla de privacidad con los textos legales de la empresa. Sin marcar privacidad no se puede enviar.
- [ ] Al enviar, el hilo muestra el cierre `Gracias, te contactamos el próximo día laborable` una sola vez, sin burbuja duplicada del mensaje de sistema.

## 4. Lo que ve el comercial

- [ ] El chat aparece en **Pendientes** de `/atencion`.
- [ ] Al abrirlo, el hilo muestra la tarjeta de **solo lectura** `Datos recogidos por el asistente` con los datos de contacto, las respuestas del guion y la nota de que se recogió sin agente. **No hay nada que confirmar**: el lead ya está guardado.
- [ ] El panel de detalle del visitante muestra los datos de contacto y el visitante figura como **lead**.
- [ ] Las respuestas que no encajan en la ficha (por ejemplo `interes`) están en los datos adicionales del lead, junto al recorrido completo.
- [ ] Recargar Console y reabrir la conversación: la tarjeta sigue igual (el estado vive en el mensaje `lead_capture_submission`).

## 5. Un comercial se conecta

- [ ] Con un comercial **Conectado**, recargar la demo y abrir el widget: **no** se muestra la tarjeta de inicio, el chat es el normal.
- [ ] Si el comercial se conecta mientras el visitante está a mitad del asistente, el envío **no se bloquea**: el dato ya es válido y queda marcado como recogido sin agente.

## 6. Fuera de horario

- [ ] Con `activeHours` configurado y estando fuera de rango, el widget **no se oculta** si hay guion activo: es justo cuando más interesa captar.
- [ ] Sin guion activo y fuera de horario, el comportamiento es el de siempre.

## Importante

- No lances este proceso si yo no te lo solicito.
- Necesito que hagas la simulación con el navegador del visitante y con el navegador del comercial, usando los MCP correspondientes, para poder ver cómo lo vas haciendo.
- Las pruebas del comercial realizarlas siempre con
  user = comercial1@rmotion.com
  password = Comercial123!
