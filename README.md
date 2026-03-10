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

**Dinámica** (round-robin entre números): Enzanoia, Transsteri, etc.
```
http://TU_IP:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10
```

**Fija** (solo un número): Contax u otra cuenta que requiera número exclusivo.
```
http://TU_IP:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10&session=numero_3
```

Para sesiones fijas, en `config/sessions.json` añade `"fixed": true` al número correspondiente.

## Agregar más números

- En el panel `/pair`: clic en el botón **+** (botón circular verde).
- Se crea una sesión con ID automático. Escanea el QR.
- Al vincular, se muestran automáticamente el número y el nombre de WhatsApp.

O usa la API: `POST /api/sessions` con body vacío `{}` o `{ "id": "numero_6", "label": "Número 6" }`

## Ver grupos y enviar a grupos

- Para sesiones conectadas: clic en **Ver grupos** para listar y copiar IDs.
- Enviar a grupo: usa el ID completo como `to`, ej. `to=1234567890-9876543210@g.us`

## Exclusiva vs Dinámica

- Cada sesión muestra **Exclusiva** o **Dinámica** (clic para alternar).
- **Exclusiva:** solo se usa cuando envías `?session=numero_X`.
- **Dinámica:** entra en round-robin entre todas las dinámicas.

## Eliminar sesión

- Clic en el icono 🗑 de la sesión → ingresar PIN **1980** → Eliminar.

## Despliegue en VPS

Ver **[GUIA_VPS.md](GUIA_VPS.md)** para comprar y configurar el servidor paso a paso.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/messages/chat` | Enviar notificación (`to`, `body`, `session`) |
| GET/POST | `/notify` | Igual que arriba |
| GET | `/health` | Estado + sesiones conectadas |
| GET | `/pair` | Panel web para vincular números |
| GET | `/api/sessions` | Estado de sesiones (JSON) |
| POST | `/api/sessions` | Añadir nueva sesión |
| PATCH | `/api/sessions/:id` | Cambiar exclusiva (body: `{ "fixed": true }`) |
| DELETE | `/api/sessions/:id` | Eliminar sesión (body: `{ "pin": "1980" }`) |
| GET | `/api/sessions/:id/groups` | Lista grupos de la sesión |
