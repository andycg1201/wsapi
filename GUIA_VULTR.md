# Guía: Instalar WSAPI en Vultr

## 1. Obtener la IP

En el panel de Vultr → **Products** → clic en tu servidor → anota la **IP Address**.

## 2. Conectarte por SSH

Desde PowerShell:

```powershell
ssh root@TU_IP_VULTR
```

(Reemplaza `TU_IP_VULTR` con tu IP)

## 3. Instalar Node.js

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git
node -v
```

## 4. Instalar WSAPI

```bash
cd /opt
git clone https://github.com/andycg1201/wsapi.git
cd wsapi
npm install
```

## 5. Crear configuración

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

## 6. Copiar sesiones desde tu PC (tienes auth en ngrok)

Desde PowerShell en tu PC:

```powershell
cd c:\Users\andre\halconsoft\wsapi
scp -r auth_sessions root@TU_IP_VULTR:/opt/wsapi/
scp src/baileys-manager.js root@TU_IP_VULTR:/opt/wsapi/src/
scp src/index.js root@TU_IP_VULTR:/opt/wsapi/src/
```

## 7. Iniciar con PM2

```bash
npm install -g pm2
cd /opt/wsapi
pm2 start src/index.js --name wsapi
pm2 startup
pm2 save
```

## 8. Abrir firewall

```bash
ufw allow 22
ufw allow 3000
ufw enable
```

## 9. Probar

- **Panel:** http://TU_IP_VULTR:3000/pair
- **Estado:** http://TU_IP_VULTR:3000/health
- **Traccar:** http://TU_IP_VULTR:3000/messages/chat?to=%NUMBER%&body=%MESSAGE%&priority=10
