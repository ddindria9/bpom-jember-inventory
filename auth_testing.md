# Auth Testing Playbook

The app uses **Emergent Google OAuth**. There are no password-based credentials.

## Create Test Session for Backend Testing
```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.admin@bpom.go.id',
  name: 'Test Admin',
  role: 'admin',
  unit_kerja: 'Loka POM Jember',
  created_at: new Date().toISOString()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
  created_at: new Date().toISOString()
});
print('Token: ' + sessionToken);
print('UserId: ' + userId);
"
```

## Test backend with curl
```bash
TOKEN="<your token>"
API=https://<your-app>.preview.emergentagent.com/api
curl -H "Authorization: Bearer $TOKEN" $API/auth/me
curl -H "Authorization: Bearer $TOKEN" $API/items
curl -H "Authorization: Bearer $TOKEN" -X POST $API/admin/seed
```

## Browser testing
```python
await page.context.add_cookies([{
    "name": "session_token",
    "value": "<token>",
    "domain": "<your-app>.preview.emergentagent.com",
    "path": "/",
    "httpOnly": True,
    "secure": True,
    "sameSite": "None"
}])
await page.goto("https://<your-app>.preview.emergentagent.com/dashboard")
```

## Roles
- `admin` (first user)
- `admin_gudang`, `approver`, `pengelola_aset`, `peminta`

## Public endpoints (no auth)
- POST `/api/spb` - submit SPB request (public form)
- GET `/api/assets/{id}` - read asset info (mobile inspection landing)
- GET `/api/spb/{id}` - read SPB for printable preview
- GET `/api/assets/{id}/qr.png` - generated QR

All other endpoints require `session_token` cookie or `Authorization: Bearer ...` header.
