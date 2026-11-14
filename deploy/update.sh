#!/usr/bin/env bash
# Actualiza la fábrica en el servidor tras mergear cambios en main. Como root.
set -euo pipefail
su - factory -c "git -C /srv/factory/ai-software-factory pull -q --ff-only && cd /srv/factory/ai-software-factory && npm ci --no-audit --no-fund >/dev/null"
install -m 0644 /srv/factory/ai-software-factory/deploy/ai-factory.service /etc/systemd/system/ai-factory.service
systemctl daemon-reload
# Si hay un run en curso, systemd lo corta; el siguiente arranque lo retoma desde el último paso guardado.
systemctl restart ai-factory
systemctl --no-pager status ai-factory | head -5
