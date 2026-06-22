# Notas del proyecto WSAPI - Donde quedamos

**Fecha:** 16 de marzo de 2026 (actualizado)

---

## ¿Qué es el proyecto?

Sistema de notificaciones WhatsApp **sin UltraMsg**. Baileys con múltiples números vinculados. Compatible con Traccar. ~2000 mensajes/día repartidos entre ~11 números.

---

## Estado actual ✅ FUNCIONANDO

### Producción: 2 VPS Hetzner (Pi ya no se usa)

| VPS | IP | Sesiones | Acceso |
|-----|-----|----------|--------|
| **wsapi-vps** | 46.225.142.215 | ~5 | Consola Hetzner (SSH con contraseña a veces falla) |
| **VPS 2** | 46.225.92.152 | ~6 | SSH con clave `id_ed25519.pub` |

- **Pi (192.168.100.6):** liberado. No producción WSAPI.
- **ngrok:** ya no se usa.

### Panel `/pair` — indicadores de estado ✅ (commit `29647c7`)

Pastillas de color por sesión (se actualiza solo cada 5 s):

| Color | Estado |
|-------|--------|
| **Verde** | En línea |
| **Rojo** | Desconectada (vinculada pero dormida) |
| **Amarillo** | Sin vincular |
| **Azul** | Conectando… |

- Resumen arriba: X en línea · Y desconectadas · Z sin vincular
- Botón **Reconectar** en rojas (sin escanear QR)
- Resto: Exclusiva/Dinámica, +, Ver grupos, 🗑 (PIN 1980)

| VPS | Panel |
|-----|-------|
| VPS 1 | http://46.225.142.215:3000/pair |
| VPS 2 | http://46.225.92.152:3000/pair |

### Keep-alive sesiones ✅ (commit `5ad5afb`)

Presencia cada 10 min + `markOnlineOnConnect`. No requiere re-escanear QR.

### URLs Traccar

**VPS 1:** `http://46.225.142.215:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10`  
**VPS 2:** `http://46.225.92.152:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10`  
Por sesión: `&session=numero_1` — IDs en `/api/sessions`

---

## Actualizar código en VPS

**En consola Hetzner:** enviar **un comando por línea** (no pegar todo con `&&`):

```bash
cd /opt/wsapi
```
```bash
git pull origin main
```
```bash
npm install
```
```bash
pm2 restart wsapi
```
```bash
pm2 status
```

**VPS 2 por SSH** (desde PC): `ssh root@46.225.92.152` y mismos comandos.

---

## Si algo falla

```bash
pm2 logs wsapi
pm2 restart wsapi
```

Sesión roja en `/pair` → botón **Reconectar** (no QR).

---

## Pendiente (para después)

| Tema | Notas |
|------|-------|
| **Lista números con error de envío** | Botón en panel |
| **IDs consecutivos (numero_1, 2, 3…)** | Cambio en `POST /api/sessions` |
| **Proxy Bright Data** | ~11 cuentas, 2 VPS |
| **SSH VPS 1** | Añadir `id_ed25519.pub` a authorized_keys |

---

## Recordatorios

- **Clave SSH:** `C:\Users\andre\.ssh\id_ed25519.pub` (pública, no la privada)
- **Contraseña VPS:** Hetzner → Console o Rescue
- **Nuevo VPS:** `GUIA_INSTALAR_VPS.txt`

---

## Proxy (planificado)

Bright Data · SOCKS5 · “apliquemos proxy” cuando digas.

---

## Ubicación

| Lugar | Ruta |
|-------|------|
| PC | `c:\Users\andre\halconsoft\wsapi` |
| VPS 1 | `/opt/wsapi` · 46.225.142.215 |
| VPS 2 | `/opt/wsapi` · 46.225.92.152 |
