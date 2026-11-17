CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE TYPE user_status AS ENUM ('PENDING','ACTIVE','SUSPENDED','DISABLED');
CREATE TYPE principal_type AS ENUM ('HUMAN','AI_SERVICE','INTEGRATION_SERVICE');
CREATE TYPE session_state AS ENUM ('ACTIVE','REVOKED','EXPIRED');
CREATE TYPE approval_state AS ENUM ('PENDING','APPROVED','REJECTED','EXPIRED');

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  email citext UNIQUE NOT NULL,
  password_hash text,
  display_name text NOT NULL,
  principal principal_type NOT NULL DEFAULT 'HUMAN',
  status user_status NOT NULL DEFAULT 'PENDING',
  email_verified_at timestamptz,
  mfa_required boolean NOT NULL DEFAULT false,
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret_enc text,
  token_version integer NOT NULL DEFAULT 0,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, name text NOT NULL, system boolean NOT NULL DEFAULT true);
CREATE TABLE permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, description text NOT NULL);
CREATE TABLE role_permissions (role_id uuid REFERENCES roles(id) ON DELETE CASCADE, permission_id uuid REFERENCES permissions(id) ON DELETE CASCADE, PRIMARY KEY(role_id,permission_id));
CREATE TABLE user_roles (user_id uuid REFERENCES users(id) ON DELETE CASCADE, role_id uuid REFERENCES roles(id) ON DELETE CASCADE, tenant_id uuid REFERENCES tenants(id), PRIMARY KEY(user_id,role_id));
CREATE TABLE sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 refresh_hash text NOT NULL UNIQUE, state session_state NOT NULL DEFAULT 'ACTIVE', ip inet, user_agent text,
 created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz, revoke_reason text
);
CREATE TABLE mfa_recovery_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, code_hash text NOT NULL, used_at timestamptz);
CREATE TABLE audit_logs (
 id bigserial PRIMARY KEY, occurred_at timestamptz NOT NULL DEFAULT now(), event text NOT NULL,
 actor_user_id uuid REFERENCES users(id), tenant_id uuid REFERENCES tenants(id), target_type text, target_id text,
 result text NOT NULL, ip inet, user_agent text, trace_id text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE approval_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id), requested_by uuid REFERENCES users(id),
 action text NOT NULL, resource_type text NOT NULL, resource_id text, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 state approval_state NOT NULL DEFAULT 'PENDING', decided_by uuid REFERENCES users(id), decided_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO roles(code,name) VALUES
('SUPER_ADMIN','Superadministrador'),('TENANT_ADMIN','Administrador empresa'),('SECURITY_ADMIN','Administrador seguridad'),('OPERATIONS_MANAGER','Jefe operaciones'),('DISPATCHER','Despachador'),('SALES_MANAGER','Jefe comercial'),('SALES_AGENT','Ejecutivo comercial'),('DOCUMENT_CONTROLLER','Control documental'),('FINANCE_MANAGER','Jefe finanzas'),('TRACKING_OPERATOR','Operador tracking'),('SUPPORT_AGENT','Soporte'),('CUSTOMER_ADMIN','Administrador cliente'),('CUSTOMER_USER','Usuario cliente'),('CARRIER_ADMIN','Administrador transportista'),('CARRIER_OPERATOR','Operador transportista'),('DRIVER','Conductor'),('AUDITOR','Auditor'),('AI_SERVICE','Servicio IA'),('INTEGRATION_SERVICE','Servicio integración');
INSERT INTO permissions(code,description) VALUES
('shipment.read','Leer cargas'),('shipment.create','Crear cargas'),('shipment.update','Modificar cargas'),('shipment.cancel','Cancelar cargas'),
('quote.read','Leer cotizaciones'),('quote.create','Crear cotizaciones'),('quote.approve','Aprobar cotizaciones'),('carrier.assign','Asignar transportista'),
('tracking.read','Leer tracking'),('tracking.update','Actualizar tracking'),('document.upload','Subir documentos'),('document.validate','Validar documentos'),
('incident.create','Crear incidencias'),('incident.resolve','Resolver incidencias'),('invoice.read','Leer facturas'),('invoice.approve','Aprobar facturas'),
('user.create','Crear usuarios'),('user.disable','Deshabilitar usuarios'),('role.assign','Asignar roles'),('audit.read','Leer auditoría'),('ai.execute','Ejecutar IA'),('approval.approve','Aprobar acciones');
-- Permisos administrativos. El resto se asigna explícitamente según política de negocio.
INSERT INTO role_permissions(role_id, permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.code='SUPER_ADMIN';
INSERT INTO role_permissions(role_id, permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('user.create','user.disable','role.assign','audit.read','approval.approve') WHERE r.code='SECURITY_ADMIN';
INSERT INTO role_permissions(role_id, permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('shipment.read','shipment.create','shipment.update','carrier.assign','tracking.read','incident.create','incident.resolve') WHERE r.code='OPERATIONS_MANAGER';
INSERT INTO role_permissions(role_id, permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('shipment.read','carrier.assign','tracking.read','tracking.update') WHERE r.code='DISPATCHER';
INSERT INTO role_permissions(role_id, permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('quote.read','quote.create','quote.approve','shipment.read') WHERE r.code='SALES_MANAGER';
INSERT INTO role_permissions(role_id, permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('quote.read','quote.create','shipment.read') WHERE r.code='SALES_AGENT';
INSERT INTO role_permissions(role_id, permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('document.upload','document.validate','shipment.read') WHERE r.code='DOCUMENT_CONTROLLER';
INSERT INTO role_permissions(role_id, permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('invoice.read','invoice.approve','audit.read') WHERE r.code='FINANCE_MANAGER';
INSERT INTO role_permissions(role_id, permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('tracking.read','tracking.update','incident.create') WHERE r.code='TRACKING_OPERATOR';
INSERT INTO role_permissions(role_id, permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('shipment.read','tracking.read','document.upload') WHERE r.code IN ('CUSTOMER_ADMIN','CUSTOMER_USER','CARRIER_ADMIN','CARRIER_OPERATOR');
INSERT INTO role_permissions(role_id, permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('tracking.read','tracking.update','document.upload','incident.create') WHERE r.code='DRIVER';
INSERT INTO role_permissions(role_id, permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('audit.read','shipment.read','quote.read','tracking.read','invoice.read') WHERE r.code='AUDITOR';
INSERT INTO role_permissions(role_id, permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.code IN ('ai.execute','shipment.read','quote.read','tracking.read') WHERE r.code='AI_SERVICE';
