# Guía: Instalar WSAPI en Hetzner

Pasos para configurar wsapi en un VPS de Hetzner (IPs que suelen funcionar mejor con WhatsApp que DigitalOcean).

---

## 1. Crear servidor en Hetzner

1. Entra a **[console.hetzner.cloud](https://console.hetzner.cloud)**
2. **Regístrate** o inicia sesión
3. **Add Server** (o **Nuevo servidor**)
4. Configuración sugerida:
   - **Ubicación**: Nuremberg o Helsinki
   - **Imagen**: Ubuntu 24.04
   - **Tipo**: **CX22** (~4 €/mes, 2 GB RAM) o **CPX11** (~4 €/mes, 2 vCPU)
   - **SSH Key**: Añade tu clave o acepta contraseña por email
5. **Create & Buy**
6. Anota la **IP** que te asignen (ej: `95.217.xxx.xxx`)

---

## 2. Conectarte por SSH

Desde PowerShell en tu PC:

```powershell
ssh root@TU_IP_HETZNER
```

(Reemplaza `TU_IP_HETZNER` con la IP del paso 1)

---

## 3. Instalar Node.js

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
```

---

## 4. Instalar WSAPI

```bash
apt install -y git
cd /opt
git clone https://github.com/andycg1201/wsapi.git
cd wsapi
npm install
```

---

## 5. Configuración inicial

```bash
mkdir -p config auth_sessions

cat > config/sessions.json << 'EOF'
[
  { "id": "numero_1", "label": "Número 1", "enabled": true },
  { "id": "numero_2", "label": "Número 2", "enabled": true },
  { "id": "numero_3", "label": "Número 3", "enabled": true },
  { "id": "numero_4", "label": "Número 4", "enabled": true },
  { "id": "numero_5", "label": "Número 5", "enabled": true }
]
EOF
```

---

## 6. Copiar sesiones desde tu PC (recomendado)

Si ya tienes wsapi funcionando con ngrok en tu PC, copia las sesiones vinculadas:

**Desde PowerShell (en tu PC):**
```powershell
cd c:\Users\andre\halconsoft\wsapi
scp -r auth_sessions root@TU_IP_HETZNER:/opt/wsapi/
```

O usa **WinSCP**: conecta a la IP de Hetzner y sube la carpeta `auth_sessions` a `/opt/wsapi/`.

---

## 7. Subir los archivos con el fix (desde tu PC)

Tu copia local tiene mejoras (conexión perezosa, Mac OS). Cópialos:

```powershell
cd c:\Users\andre\halconsoft\wsapi
scp src/baileys-manager.js root@TU_IP_HETZNER:/opt/wsapi/src/
scp src/index.js root@TU_IP_HETZNER:/opt/wsapi/src/
```

---

## 8. Iniciar con PM2

```bash
npm install -g pm2
cd /opt/wsapi
pm2 start src/index.js --name wsapi
pm2 startup
pm2 save
```

---

## 9. Firewall

```bash
ufw allow 22
ufw allow 3000
ufw enable
```

---

## 10. Verificar

- **Panel:** `http://TU_IP_HETZNER:3000/pair`
- **Estado:** `http://TU_IP_HETZNER:3000/health`
- **Para Traccar:**  
  `http://TU_IP_HETZNER:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10`

---

## Si el QR no aparece

1. Prueba vincular **desde tu PC** (ngrok) y luego copia `auth_sessions` al servidor Hetzner (paso 6).
2. Vincula **una sesión a la vez**, con 2-3 minutos entre cada una.

---

## Comandos útiles

```bash
pm2 status
pm2 logs wsapi
pm2 restart wsapi
```
