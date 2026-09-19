# Simulacro: Registro de conexiones del comercial

Probar a mano en Console: toggle **Conectado/Desconectado** en `/atencion` y la página **Conexiones** (`/conexiones`).

Cada conexión abre una fila en la colección Mongo `commercial_connection_sessions` y cada desconexión la cierra con duración y motivo.

## Antes de empezar

- [ ] Backend arriba (`npm run start:dev`, `:3000`), Console (`:4200`) y Redis en marcha (la presencia vive en Redis).
- [ ] Sesión iniciada en Console con un usuario de rol `commercial` (el caso que estaba roto) y, si se puede, otra con rol `admin`.

## Flujo básico

- [ ] Toggle a **Conectado** en `/atencion`. En `/conexiones` aparece una fila **Abierta**, sin duración y con el **nombre real** del comercial (no su email).
- [ ] Pulsar **Conectado** otra vez (o recargar y reconectar sin desconectar) no crea una segunda fila abierta: sigue habiendo una sola.
- [ ] Toggle a **Desconectado**: la fila pasa a **Cerrada**, con duración coherente y motivo **Manual**.

## Los cuatro motivos de cierre

- [ ] **Manual**: toggle a Desconectado. También lo produce `PUT /v2/commercials/status` con `offline`; `away` y `busy` **no** cierran la sesión.
- [ ] **Logout**: conectar y cerrar sesión desde el menú de usuario. Motivo **Logout**.
- [ ] **Cierre navegador**: conectar y cerrar la pestaña. Al volver a entrar en Console la fila aparece cerrada con motivo **Cierre navegador** (el arranque manda `reason: browser_close`).
- [ ] **Conexión perdida**: conectar y tirar el WebSocket sin avisar (matar la red de la pestaña con DevTools → Network offline, o parar el backend un momento). La fila se cierra con motivo **Conexión perdida**.
- [ ] **Reinicio del backend con sesión abierta**: conectar, matar el backend a lo bruto (`kill -9`) y arrancarlo de nuevo sin volver a Console. El barrido (`StaleConnectionSessionScheduler`, cada 10 minutos) cierra la fila con motivo **Conexión perdida**. Para no esperar, se puede comprobar con el test unitario del scheduler.

## Alcance por rol

- [ ] Con rol **commercial**, `/conexiones` muestra **sus propias** conexiones (esto fallaba: la Console conecta con el id de Keycloak y el listado filtraba por el id interno del usuario).
- [ ] Con rol **commercial**, el filtro de comercial no permite ver a otro agente aunque se fuerce `?commercialId=` en la URL.
- [ ] Con rol **admin** o **supervisor** se ven todas las conexiones de la empresa y el filtro por comercial funciona.
- [ ] Ningún rol ve conexiones de otra empresa.

## Comprobar también

- Filtros de fecha, estado (Abierta/Cerrada) y motivo, incluido el nuevo **Conexión perdida**.
- Un comercial que sigue trabajando más de 5 minutos **no** pierde su sesión abierta: el barrido comprueba el socket vivo además de Redis, cuya clave de presencia caduca a los 5 minutos.

## Importante

- No lances este proceso si yo no te lo solicito.
