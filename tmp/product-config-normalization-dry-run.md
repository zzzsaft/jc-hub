# 前 5 份配置表 normalization dry-run

只读：使用已导出的 extraction_json 本地运行编译后的 normalizeExtraction，未写库，未调用 LLM。

| documentId | before fields | after fields | existing candidates | key checks |
| --- | ---: | ---: | ---: | --- |
| 4 | 48 | 49 | 30 | qualifier kept; no 90℃ choker; empty docInfo skipped |
| 6 | 20 | 17 | 8 | qualifier kept; no 90℃ choker; empty docInfo skipped |
| 7 | 50 | 53 | 4 | qualifier kept; no 90℃ choker; empty docInfo skipped |
| 8 | 85 | 85 | 11 | qualifier kept; no 90℃ choker; empty docInfo skipped |
| 9 | 1 | 1 | 3 | no 90℃ choker; empty docInfo skipped; extraction漏抽仍需重抽策略 |

## document 4

- file: 生产明细（231411）2023-06-10-1900mmCPE流延膜手动模头.xls
- document_info after: {"order_number":"CG202305000441","product_number":"231411","contract_number":"20230530-01"}
- item 1 unknown: 适用塑料原料="CPE"; 应用="流延缠绕膜"; 模唇厚度调节范围={"value":{"label":"模唇厚度调节范围","value":{"value":0.8,"unit":"mm","raw_value":"0.8mm"}},"qualifier":{"area":"模唇"},"sourceText":"模唇"}; 上模唇调节方式={"value":"手动推式微调","qualifier":{"position":"上模","area":"模唇"},"sourceText":"上模"}; 下模唇调节方式={"value":"下模整体结构","qualifier":{"position":"下模","area":"模唇"},"sourceText":"下模"}; 阻流棒配置="无"; 加热方式="不锈钢加热棒"; 模头加热分区="9"; 侧板加热配置={"value":"没有","qualifier":{"area":"侧板"},"sourceText":"侧板"}; 模唇加热配置={"value":"没有","qualifier":{"area":"模唇"},"sourceText":"模唇"}; 模唇加热方式={"value":null,"qualifier":{"area":"模唇"},"sourceText":"模唇"}; 加热电压={"value":380,"unit":"V","raw_value":"380 V"}; 加热频率={"value":50,"unit":"Hz","raw_value":"50 Hz"}; 接线方式="带护罩全封闭接线"; 模体材质="B（2311A）"; 模唇表面粗糙度={"min":0.02,"max":0.03,"unit":"μm","raw_value":"A级（0.02-0.03μm)"}; 表面镀层要求="镀铬"; 流道表面镀层厚度={"min":0.02,"max":0.04,"unit":"mm","raw_value":"0.02-0.04mm"}

## document 6

- file: 配件生产明细表-（2023-380-E）-07-05-JC-90-E计量泵.xlsx
- document_info after: {}
- item 1 unknown: 计量泵型号="JC-90-E"; 数量={"value":2,"unit":"set","raw_value":"2套"}; 适用塑料原料="PET"; 应用="片材"; 泵体加热电压={"value":{"value":220,"unit":"V","raw_value":"220 V"},"qualifier":{"area":"泵体"},"sourceText":"泵体"}; 加热频率={"value":50,"unit":"Hz","raw_value":"50 Hz"}; 泵体加热方式={"value":"加热棒","qualifier":{"area":"泵体"},"sourceText":"泵体"}; 接线方式="专用接线盒封闭接线"; 产品材质="标准"

## document 7

- file: 模头生产明细表（181120-E）2018-8-2-905mmPET片材模头.xls
- document_info after: {"product_number":"181120-E","contract_number":"7180711"}
- item 1 unknown: 适用塑料原料="PET"; 应用="片材"; 产量={"min":500,"max":600,"unit":"kg","raw_value":"500-600KG/每小时"}; 适合产量=null; 模唇厚度调节范围={"value":{"label":"模唇厚度调节范围","value":{"value":2,"unit":"mm","raw_value":"2.0mm"}},"qualifier":{"area":"模唇"},"sourceText":"模唇"}; 模唇数量={"value":null,"qualifier":{"area":"模唇"},"sourceText":"模唇"}; 上模唇调节方式={"value":"手动推式微调（微调处配不锈钢保护板）","qualifier":{"position":"上模","area":"模唇"},"sourceText":"上模"}; 下模唇调节方式={"value":"下模整体结构","qualifier":{"position":"下模","area":"模唇"},"sourceText":"下模"}; 阻流棒配置="无"; 加热方式="不锈钢加热棒"; 模头加热分区="5"; 侧板加热配置={"value":"有","qualifier":{"area":"侧板"},"sourceText":"侧板"}; 模唇加热配置={"value":"有","qualifier":{"area":"模唇"},"sourceText":"模唇"}; 模唇加热方式={"value":"加热棒","qualifier":{"area":"模唇"},"sourceText":"模唇"}; 加热电压={"value":250,"unit":"V","raw_value":"250 V"}; 加热频率={"value":50,"unit":"Hz","raw_value":"50 Hz"}; 接线方式="带护罩全封闭接线"; 模体材质="A （1.2714）"

## document 8

- file: 模头生产明细表（181541-E）2018-11-1-1050mmWPC自由发泡板模头和2层AB分配器.xls
- document_info after: {"product_number":"181541-E","contract_number":"7181011"}
- item 1 unknown: 适用塑料原料="WPC"; 应用="自由发泡板"; 产量={"min":600,"max":800,"unit":"kg","raw_value":"600-800KG/每小时"}; 适合产量=null; 模唇厚度调节范围={"value":{"label":"模唇厚度调节范围","value":null},"qualifier":{"area":"模唇"},"sourceText":"模唇"}; 模唇数量={"value":{"min":1,"max":2,"unit":"mm","raw_value":"下模唇（3）套 1-2mm ,2-4mm, 4-7mm"},"qualifier":{"position":"下模","area":"模唇"},"sourceText":"下模"}; 上模唇调节方式={"value":["上模唇采用减力推","拉式机械装置微调结构","下模唇可更换或固定。（90°）"],"qualifier":{"position":"上模","area":"模唇"},"sourceText":"上模"}; 下模唇调节方式={"value":["下模唇固定","并可更换"],"qualifier":{"position":"下模","area":"模唇"},"sourceText":"下模"}; 阻流棒配置="有"; 上模阻流棒角度={"value":"90°阻流棒","qualifier":{"position":"上模"},"sourceText":"上模"}; 加热方式="不锈钢加热棒"; 模头加热分区="5"; 侧板加热配置={"value":"有","qualifier":{"area":"侧板"},"sourceText":"侧板"}; 模唇加热配置={"value":"有","qualifier":{"area":"模唇"},"sourceText":"模唇"}; 模唇加热方式={"value":"加热棒","qualifier":{"area":"模唇"},"sourceText":"模唇"}; 加热电压={"value":230,"unit":"V","raw_value":"230 V"}; 加热频率={"value":50,"unit":"Hz","raw_value":"50 Hz"}; 接线方式="带护罩全封闭接线"
- item 2 unknown: 分配器数量={"value":1,"unit":"set","raw_value":"1 套"}; 大分流芯棒数量=null; 适用塑料原料="WPC"; 层数="2"; 层结构="AB"; 每层复合比例={"label":"每层复合比例","value":["A7%","B 93%"]}; 产品主体加热方式={"value":"加热棒","qualifier":{"area":"产品主体"},"sourceText":"产品主体"}; 加热电压={"value":230,"unit":"V","raw_value":"230 V"}; 加热频率={"value":50,"unit":"Hz","raw_value":"50 Hz"}; 加热功率="KW"; 产量={"min":600,"max":800,"unit":"kg","raw_value":"600-800KG/H"}; 接线方式="专用接线盒封闭接线"; 产品材质={"value":"3Cr13钢材","qualifier":{"selector":"特殊","sourceText":"特殊"},"sourceText":"特殊"}; 表面镀层要求="镀铬"
- item 3 unknown: 分配器数量={"value":2,"unit":"set","raw_value":"2 套"}; 大分流芯棒数量=null; 适用塑料原料="LDPE LLDPE"; 层数="3"; 层结构="ABA"; 每层复合比例={"label":"每层复合比例","value":["15%","70%","15%"]}; 产品主体加热方式={"value":"加热棒","qualifier":{"area":"产品主体"},"sourceText":"产品主体"}; 加热电压={"value":220,"unit":"V","raw_value":"220 V"}; 加热频率={"value":50,"unit":"Hz","raw_value":"50 Hz"}; 加热功率={"value":5,"unit":"kW","raw_value":"5 KW"}; 产量={"value":350,"unit":"KG/H","raw_value":"350KG/H"}; 接线方式="专用接线盒封闭接线"; 产品材质={"value":1.2714,"unit":"钢","raw_value":"1.2714钢"}; 表面镀层要求="镀铬"

## document 9

- file: 配件生产明细表：（2018-231-E）2018-05-29-GD-E45计量泵（泵体）.xls
- document_info after: {}
- item 1 unknown: 数量="壹套"
