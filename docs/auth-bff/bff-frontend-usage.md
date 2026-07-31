# Guía de Uso: BFF con Cookies HttpOnly para SPA Frontend

## 📋 Resumen

Esta guía explica cómo utilizar la nueva estrategia BFF (Backend For Frontend) con cookies HttpOnly desde tu aplicación SPA (Single Page Application) de frontend.

## 🎯 ¿Qué es el BFF con Cookies HttpOnly?

El BFF es una capa intermedia que:
- Maneja la autenticación con Keycloak automáticamente
- Almacena tokens JWT en cookies HttpOnly (inaccesibles desde JavaScript)
- Proporciona endpoints simples para login/logout/refresh
- Mejora la seguridad contra ataques XSS

## 🔧 Configuración Frontend

### 1. Configuración de Fetch/Axios

**IMPORTANTE**: Siempre incluir `credentials: 'include'` en todas las peticiones:

```javascript
// Con fetch nativo
fetch('/api/bff/auth/login', {
  method: 'POST',
  credentials: 'include', // ← Esencial para cookies
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    username: 'usuario@ejemplo.com',
    password: 'password123'
  })
});

// Con axios (configuración global recomendada)
axios.defaults.withCredentials = true;

// O por petición individual
axios.post('/api/bff/auth/login', {
  username: 'usuario@ejemplo.com',
  password: 'password123'
}, {
  withCredentials: true
});
```

### 2. Configuración CORS del Frontend

Asegúrate de que tu servidor de desarrollo esté configurado correctamente:

```javascript
// webpack.config.js o similar
module.exports = {
  devServer: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        credentials: true // ← Para cookies
      }
    }
  }
};

// O con Vite (vite.config.js)
export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
};
```

## 🚀 Endpoints Disponibles

### POST `/api/bff/auth/login`
Autentica al usuario y establece cookies HttpOnly.

```javascript
const login = async (username, password) => {
  try {
    const response = await fetch('/api/bff/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('Login exitoso:', data.user);
      // Las cookies se configuran automáticamente
      return data.user;
    } else {
      throw new Error('Login fallido');
    }
  } catch (error) {
    console.error('Error en login:', error);
    throw error;
  }
};
```

### POST `/api/bff/auth/refresh`
Renueva automáticamente el access token usando el refresh token de la cookie.

```javascript
const refreshToken = async () => {
  try {
    const response = await fetch('/api/bff/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error renovando token:', error);
    return false;
  }
};
```

### GET `/api/bff/auth/me`
Obtiene información del usuario autenticado.

```javascript
const getCurrentUser = async () => {
  try {
    const response = await fetch('/api/bff/auth/me', {
      method: 'GET',
      credentials: 'include',
    });

    if (response.ok) {
      const data = await response.json();
      return data.user;
    } else {
      return null; // No autenticado
    }
  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    return null;
  }
};
```

### POST `/api/bff/auth/logout`
Cierra la sesión y limpia las cookies.

```javascript
const logout = async () => {
  try {
    const response = await fetch('/api/bff/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('Logout exitoso');
      // Redirigir a login o limpiar estado
      return true;
    }
  } catch (error) {
    console.error('Error en logout:', error);
  }
  return false;
};
```

## 🔒 Peticiones Autenticadas a Otros Endpoints

Para todas las demás peticiones API que requieren autenticación:

```javascript
// Ejemplo: Obtener datos protegidos
const fetchProtectedData = async () => {
  try {
    const response = await fetch('/api/protected-endpoint', {
      method: 'GET',
      credentials: 'include', // ← Las cookies se envían automáticamente
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (response.status === 401) {
      // Token expirado, intentar renovar
      const refreshed = await refreshToken();
      if (refreshed) {
        // Reintentar la petición original
        return fetchProtectedData();
      } else {
        // Redirigir a login
        window.location.href = '/login';
        return;
      }
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error en petición protegida:', error);
    throw error;
  }
};
```

## ⚡ Implementación en React/Vue/Angular

### React Context para Autenticación

```jsx
import React, { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Verificar autenticación al cargar
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      const response = await fetch('/api/bff/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      
      if (data.success) {
        setUser(data.user);
        return true;
      } else {
        throw new Error('Login fallido');
      }
    } catch (error) {
      console.error('Error en login:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/bff/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      setUser(null);
    } catch (error) {
      console.error('Error en logout:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};
```

### Interceptor HTTP Axios

```javascript
import axios from 'axios';

// Configuración global
axios.defaults.baseURL = 'http://localhost:3000';
axios.defaults.withCredentials = true;

// Interceptor para renovación automática
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      
      try {
        // Intentar renovar token
        await axios.post('/api/bff/auth/refresh');
        
        // Reintentar petición original
        return axios(original);
      } catch (refreshError) {
        // Renovación falló, redirigir a login
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);
```

## 🔧 Interceptor para Fetch

```javascript
// Wrapper para fetch con renovación automática
const authenticatedFetch = async (url, options = {}) => {
  const defaultOptions = {
    credentials: 'include',
    ...options
  };

  let response = await fetch(url, defaultOptions);

  // Si recibimos 401, intentar renovar
  if (response.status === 401) {
    const refreshResponse = await fetch('/api/bff/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    if (refreshResponse.ok) {
      // Token renovado, reintentar petición original
      response = await fetch(url, defaultOptions);
    } else {
      // Renovación falló, redirigir a login
      window.location.href = '/login';
      throw new Error('Sesión expirada');
    }
  }

  return response;
};

// Uso
const data = await authenticatedFetch('/api/protected-endpoint');
```

## 🚫 Lo que NO debes hacer

### ❌ No almacenar tokens en localStorage
```javascript
// MAL - Ya no necesario
localStorage.setItem('access_token', token);

// BIEN - Las cookies se manejan automáticamente
// No necesitas hacer nada especial
```

### ❌ No agregar headers Authorization manualmente
```javascript
// MAL - Ya no necesario
const response = await fetch('/api/endpoint', {
  headers: {
    'Authorization': `Bearer ${token}` // ← No necesario
  }
});

// BIEN - Solo incluir credentials
const response = await fetch('/api/endpoint', {
  credentials: 'include' // ← Suficiente
});
```

### ❌ No olvidar credentials: 'include'
```javascript
// MAL - Las cookies no se envían
fetch('/api/endpoint');

// BIEN - Las cookies se incluyen
fetch('/api/endpoint', { credentials: 'include' });
```

## 🔍 Debugging

### Verificar Cookies en DevTools
1. Abre las DevTools (F12)
2. Ve a la pestaña "Application" (Chrome) o "Storage" (Firefox)
3. Selecciona "Cookies" en el panel izquierdo
4. Deberías ver:
   - `access_token` (con HttpOnly marcado)
   - `refresh_token` (con HttpOnly marcado)

### Verificar Peticiones de Red
1. Ve a la pestaña "Network"
2. Realiza una petición autenticada
3. En la petición, verifica:
   - Header "Cookie" debe incluir los tokens
   - Si es una respuesta de login, "Set-Cookie" debe estar presente

## ⚠️ Consideraciones de Seguridad

1. **HTTPS en Producción**: Las cookies HttpOnly requieren HTTPS para máxima seguridad
2. **SameSite**: Las cookies están configuradas con `SameSite=Strict`
3. **Dominios**: Asegúrate de que frontend y backend estén en el mismo dominio en producción
4. **CSP**: Configura Content Security Policy adecuadamente

## 🚀 Migración desde JWT en Headers

Si vienes de una implementación con JWT en headers:

```javascript
// ANTES: Con JWT en headers
const oldApiCall = async () => {
  const token = localStorage.getItem('access_token');
  
  const response = await fetch('/api/endpoint', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return response.json();
};

// DESPUÉS: Con BFF y cookies HttpOnly
const newApiCall = async () => {
  const response = await fetch('/api/endpoint', {
    credentials: 'include' // ← Solo este cambio necesario
  });
  
  return response.json();
};
```

## 🎉 Beneficios Obtenidos

- ✅ **Seguridad mejorada**: Tokens inaccesibles desde JavaScript
- ✅ **Simplicidad**: No gestión manual de tokens
- ✅ **Renovación automática**: Sin interrupciones para el usuario
- ✅ **Menos código**: Eliminación de lógica de manejo de tokens
- ✅ **Anti-XSS**: Protección nativa contra scripts maliciosos

## 🆘 Troubleshooting

### Problema: Las cookies no se envían
**Solución**: Verificar `credentials: 'include'` en todas las peticiones

### Problema: CORS errors
**Solución**: Verificar configuración de CORS en backend y proxy en frontend

### Problema: 401 constantes
**Solución**: Verificar que el endpoint `/api/bff/auth/refresh` funcione correctamente

### Problema: Cookies no aparecen en DevTools
**Solución**: Verificar que el backend esté enviando headers `Set-Cookie` correctos

¿Necesitas ayuda adicional? Revisa los logs del backend o contacta al equipo de desarrollo.