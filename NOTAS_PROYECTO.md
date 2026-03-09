# Notas del proyecto WSAPI - Donde quedamos

**Fecha:** 9 de marzo de 2026

---

## ¿Qué es el proyecto?

Sistema de notificaciones WhatsApp **sin UltraMsg** (para ahorrar costo). Usa Baileys con múltiples números de WhatsApp vinculados directamente. Compatible con Traccar.

---

## Estado actual ✅ FUNCIONANDO

### Lo que ya funciona

- **Notificaciones operativas** - Traccar envía a WSAPI y los mensajes llegan a WhatsApp
- **ngrok temporal** - Traccar (VPS de terceros) se conecta vía ngrok a tu PC
- **1 número vinculado** (numero_1) - Sesión conectada
- **URL para Traccar:** `https://[tu-url-ngrok].ngrok-free.app/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10`

### Configuración actual

- **Traccar:** En VPS de terceros (sin acceso SSH)
- **WSAPI:** Corriendo en tu PC
- **Túnel:** ngrok expone localhost:3000 a internet
- **Limitación:** Tu PC debe estar encendida 24/7. La URL ngrok cambia si reinicias.

---

## Para continuar mañana

### Opción A: Seguir con ngrok (temporal)

1. Iniciar WSAPI: `npm start`
2. Iniciar ngrok: `ngrok http 3000`
3. Si la URL cambió, actualizar con el proveedor de Traccar

### Opción B: Comprar VPS propio (recomendado para producción)

- Ver **GUIA_VPS.md** - Sección "Cuándo comprar un VPS"
- Costo: ~4-6 USD/mes
- WSAPI correría 24/7 sin depender de tu PC
- El proveedor de Traccar cambiaría la URL a tu IP del VPS

### Vincular más números

- Ir a `/pair` (o `http://[ngrok-url]/pair`)
- Escanear QR de numero_2, 3, 4, 5 para distribuir carga

---

## Comandos útiles

```bash
npm start                    # Iniciar WSAPI
ngrok http 3000              # Exponer a internet (con ngrok instalado)
taskkill /F /IM node.exe     # Detener Node (Windows)
```

---

## Archivos clave

- `config/sessions.json` - Sesiones configuradas
- `auth_sessions/` - Credenciales WhatsApp (no subir a git)
- `CONFIGURAR_TRACCAR.md` - Guía Traccar (SMS POST)
- `GUIA_VPS.md` - Comprar VPS e instalar WSAPI

---

## Ubicación del proyecto

```
c:\Users\andre\halconsoft\wsapi
```
