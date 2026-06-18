"""End-to-end backend tests for BPOM Jember Inventory."""
import re
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone


# ============ AUTH ============
class TestAuth:
    def test_auth_me_with_bearer(self, admin_client, base_url):
        r = admin_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["role"] == "admin"
        assert u["email"].startswith("test.admin")
        assert "user_id" in u

    def test_auth_me_unauth(self, anon_client, base_url):
        r = anon_client.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401


# ============ SEED ============
class TestSeed:
    def test_seed_endpoint(self, admin_client, base_url):
        r = admin_client.post(f"{base_url}/api/admin/seed")
        # Acceptable: success OR already-exists message; both proceed
        assert r.status_code in (200, 400), r.text
        if r.status_code == 200:
            data = r.json()
            assert data.get("ok") is True
            assert data.get("items") == 8
            assert data.get("assets") == 5


# ============ ITEMS CRUD ============
class TestItems:
    def test_list_items(self, admin_client, base_url):
        r = admin_client.get(f"{base_url}/api/items")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1

    def test_create_update_duplicate_item(self, admin_client, base_url):
        kode = f"TEST_{uuid.uuid4().hex[:6]}"
        payload = {"kode": kode, "nama": "Test Item", "kategori": "TEST", "satuan": "pcs", "harga": 1234, "stok_min": 2}
        r = admin_client.post(f"{base_url}/api/items", json=payload)
        assert r.status_code == 200, r.text
        item = r.json()
        assert item["kode"] == kode
        assert item["nama"] == "Test Item"
        assert "id" in item
        assert item["stok"] == 0
        item_id = item["id"]
        # Update
        upd = {**payload, "nama": "Test Item Updated", "harga": 5678}
        r = admin_client.patch(f"{base_url}/api/items/{item_id}", json=upd)
        assert r.status_code == 200, r.text
        assert r.json()["nama"] == "Test Item Updated"
        # Duplicate kode
        r = admin_client.post(f"{base_url}/api/items", json=payload)
        assert r.status_code == 400, r.text
        # store for later
        pytest.created_item_id = item_id
        pytest.created_item_kode = kode

    def test_stock_card(self, admin_client, base_url):
        item_id = getattr(pytest, "created_item_id", None)
        assert item_id, "needs test_create_update_duplicate_item"
        r = admin_client.get(f"{base_url}/api/items/{item_id}/stock-card")
        assert r.status_code == 200
        data = r.json()
        assert "item" in data
        assert "movements" in data
        assert isinstance(data["movements"], list)


# ============ INCOMING ============
class TestIncoming:
    def test_incoming_creates_stok_and_movement(self, admin_client, base_url):
        item_id = getattr(pytest, "created_item_id", None)
        assert item_id
        # current stok
        items = admin_client.get(f"{base_url}/api/items").json()
        cur = next(i for i in items if i["id"] == item_id)
        start_stok = cur.get("stok", 0)

        payload = {
            "tanggal": "2026-01-15",
            "no_faktur": f"FK-{uuid.uuid4().hex[:6]}",
            "supplier": "PT Supplier Test",
            "catatan": "test",
            "lines": [
                {"item_id": item_id, "jumlah": 10, "harga_beli": 1500},
                {"item_id": item_id, "jumlah": 5, "harga_beli": 1600},
            ],
        }
        r = admin_client.post(f"{base_url}/api/incoming", json=payload)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["total_nilai"] == 10 * 1500 + 5 * 1600
        assert "id" in doc

        # verify stok increased
        items2 = admin_client.get(f"{base_url}/api/items").json()
        new_stok = next(i for i in items2 if i["id"] == item_id)["stok"]
        assert new_stok == start_stok + 15

        # movements include MASUK
        sc = admin_client.get(f"{base_url}/api/items/{item_id}/stock-card").json()
        masuk = [m for m in sc["movements"] if m["tipe"] == "MASUK"]
        assert len(masuk) >= 2

    def test_list_incoming(self, admin_client, base_url):
        r = admin_client.get(f"{base_url}/api/incoming")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ============ SPB ============
NOMOR_RE = re.compile(r"^\d{4}/PSD/(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)/\d{4}$")
SBBK_RE = re.compile(r"^\d{4}/SBBK/(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)/\d{4}$")


class TestSPB:
    def test_public_spb_submission(self, anon_client, base_url):
        item_id = getattr(pytest, "created_item_id", None)
        payload = {
            "nama_peminta": "Budi Public",
            "unit_kerja": "Lab Mikro",
            "keperluan": "Kebutuhan Lab",
            "lines": [{"item_id": item_id, "jumlah": 2, "keperluan": "uji sampel"}],
        }
        r = anon_client.post(f"{base_url}/api/spb", json=payload)
        assert r.status_code == 200, r.text
        spb = r.json()
        assert spb["status"] == "PENDING"
        assert NOMOR_RE.match(spb["nomor"]), f"bad nomor format: {spb['nomor']}"
        pytest.spb_id = spb["id"]

    def test_list_spb_pending(self, admin_client, base_url):
        r = admin_client.get(f"{base_url}/api/spb", params={"status": "PENDING"})
        assert r.status_code == 200
        docs = r.json()
        assert any(d["id"] == pytest.spb_id for d in docs)

    def test_spb_approve_creates_sbbk_and_reduces_stok(self, admin_client, base_url):
        item_id = pytest.created_item_id
        before = next(i for i in admin_client.get(f"{base_url}/api/items").json() if i["id"] == item_id)["stok"]
        r = admin_client.post(
            f"{base_url}/api/spb/{pytest.spb_id}/action",
            json={"action": "APPROVE", "paraf": "ttd"},
        )
        assert r.status_code == 200, r.text
        spb = r.json()
        assert spb["status"] == "APPROVED"
        assert "sbbk_nomor" in spb
        assert SBBK_RE.match(spb["sbbk_nomor"])
        # stok reduced by 2
        after = next(i for i in admin_client.get(f"{base_url}/api/items").json() if i["id"] == item_id)["stok"]
        assert after == before - 2
        # KELUAR movement exists
        sc = admin_client.get(f"{base_url}/api/items/{item_id}/stock-card").json()
        keluar = [m for m in sc["movements"] if m["tipe"] == "KELUAR"]
        assert len(keluar) >= 1

    def test_spb_approve_insufficient_stock(self, admin_client, anon_client, base_url):
        item_id = pytest.created_item_id
        # Submit a huge SPB
        payload = {
            "nama_peminta": "Greedy",
            "unit_kerja": "U",
            "lines": [{"item_id": item_id, "jumlah": 999999, "keperluan": "x"}],
        }
        spb = anon_client.post(f"{base_url}/api/spb", json=payload).json()
        r = admin_client.post(
            f"{base_url}/api/spb/{spb['id']}/action",
            json={"action": "APPROVE", "paraf": "ttd"},
        )
        assert r.status_code == 400, r.text

    def test_spb_reject(self, admin_client, anon_client, base_url):
        item_id = pytest.created_item_id
        spb = anon_client.post(
            f"{base_url}/api/spb",
            json={
                "nama_peminta": "TolakUser",
                "unit_kerja": "U",
                "lines": [{"item_id": item_id, "jumlah": 1, "keperluan": "x"}],
            },
        ).json()
        r = admin_client.post(
            f"{base_url}/api/spb/{spb['id']}/action",
            json={"action": "REJECT", "alasan": "stok dialokasikan unit lain"},
        )
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["status"] == "REJECTED"
        assert out["alasan_tolak"] == "stok dialokasikan unit lain"


# ============ ASSETS ============
class TestAssets:
    def test_list_assets(self, admin_client, base_url):
        r = admin_client.get(f"{base_url}/api/assets")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_asset(self, admin_client, base_url):
        nup = f"TEST-{uuid.uuid4().hex[:6]}"
        payload = {
            "nup": nup,
            "nama": "Test Asset",
            "kategori": "PERANGKAT IT",
            "lokasi": "Lab",
            "tahun_perolehan": 2024,
            "harga": 1000000,
            "kondisi": "BAIK",
            "bast": "BAST/TEST/001",
        }
        r = admin_client.post(f"{base_url}/api/assets", json=payload)
        assert r.status_code == 200, r.text
        a = r.json()
        assert a["nup"] == nup
        pytest.asset_id = a["id"]

    def test_public_get_asset_no_auth(self, anon_client, base_url):
        r = anon_client.get(f"{base_url}/api/assets/{pytest.asset_id}")
        assert r.status_code == 200, r.text
        assert r.json()["id"] == pytest.asset_id

    def test_update_kondisi(self, admin_client, base_url):
        r = admin_client.post(
            f"{base_url}/api/assets/{pytest.asset_id}/kondisi",
            json={"kondisi": "RUSAK_RINGAN", "catatan": "lecet"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["kondisi"] == "RUSAK_RINGAN"

    def test_invalid_kondisi(self, admin_client, base_url):
        r = admin_client.post(
            f"{base_url}/api/assets/{pytest.asset_id}/kondisi",
            json={"kondisi": "INVALID", "catatan": "x"},
        )
        assert r.status_code == 400

    def test_qr_png(self, anon_client, base_url):
        r = anon_client.get(
            f"{base_url}/api/assets/{pytest.asset_id}/qr.png",
            params={"frontend_url": "https://example.com"},
        )
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("image/png")
        assert len(r.content) > 100


# ============ DASHBOARD ============
class TestDashboard:
    def test_dashboard_stats_shape(self, admin_client, base_url):
        r = admin_client.get(f"{base_url}/api/dashboard/stats")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in [
            "total_items", "total_assets", "low_stock_count", "low_stock_items",
            "total_nilai", "expiring", "kondisi_counts", "pending_spb",
        ]:
            assert k in d, f"missing {k}"
        assert set(d["kondisi_counts"].keys()) >= {"BAIK", "RUSAK_RINGAN", "RUSAK_BERAT"}
        assert isinstance(d["expiring"], list)
        assert isinstance(d["total_items"], int) and d["total_items"] >= 1


# ============ REPORTS ============
class TestReports:
    def test_asset_condition_report(self, admin_client, base_url):
        r = admin_client.get(f"{base_url}/api/reports/asset-condition")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_stock_opname_report(self, admin_client, base_url):
        r = admin_client.get(f"{base_url}/api/reports/stock-opname")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ============ USERS RBAC ============
class TestUsers:
    def test_list_users_admin(self, admin_client, base_url):
        r = admin_client.get(f"{base_url}/api/users")
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list) and len(users) >= 1
        pytest.users_list = users

    def test_patch_user_role(self, admin_client, base_url):
        # find another (non-self) user; if none, create one in db via API? No API; use any
        me = admin_client.get(f"{base_url}/api/auth/me").json()
        target = next((u for u in pytest.users_list if u["user_id"] != me["user_id"]), None)
        if not target:
            pytest.skip("Need another user")
        original_role = target.get("role", "peminta")
        r = admin_client.patch(
            f"{base_url}/api/users/{target['user_id']}",
            json={"role": "approver"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "approver"
        # restore
        admin_client.patch(f"{base_url}/api/users/{target['user_id']}", json={"role": original_role})

    def test_delete_self_blocked(self, admin_client, base_url):
        me = admin_client.get(f"{base_url}/api/auth/me").json()
        r = admin_client.delete(f"{base_url}/api/users/{me['user_id']}")
        assert r.status_code == 400


# ============ UPLOAD ============
class TestUpload:
    def test_upload_and_serve(self, admin_token, base_url):
        # Use a fresh session WITHOUT default Content-Type for multipart
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {admin_token}"})
        files = {"file": ("hello.txt", b"Hello BPOM", "text/plain")}
        r = s.post(f"{base_url}/api/upload", files=files)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "path" in body and "url" in body
        # serve
        r2 = requests.get(f"{base_url}{body['url']}")
        assert r2.status_code == 200
        assert r2.content == b"Hello BPOM"
