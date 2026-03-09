# Notas del proyecto WSAPI - Donde quedamos

**Fecha:** 9 de marzo de 2026

---

## ¿Qué es el proyecto?

Sistema de notificaciones WhatsApp **sin UltraMsg** (para ahorrar costo). Usa Baileys con múltiples números de WhatsApp vinculados directamente. Compatible con Traccar.

---

## Estado actual

### ✅ Lo que ya funciona

- **1 número vinculado** - Escaneaste el QR y quedó conectado
- **API operativa** - Endpoint `/messages/chat` recibe `to` y `body`
- **Traccar configurado** - URL: `http://localhost:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%`
- **Panel de vinculación** - `http://localhost:3000/pair` para vincular más números

### 🔧 Fix aplicado

WhatsApp rechazaba la plataforma WEB (Connection Failure). Se instaló Baileys desde el fork con el fix:
- En `package.json`: `"@whiskeysockets/baileys": "github:kobie3717/Baileys#fix/405-platform-macos"`

### 📁 Estructura importante

- `config/sessions.json` - Lista de sesiones (numero_1, numero_2, etc.)
- `auth_sessions/` - Credenciales de WhatsApp por sesión (no subir a git)
- `src/baileys-manager.js` - Lógica round-robin
- `src/index.js` - API y panel web

---

## Cómo funciona el round-robin

- Las sesiones son los **números que envían** (los WhatsApp vinculados)
- El `to` es siempre el **cliente que recibe** (configurado en Traccar)
- El sistema **rota automáticamente** entre sesiones: mensaje 1 → numero_1, mensaje 2 → numero_2, etc.
- No hay que configurar qué sesión usa cada mensaje

---

## Para continuar mañana

### 1. Probar envío de notificación

```
http://localhost:3000/messages/chat?to=52XXXXXXXXXX&body=Prueba
```
(Reemplazar con tu número real)

### 2. Vincular más números (opcional)

- Editar `config/sessions.json` y añadir: `{ "id": "numero_2", "label": "Número 2", "enabled": true }`
- Reiniciar servidor
- Ir a `/pair` y escanear QR

### 3. Desplegar en VPS (cuando esté listo)

- Seguir **GUIA_VPS.md**
- Subir el proyecto al VPS
- Configurar PM2 para que corra 24/7
- Cambiar la URL en Traccar a la IP del VPS

### 4. Comandos útiles

```bash
npm start          # Iniciar servidor
taskkill /F /IM node.exe   # Detener (Windows)
```

---

## Pendientes / recordatorios

- [ ] Probar notificación real desde Traccar (evento de geocerca, etc.)
- [ ] Vincular los 5 números si se quiere distribuir carga
- [ ] Desplegar en VPS cuando se use en producción
- [ ] El archivo `auth_sessions/` no debe subirse a GitHub (está en .gitignore)

---

## Ubicación del proyecto

```
c:\Users\andre\halconsoft\wsapi
```
