#!/bin/bash
# Script para aplicar el parche de conexión perezosa en el VPS
# Ejecutar en el VPS: bash -c "$(curl -sL https://raw.githubusercontent.com/...)" 
# O copiar los archivos manualmente con SCP

cd /opt/wsapi || exit 1

# Backup
cp src/baileys-manager.js src/baileys-manager.js.bak 2>/dev/null || true
cp src/index.js src/index.js.bak 2>/dev/null || true

echo "Archivos listos para parchear. Usa SCP para copiar desde tu PC."
