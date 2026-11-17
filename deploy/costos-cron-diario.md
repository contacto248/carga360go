# Cron diario del diésel

`deploy/costos-jobs.sh` ya refresca el diésel y revisa los PDF de peajes. Lee `COSTOS_CRON_SECRET` desde el `.env` del servidor (por defecto `/opt/carga360go/.env`) y lo pasa a `POST /api/costos/cron` por un archivo temporal, no por la línea de comandos.

El cron de cada 6 horas sigue en `deploy/carga360go-costos.cron`. El diario lo extiende: misma URL, mismo secreto, una vez al día.

Orden de la fuente de diésel, sin credenciales:

1. CNE – Bencina en Línea (archivo zonal público).
2. Si esa fuente no responde, ENAP (informe semanal público). Solo se guarda un precio si el informe trae un valor absoluto. Una variación semanal no reemplaza el histórico.
3. Si ninguna responde, la calculadora usa el último precio guardado y muestra su fecha. Con ese precio no muestra «Total pendiente».

## Instalar

En el servidor, con el código en `/opt/carga360go` y `COSTOS_CRON_SECRET` ya definido en el `.env` (32 caracteres o más). No copies el secreto al cron ni al repositorio.

```sh
sudo install -m 644 /opt/carga360go/deploy/carga360go-costos-diario.cron /etc/cron.d/carga360go-costos-diario
sudo mkdir -p /var/lib/carga360go
sudo chown carga360go:carga360go /var/lib/carga360go
```

El horario del archivo es 15:10 UTC. El usuario de cron es `carga360go`. La salida queda en `/var/lib/carga360go/costos-jobs.log`.

Comprobar sin revelar el secreto:

```sh
sudo -u carga360go /opt/carga360go/deploy/costos-jobs.sh
tail -n 5 /var/lib/carga360go/costos-jobs.log
```

Una línea `200` indica que el endpoint aceptó el job. `000` indica que faltaba `COSTOS_CRON_SECRET` en el `.env`.
