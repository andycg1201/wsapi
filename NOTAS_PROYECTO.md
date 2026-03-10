# Notas del proyecto WSAPI - Donde quedamos

**Fecha:** 8 de marzo de 2026 (actualizado)

---

## ¿Qué es el proyecto?

Sistema de notificaciones WhatsApp **sin UltraMsg** (para ahorrar costo). Usa Baileys con múltiples números de WhatsApp vinculados directamente. Compatible con Traccar.

---

## Estado actual ✅ FUNCIONANDO

### Lo que ya funciona

- **Notificaciones operativas** - Traccar envía a WSAPI y los mensajes llegan a WhatsApp
- **ngrok temporal** - Traccar (VPS de terceros) se conecta vía ngrok a tu PC
- **Múltiples números** - Sesiones con round-robin o fijas (`session=numero_X`)
- **URL para Traccar:** `https://[tu-url-ngrok].ngrok-free.app/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10`
- **Envío a grupos** - Usar ID de grupo: `to=1234567890-9876543210@g.us`

### Panel `/pair` - Funciones

| Función | Descripción |
|---------|-------------|
| ✅/⏳ | Iconos: Vinculado / Sin vincular |
| Exclusiva/Dinámica | Badge clicable: alterna entre sesión fija o round-robin |
| **+** | Botón circular: agregar sesión (ID automático) |
| Ver grupos | Lista grupos WhatsApp y permite copiar ID |
| 🗑 | Eliminar sesión (PIN: 1980) |

- Al vincular: se muestra número de teléfono y nombre de WhatsApp automáticamente
- **Exclusiva** = solo se usa con `?session=numero_X`; **Dinámica** = entra en round-robin

### Configuración actual

- **Traccar:** En VPS de terceros (sin acceso SSH)
- **WSAPI:** Corriendo en tu PC
- **Túnel:** ngrok expone localhost:3000 a internet
- **Limitación:** Tu PC debe estar encendida 24/7. La URL ngrok cambia si reinicias.

---

## Para continuar

### Opción A: Seguir con ngrok (temporal)

1. Iniciar WSAPI: `npm start`
2. Iniciar ngrok: `ngrok http 3000`
3. Si la URL cambió, actualizar con el proveedor de Traccar

### Opción B: Comprar VPS propio (recomendado para producción)

- Ver **GUIA_VPS.md** - Sección "Cuándo comprar un VPS"
- Costo: ~4-6 USD/mes
- WSAPI correría 24/7 sin depender de tu PC

### Vincular más números

- Ir a `/pair` → clic en **+** para agregar sesión
- Escanear QR con "Mostrar QR"
- El número y nombre se actualizan solos al vincular

---

## Comandos útiles

```bash
npm start                    # Iniciar WSAPI
npm run dev                  # Con reinicio automático
ngrok http 3000              # Exponer a internet
taskkill /F /IM node.exe     # Detener Node (Windows)
```

---

## API relevante

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/sessions` | Estado de sesiones |
| POST | `/api/sessions` | Agregar sesión (body vacío = ID auto) |
| PATCH | `/api/sessions/:id` | Cambiar fijo (body: `{ "fixed": true/false }`) |
| DELETE | `/api/sessions/:id` | Eliminar sesión (body: `{ "pin": "1980" }`) |
| GET | `/api/sessions/:id/groups` | Grupos de una sesión conectada |

---

## Archivos clave

- `config/sessions.json` - Sesiones configuradas (phone, label se auto-actualizan)
- `auth_sessions/` - Credenciales WhatsApp (no subir a git)
- `CONFIGURAR_TRACCAR.md` - Guía Traccar (SMS POST)
- `GUIA_VPS.md` - Comprar VPS e instalar WSAPI

---

## Ubicación del proyecto

```
c:\Users\andre\halconsoft\wsapi
```
