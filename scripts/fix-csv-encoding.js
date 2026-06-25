#!/usr/bin/env node
// 生成 UTF-8 BOM 版 CSV，Excel 可直接正常打开中文
'use strict';
const fs   = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '订单导入模板.csv');

// UTF-8 BOM = EF BB BF
const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);

const content = [
  '项目名称,采购员,日期,物资名称,规格,品牌,单位,数量,单价',
  '雄安城服物业项目,李玉,2026-06-01,防锈漆,500g/桶 红色,立邦,桶,10,35.00',
  '雄安城服物业项目,李玉,2026-06-01,扳手,300mm,得力,把,5,28.50',
  '雄安城服物业项目,张三,2026-06-10,绝缘胶带,18mm×10m,3M,卷,20,8.00',
].join('\r\n') + '\r\n';

fs.writeFileSync(OUT, Buffer.concat([BOM, Buffer.from(content, 'utf-8')]));
console.log('✅ 已生成带 BOM 的 CSV：' + OUT);
console.log('   用 Excel 直接双击打开即可正常显示中文。');
