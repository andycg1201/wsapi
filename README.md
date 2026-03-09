# WSAPI - Notificaciones WhatsApp con Baileys

Sistema de notificaciones por WhatsApp **sin UltraMsg**: usa múltiples números conectados directamente.  
Compatible con Traccar y cualquier plataforma que envíe a una URL.

## Requisitos

- Node.js 18+
- 5 celulares con WhatsApp (o los que quieras vincular)

## Instalación

```bash
npm install
npm start
```

## Vincular números

1. Abre en el navegador: `http://TU_IP:3000/pair`
2. Para cada número: clic en "Mostrar QR"
3. Escanea el QR con WhatsApp: **Configuración → Dispositivos vinculados → Vincular dispositivo**
4. El celular debe mantener internet (no hace falta que esté cerca del servidor)

## URL para Traccar

En la configuración de notificaciones de Traccar, usa:

```
http://TU_IP_O_DOMINIO:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%
```

## Agregar más números

1. Edita `config/sessions.json` y añade: `{ "id": "numero_6", "label": "Número 6", "enabled": true }`
2. Reinicia el servicio
3. Ve a `/pair` y escanea el QR del nuevo número

O usa la API: `POST /api/sessions` con `{ "id": "numero_6", "label": "Número 6" }`

## Despliegue en VPS

Ver **[GUIA_VPS.md](GUIA_VPS.md)** para comprar y configurar el servidor paso a paso.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/messages/chat` | Enviar notificación (`to`, `body`) |
| GET/POST | `/notify` | Igual que arriba |
| GET | `/health` | Estado + sesiones conectadas |
| GET | `/pair` | Panel web para vincular números |
| GET | `/api/sessions` | Estado de sesiones (JSON) |
| POST | `/api/sessions` | Añadir nueva sesión |
