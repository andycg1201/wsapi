#!/bin/bash
# Configuración inicial del VPS: bash setup-vps.sh
# 1. Copia settings.json (alertas admin + umbral antigüedad)
# 2. Instala la clave SSH del PC de Andre para acceso directo

cd /opt/wsapi

cp -f config/settings.halconsoft.json config/settings.json
echo "settings.json instalado"

mkdir -p /root/.ssh
chmod 700 /root/.ssh
KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDPB2Hco/ng9xzFb6D+32P2DIuKVajT57+VU3JmBLMHW andre@Halconsat"
if ! grep -q "andre@Halconsat" /root/.ssh/authorized_keys 2>/dev/null; then
  echo "$KEY" >> /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
  echo "Clave SSH instalada"
else
  echo "Clave SSH ya estaba instalada"
fi

pm2 restart wsapi
echo "Listo. Verifica con: grep Ajustes /root/.pm2/logs/wsapi-out.log"
