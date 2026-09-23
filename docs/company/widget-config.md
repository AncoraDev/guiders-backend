# Configuración del widget (pixel)

El admin del concesionario configura el chat web en Console. El plugin de WordPress solo instala el pixel (API key, entorno, tracking).

## Dónde se guarda

Columna JSON `companies.widget_config` (migración `1771000000000-add-widget-config`).

Defaults si está vacía:

- `chatEnabled`: true
- `autoOpenChatOnMessage`: true
- `colorScheme`: `system`
- `theme`: `default`
- `position.desktop`: `bottom-right`
- `position.mobileEnabled`: false
- `position.mobile`: `bottom-right`

## Endpoints

| Quién | Método | Ruta | Auth |
|-------|--------|------|------|
| Console admin | GET / PUT | `/api/me/company/widget-config` | Sesión BFF + rol `admin` |
| Pixel / WP / web suelta | GET | `/api/v2/widget/config?domain=&apiKey=` | API key del dominio |

El GET público vive en `WidgetConfigModule` (no en `CompanyModule`) para no circular con AuthVisitor.

## Flujo

1. Admin guarda en **Configuración → Chat web**.
2. El SDK, al iniciar (antes de pintar el widget), pide el GET público.
3. Si la red falla, usa los defaults de arriba.

No se configuran aquí: horarios, Quick Actions, textos de IA, ni el toggle Conectado de Atención.
