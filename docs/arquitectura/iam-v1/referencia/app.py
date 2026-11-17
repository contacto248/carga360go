import os, hashlib, secrets, uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt, pyotp
from cryptography.fernet import Fernet
from fastapi import FastAPI, Depends, HTTPException, Request, Response, Cookie
from pydantic import BaseModel, EmailStr
from pydantic_settings import BaseSettings
from pwdlib import PasswordHash
from sqlalchemy import create_engine, text

class Settings(BaseSettings):
    database_url:str=os.getenv('DATABASE_URL','postgresql+psycopg://carga360:change-me-now@localhost:5432/carga360')
    jwt_secret:str=os.getenv('JWT_SECRET','dev-only-change-me')
    mfa_encryption_key:str=os.getenv('MFA_ENCRYPTION_KEY','')
    access_token_minutes:int=int(os.getenv('ACCESS_TOKEN_MINUTES','15'))
    refresh_token_days:int=int(os.getenv('REFRESH_TOKEN_DAYS','30'))
    cookie_secure:bool=os.getenv('COOKIE_SECURE','false').lower()=='true'
s=Settings(); engine=create_engine(s.database_url,pool_pre_ping=True); ph=PasswordHash.recommended()
fernet=Fernet(s.mfa_encryption_key.encode()) if s.mfa_encryption_key else Fernet(Fernet.generate_key())
app=FastAPI(title='Carga360GO IAM',version='1.0.0')

def now(): return datetime.now(timezone.utc)
def sha(v): return hashlib.sha256(v.encode()).hexdigest()
def audit(conn,event,result,request:Request,user=None,tenant=None,target_type=None,target_id=None,meta=None):
    conn.execute(text("INSERT INTO audit_logs(event,result,actor_user_id,tenant_id,target_type,target_id,ip,user_agent,trace_id,metadata) VALUES(:e,:r,:u,:t,:tt,:ti,:ip,:ua,:tr,CAST(:m AS jsonb))"),dict(e=event,r=result,u=user,t=tenant,tt=target_type,ti=target_id,ip=request.client.host if request.client else None,ua=request.headers.get('user-agent'),tr=request.headers.get('x-request-id',str(uuid.uuid4())),m=__import__('json').dumps(meta or {})))
def token(user,tenant,ver,mfa):
    return jwt.encode({'sub':str(user),'tenant':str(tenant) if tenant else None,'ver':ver,'mfa':mfa,'exp':now()+timedelta(minutes=s.access_token_minutes)},s.jwt_secret,algorithm='HS256')
def bearer(req:Request):
    h=req.headers.get('authorization','');
    if not h.startswith('Bearer '): raise HTTPException(401,'Token requerido')
    try: return jwt.decode(h[7:],s.jwt_secret,algorithms=['HS256'])
    except jwt.PyJWTError: raise HTTPException(401,'Token inválido o caducado')
def current(req:Request):
    p=bearer(req)
    with engine.begin() as c:
        u=c.execute(text("SELECT id,tenant_id,status,token_version,mfa_required FROM users WHERE id=:id"),{'id':p['sub']}).mappings().first()
        if not u or u['status']!='ACTIVE' or u['token_version']!=p['ver']: raise HTTPException(401,'Sesión no válida')
        return dict(u)|{'mfa':bool(p.get('mfa'))}
def require_perm(code):
    def dep(u=Depends(current)):
        with engine.begin() as c:
            ok=c.execute(text("SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=:u AND p.code=:p LIMIT 1"),{'u':u['id'],'p':code}).first()
        if not ok: raise HTTPException(403,'Permiso insuficiente')
        return u
    return dep
class Login(BaseModel): email:EmailStr; password:str; otp:Optional[str]=None
class MFASetup(BaseModel): otp:str
class Refresh(BaseModel): refresh_token:Optional[str]=None
class RoleAssign(BaseModel): user_id:uuid.UUID; role_code:str

@app.get('/health')
def health(): return {'status':'ok'}
@app.post('/auth/login')
def login(x:Login,request:Request,response:Response):
    with engine.begin() as c:
        u=c.execute(text("SELECT * FROM users WHERE lower(email)=lower(:e)"),{'e':x.email}).mappings().first()
        if not u or not u['password_hash'] or not ph.verify(x.password,u['password_hash']):
            if u: c.execute(text("UPDATE users SET failed_login_count=failed_login_count+1,locked_until=CASE WHEN failed_login_count>=4 THEN now()+interval '15 minutes' ELSE locked_until END WHERE id=:id"),{'id':u['id']})
            audit(c,'auth.login_failed','DENIED',request,u['id'] if u else None,u['tenant_id'] if u else None); raise HTTPException(401,'Credenciales no válidas')
        if u['status']!='ACTIVE' or (u['locked_until'] and u['locked_until']>now()): raise HTTPException(403,'Cuenta no disponible')
        mfa=False
        if u['mfa_enabled']:
            if not x.otp: raise HTTPException(428,'MFA_REQUIRED')
            secret=fernet.decrypt(u['mfa_secret_enc'].encode()).decode()
            if not pyotp.TOTP(secret).verify(x.otp,valid_window=1): audit(c,'auth.mfa_failed','DENIED',request,u['id'],u['tenant_id']); raise HTTPException(401,'MFA no válido')
            mfa=True
        refresh=secrets.token_urlsafe(48); sid=uuid.uuid4(); exp=now()+timedelta(days=s.refresh_token_days)
        c.execute(text("INSERT INTO sessions(id,user_id,refresh_hash,ip,user_agent,expires_at) VALUES(:id,:u,:h,:ip,:ua,:e)"),dict(id=sid,u=u['id'],h=sha(refresh),ip=request.client.host if request.client else None,ua=request.headers.get('user-agent'),e=exp))
        c.execute(text("UPDATE users SET failed_login_count=0,locked_until=NULL,last_login_at=now() WHERE id=:id"),{'id':u['id']}); audit(c,'auth.login_success','SUCCESS',request,u['id'],u['tenant_id'])
        access=token(u['id'],u['tenant_id'],u['token_version'],mfa)
        response.set_cookie('refresh_token',refresh,httponly=True,secure=s.cookie_secure,samesite='strict',max_age=s.refresh_token_days*86400,path='/auth')
        return {'access_token':access,'token_type':'bearer','expires_in':s.access_token_minutes*60,'mfa':mfa}
@app.post('/auth/refresh')
def refresh(x:Refresh,request:Request,response:Response,refresh_cookie:Optional[str]=Cookie(None,alias='refresh_token')):
    raw=x.refresh_token or refresh_cookie
    if not raw: raise HTTPException(401,'Refresh token requerido')
    with engine.begin() as c:
        row=c.execute(text("SELECT s.id,s.user_id,u.tenant_id,u.token_version,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.refresh_hash=:h AND s.state='ACTIVE' AND s.expires_at>now()"),{'h':sha(raw)}).mappings().first()
        if not row or row['status']!='ACTIVE': raise HTTPException(401,'Sesión no válida')
        nxt=secrets.token_urlsafe(48); c.execute(text("UPDATE sessions SET refresh_hash=:h,last_seen_at=now() WHERE id=:id"),{'h':sha(nxt),'id':row['id']}); audit(c,'session.refresh','SUCCESS',request,row['user_id'],row['tenant_id'])
        response.set_cookie('refresh_token',nxt,httponly=True,secure=s.cookie_secure,samesite='strict',max_age=s.refresh_token_days*86400,path='/auth')
        return {'access_token':token(row['user_id'],row['tenant_id'],row['token_version'],False),'token_type':'bearer'}
@app.post('/auth/logout')
def logout(request:Request,response:Response,refresh_token:Optional[str]=Cookie(None)):
    if refresh_token:
        with engine.begin() as c: c.execute(text("UPDATE sessions SET state='REVOKED',revoked_at=now(),revoke_reason='logout' WHERE refresh_hash=:h"),{'h':sha(refresh_token)})
    response.delete_cookie('refresh_token',path='/auth'); return {'ok':True}
@app.post('/auth/logout-all')
def logout_all(request:Request,u=Depends(current)):
    with engine.begin() as c:
        c.execute(text("UPDATE sessions SET state='REVOKED',revoked_at=now(),revoke_reason='logout_all' WHERE user_id=:u AND state='ACTIVE'"),{'u':u['id']}); c.execute(text("UPDATE users SET token_version=token_version+1 WHERE id=:u"),{'u':u['id']}); audit(c,'session.revoke_all','SUCCESS',request,u['id'],u['tenant_id'])
    return {'ok':True}
@app.post('/auth/mfa/setup')
def mfa_setup(request:Request,u=Depends(current)):
    secret=pyotp.random_base32(); enc=fernet.encrypt(secret.encode()).decode()
    with engine.begin() as c: c.execute(text("UPDATE users SET mfa_secret_enc=:s WHERE id=:u"),{'s':enc,'u':u['id']}); audit(c,'mfa.setup_started','SUCCESS',request,u['id'],u['tenant_id'])
    return {'secret':secret,'otpauth_uri':pyotp.TOTP(secret).provisioning_uri(name=str(u['id']),issuer_name='Carga360GO')}
@app.post('/auth/mfa/enable')
def mfa_enable(x:MFASetup,request:Request,u=Depends(current)):
    with engine.begin() as c:
        row=c.execute(text("SELECT mfa_secret_enc FROM users WHERE id=:u"),{'u':u['id']}).first();
        if not row or not row[0]: raise HTTPException(400,'Inicia primero la configuración MFA')
        if not pyotp.TOTP(fernet.decrypt(row[0].encode()).decode()).verify(x.otp,valid_window=1): raise HTTPException(400,'Código MFA no válido')
        c.execute(text("UPDATE users SET mfa_enabled=true WHERE id=:u"),{'u':u['id']}); audit(c,'mfa.enabled','SUCCESS',request,u['id'],u['tenant_id'])
    return {'enabled':True}
@app.get('/me')
def me(u=Depends(current)):
    with engine.begin() as c:
        roles=[r[0] for r in c.execute(text("SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=:u"),{'u':u['id']})]; perms=[r[0] for r in c.execute(text("SELECT DISTINCT p.code FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=:u"),{'u':u['id']})]
    return {'user_id':u['id'],'tenant_id':u['tenant_id'],'roles':roles,'permissions':perms,'mfa':u['mfa']}
@app.post('/admin/roles/assign')
def role_assign(x:RoleAssign,request:Request,u=Depends(require_perm('role.assign'))):
    if not u['mfa']: raise HTTPException(403,'MFA requerido para asignar roles')
    with engine.begin() as c:
        role=c.execute(text("SELECT id FROM roles WHERE code=:c"),{'c':x.role_code}).first();
        if not role: raise HTTPException(404,'Rol no existe')
        c.execute(text("INSERT INTO user_roles(user_id,role_id,tenant_id) SELECT :uid,:rid,tenant_id FROM users WHERE id=:uid ON CONFLICT DO NOTHING"),{'uid':x.user_id,'rid':role[0]}); audit(c,'role.assigned','SUCCESS',request,u['id'],u['tenant_id'],'user',str(x.user_id),{'role':x.role_code})
    return {'ok':True}
@app.get('/admin/audit')
def audit_list(limit:int=100,u=Depends(require_perm('audit.read'))):
    with engine.begin() as c: rows=c.execute(text("SELECT id,occurred_at,event,actor_user_id,tenant_id,target_type,target_id,result,trace_id,metadata FROM audit_logs ORDER BY id DESC LIMIT :l"),{'l':min(limit,500)}).mappings().all()
    return [dict(r) for r in rows]
