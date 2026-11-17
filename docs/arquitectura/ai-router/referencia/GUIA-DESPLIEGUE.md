# Guia de despliegue

## Requisitos
Docker Engine y Docker Compose v2, DNS del dominio y un proxy/TLS de produccion.

## Ejecucion
```bash
cp .env.example .env
# Editar .env: contrasenas, JWT_SECRET y claves API
docker compose up -d --build
docker compose ps
curl http://localhost/health
```

## Crear primer administrador
Genera un hash Argon2:
```bash
docker compose exec api python -c "from passlib.context import CryptContext; print(CryptContext(schemes=['argon2']).hash(input('Clave: ')))"
```
En PostgreSQL, crea tenant y usuario, y asigna `SUPER_ADMIN`:
```sql
with t as (insert into tenants(name) values('Carga360GO') returning id),
u as (insert into users(tenant_id,email,password_hash) select id,'admin@tu-dominio.cl','PEGA_HASH_ARGON2' from t returning id)
insert into user_roles(user_id,role_id) select u.id,r.id from u cross join roles r where r.name='SUPER_ADMIN';
```

## Prueba funcional
1. POST `/v1/auth/login` como formulario con `username` y `password`.
2. Usa el bearer token en POST `/v1/ai/orchestrate`.
3. `provider=auto` elige el proveedor configurado con menor suma de precios de entrada/salida.
4. Si falla, intenta el otro proveedor y registra `fallback_used=true`.

## Produccion
Usa HTTPS, secretos gestionados, copias PostgreSQL, rotacion de claves, alertas de `/health`, restriccion de `/docs`, revision de logs y pruebas de restauracion. Este paquete no incluye certificados ni claves.
