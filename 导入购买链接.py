"""
导入 SKU 购买链接到 Cloudflare D1
-------------------------------------
功能：读取 Excel 文件 → 生成 SQL 文件 → 可粘贴到 Cloudflare D1 控制台执行

使用方法：
  1. 确保已安装 openpyxl：pip install openpyxl
  2. 双击运行本脚本，或在命令行执行：python 导入购买链接.py
  3. 生成 purchase_links.sql 文件
  4. 打开 Cloudflare 控制台 → D1 → cfgs-purchase-db → Execute SQL
  5. 粘贴 SQL 内容执行
"""

import os
import openpyxl

# ── 配置 ─────────────────────────────────────────────────────────────
EXCEL_FILE = os.path.join(os.path.dirname(__file__), "SKU购买链接_可导入版.xlsx")
OUTPUT_SQL  = os.path.join(os.path.dirname(__file__), "purchase_links.sql")

# ── 读取 Excel ────────────────────────────────────────────────────────
print(f"读取文件: {EXCEL_FILE}")
try:
    wb = openpyxl.load_workbook(EXCEL_FILE)
except FileNotFoundError:
    print(f"❌ 找不到文件：{EXCEL_FILE}")
    print("请把 SKU购买链接_可导入版.xlsx 放到与本脚本相同的目录下")
    input("按回车退出...")
    exit(1)

ws = wb.active
rows = list(ws.iter_rows(values_only=True))

# 打印列名帮助识别
print("\n文件列名（第1行）：")
for i, col in enumerate(rows[0]):
    print(f"  列{i+1}: {col}")

print(f"\n共 {len(rows)-1} 行数据（不含表头）")

# ── 自动识别列 ────────────────────────────────────────────────────────
headers = [str(c).strip() if c else "" for c in rows[0]]

CODE_KEYWORDS  = ["编码", "code", "sku", "物料", "货号"]
URL_KEYWORDS   = ["链接", "url", "link", "地址", "网址"]

code_col = None
url_col  = None

for i, h in enumerate(headers):
    hl = h.lower()
    if code_col is None and any(k in hl for k in CODE_KEYWORDS):
        code_col = i
    if url_col is None and any(k in hl for k in URL_KEYWORDS):
        url_col = i

if code_col is None or url_col is None:
    print("\n⚠️  无法自动识别列，请手动指定列号（从0开始）：")
    for i, h in enumerate(headers):
        print(f"  {i}: {h}")
    code_col = int(input("SKU编码 所在列号: "))
    url_col  = int(input("购买链接 所在列号: "))

print(f"\n✅ 识别结果：SKU编码=列{code_col+1}「{headers[code_col]}」，购买链接=列{url_col+1}「{headers[url_col]}」")

# ── 生成 SQL ─────────────────────────────────────────────────────────
sql_lines = []
sql_lines.append("-- 购买链接批量导入 SQL")
sql_lines.append("-- 执行前请先确认已运行 ALTER TABLE 加列语句")
sql_lines.append("-- ALTER TABLE sku_library ADD COLUMN purchase_url TEXT DEFAULT '';")
sql_lines.append("")

ok_count   = 0
skip_count = 0

for row in rows[1:]:  # 跳过表头
    code = row[code_col]
    url  = row[url_col]

    if not code or not url:
        skip_count += 1
        continue

    code = str(code).strip()
    url  = str(url).strip()

    if not url.startswith("http"):
        skip_count += 1
        continue

    # 转义单引号
    code_escaped = code.replace("'", "''")
    url_escaped  = url.replace("'", "''")

    sql_lines.append(
        f"UPDATE sku_library SET purchase_url = '{url_escaped}' WHERE code = '{code_escaped}';"
    )
    ok_count += 1

sql_lines.append("")
sql_lines.append(f"-- 共生成 {ok_count} 条更新，跳过 {skip_count} 条空行/无效行")

# ── 写出文件 ──────────────────────────────────────────────────────────
with open(OUTPUT_SQL, "w", encoding="utf-8") as f:
    f.write("\n".join(sql_lines))

print(f"\n✅ 已生成 SQL 文件：{OUTPUT_SQL}")
print(f"   有效记录：{ok_count} 条")
print(f"   跳过：    {skip_count} 条（空行或链接无效）")
print("\n接下来：")
print("  1. 打开 https://dash.cloudflare.com")
print("  2. Workers & Pages → D1 → cfgs-purchase-db → 点击 Console")
print("  3. 打开 purchase_links.sql，全选复制内容，粘贴到控制台执行")
print("  4. 测试库(cfgs-purchase-db-dev)同理操作一次")
input("\n按回车退出...")
