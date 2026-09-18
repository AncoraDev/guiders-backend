# Simulacro: Solicitar datos

Probar a mano en Console (`/atencion`) + widget SDK. El comercial debe estar **conectado**.

Frase de preface: `Por favor rellena este formulario, por favor`

## Antes de empezar

- [ ] Backend arriba (`npm run start:dev`, `:3000`), Console (`:4200`), dev server SDK (`:8081`) y demo PHP (`:8083`).
- [ ] Migraciones al día: `npm run typeorm:migrate:run`. Ojo con el doble Postgres (ver `docker/README.md`): `localhost` resuelve al Postgres nativo, no al del compose. Si falta una columna, Console rebota a Keycloak y parece un fallo de login.
- [ ] Bundle del SDK actualizado en la demo: `npm run build && cp dist/index.js demo/app/guiders-sdk.js` en `guiders-sdk`.

## Flujo

- [ ] El comercial escribe la frase, pulsa `/` y elige **Solicitar datos**. Ya **no hay botón dedicado** en el composer: la única entrada es el comando `/`.
- [ ] Toast: `Solicitud de datos enviada al visitante`. Si el backend responde error se ve el error real (400/409 salen como aviso informativo, no como éxito).
- [ ] El visitante ve el preface y el formulario debajo, en **una sola tarjeta activa**.
- [ ] El visitante puede **Cancelar**: Console muestra `El visitante ha cancelado el formulario`.
- [ ] El comercial puede volver a enviar el formulario (visitante aún no es lead). En el widget solo queda la tarjeta nueva; la cancelada anterior ya no se pinta.
- [ ] El visitante rellena (nombre, email, teléfono, población, privacidad) y envía. En el widget queda `Datos enviados` **sin tarjeta duplicada**.
- [ ] El comercial recibe los datos, los revisa y **Confirma**: toast `Datos de contacto guardados`, la tarjeta pasa a `Datos aplicados` y el visitante pasa a lead.
- [ ] **Recargar Console** y reabrir la conversación: sigue mostrando `Datos aplicados`. El estado vive en el mensaje `contact_confirmation` (`POST /v2/chats/:chatId/contact-confirm`), no en memoria.
- [ ] **Recargar la página del visitante** y reabrir el widget: sigue habiendo una sola tarjeta con el último estado.
- [ ] `/` → **Solicitar datos** sigue disponible. Si el comercial lo elige con un lead: toast `Este visitante ya es lead…` y no se envía otra tarjeta al hilo.

## Comprobar también

- Población y política de privacidad son obligatorias en el widget.
- El hilo del visitante no muestra burbujas de texto para cancelación ni confirmación: solo cambian el estado de la tarjeta.

## Limitaciones conocidas (pendiente de endurecer en backend)

- Un segundo `contact-request` con una solicitud pendiente se acepta (HTTP 201) y crea otra tarjeta; debería rechazarse.
- Chat inexistente o de otro tenant devuelve 500 en vez de 404/403, y `contact-request` no valida la pertenencia del chat al comercial.

## Importante

- No lances este proceso si yo no te lo solicito. 

- Necesito que hagas una simulacion con el navegador del visitante y con el navegador del comercial y que o vaya viendo como lo vas haciendo haciendo uso de los mcp correspondiente. Así podrás verificar tu mismo que todos los procesos son correctos.

- Las pruebas del comercial realizarlas siempre con 
user = comercial1@rmotion.com
password = Comercial123!
