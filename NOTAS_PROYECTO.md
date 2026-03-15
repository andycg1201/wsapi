# Notas del proyecto WSAPI - Donde quedamos

**Fecha:** 15 de marzo de 2026 (actualizado)

---

## ¿Qué es el proyecto?

Sistema de notificaciones WhatsApp **sin UltraMsg** (para ahorrar costo). Usa Baileys con múltiples números de WhatsApp vinculados directamente. Compatible con Traccar.

---

## Estado actual ✅ FUNCIONANDO

### Lo que ya funciona

- **Notificaciones operativas** - Traccar envía a WSAPI y los mensajes llegan a WhatsApp
- **WSAPI en Raspberry Pi** - Corriendo en `/opt/wsapi` en 192.168.100.6
- **ngrok con dominio fijo** - `izaiah-multiaxial-mostly.ngrok-free.dev` (Traccar VPS se conecta vía internet)
- **Servicios automáticos** - ngrok y wsapi arrancan solos al encender el Pi (systemd)
- **Múltiples números** - Sesiones con round-robin o fijas (`session=numero_X`)
- **URL para Traccar:** `https://izaiah-multiaxial-mostly.ngrok-free.dev/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10`
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
- **WSAPI:** Corriendo en Raspberry Pi (192.168.100.6)
- **Túnel:** ngrok en el Pi, dominio fijo `izaiah-multiaxial-mostly.ngrok-free.dev`
- **Arranque automático:** Si el Pi se apaga o pierde internet, al reconectar los servicios ngrok y wsapi se reinician solos

---

## Para continuar

### Si algo deja de funcionar

1. SSH al Pi: `ssh andycg@192.168.100.6`
2. Revisar servicios: `sudo systemctl status ngrok wsapi`
3. Reiniciar si hace falta: `sudo systemctl restart wsapi` o `sudo systemctl restart ngrok`
4. Panel local: `http://192.168.100.6:3000/pair`

### Vincular más números

- Ir a `https://izaiah-multiaxial-mostly.ngrok-free.dev/pair` (o `http://192.168.100.6:3000/pair` en red local)
- Clic en **+** para agregar sesión
- Escanear QR con "Mostrar QR"
- El número y nombre se actualizan solos al vincular

### Actualizar código en el Pi

```bash
ssh andycg@192.168.100.6
cd /opt/wsapi
git pull origin main
npm install
sudo systemctl restart wsapi
```

---

## Comandos útiles

```bash
# En tu PC (desarrollo)
npm start                    # Iniciar WSAPI local
npm run dev                  # Con reinicio automático

# Conectar al Pi
ssh andycg@192.168.100.6

# En el Pi
cd /opt/wsapi && npm start   # Iniciar WSAPI manualmente
sudo systemctl status ngrok wsapi   # Estado de servicios
sudo systemctl restart wsapi        # Reiniciar WSAPI
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

| Lugar | Ruta |
|-------|------|
| PC (desarrollo) | `c:\Users\andre\halconsoft\wsapi` |
| Raspberry Pi (producción) | `/opt/wsapi` en 192.168.100.6 |
