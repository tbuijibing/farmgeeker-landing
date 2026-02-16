import requests, hashlib, time, sys
requests.packages.urllib3.disable_warnings()

BT_URL = "https://38.165.20.222:14038"
BT_KEY = "E0WhOhfn82NvetCAUljNMBWRNQqPEkPM"

def bt_api(path, params={}):
    now = int(time.time())
    token = hashlib.md5(BT_KEY.encode()).hexdigest()
    request_token = hashlib.md5((str(now) + token).encode()).hexdigest()
    params['request_time'] = now
    params['request_token'] = request_token
    try:
        r = requests.post(f"{BT_URL}{path}", data=params, verify=False, timeout=60)
        return r.json()
    except Exception as e:
        return {"status": False, "msg": str(e)}

# Read the HTML files
print("Reading files...", flush=True)
with open('/Users/justin/.openclaw/workspace/projects/wecom-ops/landing/index.html', 'r', encoding='utf-8') as f:
    index_content = f.read()

with open('/Users/justin/.openclaw/workspace/projects/wecom-ops/landing/partner.html', 'r', encoding='utf-8') as f:
    partner_content = f.read()

print(f"index.html size: {len(index_content)} bytes", flush=True)
print(f"partner.html size: {len(partner_content)} bytes", flush=True)

# Deploy index.html
print("\nDeploying index.html...", flush=True)
result = bt_api("/files?action=SaveFileBody", {
    "path": "/www/wwwroot/farmgeeker/index.html",
    "data": index_content,
    "encoding": "utf-8"
})
print(f"Result: {result}", flush=True)

# Deploy partner.html
print("\nDeploying partner.html...", flush=True)
result = bt_api("/files?action=SaveFileBody", {
    "path": "/www/wwwroot/farmgeeker/partner.html",
    "data": partner_content,
    "encoding": "utf-8"
})
print(f"Result: {result}", flush=True)

print("\n✅ Deployment complete!", flush=True)
print("View at:", flush=True)
print("  - http://38.165.20.222/", flush=True)
print("  - http://38.165.20.222/partner.html", flush=True)
