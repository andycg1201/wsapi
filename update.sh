#!/bin/bash
# Actualiza WSAPI en el VPS: bash update.sh
set -e
cd /opt/wsapi
git pull origin main
npm install
pm2 restart wsapi
pm2 status
