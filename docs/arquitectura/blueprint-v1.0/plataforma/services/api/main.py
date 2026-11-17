import os, uuid, json
from decimal import Decimal
from fastapi import FastAPI, Header, HTTPException, Depends
from pydantic import BaseModel, Field
import psycopg
from psycopg.rows import dict_row

app=FastAPI(title="Carga360GO Core API", version="1.0.0")
DB=os.getenv("DATABASE_URL","postgresql://carga360:change-this-db-password@db:5432/carga360").replace("postgresql+psycopg://","postgresql://")
KEY=os.getenv("C360_API_KEY","change-me-now")

def auth(x_api_key:str=Header(...)):
    if x_api_key != KEY: raise HTTPException(401,"Credencial no válida")
    return "operator"

def run(sql, params=(), fetch=True):
    with psycopg.connect(DB,row_factory=dict_row) as c:
        with c.cursor() as cur:
            cur.execute(sql,params)
            return cur.fetchall() if fetch else None

def audit(actor, action, typ=None, eid=None, payload=None):
    run("INSERT INTO audit_logs(actor,action,entity_type,entity_id,payload) VALUES(%s,%s,%s,%s,%s)",(actor,action,typ,eid,json.dumps(payload or {})),False)

class Freight(BaseModel):
    customer_name:str; origin:str; destination:str; cargo_type:str; weight_kg:float=Field(gt=0)
class QuoteIn(BaseModel):
    distance_km:float=Field(gt=0); services:float=Field(default=0,ge=0); margin_pct:float=Field(default=18,ge=0,le=100)
class Assign(BaseModel):
    carrier:str; vehicle_plate:str; driver_name:str
class Track(BaseModel):
    lat:float=Field(ge=-90,le=90); lon:float=Field(ge=-180,le=180); event_type:str="GPS"
class Incident(BaseModel):
    severity:str; description:str
class AgentAsk(BaseModel):
    agent:str; intent:str; entity_id:str|None=None

AGENTS={
 "MASTER":{"tools":["overview","delegate"]}, "SALES":{"tools":["freight.read","quote.create"]},
 "OPS":{"tools":["freight.read","operation.read"]}, "DISPATCH":{"tools":["operation.assign"]},
 "TRACK":{"tools":["tracking.read","tracking.write"]}, "GUARDIAN":{"tools":["incident.read","incident.create"]},
 "DOC":{"tools":["document.read","document.validate"]}, "CUSTOMER":{"tools":["operation.read","tracking.read"]},
 "CARRIER":{"tools":["operation.read","tracking.write"]}, "ANALYST":{"tools":["overview"]}}

@app.get("/health")
def health(): return {"status":"ok","service":"c360-core"}

@app.get("/overview",dependencies=[Depends(auth)])
def overview():
    names=["freight_requests","quotes","operations","incidents","approvals"]
    return {n:run(f"SELECT count(*) AS count FROM {n}")[0]["count"] for n in names}

@app.get("/agents",dependencies=[Depends(auth)])
def agents(): return AGENTS

@app.post("/freight",dependencies=[Depends(auth)])
def create_freight(x:Freight):
    r=run("INSERT INTO freight_requests(customer_name,origin,destination,cargo_type,weight_kg) VALUES(%s,%s,%s,%s,%s) RETURNING *",(x.customer_name,x.origin,x.destination,x.cargo_type,x.weight_kg))[0]
    audit("operator","freight.created","freight",str(r["id"]),x.model_dump()); return r

@app.get("/freight",dependencies=[Depends(auth)])
def get_freight(): return run("SELECT * FROM freight_requests ORDER BY created_at DESC LIMIT 100")

@app.post("/freight/{fid}/quote",dependencies=[Depends(auth)])
def quote(fid:uuid.UUID,q:QuoteIn):
    f=run("SELECT * FROM freight_requests WHERE id=%s",(fid,));
    if not f: raise HTTPException(404,"Carga no encontrada")
    # Motor determinista demo: sustituir coeficientes por tabla tarifaria contractual.
    base=Decimal(str(q.distance_km))*Decimal("1.35") + Decimal(str(f[0]["weight_kg"]))*Decimal("0.03")
    services=Decimal(str(q.services)); margin=(base+services)*Decimal(str(q.margin_pct))/100; total=base+services+margin
    r=run("INSERT INTO quotes(freight_id,distance_km,base_cost,services,margin,total) VALUES(%s,%s,%s,%s,%s,%s) RETURNING *",(fid,q.distance_km,base,services,margin,total))[0]
    audit("SALES","quote.created","quote",str(r["id"]),{"freight_id":str(fid)}); return r

@app.post("/freight/{fid}/operation",dependencies=[Depends(auth)])
def operation(fid:uuid.UUID):
    r=run("INSERT INTO operations(freight_id) VALUES(%s) RETURNING *",(fid,))[0]; audit("OPS","operation.created","operation",str(r["id"])); return r

@app.get("/operations",dependencies=[Depends(auth)])
def operations(): return run("SELECT o.*,f.origin,f.destination,f.customer_name FROM operations o JOIN freight_requests f ON f.id=o.freight_id ORDER BY o.created_at DESC")

@app.post("/operations/{oid}/assign",dependencies=[Depends(auth)])
def assign(oid:uuid.UUID,x:Assign):
    # Acción sensible: crea aprobación, no ejecuta asignación todavía.
    r=run("INSERT INTO approvals(action,payload,requested_by) VALUES('operation.assign',%s,'DISPATCH') RETURNING *",(json.dumps({"operation_id":str(oid),**x.model_dump()}),))[0]; audit("DISPATCH","approval.requested","approval",str(r["id"])); return r

@app.post("/approvals/{aid}/approve",dependencies=[Depends(auth)])
def approve(aid:uuid.UUID):
    a=run("SELECT * FROM approvals WHERE id=%s AND status='PENDING'",(aid,));
    if not a: raise HTTPException(404,"Aprobación pendiente no encontrada")
    p=a[0]["payload"]
    if a[0]["action"]=="operation.assign": run("UPDATE operations SET carrier=%s,vehicle_plate=%s,driver_name=%s,status='ASSIGNED' WHERE id=%s",(p["carrier"],p["vehicle_plate"],p["driver_name"],p["operation_id"]),False)
    run("UPDATE approvals SET status='APPROVED',decided_by='operator',decided_at=now() WHERE id=%s",(aid,),False); audit("operator","approval.approved","approval",str(aid)); return {"status":"APPROVED"}

@app.post("/operations/{oid}/tracking",dependencies=[Depends(auth)])
def track(oid:uuid.UUID,x:Track):
    r=run("INSERT INTO tracking_events(operation_id,lat,lon,event_type) VALUES(%s,%s,%s,%s) RETURNING *",(oid,x.lat,x.lon,x.event_type))[0]; audit("TRACK","tracking.recorded","operation",str(oid)); return r

@app.post("/operations/{oid}/incidents",dependencies=[Depends(auth)])
def incident(oid:uuid.UUID,x:Incident):
    r=run("INSERT INTO incidents(operation_id,severity,description) VALUES(%s,%s,%s) RETURNING *",(oid,x.severity,x.description))[0]; audit("GUARDIAN","incident.created","incident",str(r["id"])); return r

@app.get("/audit",dependencies=[Depends(auth)])
def audits(): return run("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200")

@app.post("/ai/orchestrate",dependencies=[Depends(auth)])
def orchestrate(x:AgentAsk):
    a=x.agent.upper();
    if a not in AGENTS: raise HTTPException(400,"Agente desconocido")
    # Punto seguro para conectar el proveedor LLM: sólo expone herramientas allow-listed.
    audit(a,"agent.intent","ai",x.entity_id,{"intent":x.intent})
    return {"agent":a,"intent":x.intent,"allowed_tools":AGENTS[a]["tools"],"execution":"policy-gated","llm_connector":"configure-provider"}
