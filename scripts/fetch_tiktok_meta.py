import urllib.request
import json
import re

url = "https://www.tiktok.com/@villainedits7/video/7621883548156398868"
req = urllib.request.Request(
    url,
    headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
)
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
        
    m = re.search(r"<title>(.*?)</title>", html)
    if m:
        print("Page title:", m.group(1))
        
    m_json = re.search(r'id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>', html)
    if m_json:
        data = json.loads(m_json.group(1))
        item = data.get("__DEFAULT_SCOPE__", {}).get("webapp.video-detail", {}).get("itemInfo", {}).get("itemStruct", {})
        desc = item.get("desc", "")
        print("Description:", desc.encode("ascii", errors="replace").decode("ascii"))
        music = item.get("music", {})
        print("Music Title:", str(music.get("title", "")).encode("ascii", errors="replace").decode("ascii"))
        print("Music Author:", str(music.get("authorName", "")).encode("ascii", errors="replace").decode("ascii"))
except Exception as e:
    print("Error:", e)
