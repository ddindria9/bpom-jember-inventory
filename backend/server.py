from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, UploadFile, File, Response, Query, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, io, uuid, logging, requests, re
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import qrcode

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = os.environ.get("APP_NAME", "bpom-jember-inventory")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="BPOM Jember Inventory")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s - %(message)s')
log = logging.getLogger("inventory")

# -------------------- Storage --------------------
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
storage_key: Optional[str] = None

def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_KEY:
        raise RuntimeError("EMERGENT_LLM_KEY missing")
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    r = requests.put(f"{STORAGE_URL}/objects/{path}",
                     headers={"X-Storage-Key": key, "Content-Type": content_type},
                     data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def get_object(path: str):
    key = init_storage()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

# -------------------- Helpers --------------------
def now_utc():
    return datetime.now(timezone.utc)

def iso(dt: datetime) -> str:
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    return dt.isoformat()

def clean(doc: dict) -> dict:
    """Remove MongoDB _id."""
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc

# -------------------- Auth --------------------
ROLES = ["admin_gudang", "peminta", "approver", "pengelola_aset", "admin"]

async def get_current_user(request: Request, authorization: Optional[str] = Header(None)):
    token = request.cookies.get("session_token")
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    if not token:
        raise HTTPException(401, "Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Invalid session")
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user

def require_role(*roles):
    async def dep(user=Depends(get_current_user)):
        if user.get("role") not in roles and user.get("role") != "admin":
            raise HTTPException(403, f"Need role: {roles}")
        return user
    return dep

class SessionRequest(BaseModel):
    session_id: str

@api.post("/auth/session")
async def auth_session(payload: SessionRequest, response: Response):
    sid = payload.session_id
    r = requests.get(
        "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
        headers={"X-Session-ID": sid}, timeout=15
    )
    if r.status_code != 200:
        raise HTTPException(401, "Invalid session_id")
    data = r.json()
    email = data["email"]
    # Find or create user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        role = existing.get("role", "peminta")
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        # First user becomes admin
        count = await db.users.count_documents({})
        role = "admin" if count == 0 else "peminta"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name", email),
            "picture": data.get("picture", ""),
            "role": role,
            "unit_kerja": "",
            "created_at": iso(now_utc())
        })
    # Store session
    session_token = data["session_token"]
    expires = now_utc() + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": iso(expires),
        "created_at": iso(now_utc())
    })
    response.set_cookie(
        key="session_token", value=session_token,
        max_age=7*24*60*60, httponly=True, secure=True, samesite="none", path="/"
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user, "session_token": session_token}

@api.get("/auth/me")
async def auth_me(user=Depends(get_current_user)):
    return user

@api.post("/auth/logout")
async def auth_logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

# -------------------- Users mgmt --------------------
class UserUpdate(BaseModel):
    role: Optional[str] = None
    unit_kerja: Optional[str] = None
    name: Optional[str] = None

@api.get("/users")
async def list_users(user=Depends(require_role("admin"))):
    users = await db.users.find({}, {"_id": 0}).to_list(500)
    return users

@api.patch("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, user=Depends(require_role("admin"))):
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if "role" in upd and upd["role"] not in ROLES:
        raise HTTPException(400, "Invalid role")
    await db.users.update_one({"user_id": user_id}, {"$set": upd})
    return await db.users.find_one({"user_id": user_id}, {"_id": 0})

@api.delete("/users/{user_id}")
async def delete_user(user_id: str, user=Depends(require_role("admin"))):
    if user_id == user["user_id"]:
        raise HTTPException(400, "Cannot delete self")
    await db.users.delete_one({"user_id": user_id})
    return {"ok": True}

# -------------------- Items (Master Data) --------------------
class ItemIn(BaseModel):
    kode: str
    nama: str
    kategori: str = ""
    satuan: str = "pcs"
    harga: float = 0
    stok_min: int = 0
    is_reagen: bool = False
    expiry_date: Optional[str] = None  # for reagen

@api.get("/items")
async def list_items(user=Depends(get_current_user)):
    items = await db.items.find({}, {"_id": 0}).sort("kode", 1).to_list(2000)
    return items

@api.post("/items")
async def create_item(body: ItemIn, user=Depends(require_role("admin_gudang", "admin"))):
    exists = await db.items.find_one({"kode": body.kode}, {"_id": 0})
    if exists:
        raise HTTPException(400, "Kode barang sudah ada")
    doc = body.model_dump()
    doc["id"] = f"item_{uuid.uuid4().hex[:10]}"
    doc["stok"] = 0
    doc["created_at"] = iso(now_utc())
    await db.items.insert_one(doc)
    return clean(doc)

@api.patch("/items/{item_id}")
async def update_item(item_id: str, body: ItemIn, user=Depends(require_role("admin_gudang", "admin"))):
    await db.items.update_one({"id": item_id}, {"$set": body.model_dump()})
    return await db.items.find_one({"id": item_id}, {"_id": 0})

@api.delete("/items/{item_id}")
async def delete_item(item_id: str, user=Depends(require_role("admin_gudang", "admin"))):
    await db.items.delete_one({"id": item_id})
    return {"ok": True}

@api.get("/items/{item_id}/stock-card")
async def stock_card(item_id: str, user=Depends(get_current_user)):
    item = await db.items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item not found")
    movements = await db.movements.find({"item_id": item_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return {"item": item, "movements": movements}

# Bulk import master barang from CSV / Excel
COLUMN_ALIASES = {
    "kode": ["kode", "kode_barang", "kode barang", "code"],
    "nama": ["nama", "nama_barang", "nama barang", "name"],
    "kategori": ["kategori", "category"],
    "satuan": ["satuan", "unit", "uom"],
    "harga": ["harga", "harga_jual", "harga_satuan", "harga jual", "harga satuan", "price"],
    "stok_min": ["stok_min", "stok minimum", "minimum_stock", "min_stock", "min"],
    "stok": ["stok", "tersedia", "stock", "saldo"],
    "is_reagen": ["is_reagen", "reagen"],
    "expiry_date": ["expiry_date", "kadaluarsa", "exp", "tanggal_kadaluarsa"],
}

def _map_row(row: dict) -> dict:
    lower = {str(k).strip().lower(): v for k, v in row.items() if k is not None}
    out = {}
    for field, aliases in COLUMN_ALIASES.items():
        for a in aliases:
            if a in lower and lower[a] not in (None, ""):
                out[field] = lower[a]
                break
    return out

@api.post("/items/bulk-import")
async def bulk_import_items(file: UploadFile = File(...), user=Depends(require_role("admin_gudang", "admin"))):
    import pandas as pd
    raw = await file.read()
    fname = (file.filename or "").lower()
    try:
        if fname.endswith(".xlsx") or fname.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(raw), dtype=str, engine="openpyxl")
        else:
            # try utf-8 then latin-1
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                text = raw.decode("latin-1")
            df = pd.read_csv(io.StringIO(text), dtype=str, sep=None, engine="python")
    except Exception as e:
        raise HTTPException(400, f"Gagal membaca file: {e}")

    created, updated, errors = [], [], []
    existing_codes = {x["kode"]: x for x in await db.items.find({}, {"_id": 0}).to_list(5000)}

    for idx, raw_row in enumerate(df.fillna("").to_dict(orient="records")):
        mapped = _map_row(raw_row)
        kode = str(mapped.get("kode", "")).strip()
        nama = str(mapped.get("nama", "")).strip()
        if not kode or not nama:
            errors.append({"row": idx + 2, "error": "Kode atau Nama kosong"})
            continue
        def _to_num(v, default=0):
            try:
                if v is None or v == "":
                    return default
                s = str(v).replace(",", "").replace(".", "") if isinstance(v, str) and v.count(",") > 0 and v.count(".") == 0 else str(v).replace(",", "")
                return float(s)
            except Exception:
                return default
        def _to_int(v, default=0):
            try:
                return int(float(_to_num(v, default)))
            except Exception:
                return default
        doc = {
            "kode": kode,
            "nama": nama,
            "kategori": str(mapped.get("kategori", "")).strip(),
            "satuan": str(mapped.get("satuan", "pcs")).strip() or "pcs",
            "harga": _to_num(mapped.get("harga", 0)),
            "stok_min": _to_int(mapped.get("stok_min", 0)),
            "is_reagen": str(mapped.get("is_reagen", "")).strip().lower() in ("1", "true", "ya", "yes", "y"),
            "expiry_date": str(mapped.get("expiry_date", "")).strip() or None,
        }
        if kode in existing_codes:
            await db.items.update_one({"kode": kode}, {"$set": doc})
            updated.append(kode)
        else:
            doc["id"] = f"item_{uuid.uuid4().hex[:10]}"
            doc["stok"] = _to_int(mapped.get("stok", 0))
            doc["created_at"] = iso(now_utc())
            await db.items.insert_one(doc)
            created.append(kode)
    return {
        "created": len(created),
        "updated": len(updated),
        "errors": errors,
        "created_codes": created[:50],
        "updated_codes": updated[:50],
    }

@api.get("/items/template.csv")
async def items_template():
    """Public template - no auth needed."""
    csv = "kode,nama,kategori,satuan,harga,stok_min,is_reagen,expiry_date\n"
    csv += "ATK003,Pulpen Standard,ATK,pcs,2500,20,false,\n"
    csv += "RGN004,Asam Sulfat 98%,REAGEN,ltr,420000,2,true,2026-12-31\n"
    return Response(
        content=csv,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="template_items.csv"'},
    )

# -------------------- Incoming (Pembelian) --------------------
class IncomingLine(BaseModel):
    item_id: str
    jumlah: int
    harga_beli: float

class IncomingIn(BaseModel):
    tanggal: str
    no_faktur: str
    supplier: str = ""
    lines: List[IncomingLine]
    catatan: str = ""

@api.post("/incoming")
async def create_incoming(body: IncomingIn, user=Depends(require_role("admin_gudang", "admin"))):
    if not body.lines:
        raise HTTPException(400, "Daftar barang tidak boleh kosong")
    if not body.no_faktur:
        raise HTTPException(400, "Nomor faktur wajib diisi")
    # Validate every item_id exists and quantities are positive
    ids = [l.item_id for l in body.lines]
    existing = await db.items.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "nama": 1}).to_list(2000)
    found = {x["id"] for x in existing}
    missing = [i for i in ids if i not in found]
    if missing:
        raise HTTPException(400, f"Barang tidak ditemukan: {', '.join(missing)}")
    for l in body.lines:
        if l.jumlah <= 0:
            raise HTTPException(400, "Jumlah harus lebih dari 0")
        if l.harga_beli < 0:
            raise HTTPException(400, "Harga beli tidak boleh negatif")

    doc_id = f"in_{uuid.uuid4().hex[:10]}"
    total = sum(l.jumlah * l.harga_beli for l in body.lines)
    doc = {
        "id": doc_id,
        "tanggal": body.tanggal,
        "no_faktur": body.no_faktur,
        "supplier": body.supplier,
        "catatan": body.catatan,
        "lines": [l.model_dump() for l in body.lines],
        "total_nilai": total,
        "created_by": user["user_id"],
        "created_at": iso(now_utc()),
    }
    await db.incoming.insert_one(doc)
    # Track applied changes for rollback on partial failure
    applied_items = []  # [(item_id, delta_applied)]
    inserted_movements = []  # [movement_id]
    try:
        for l in body.lines:
            await db.items.update_one({"id": l.item_id}, {"$inc": {"stok": l.jumlah}})
            applied_items.append((l.item_id, l.jumlah))
            mv_id = f"mv_{uuid.uuid4().hex[:10]}"
            await db.movements.insert_one({
                "id": mv_id,
                "item_id": l.item_id,
                "tipe": "MASUK",
                "ref": body.no_faktur,
                "jumlah": l.jumlah,
                "harga": l.harga_beli,
                "tanggal": body.tanggal,
                "created_at": iso(now_utc()),
            })
            inserted_movements.append(mv_id)
    except Exception as e:
        # Rollback applied changes
        for iid, delta in applied_items:
            await db.items.update_one({"id": iid}, {"$inc": {"stok": -delta}})
        if inserted_movements:
            await db.movements.delete_many({"id": {"$in": inserted_movements}})
        await db.incoming.delete_one({"id": doc_id})
        log.error(f"Incoming rollback: {e}")
        raise HTTPException(500, f"Transaksi gagal, dibatalkan: {e}")
    return clean(doc)

@api.get("/incoming")
async def list_incoming(user=Depends(get_current_user)):
    docs = await db.incoming.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs

# -------------------- SPB Requests --------------------
class SPBLine(BaseModel):
    item_id: str
    jumlah: int
    keperluan: str = ""

class SPBIn(BaseModel):
    nama_peminta: str
    unit_kerja: str
    keperluan: str = ""
    lines: List[SPBLine]

def gen_nomor_surat(prefix: str, seq: int):
    bulan_romawi = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
    now = now_utc()
    return f"{seq:04d}/{prefix}/{bulan_romawi[now.month]}/{now.year}"

@api.post("/spb")
async def create_spb(body: SPBIn):
    """Public endpoint - employees can submit via link/QR."""
    count = await db.spb.count_documents({})
    nomor = gen_nomor_surat("PSD", count + 1)
    doc = {
        "id": f"spb_{uuid.uuid4().hex[:10]}",
        "nomor": nomor,
        "nama_peminta": body.nama_peminta,
        "unit_kerja": body.unit_kerja,
        "keperluan": body.keperluan,
        "lines": [l.model_dump() for l in body.lines],
        "status": "PENDING",
        "approver_id": None,
        "approver_name": None,
        "approver_paraf": None,
        "approved_at": None,
        "alasan_tolak": None,
        "created_at": iso(now_utc()),
    }
    await db.spb.insert_one(doc)
    return clean(doc)

@api.get("/spb")
async def list_spb(status: Optional[str] = None, user=Depends(get_current_user)):
    q = {}
    if status:
        q["status"] = status
    docs = await db.spb.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs

@api.get("/spb/{spb_id}")
async def get_spb(spb_id: str):
    doc = await db.spb.find_one({"id": spb_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "SPB not found")
    return doc

class ApprovalAction(BaseModel):
    action: str  # APPROVE or REJECT
    paraf: str = ""
    alasan: str = ""

@api.post("/spb/{spb_id}/action")
async def spb_action(spb_id: str, body: ApprovalAction, user=Depends(require_role("approver", "admin"))):
    spb = await db.spb.find_one({"id": spb_id}, {"_id": 0})
    if not spb:
        raise HTTPException(404, "SPB not found")
    if spb["status"] != "PENDING":
        raise HTTPException(400, "SPB already processed")
    if body.action == "APPROVE":
        # Validate stok upfront
        for l in spb["lines"]:
            it = await db.items.find_one({"id": l["item_id"]}, {"_id": 0})
            if not it:
                raise HTTPException(400, f"Barang tidak ditemukan: {l['item_id']}")
            if it.get("stok", 0) < l["jumlah"]:
                raise HTTPException(400, f"Stok tidak cukup untuk {it['nama']} (tersedia {it.get('stok', 0)}, diminta {l['jumlah']})")
        # Atomic block with manual rollback (Mongo standalone has no multi-doc tx)
        sbbk_count = await db.sbbk.count_documents({})
        sbbk_nomor = gen_nomor_surat("SBBK", sbbk_count + 1)
        applied_items = []  # [(item_id, qty)] - delta to roll back
        inserted_movements = []
        sbbk_id = f"sbbk_{uuid.uuid4().hex[:10]}"
        try:
            for l in spb["lines"]:
                await db.items.update_one({"id": l["item_id"]}, {"$inc": {"stok": -l["jumlah"]}})
                applied_items.append((l["item_id"], l["jumlah"]))
                mv_id = f"mv_{uuid.uuid4().hex[:10]}"
                await db.movements.insert_one({
                    "id": mv_id,
                    "item_id": l["item_id"],
                    "tipe": "KELUAR",
                    "ref": sbbk_nomor,
                    "jumlah": l["jumlah"],
                    "harga": 0,
                    "tanggal": now_utc().strftime("%Y-%m-%d"),
                    "created_at": iso(now_utc()),
                })
                inserted_movements.append(mv_id)
            sbbk = {
                "id": sbbk_id,
                "nomor": sbbk_nomor,
                "spb_id": spb_id,
                "spb_nomor": spb["nomor"],
                "nama_penerima": spb["nama_peminta"],
                "unit_kerja": spb["unit_kerja"],
                "lines": spb["lines"],
                "created_at": iso(now_utc()),
            }
            await db.sbbk.insert_one(sbbk)
            await db.spb.update_one({"id": spb_id}, {"$set": {
                "status": "APPROVED",
                "approver_id": user["user_id"],
                "approver_name": user["name"],
                "approver_paraf": body.paraf,
                "approved_at": iso(now_utc()),
                "sbbk_nomor": sbbk_nomor,
            }})
        except Exception as e:
            # Compensating rollback
            for iid, qty in applied_items:
                await db.items.update_one({"id": iid}, {"$inc": {"stok": qty}})
            if inserted_movements:
                await db.movements.delete_many({"id": {"$in": inserted_movements}})
            await db.sbbk.delete_one({"id": sbbk_id})
            log.error(f"Approval rollback for SPB {spb_id}: {e}")
            raise HTTPException(500, f"Approval gagal, perubahan dibatalkan: {e}")
    else:
        await db.spb.update_one({"id": spb_id}, {"$set": {
            "status": "REJECTED",
            "approver_id": user["user_id"],
            "approver_name": user["name"],
            "approved_at": iso(now_utc()),
            "alasan_tolak": body.alasan,
        }})
    return await db.spb.find_one({"id": spb_id}, {"_id": 0})

@api.get("/sbbk/{sbbk_id}")
async def get_sbbk(sbbk_id: str, user=Depends(get_current_user)):
    doc = await db.sbbk.find_one({"id": sbbk_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "SBBK not found")
    return doc

@api.get("/sbbk")
async def list_sbbk(user=Depends(get_current_user)):
    docs = await db.sbbk.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs

# -------------------- Assets --------------------
class AssetIn(BaseModel):
    nup: str
    nama: str
    kategori: str = ""
    lokasi: str = ""
    tahun_perolehan: Optional[int] = None
    harga: float = 0
    kondisi: str = "BAIK"  # BAIK, RUSAK_RINGAN, RUSAK_BERAT
    bast: str = ""
    foto_path: Optional[str] = None

@api.get("/assets")
async def list_assets(user=Depends(get_current_user)):
    docs = await db.assets.find({}, {"_id": 0}).sort("nup", 1).to_list(2000)
    return docs

@api.get("/assets/{asset_id}")
async def get_asset(asset_id: str):
    """Public for QR-scan inspection page."""
    doc = await db.assets.find_one({"id": asset_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Asset not found")
    return doc

@api.post("/assets")
async def create_asset(body: AssetIn, user=Depends(require_role("pengelola_aset", "admin"))):
    doc = body.model_dump()
    doc["id"] = f"ast_{uuid.uuid4().hex[:10]}"
    doc["created_at"] = iso(now_utc())
    await db.assets.insert_one(doc)
    return clean(doc)

@api.patch("/assets/{asset_id}")
async def update_asset(asset_id: str, body: AssetIn, user=Depends(require_role("pengelola_aset", "admin"))):
    await db.assets.update_one({"id": asset_id}, {"$set": body.model_dump()})
    return await db.assets.find_one({"id": asset_id}, {"_id": 0})

class KondisiUpdate(BaseModel):
    kondisi: str
    catatan: str = ""

@api.post("/assets/{asset_id}/kondisi")
async def update_kondisi(asset_id: str, body: KondisiUpdate, user=Depends(get_current_user)):
    """Mobile-friendly inspection - any authenticated user can update."""
    if body.kondisi not in ["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT"]:
        raise HTTPException(400, "Invalid kondisi")
    await db.assets.update_one({"id": asset_id}, {"$set": {"kondisi": body.kondisi, "catatan_kondisi": body.catatan}})
    await db.asset_inspections.insert_one({
        "id": f"insp_{uuid.uuid4().hex[:10]}",
        "asset_id": asset_id,
        "kondisi": body.kondisi,
        "catatan": body.catatan,
        "by_user_id": user["user_id"],
        "by_user_name": user["name"],
        "created_at": iso(now_utc()),
    })
    return await db.assets.find_one({"id": asset_id}, {"_id": 0})

@api.delete("/assets/{asset_id}")
async def delete_asset(asset_id: str, user=Depends(require_role("pengelola_aset", "admin"))):
    await db.assets.delete_one({"id": asset_id})
    return {"ok": True}

@api.get("/assets/{asset_id}/qr.png")
async def asset_qr(asset_id: str, frontend_url: str = Query(...)):
    """Generate QR code PNG that points to mobile inspection page."""
    url = f"{frontend_url}/asset-inspect/{asset_id}"
    img = qrcode.make(url, box_size=10, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Response(content=buf.read(), media_type="image/png")

# -------------------- Upload --------------------
@api.post("/upload")
async def upload_file(file: UploadFile = File(...), user=Depends(get_current_user)):
    ext = (file.filename.split(".")[-1] if "." in file.filename else "bin").lower()
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    result = put_object(path, data, file.content_type or "application/octet-stream")
    rec_id = str(uuid.uuid4())
    await db.files.insert_one({
        "id": rec_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type,
        "size": result["size"],
        "is_deleted": False,
        "uploaded_by": user["user_id"],
        "created_at": iso(now_utc())
    })
    return {"id": rec_id, "path": result["path"], "url": f"/api/files/{result['path']}"}

@api.get("/files/{path:path}")
async def serve_file(path: str):
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "File not found")
    data, ct = get_object(path)
    return Response(content=data, media_type=rec.get("content_type", ct))

# -------------------- Dashboard --------------------
@api.get("/dashboard/stats")
async def dashboard_stats(user=Depends(get_current_user)):
    items = await db.items.find({}, {"_id": 0}).to_list(2000)
    assets = await db.assets.find({}, {"_id": 0}).to_list(2000)
    low_stock = [i for i in items if i.get("stok", 0) <= i.get("stok_min", 0)]
    total_nilai = sum(i.get("stok", 0) * i.get("harga", 0) for i in items)
    # Expiry alerts (reagen with expiry within 90 days)
    expiring = []
    today = now_utc().date()
    for it in items:
        if it.get("is_reagen") and it.get("expiry_date"):
            try:
                ed = datetime.strptime(it["expiry_date"], "%Y-%m-%d").date()
                days_left = (ed - today).days
                if days_left <= 90:
                    expiring.append({**it, "days_left": days_left})
            except Exception:
                pass
    kondisi_counts = {"BAIK": 0, "RUSAK_RINGAN": 0, "RUSAK_BERAT": 0}
    for a in assets:
        k = a.get("kondisi", "BAIK")
        kondisi_counts[k] = kondisi_counts.get(k, 0) + 1
    pending_spb = await db.spb.count_documents({"status": "PENDING"})
    return {
        "total_items": len(items),
        "total_assets": len(assets),
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock[:10],
        "total_nilai": total_nilai,
        "expiring": expiring,
        "kondisi_counts": kondisi_counts,
        "pending_spb": pending_spb,
    }

# -------------------- Settings (Surat Template URLs) --------------------
SETTINGS_KEY = "app_settings"

@api.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    s = await db.settings.find_one({"key": SETTINGS_KEY}, {"_id": 0}) or {}
    return {
        "spb_template_doc_id": s.get("spb_template_doc_id", ""),
        "sbbk_template_doc_id": s.get("sbbk_template_doc_id", ""),
    }

class SettingsIn(BaseModel):
    spb_template_doc_id: Optional[str] = None
    sbbk_template_doc_id: Optional[str] = None

def _extract_doc_id(s: str) -> str:
    """Accept either raw doc_id or full URL and return doc_id."""
    if not s:
        return ""
    s = s.strip()
    m = re.search(r"/document/d/([a-zA-Z0-9_\-]+)", s)
    if m:
        return m.group(1)
    return s

@api.put("/settings")
async def update_settings(body: SettingsIn, user=Depends(require_role("admin", "admin_gudang"))):
    upd = {}
    if body.spb_template_doc_id is not None:
        upd["spb_template_doc_id"] = _extract_doc_id(body.spb_template_doc_id)
    if body.sbbk_template_doc_id is not None:
        upd["sbbk_template_doc_id"] = _extract_doc_id(body.sbbk_template_doc_id)
    await db.settings.update_one({"key": SETTINGS_KEY}, {"$set": {"key": SETTINGS_KEY, **upd}}, upsert=True)
    return await get_settings(user)

# -------------------- Surat (Google Docs template render) --------------------
def _fetch_gdoc_html(doc_id: str) -> str:
    """Fetch publicly-shared Google Doc as HTML."""
    url = f"https://docs.google.com/document/d/{doc_id}/export?format=html"
    r = requests.get(url, timeout=30, allow_redirects=True)
    if r.status_code != 200 or "<body" not in r.text:
        raise HTTPException(400, "Gagal memuat Google Doc. Pastikan dibagikan 'Anyone with the link can view'.")
    return r.text

NAMA_BULAN_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"]

def _fmt_tanggal(dt_str: str) -> str:
    if not dt_str:
        return ""
    try:
        d = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        return f"{d.day} {NAMA_BULAN_ID[d.month-1]} {d.year}"
    except Exception:
        return dt_str

def _render_template(html_text: str, ctx: dict, rows: list) -> str:
    """Replace {{key}} placeholders + expand row template.
    If NO placeholders detected, falls back to auto-fill based on table structure.
    """
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html_text, "lxml")

    raw = str(soup)
    has_explicit_placeholder = "{{" in raw

    if has_explicit_placeholder:
        # --- Explicit placeholder mode ---
        row_keys = set(re.findall(r"\{\{\s*row\.([a-zA-Z0-9_]+)\s*\}\}", raw))
        if row_keys:
            for tr in list(soup.find_all("tr")):
                tr_str = str(tr)
                if "{{row." not in tr_str and "{{ row." not in tr_str:
                    continue
                for r in rows:
                    new_html = tr_str
                    for k in row_keys:
                        val = "" if r.get(k) is None else str(r.get(k))
                        new_html = re.sub(r"\{\{\s*row\." + re.escape(k) + r"\s*\}\}", val, new_html)
                    new_tr = BeautifulSoup(new_html, "lxml").find("tr")
                    if new_tr:
                        tr.insert_before(new_tr)
                tr.extract()
        result = str(soup)
        for k, v in ctx.items():
            result = re.sub(r"\{\{\s*" + re.escape(k) + r"\s*\}\}", "" if v is None else str(v), result)
        return result

    # --- Auto-fill mode (no placeholders found) ---
    def _txt(el):
        return el.get_text(separator=" ", strip=True) if el else ""

    # 1) Inject nomor after "Nomor :" anywhere in document
    for tag in soup.find_all(["p", "span", "div", "td"]):
        t = _txt(tag)
        if re.match(r"^\s*Nomor\s*:\s*$", t):
            # Append nomor text to this element
            tag.append(" " + str(ctx.get("nomor", "")))
            break
        if t.startswith("Nomor :") and len(t) < 15:
            # Replace whole text
            for child in list(tag.children):
                child.extract()
            tag.append(f"Nomor : {ctx.get('nomor', '')}")
            break

    # 2) Fill info table: rows with label + ":" + empty cell
    LABEL_MAP = {
        "unit kerja": "unit_kerja",
        "no. dan tgl. spb": "tanggal_spb",
        "tanggal permintaan": "tanggal_permintaan",
        "nama peminta": "nama_peminta",
        "keperluan": "keperluan",
    }
    for tr in soup.find_all("tr"):
        tds = tr.find_all(["td", "th"])
        if len(tds) < 2:
            continue
        label = _txt(tds[0]).lower().strip().rstrip(":").strip()
        if label in LABEL_MAP:
            target_cell = tds[-1]  # last cell is the value cell
            if not _txt(target_cell):
                key = LABEL_MAP[label]
                val = ctx.get(key, "")
                if val:
                    # Insert as a paragraph to preserve doc styling
                    new_p = soup.new_tag("p")
                    new_p.string = str(val)
                    target_cell.append(new_p)

    # 3) Data table auto-fill: find table whose header contains "Nama Barang"
    target_table = None
    for tbl in soup.find_all("table"):
        first_tr = tbl.find("tr")
        if not first_tr:
            continue
        headers_text = _txt(first_tr).lower()
        if "nama barang" in headers_text:
            target_table = tbl
            break

    if target_table and rows:
        all_trs = target_table.find_all("tr")
        # Identify header rows (first 1 or 2 rows are headers). Header row contains "No." and "Nama Barang"
        header_count = 1
        if len(all_trs) >= 2:
            r1_text = _txt(all_trs[1]).lower()
            # If row 2 has "permintaan" or "disetujui" then header is 2 rows
            if "permintaan" in r1_text or "disetujui" in r1_text:
                header_count = 2
        header_rows = all_trs[:header_count]
        data_rows = all_trs[header_count:]

        # Determine column mapping from header text
        col_keys = []
        if header_count == 2:
            # Build combined header (top + sub-headers)
            top_cells = header_rows[0].find_all(["td", "th"])
            sub_cells = header_rows[1].find_all(["td", "th"])
            # Build flat list by considering colspan
            top_flat = []
            for c in top_cells:
                cs = int(c.get("colspan", 1))
                for _ in range(cs):
                    top_flat.append(_txt(c).lower())
            # Distribute sub cells under top
            sub_iter = iter(sub_cells)
            for i, t in enumerate(top_flat):
                if "jumlah" in t and i < len(top_flat) - 1 and top_flat[i] == top_flat[i + 1]:
                    # this is a merged "Jumlah" header spanning permintaan|disetujui
                    sub = _txt(next(sub_iter, soup.new_tag("td"))).lower()
                    col_keys.append("permintaan" if "perminta" in sub else "disetujui")
                else:
                    col_keys.append(t)
        else:
            col_keys = [_txt(c).lower() for c in header_rows[0].find_all(["td", "th"])]

        # Map header label -> data key
        def header_to_key(h):
            h = h.strip()
            if "no" == h or h.startswith("no."):
                return "no"
            if "nama" in h:
                return "nama"
            if "satuan" in h:
                return "satuan"
            if "jumlah" in h:
                return "jumlah"
            if "perminta" in h:
                return "permintaan"
            if "disetuj" in h:
                return "disetujui"
            if "keperluan" in h:
                return "keperluan"
            if "keterangan" in h:
                return "keterangan"
            return None

        data_keys = [header_to_key(h) for h in col_keys]

        # Take first template data row to clone styling
        template_row = data_rows[0] if data_rows else None

        if template_row:
            # Remove all existing data rows
            for r in data_rows:
                r.extract()
            # Build a new row per data item
            for r in rows:
                new_tr = BeautifulSoup(str(template_row), "lxml").find("tr")
                cells = new_tr.find_all(["td", "th"])
                for ci, cell in enumerate(cells):
                    if ci >= len(data_keys):
                        break
                    key = data_keys[ci]
                    val = r.get(key, "") if key else ""
                    # Clear cell content while preserving cell styling
                    for ch in list(cell.children):
                        ch.extract()
                    if val != "":
                        new_p = soup.new_tag("p")
                        new_p.string = str(val)
                        cell.append(new_p)
                target_table.append(new_tr)

    # 4) Fill signature block: detect tables with "NIP." labels and try to fill names above
    # Look for a table with 3 cells in last row containing "NIP."
    for tbl in soup.find_all("table"):
        trs = tbl.find_all("tr")
        if len(trs) < 2:
            continue
        last_tr = trs[-1]
        cells = last_tr.find_all(["td", "th"])
        if not (len(cells) >= 2 and all("NIP" in _txt(c) for c in cells if _txt(c))):
            continue
        # This is a signature table. First row = labels (Pengelola Gudang / Pejabat Struktural / Yang Menerima)
        first_cells = trs[0].find_all(["td", "th"])
        if len(first_cells) < 2:
            continue
        labels = [_txt(c).lower() for c in first_cells]
        # The row right above NIP row (or 2nd from last) is for names
        name_row = trs[-2] if len(trs) >= 2 else None
        if name_row:
            name_cells = name_row.find_all(["td", "th"])
            for i, cell in enumerate(name_cells):
                if i >= len(labels):
                    break
                lab = labels[i] if i < len(labels) else ""
                val = ""
                if "yang menerima" in lab or "penerima" in lab:
                    val = ctx.get("nama_penerima", "")
                elif "pengelola" in lab:
                    val = ctx.get("nama_pengelola", "")
                elif "pejabat" in lab or "menyetujui" in lab:
                    val = ctx.get("nama_pejabat", "") or ctx.get("approver_name", "")
                elif "meminta" in lab:
                    val = ctx.get("nama_peminta", "")
                if val and not _txt(cell):
                    new_p = soup.new_tag("p")
                    new_p.string = str(val)
                    cell.append(new_p)

    return str(soup)

def _build_ctx_rows(spb: dict, items_by_id: dict, type_: str):
    rows = []
    for i, l in enumerate(spb.get("lines", [])):
        it = items_by_id.get(l["item_id"], {})
        rows.append({
            "no": i + 1,
            "kode": it.get("kode", ""),
            "nama": it.get("nama", l["item_id"]),
            "satuan": it.get("satuan", ""),
            "jumlah": l["jumlah"],
            "permintaan": l["jumlah"],
            "disetujui": l["jumlah"],
            "keperluan": l.get("keperluan", "") or spb.get("keperluan", ""),
            "keterangan": "",
            "harga": it.get("harga", 0),
        })
    today = now_utc()
    place_date = f"Jember, {today.day} {NAMA_BULAN_ID[today.month-1]} {today.year}"
    nomor_current = (spb.get("sbbk_nomor") if type_ == "sbbk" else spb.get("nomor")) or ""
    ctx = {
        "nomor": nomor_current,
        "no_surat": nomor_current,
        "nomor_spb": spb.get("nomor", ""),
        "nomor_sbbk": spb.get("sbbk_nomor", ""),
        "unit_kerja": spb.get("unit_kerja", ""),
        "nama_peminta": spb.get("nama_peminta", ""),
        "nama_penerima": spb.get("nama_peminta", ""),
        "tanggal_permintaan": _fmt_tanggal(spb.get("created_at", "")),
        "tanggal": _fmt_tanggal(spb.get("created_at", "")),
        "tanggal_spb": _fmt_tanggal(spb.get("created_at", "")),
        "tanggal_keluar": _fmt_tanggal(spb.get("approved_at", "")) or place_date.split(", ", 1)[1],
        "place_date": place_date,
        "tempat_tanggal": place_date,
        "keperluan": spb.get("keperluan", ""),
        "status": spb.get("status", ""),
        "approver_name": spb.get("approver_name", ""),
        "nama_pejabat": spb.get("approver_name", ""),
        "approver_paraf": spb.get("approver_paraf", ""),
        "nama_pengelola": "",
        "nip_pengelola": "",
        "nip_peminta": "",
        "nip_pejabat": "",
        "nip_penerima": "",
    }
    return ctx, rows

@api.get("/surat/render/{type}/{spb_id}")
async def render_surat(type: str, spb_id: str, user=Depends(get_current_user)):
    if type not in ("spb", "sbbk"):
        raise HTTPException(400, "Type harus 'spb' atau 'sbbk'")
    spb = await db.spb.find_one({"id": spb_id}, {"_id": 0})
    if not spb:
        raise HTTPException(404, "SPB tidak ditemukan")
    settings = await db.settings.find_one({"key": SETTINGS_KEY}, {"_id": 0}) or {}
    doc_id = settings.get(f"{type}_template_doc_id", "")
    if not doc_id:
        raise HTTPException(400, f"Template Google Doc untuk {type.upper()} belum diatur. Buka menu Pengaturan.")
    items_by_id = {x["id"]: x for x in await db.items.find({}, {"_id": 0}).to_list(5000)}
    ctx, rows = _build_ctx_rows(spb, items_by_id, type)
    html_text = _fetch_gdoc_html(doc_id)
    rendered = _render_template(html_text, ctx, rows)
    return Response(content=rendered, media_type="text/html; charset=utf-8")

@api.get("/surat/data/{type}/{spb_id}")
async def render_surat_data(type: str, spb_id: str, user=Depends(get_current_user)):
    """Returns the variables that would be substituted for this transaction (for debugging template)."""
    if type not in ("spb", "sbbk"):
        raise HTTPException(400, "Type harus 'spb' atau 'sbbk'")
    spb = await db.spb.find_one({"id": spb_id}, {"_id": 0})
    if not spb:
        raise HTTPException(404, "SPB tidak ditemukan")
    items_by_id = {x["id"]: x for x in await db.items.find({}, {"_id": 0}).to_list(5000)}
    ctx, rows = _build_ctx_rows(spb, items_by_id, type)
    return {"context": ctx, "rows": rows}

# -------------------- Reports --------------------
async def report_asset_condition(user=Depends(get_current_user)):
    assets = await db.assets.find({}, {"_id": 0}).sort("nup", 1).to_list(5000)
    return assets

@api.get("/reports/stock-opname")
async def report_stock_opname(user=Depends(get_current_user)):
    items = await db.items.find({}, {"_id": 0}).sort("kode", 1).to_list(5000)
    return items

# -------------------- Seed --------------------
@api.post("/admin/seed")
async def seed_data(user=Depends(get_current_user)):
    """Seed sample data. Only allowed if items collection is empty or by admin."""
    count = await db.items.count_documents({})
    if count > 0 and user.get("role") != "admin":
        raise HTTPException(400, "Data already exists")
    samples = [
        {"kode": "100004", "nama": "AJWA GALON", "kategori": "AIR MINUM", "satuan": "gal", "harga": 19000, "stok_min": 5, "stok": 20, "is_reagen": False},
        {"kode": "8886008101336", "nama": "AQUA BOTOL 330ML", "kategori": "AIR MINUM", "satuan": "btl", "harga": 3000, "stok_min": 24, "stok": 0, "is_reagen": False},
        {"kode": "8886008101138", "nama": "AQUA GALON", "kategori": "AIR MINUM", "satuan": "gal", "harga": 18500, "stok_min": 5, "stok": 15, "is_reagen": False},
        {"kode": "ATK001", "nama": "Kertas A4 80gr", "kategori": "ATK", "satuan": "rim", "harga": 55000, "stok_min": 10, "stok": 25, "is_reagen": False},
        {"kode": "ATK002", "nama": "Tinta Printer Hitam", "kategori": "ATK", "satuan": "btl", "harga": 85000, "stok_min": 5, "stok": 3, "is_reagen": False},
        {"kode": "RGN001", "nama": "Methanol HPLC Grade", "kategori": "REAGEN", "satuan": "ltr", "harga": 450000, "stok_min": 2, "stok": 5, "is_reagen": True, "expiry_date": (now_utc().date() + timedelta(days=45)).isoformat()},
        {"kode": "RGN002", "nama": "Acetonitrile", "kategori": "REAGEN", "satuan": "ltr", "harga": 520000, "stok_min": 2, "stok": 8, "is_reagen": True, "expiry_date": (now_utc().date() + timedelta(days=180)).isoformat()},
        {"kode": "RGN003", "nama": "Buffer pH 7", "kategori": "REAGEN", "satuan": "btl", "harga": 75000, "stok_min": 3, "stok": 2, "is_reagen": True, "expiry_date": (now_utc().date() + timedelta(days=20)).isoformat()},
    ]
    for s in samples:
        s["id"] = f"item_{uuid.uuid4().hex[:10]}"
        s["created_at"] = iso(now_utc())
        await db.items.insert_one(s)
    # Sample assets
    asset_samples = [
        {"nup": "BMN-001", "nama": "PC Desktop Dell OptiPlex", "kategori": "PERANGKAT IT", "lokasi": "Lab Mikrobiologi", "tahun_perolehan": 2023, "harga": 12000000, "kondisi": "BAIK", "bast": "BAST/2023/001"},
        {"nup": "BMN-002", "nama": "Kursi Kantor Ergonomis", "kategori": "MEUBELAIR", "lokasi": "R. Kepala", "tahun_perolehan": 2022, "harga": 2500000, "kondisi": "BAIK", "bast": "BAST/2022/045"},
        {"nup": "BMN-003", "nama": "Lemari Arsip Besi", "kategori": "MEUBELAIR", "lokasi": "R. Arsip", "tahun_perolehan": 2021, "harga": 3500000, "kondisi": "RUSAK_RINGAN", "bast": "BAST/2021/012"},
        {"nup": "BMN-004", "nama": "Printer Laserjet HP", "kategori": "PERANGKAT IT", "lokasi": "Sekretariat", "tahun_perolehan": 2023, "harga": 4500000, "kondisi": "BAIK", "bast": "BAST/2023/007"},
        {"nup": "BMN-005", "nama": "AC Split 1 PK", "kategori": "ELEKTRONIK", "lokasi": "Lab Kimia", "tahun_perolehan": 2020, "harga": 4200000, "kondisi": "RUSAK_BERAT", "bast": "BAST/2020/033"},
    ]
    for a in asset_samples:
        a["id"] = f"ast_{uuid.uuid4().hex[:10]}"
        a["created_at"] = iso(now_utc())
        await db.assets.insert_one(a)
    return {"ok": True, "items": len(samples), "assets": len(asset_samples)}

# -------------------- Root --------------------
@api.get("/")
async def root():
    return {"app": "BPOM Jember Inventory", "status": "ok"}

# -------------------- Startup --------------------
@app.on_event("startup")
async def startup():
    try:
        init_storage()
        log.info("Storage initialized")
    except Exception as e:
        log.warning(f"Storage init failed (will retry on first use): {e}")
    await db.items.create_index("kode", unique=False)
    await db.movements.create_index("item_id")
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)

@app.on_event("shutdown")
async def shutdown():
    client.close()

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
