@echo off
cd /d E:\workspace_hermes\ListenApp
echo Starting Expo... > E:\workspace_hermes\ListenApp\expo_log.txt
npx expo start --lan --port 8082 >> E:\workspace_hermes\ListenApp\expo_log.txt 2>&1
