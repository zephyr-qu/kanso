#!/usr/bin/env python3
"""品牌字「簡」的唯一来源：取轮廓 -> 落地页 mark / favicon / 应用字体。

为什么需要它
------------
应用自托管的 Noto Serif SC 是 1180 字形的子集，**里面没有 U+7C21**。不补的话，
应用内 mark、favicon、落地页 mark 的「簡」会各自落到所在平台的系统衬线字体，
三处形状不同（Windows 是宋体、macOS 是宋体家族、Linux 又一套）。

本脚本把同一个字形铺到三处：
- apps/landing/favicon.svg 与 web/public/favicon.svg：轮廓路径（两份必须逐字节一致）。
  favicon 作为图片无法加载 webfont，只能走路径。
- apps/landing/index.html 的 <symbol id="kanso-mark">：顶栏与页脚两处 mark 用 <use> 引用它，
  同样不依赖字体。
- web/src/assets/fonts/noto-serif-sc-{400,600}.woff2：应用内 mark 仍是文本渲染，
  把字形合并进字体子集，应用才不需要靠系统回落。

**重新生成应用字体子集后必须重跑本脚本**，否则「簡」会静默消失、mark 退回系统字体。
`--check` 只校验、不写入，可用于确认三者没有跑偏。

依赖：pip install fonttools brotli
用法：python web/tools/build-brand-mark.py [--check]
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys
import urllib.request

from fontTools.misc.transform import Transform
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

CP = 0x7C21  # 「簡」
ROOT = pathlib.Path(__file__).resolve().parents[2]
LANDING = ROOT / "apps" / "landing"
APP_FONT_DIR = ROOT / "web" / "src" / "assets" / "fonts"
CACHE = ROOT / "temp" / "fonts" / "noto-serif-sc-chunk.woff2"
WEIGHTS = ("400", "600")

FONT_CSS = "https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600&display=swap"
# Google Fonts 只对浏览器 UA 返回 woff2 分片。
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

# favicon 画布 64x64：rect rx=14，字形按 <text x=32 y=45 font-size=38 text-anchor=middle> 定位。
GLYPH_SIZE = 38.0
GLYPH_CENTER_X = 32.0
GLYPH_BASELINE_Y = 45.0

SYMBOL_RE = re.compile(r'(<symbol id="kanso-mark">).*?(</symbol>)', re.S)


def fetch_source() -> TTFont:
    """取一份含「簡」的 Noto Serif SC 分片（有缓存就用缓存）。"""
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        css = urllib.request.urlopen(
            urllib.request.Request(FONT_CSS, headers={"User-Agent": UA}), timeout=60
        ).read().decode("utf-8")
        url = None
        for block in re.findall(r"@font-face \{(.*?)\}", css, re.S):
            rng = re.search(r"unicode-range: (.*?);", block, re.S)
            if rng and f"{CP:04x}" in rng.group(1).lower():
                url = re.search(r"url\((.*?)\)", block).group(1)
                break
        if not url:
            sys.exit(f"Google Fonts 的分片里没有 U+{CP:04X}")
        CACHE.write_bytes(urllib.request.urlopen(url, timeout=60).read())
        print(f"已缓存字体分片：{CACHE.relative_to(ROOT)}（{CACHE.stat().st_size} 字节）")
    return TTFont(CACHE)


def glyph_path(font: TTFont) -> str:
    """把「簡」的轮廓导出成 favicon 64 格坐标系里的 SVG 路径。"""
    name = font.getBestCmap().get(CP)
    if not name:
        sys.exit(f"字体里没有 U+{CP:04X}")
    scale = GLYPH_SIZE / font["head"].unitsPerEm
    origin_x = GLYPH_CENTER_X - (font["hmtx"][name][0] * scale) / 2
    pen = SVGPathPen(font.getGlyphSet())
    font.getGlyphSet()[name].draw(
        TransformPen(pen, Transform(scale, 0, 0, -scale, origin_x, GLYPH_BASELINE_Y))
    )
    return pen.getCommands()


def favicon_svg(path_d: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n'
        '  <rect width="64" height="64" rx="14" fill="#c2410c"/>\n'
        '  <rect x="1" y="1" width="62" height="62" rx="13" fill="none" '
        'stroke="rgba(255,248,240,0.25)" stroke-width="1"/>\n'
        f'  <path fill="#fff8f0" d="{path_d}"/>\n'
        "</svg>\n"
    )


def merge_into_app_font(source: TTFont, weight: str) -> str:
    """把字形合并进应用字体子集；已存在则跳过。返回一句话状态。"""
    target = APP_FONT_DIR / f"noto-serif-sc-{weight}.woff2"
    font = TTFont(target)
    if CP in font.getBestCmap():
        return f"{weight}: 已含 U+{CP:04X}，跳过"
    name = source.getBestCmap()[CP]
    before = len(font.getGlyphOrder())
    # 顺序要在插入之前取好：插完再问 getGlyphOrder()，fontTools 会把 glyf 与 hmtx 里的
    # 新名字各算一次（1182 != 1181），保存时 maxp 断言失败。
    order = list(font.getGlyphOrder())
    font["glyf"][name] = source["glyf"][name]
    font["hmtx"][name] = source["hmtx"][name]
    # vmtx 同样必须每个字形一条，否则 numGlyphs 与 vmtx 条数对不上，浏览器 OTS 直接拒载。
    if "vmtx" in font and "vmtx" in source:
        font["vmtx"][name] = source["vmtx"][name]
    font.setGlyphOrder(order + [name])
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[CP] = name
    font.save(target)
    return f"{weight}: {before} -> {before + 1} 字形，{target.stat().st_size // 1024}KB"


def symbol_snippet(path_d: str) -> str:
    return f'<symbol id="kanso-mark"><path d="{path_d}" /></symbol>'


def check(path_d: str) -> list[str]:
    """校验三处是否都用了同一条轮廓。返回问题清单（空 = 一致）。"""
    problems: list[str] = []
    landing_favicon = (LANDING / "favicon.svg").read_text()
    app_favicon = (ROOT / "web" / "public" / "favicon.svg").read_text()
    if landing_favicon != app_favicon:
        problems.append("两份 favicon 内容不一致")
    if f'd="{path_d}"' not in landing_favicon:
        problems.append("favicon 里的轮廓与字体里的不一致")
    html = (LANDING / "index.html").read_text(encoding="utf-8")
    if len(SYMBOL_RE.findall(html)) != 1:
        problems.append("index.html 里找不到唯一的 <symbol id=\"kanso-mark\">")
    elif symbol_snippet(path_d) not in html:
        problems.append("index.html 的 <symbol> 轮廓与字体里的不一致")
    for weight in WEIGHTS:
        font = TTFont(APP_FONT_DIR / f"noto-serif-sc-{weight}.woff2")
        if CP not in font.getBestCmap():
            problems.append(f"应用字体 {weight} 里没有 U+{CP:04X}（mark 会退回系统字体）")
    return problems


def main() -> int:
    # Windows 控制台默认 GBK：不切到 UTF-8，打印中文与 ✓/✗ 会直接抛 UnicodeEncodeError。
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="提取并铺开品牌字「簡」")
    parser.add_argument("--check", action="store_true", help="只校验，不写入")
    args = parser.parse_args()

    path_d = glyph_path(fetch_source())

    if args.check:
        problems = check(path_d)
        for line in problems:
            print(f"✗ {line}")
        print("✓ 落地页 mark、favicon、应用字体三处轮廓一致" if not problems else "")
        return 1 if problems else 0

    svg = favicon_svg(path_d)
    for target in (LANDING / "favicon.svg", ROOT / "web" / "public" / "favicon.svg"):
        target.write_text(svg)
        print(f"{target.relative_to(ROOT)}: {len(svg)} 字节")

    html_file = LANDING / "index.html"
    html = html_file.read_text(encoding="utf-8")
    html, count = SYMBOL_RE.subn(symbol_snippet(path_d), html)
    if count != 1:
        sys.exit('index.html 里应有且只有一个 <symbol id="kanso-mark">')
    html_file.write_text(html, encoding="utf-8")
    print("apps/landing/index.html: <symbol id=\"kanso-mark\"> 已更新")

    source = fetch_source()
    for weight in WEIGHTS:
        print(merge_into_app_font(source, weight))

    problems = check(path_d)
    print("校验:", "通过" if not problems else " | ".join(problems))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
