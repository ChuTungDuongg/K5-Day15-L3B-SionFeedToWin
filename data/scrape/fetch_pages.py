"""Tải các trang nguồn về Ocean Park và lưu bản text thô (không commit) để trích dữ kiện.

Chạy: python data/scrape/fetch_pages.py   (thêm --refresh để tải lại cả trang đã có)
Kết quả: data/scrape/raw/<slug>.txt (đã có trong .gitignore) + data/scrape/raw/index.json
"""
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import time
import urllib.request

SOURCES = [
    "https://vinwonders.com/vi/wonderpedia/news/cong-vien-song-vinwonders-wave-park/",
    "https://vinwonders.com/vi/wonderpedia/news/vinwonders-water-park-gia-ve-gio-hoat-dong/",
    "https://vinwonders.com/vi/wonderpedia/news/bien-nhan-tao-vinhomes-ocean-park-2/",
    "https://vinwonders.com/vi/wonderpedia/news/vinhomes-ocean-park-tron-bo-kinh-nghiem-vui-choi/",
    "https://vinwonders.com/vi/wonderpedia/news/vinhomes-ocean-park-3-phia-dong-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/ocean-city-phia-dong-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/cong-vien-nuoc-ocean-park-3-gia-ve-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/review-grand-world-co-gi/",
    "https://vinwonders.com/vi/wonderpedia/news/thuyen-gondola/",
    "https://vinwonders.com/en/wonderpedia/news/grand-world-travel-guide/",
    "https://www.greensm.com/vn-vi/news/bien-nhan-tao-vinhomes-ocean-park",
    "https://vinwonders.com/vi/wonderpedia/news/aquafield-ocean-city-sauna-spa-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/an-gi-o-grand-world/",
    "https://vinwonders.com/vi/wonderpedia/news/quan-nhau-tu-do-grand-world/",
    "https://vinwonders.com/vi/wonderpedia/news/bien-nhan-tao-hung-yen-vinwonders-wave-park/",
    "https://vinwonders.com/en/wonderpedia/news/vinhomes-ocean-park-2-an-in-depth-review/",
    "https://www.greensm.com/vn-vi/news/vinhomes-ocean-park-3-co-gi-an",
    "https://www.greensm.com/vn-vi/news/vincom-mega-mall-vinhomes-ocean-park",
    "https://market.vinhomes.vn/blog/tat-tan-tat-ve-ocean-city-choi-dau-an-gi-di-chuyen-the-nao",
    "https://market.vinhomes.vn/blog/tong-hop-lich-trinh-xe-buyt-den-vinhomes-ocean-park-3-moi-nhat-2025",
    # Lưu trú (đợt 3). staynfun.vinpearl.com chặn cả script lẫn trình duyệt (Cloudflare) nên đã bỏ.
    "https://market.vinhomes.vn/en/blog/kham-pha-top-10-dia-diem-vui-choi-tai-vinhomes-ocean-park-3",
    "https://www.greensm.com/vn-vi/news/homestay-ocean-park-gia-lam",
    "https://vinwonders.com/en/wonderpedia/news/hung-yen-province-travel/",
    # Ăn uống quanh Ocean Park, khu Vin và Hà Nội (đợt 4)
    "https://market.vinhomes.vn/blog/vinhomes-ocean-park-2-kinh-nghiem-an-choi-cac-diem-den-hap-dan",
    "https://vinwonders.com/en/wonderpedia/news/vinhomes-ocean-park-3/",
    "https://www.greensm.com/vn-vi/news/tiem-ca-phe-thu-bao-gia-lam",
    "https://www.greensm.com/vn-vi/news/quan-ngon-long-bien",
    "https://www.greensm.com/vn-vi/news/cafe-long-bien",
    "https://www.greensm.com/vn-vi/news/quan-nuong-long-bien",
    "https://www.greensm.com/vn-vi/news/quan-lau-long-bien",
    "https://www.greensm.com/vn-vi/news/buffet-long-bien",
    "https://www.greensm.com/vn-vi/news/quan-chay-long-bien",
    "https://vinwonders.com/vi/wonderpedia/news/check-in-13-quan-cafe-long-bien-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/7-quan-chay-long-bien-ha-noi-noi-tieng/",
    "https://vinwonders.com/vi/wonderpedia/news/quan-an-ngon-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/an-toi-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/quan-lau-ngon-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/quan-dimsum-ngon-o-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/buffet-hai-san-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/quan-cafe-lam-viec-o-ha-noi/",
    # Bar, pub, nhậu, karaoke, chơi đêm / ngày ở Hà Nội (đợt 5)
    "https://www.greensm.com/vn-vi/news/bar-cau-giay",
    "https://www.greensm.com/vn-vi/news/pub-cau-giay-ha-noi",
    "https://www.greensm.com/vn-vi/news/top-of-ha-noi",
    "https://vinwonders.com/vi/wonderpedia/news/quan-nhau-ngon-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/quan-bia-hoi-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/cafe-nhac-song-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/cafe-trung-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/oc-dem-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/an-dem-ha-noi/",
    "https://www.greensm.com/vn-vi/news/karaoke-hoang-mai-ha-noi",
    "https://www.greensm.com/vn-vi/news/quan-karaoke-cau-giay",
    "https://www.greensm.com/vn-vi/news/karaoke-ba-dinh",
    "https://www.greensm.com/vn-vi/news/music-box-dong-da",
    "https://vinwonders.com/vi/wonderpedia/news/kham-pha-ha-noi-ve-dem/",
    "https://vinwonders.com/vi/wonderpedia/news/dia-diem-vui-choi-ha-noi-buoi-toi/",
    "https://vinwonders.com/vi/wonderpedia/news/dia-diem-vui-choi-ha-noi/",
    "https://vinwonders.com/vi/wonderpedia/news/dia-diem-vui-choi-ha-noi-cho-nhom-ban/",
    # Trò chơi và quy định vé theo chiều cao (đợt 6)
    "https://vinwonders.com/vi/vinwonders-wave-park-water-park-price-regulations/",
    # vinpearl.com trả 403 cho bot nên không dùng (không lách chặn).
]
RAW = Path(__file__).resolve().parent / "raw"


class _Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "header", "footer", "nav"}
    BLOCK = {"p", "li", "h1", "h2", "h3", "h4", "tr", "br", "div", "td"}

    def __init__(self):
        super().__init__()
        self.parts, self.depth = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.depth += 1
        elif tag in self.BLOCK:
            self.parts.append("\n")
            if tag in {"h1", "h2", "h3", "h4"}:
                self.parts.append("## ")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.depth:
            self.depth -= 1

    def handle_data(self, data):
        if not self.depth:
            self.parts.append(data)


def to_text(html):
    parser = _Text()
    parser.feed(html)
    lines = (re.sub(r"\s+", " ", line).strip() for line in "".join(parser.parts).splitlines())
    return "\n".join(line for line in lines if len(line) > 1)


def main():
    """Mặc định chỉ tải trang mới hoặc lỗi lần trước; `--refresh` tải lại tất cả."""
    RAW.mkdir(exist_ok=True)
    refresh = "--refresh" in sys.argv
    previous = {}
    if (RAW / "index.json").exists() and not refresh:
        previous = {row["url"]: row for row in json.loads((RAW / "index.json").read_text(encoding="utf-8"))
                    if row["status"] == "ok" and (RAW / f"{row['slug']}.txt").exists()}
    index = []
    for url in SOURCES:
        slug = url.rstrip("/").rsplit("/", 1)[-1]
        if url in previous:
            index.append(previous[url])
            continue
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (research-bot)"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                html = response.read().decode("utf-8", "replace")
            text = to_text(html)
            (RAW / f"{slug}.txt").write_text(text, encoding="utf-8")
            status = "ok"
        except Exception as error:  # ghi lỗi, không dừng cả lượt
            text, status = "", f"error: {error}"
        index.append({"url": url, "slug": slug, "status": status, "chars": len(text),
                      "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
        print(status, len(text), url)
        time.sleep(1)
    (RAW / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
