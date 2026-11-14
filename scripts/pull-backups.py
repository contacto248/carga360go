#!/usr/bin/env python3
"""Copia fuera del servidor de los respaldos cifrados de Carga360go.

Descarga por SFTP los .tar.gz.gpg nuevos de /var/backups/carga360go/{daily,weekly}, verifica su sha256,
prueba descifrar el más reciente (si hay clave local), aplica la retención (14 diarios, 8 semanales) y,
si el último respaldo del servidor tiene más de 26 horas, dispara la alerta por correo en el servidor.

Configuración por variables de entorno (valores por defecto para el equipo de respaldo de Bastian):
  C360_HOST, C360_PORT, C360_USER, C360_PASSWORD_FILE, C360_LOCAL_DIR, C360_KEY_FILE
Salida: una línea JSON con el resumen. Código de salida 0 = todo bien, 1 = hay un problema.
"""
import calendar, hashlib, json, os, subprocess, sys, time

import paramiko

HOST = os.environ.get("C360_HOST", "192.141.168.203")
PORT = int(os.environ.get("C360_PORT", "60000"))
USER = os.environ.get("C360_USER", "irprgxxh")
PASSWORD_FILE = os.environ.get("C360_PASSWORD_FILE", "/home/box/secure/carga360_vps_pw.txt")
LOCAL = os.environ.get("C360_LOCAL_DIR", "/home/box/backups/carga360go")
KEY_FILE = os.environ.get("C360_KEY_FILE", "/home/box/secure/carga360_backup_key.txt")
REMOTE = "/var/backups/carga360go"
KEEP = {"daily": 14, "weekly": 8}
MAX_AGE_H = 26


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    summary = {"ok": True, "downloaded": [], "problems": []}
    os.umask(0o077)
    with open(PASSWORD_FILE) as f:
        password = f.read().strip()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, PORT, USER, password, timeout=30)
    sftp = ssh.open_sftp()
    try:
        status = json.loads(sftp.open(f"{REMOTE}/last-success.json").read().decode())
        summary["lastServerBackup"] = status
        age_h = (time.time() - calendar.timegm(time.strptime(status["at"], "%Y-%m-%dT%H:%M:%SZ"))) / 3600
        summary["lastServerBackupAgeHours"] = round(age_h, 1)
        if age_h > MAX_AGE_H:
            summary["problems"].append(f"El último respaldo del servidor tiene {age_h:.0f} horas")
    except FileNotFoundError:
        summary["problems"].append("El servidor no tiene last-success.json (ningún respaldo correcto)")

    for kind, keep in KEEP.items():
        local_dir = os.path.join(LOCAL, kind)
        os.makedirs(local_dir, exist_ok=True)
        remote_files = sorted(n for n in sftp.listdir(f"{REMOTE}/{kind}") if n.endswith(".tar.gz.gpg"))
        for name in remote_files:
            dest = os.path.join(local_dir, name)
            if os.path.exists(dest):
                continue
            tmp = dest + ".part"
            sftp.get(f"{REMOTE}/{kind}/{name}", tmp)
            expected = sftp.open(f"{REMOTE}/{kind}/{name}.sha256").read().decode().split()[0]
            if sha256(tmp) != expected:
                os.remove(tmp)
                summary["problems"].append(f"sha256 no coincide: {kind}/{name}")
                continue
            os.replace(tmp, dest)
            with open(dest + ".sha256", "w") as f:
                f.write(f"{expected}  {name}\n")
            summary["downloaded"].append(f"{kind}/{name}")
        local_files = sorted((n for n in os.listdir(local_dir) if n.endswith(".tar.gz.gpg")), reverse=True)
        for old in local_files[keep:]:
            for path in (os.path.join(local_dir, old), os.path.join(local_dir, old + ".sha256")):
                if os.path.exists(path):
                    os.remove(path)
        summary[kind] = sorted(n for n in os.listdir(local_dir) if n.endswith(".tar.gz.gpg"))

    newest = summary["daily"][-1] if summary.get("daily") else None
    if newest and os.path.exists(KEY_FILE):
        path = os.path.join(LOCAL, "daily", newest)
        dec = subprocess.run(
            f"gpg --batch --quiet --pinentry-mode loopback --passphrase-file '{KEY_FILE}' -d '{path}' | tar -tzf - | head -n 50",
            shell=True, capture_output=True, text=True,
        )
        members = [m for m in dec.stdout.splitlines() if m]
        summary["newestDecrypts"] = dec.returncode == 0 and "carga360go.sqlite" in members
        if not summary["newestDecrypts"]:
            summary["problems"].append(f"No se pudo descifrar {newest}")

    if summary["problems"]:
        summary["ok"] = False
        msg = "Copia externa: " + "; ".join(summary["problems"])
        _, out, err = ssh.exec_command(f"sudo /usr/local/sbin/carga360go-backup-alert {json.dumps(msg)}")
        summary["alert"] = (out.read().decode() + err.read().decode()).strip()[-300:]
    sftp.close()
    ssh.close()
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
