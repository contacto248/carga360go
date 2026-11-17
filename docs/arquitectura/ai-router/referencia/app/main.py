import os, time, uuid, hashlib, asyncio
from datetime import datetime, timedelta, timezone
from typing import Literal
import httpx, jwt, pyotp
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field
from passlib.context import CryptContext
from sqlalchemy import create_engine, text

APP_NAME='Carga360GO Unificado'
DB=os.getenv('DATABASE_URL','postgresql+psycopg://carga360:cambia_esto@db:5432/carga360')
JWT_SECRET=os.getenv('JWT_SECRET','CAMBIAR_EN_PRODUCCION')
JWT_ALG='HS256'; ACCESS_MIN=int(os.getenv('ACCESS_TOKEN_MINUTES','30'))
OPENAI_KEY=os.getenv('OPENAI_API_KEY',''); XAI_KEY=os.getenv('XAI_API_KEY','')
OPENAI_MODEL=os.getenv('OPENAI_MODEL','gpt-5-mini'); XAI_MODEL=os.getenv('XAI_MODEL','grok-4.7')
OPENAI_INPUT_USD=float(os.getenv('OPENAI_INPUT_USD_PER_M','0.25')); OPENAI_OUTPUT_USD=float(os.getenv('OPENAI_OUTPUT_USD_PER_M','2.0'))
XAI_INPUT_USD=float(os.getenv('XAI_INPUT_USD_PER_M','2.0')); XAI_OUTPUT_USD=float(os.getenv('XAI_OUTPUT_USD_PER_M','6.0'))
TIMEOUT=float(os.getenv('PROVIDER_TIMEOUT_SECONDS','120'))
engine=create_engine(DB,pool_pre_ping=True)
pwd=CryptContext(schemes=['argon2'],deprecated='auto'); oauth=OAuth2PasswordBearer(tokenUrl='/v1/auth/login')
app=FastAPI(title=APP_NAME,version='1.0.0')

class TokenOut(BaseModel): access_token:str; token_type:str='bearer'; expires_in:int
class MFAIn(BaseModel): code:str=Field(min_length=6,max_length=8)
class Ask(BaseModel):
    prompt:str=Field(min_length=1,max_length=100000)
    provider:Literal['auto','openai','xai','both']='auto'
    max_output_tokens:int=Field(default=1200,ge=1,le=8000)
class UserCreate(BaseModel): email:EmailStr; password:str=Field(min_length=12); tenant_id:uuid.UUID; role:str='USER'

def audit(event, user_id=None, tenant_id=None, detail=None):
    with engine.begin() as c:
        c.execute(text('insert into audit_logs(event,user_id,tenant_id,detail) values(:e,:u,:t,cast(:d as jsonb))'), {'e':event,'u':user_id,'t':tenant_id,'d':__import__('json').dumps(detail or {})})

def token_for(row,mfa=False):
    now=datetime.now(timezone.utc); exp=now+timedelta(minutes=ACCESS_MIN)
    payload={'sub':str(row['id']),'tenant_id':str(row['tenant_id']),'roles':row['roles'] or [],'permissions':row['permissions'] or [],'mfa':mfa,'iat':int(now.timestamp()),'exp':int(exp.timestamp()),'jti':str(uuid.uuid4())}
    return jwt.encode(payload,JWT_SECRET,algorithm=JWT_ALG)

def current(token:str=Depends(oauth)):
    try: p=jwt.decode(token,JWT_SECRET,algorithms=[JWT_ALG])
    except jwt.PyJWTError: raise HTTPException(401,'Token no valido o expirado')
    with engine.begin() as c:
        revoked=c.execute(text('select 1 from revoked_tokens where jti=:j'),{'j':p['jti']}).first()
        user=c.execute(text('select active from users where id=:u'),{'u':p['sub']}).mappings().first()
    if revoked or not user or not user['active']: raise HTTPException(401,'Sesion revocada')
    return p

def require(permission):
    def dep(u=Depends(current)):
        if 'SUPER_ADMIN' not in u['roles'] and permission not in u['permissions']: raise HTTPException(403,'Permiso insuficiente')
        return u
    return dep

@app.get('/health')
def health():
    db_ok=True
    try:
        with engine.connect() as c: c.execute(text('select 1'))
    except Exception: db_ok=False
    return {'status':'ok' if db_ok else 'degraded','database':db_ok,'openai_configured':bool(OPENAI_KEY),'xai_configured':bool(XAI_KEY)}

@app.post('/v1/auth/login',response_model=TokenOut)
def login(f:OAuth2PasswordRequestForm=Depends()):
    with engine.begin() as c:
        r=c.execute(text('''select u.id,u.tenant_id,u.password_hash,u.active,u.mfa_enabled,
        coalesce(array_agg(distinct r.name) filter(where r.name is not null),'{}') roles,
        coalesce(array_agg(distinct p.name) filter(where p.name is not null),'{}') permissions
        from users u left join user_roles ur on ur.user_id=u.id left join roles r on r.id=ur.role_id
        left join role_permissions rp on rp.role_id=r.id left join permissions p on p.id=rp.permission_id
        where lower(u.email)=lower(:e) group by u.id'''),{'e':f.username}).mappings().first()
    if not r or not r['active'] or not pwd.verify(f.password,r['password_hash']):
        audit('AUTH_FAILURE',detail={'email_hash':hashlib.sha256(f.username.lower().encode()).hexdigest()}); raise HTTPException(401,'Credenciales incorrectas')
    if r['mfa_enabled']:
        challenge=jwt.encode({'sub':str(r['id']),'purpose':'mfa','exp':datetime.now(timezone.utc)+timedelta(minutes=5)},JWT_SECRET,algorithm=JWT_ALG)
        return TokenOut(access_token=challenge,expires_in=300)
    audit('AUTH_SUCCESS',r['id'],r['tenant_id']); return TokenOut(access_token=token_for(r),expires_in=ACCESS_MIN*60)

@app.post('/v1/auth/mfa/verify',response_model=TokenOut)
def verify_mfa(data:MFAIn, authorization:str=Header(...)):
    try: p=jwt.decode(authorization.removeprefix('Bearer ').strip(),JWT_SECRET,algorithms=[JWT_ALG]); assert p.get('purpose')=='mfa'
    except Exception: raise HTTPException(401,'Desafio MFA no valido')
    with engine.begin() as c:
        r=c.execute(text('''select u.id,u.tenant_id,u.mfa_secret,
        coalesce(array_agg(distinct r.name) filter(where r.name is not null),'{}') roles,
        coalesce(array_agg(distinct p.name) filter(where p.name is not null),'{}') permissions
        from users u left join user_roles ur on ur.user_id=u.id left join roles r on r.id=ur.role_id
        left join role_permissions rp on rp.role_id=r.id left join permissions p on p.id=rp.permission_id
        where u.id=:u group by u.id'''),{'u':p['sub']}).mappings().first()
    if not r or not pyotp.TOTP(r['mfa_secret']).verify(data.code,valid_window=1): audit('MFA_FAILURE',p['sub']); raise HTTPException(401,'Codigo MFA incorrecto')
    audit('MFA_SUCCESS',r['id'],r['tenant_id']); return TokenOut(access_token=token_for(r,True),expires_in=ACCESS_MIN*60)

@app.post('/v1/auth/logout')
def logout(u=Depends(current)):
    with engine.begin() as c: c.execute(text('insert into revoked_tokens(jti,expires_at) values(:j,to_timestamp(:e)) on conflict do nothing'),{'j':u['jti'],'e':u['exp']})
    audit('LOGOUT',u['sub'],u['tenant_id']); return {'ok':True}

@app.get('/v1/me')
def me(u=Depends(current)): return {k:u[k] for k in ('sub','tenant_id','roles','permissions','mfa')}

async def call_provider(name,prompt,max_tokens):
    cfg={'openai':('https://api.openai.com/v1',OPENAI_KEY,OPENAI_MODEL),'xai':('https://api.x.ai/v1',XAI_KEY,XAI_MODEL)}[name]
    if not cfg[1]: raise RuntimeError(f'{name}: API key no configurada')
    started=time.monotonic()
    async with httpx.AsyncClient(timeout=TIMEOUT) as h:
        r=await h.post(cfg[0]+'/responses',headers={'Authorization':'Bearer '+cfg[1],'Content-Type':'application/json'},json={'model':cfg[2],'input':prompt,'max_output_tokens':max_tokens,'store':False})
        r.raise_for_status(); j=r.json()
    out=[]
    for item in j.get('output',[]):
        for part in item.get('content',[]):
            if part.get('type')=='output_text': out.append(part.get('text',''))
    usage=j.get('usage') or {}; inp=usage.get('input_tokens',0); outp=usage.get('output_tokens',0)
    prices=(OPENAI_INPUT_USD,OPENAI_OUTPUT_USD) if name=='openai' else (XAI_INPUT_USD,XAI_OUTPUT_USD)
    return {'provider':name,'model':cfg[2],'text':'\n'.join(out),'response_id':j.get('id'),'usage':usage,'estimated_cost_usd':round(inp*prices[0]/1e6+outp*prices[1]/1e6,8),'latency_ms':round((time.monotonic()-started)*1000)}

def provider_order(prompt):
    # Cost-first among configured providers. Price values are environment-controlled.
    candidates=[]
    if OPENAI_KEY: candidates.append(('openai',OPENAI_INPUT_USD+OPENAI_OUTPUT_USD))
    if XAI_KEY: candidates.append(('xai',XAI_INPUT_USD+XAI_OUTPUT_USD))
    return [n for n,_ in sorted(candidates,key=lambda x:x[1])]

@app.post('/v1/ai/orchestrate')
async def orchestrate(req:Ask,u=Depends(require('ai.execute'))):
    trace=str(uuid.uuid4()); requested=req.provider
    if requested=='both':
        results=await asyncio.gather(*(call_provider(p,req.prompt,req.max_output_tokens) for p in ['openai','xai']),return_exceptions=True)
        payload={p:({'error':str(r)} if isinstance(r,Exception) else r) for p,r in zip(['openai','xai'],results)}
        audit('AI_BOTH',u['sub'],u['tenant_id'],{'trace_id':trace}); return {'trace_id':trace,'results':payload}
    order=provider_order(req.prompt) if requested=='auto' else [requested]+[p for p in ['openai','xai'] if p!=requested]
    errors=[]
    for idx,p in enumerate(order):
        try:
            result=await call_provider(p,req.prompt,req.max_output_tokens)
            with engine.begin() as c: c.execute(text('insert into ai_usage(trace_id,user_id,tenant_id,provider,model,input_tokens,output_tokens,cost_usd,latency_ms,fallback_used) values(:tr,:u,:t,:p,:m,:i,:o,:c,:l,:f)'),{'tr':trace,'u':u['sub'],'t':u['tenant_id'],'p':p,'m':result['model'],'i':result['usage'].get('input_tokens',0),'o':result['usage'].get('output_tokens',0),'c':result['estimated_cost_usd'],'l':result['latency_ms'],'f':idx>0})
            audit('AI_SUCCESS',u['sub'],u['tenant_id'],{'trace_id':trace,'provider':p,'fallback':idx>0}); return {'trace_id':trace,'fallback_used':idx>0,**result}
        except Exception as e:
            errors.append({'provider':p,'error':str(e)[:500]}); audit('AI_PROVIDER_FAILURE',u['sub'],u['tenant_id'],{'trace_id':trace,'provider':p})
    raise HTTPException(502,{'trace_id':trace,'message':'Todos los proveedores fallaron','errors':errors})

@app.get('/v1/admin/usage')
def usage(u=Depends(require('audit.read'))):
    with engine.begin() as c:
        rows=c.execute(text('select provider,count(*) requests,coalesce(sum(input_tokens),0) input_tokens,coalesce(sum(output_tokens),0) output_tokens,coalesce(sum(cost_usd),0) cost_usd from ai_usage where tenant_id=:t group by provider'),{'t':u['tenant_id']}).mappings().all()
    return {'tenant_id':u['tenant_id'],'providers':[dict(x) for x in rows]}
