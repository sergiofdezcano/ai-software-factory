# Runbook: la AI Factory en orca-studio

Para una sesión de Claude Code en **orca-studio** (Ubuntu), con un usuario que pueda usar `sudo`. Sigue los pasos en orden y, después de cada uno, cuéntale a Sergio en una línea qué ha pasado. **Para en cuanto algo falle** y no improvises nada que no diga este documento.

La fábrica corre como el usuario `factory`, sin acceso a `/srv/projects` ni a la configuración de Sergio. Todo lo suyo vive en `/srv/factory`:

| Ruta | Qué hay |
|---|---|
| `/srv/factory/ai-software-factory` | el repo de la fábrica y sus `runs/` |
| `/srv/factory/apps/<app>` | los clones de las apps |
| `/etc/ai-factory/env` | los secretos (permisos 600, propiedad de `factory`) |

Los pasos marcados **[Proxmox]** son para el host Proxmox, donde vive el LXC viejo. Si la sesión no tiene acceso a él, los ejecuta Sergio y te pasa el resultado.

## 0. Comprobar la máquina
- `sudo -v`, `lsb_release -d`, `nproc`, `free -h` y `df -h /srv`. Un build con Playwright necesita unos 2 núcleos y 4 GB libres.
- `node -v`: si existe y no es v24, para. El instalador no cambia un Node que pueden estar usando otros servicios.
- `id factory`: si ya existe, comprueba con Sergio que no es de otra cosa.

## 1. Primera instalación
```bash
curl -fsSL https://raw.githubusercontent.com/sergiofdezcano/ai-software-factory/main/deploy/install.sh -o /tmp/install-factory.sh
sudo bash /tmp/install-factory.sh
```
Instala lo que falte (gh, Codex y Claude Code para `factory`) y crea `/etc/ai-factory/env` vacío.

## 2. Secretos: los del LXC viejo
**[Proxmox]**: `pct pull <CTID> /etc/ai-factory/env /root/ai-factory.env`, y luego `scp` de ese archivo a orca-studio en `/tmp/ai-factory.env`.

En orca-studio:
```bash
sudo install -m 600 -o factory -g factory /tmp/ai-factory.env /etc/ai-factory/env
sudo sed -i 's|^FACTORY_APPS_DIR=.*|FACTORY_APPS_DIR=/srv/factory/apps|' /etc/ai-factory/env
rm /tmp/ai-factory.env
```
**[Proxmox]**: `rm /root/ai-factory.env`. No enseñes los valores en ningún momento. Para comprobarlo sin verlos: `sudo grep -c '=.\+' /etc/ai-factory/env`.

Claude no necesita login: usa el `CLAUDE_CODE_OAUTH_TOKEN` del env.

## 3. Segunda instalación
```bash
sudo bash /tmp/install-factory.sh
```
Clona la fábrica y las apps, instala Playwright y deja instalado el servicio `ai-factory` sin activarlo.

## 4. Login de Codex (con Sergio)
```bash
sudo su - factory -c "codex login --device-auth"
```
Pasa a Sergio la URL y el código; él lo valida desde el móvil. Comprueba con `sudo su - factory -c "codex login status"`, que debe decir `Logged in using ChatGPT`.

## 5. Prueba sin tocar nada
```bash
sudo su - factory -c "set -a; . /etc/ai-factory/env; set +a; cd /srv/factory/ai-software-factory && npx tsx src/cli.ts watch --once --dry-run"
sudo su - factory -c "cd /srv/factory/apps/landing && echo 'Responde solo: ok' | codex exec --ignore-user-config --sandbox read-only --skip-git-repo-check -"
```
Los dos tienen que terminar sin errores.

## 6. Corte (Sergio confirma antes)
Nunca puede haber dos fábricas a la vez.

1. Comprueba que no hay ninguna tarea a medias. En cada repo de `apps.yml`:
   `gh issue list -R <repo> --state open --label factory:building` y lo mismo con `factory:reviewing`, `factory:spec` y `factory:awaiting-spec`.
   Si alguna aparece, espera a que termine o pregunta a Sergio. Un run a medias guarda rutas del LXC y no se puede retomar aquí.
2. **[Proxmox]** Para la fábrica vieja y saca su historial:
   ```bash
   pct exec <CTID> -- systemctl disable --now ai-factory
   pct exec <CTID> -- tar -C /opt/ai-factory -czf /root/runs.tgz runs
   pct pull <CTID> /root/runs.tgz /root/runs.tgz
   ```
   `scp` de `/root/runs.tgz` a orca-studio en `/tmp/runs.tgz`.
3. En orca-studio, restaura el historial (sin worktrees viejos) y arranca:
   ```bash
   sudo su - factory -c "tar -C /srv/factory/ai-software-factory -xzf /tmp/runs.tgz && rm -rf /srv/factory/ai-software-factory/runs/*/worktree"
   rm /tmp/runs.tgz
   sudo systemctl enable --now ai-factory
   sudo systemctl --no-pager status ai-factory | head -5
   sudo journalctl -u ai-factory -n 30 --no-pager
   ```
4. Prueba real: Sergio pide por Telegram una tarea pequeña. Sigue el issue hasta el aviso final, y con `npx tsx src/cli.ts status <app> <issue>` (como `factory`) apunta el coste.

## 7. Apagar el LXC viejo (Sergio confirma antes)
**[Proxmox]**:
```bash
vzdump <CTID> --mode stop --compress zstd
pct set <CTID> --onboot 0
pct stop <CTID>
```
Sergio lo destruye (`pct destroy <CTID>`) cuando la fábrica lleve una semana funcionando bien aquí.

## Mantenimiento
- Actualizar tras mergear cambios en la fábrica: `sudo bash /srv/factory/ai-software-factory/deploy/update.sh`.
- Estado: `systemctl status ai-factory` y `journalctl -u ai-factory`.
- Registro de cada tarea: `/srv/factory/ai-software-factory/runs/<app>-<issue>/`.
- Hermes no cambia: solo crea issues y lee su estado en GitHub.
