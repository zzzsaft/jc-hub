# 报价单字典数据整理

整理来源：

- `scripts/form_fields.json`：已有报价配置表字段清单，当前打印配置也使用它。
- `src/components/quoteForm/**`：各产品配置表单源码中的固定选项。
- `src/components/quoteForm/formComponents/**`：通用枚举组件，例如加热方式、电压、材质。
- `src/pages/quoteAgent/**`：字典审核页面定义的后端字段结构和审核动作。

## 建议后端表结构字段

### term type

| 字段 | 说明 |
| --- | --- |
| `termType` | 标准字段 key，建议使用前端表单 `name`，例如 `heatingMethod` |
| `displayName` | 中文名，例如 `加热方式` |
| `quoteDisplayName` | 报价单展示名，初始可等于 `displayName` |
| `category` | 字段分类，建议用产品表单名或业务分组，例如 `DieForm / 模体配置` |
| `valueKind` | 值类型：`enum`、`enums`、`text`、`number`、`boolean`、`date` |
| `applicableProductTypes` | 适用产品类型；通用字段可填 `common` |
| `aliasNames` | 字段别名；初始建议放中文 label、历史中文字段名、常见同义词 |
| `sortOrder` | 排序 |

### enum value

| 字段 | 说明 |
| --- | --- |
| `termType` | 关联字段 key |
| `canonicalValue` | 标准值；建议与前端实际提交值一致 |
| `displayName` | 展示名；初始可等于 `canonicalValue` |
| `aliasNames` | 值别名；例如 `true` 可别名 `是 / 有 / 选配` |

## 产品类型建议

这些是报价配置表里已经有专用表单的产品类型，可作为 `applicableProductTypes` 初始值：

| canonicalValue | displayName | 对应表单 |
| --- | --- | --- |
| `die` | 平模/模头 | `DieForm` |
| `smart_regulator` | 智能调节器 | `SmartRegulator` |
| `metering_pump` | 熔体计量泵 | `MeteringPumpForm` |
| `feedblock` | 共挤复合分配器/分配器 | `FeedblockForm` |
| `manifold` | 合流器 | `ManifoldForm` |
| `filter` | 过滤器 | `FilterForm` |
| `thickness_gauge` | 测厚仪 | `ThicknessGaugeForm` |
| `hydraulic_station` | 液压站 | `HydraulicStationForm` |
| `coating_die` | 涂布模头 | `CoatingDieForm` |
| `parts` | 配件/赠品 | `PartsForm` |
| `other` | 其他产品 | `OtherForm` |
| `common` | 通用字段 | 通用 |

## 通用 term type

| termType | displayName | valueKind | 标准值/说明 |
| --- | --- | --- | --- |
| `productName` | 产品名称 | text | 通用报价行字段 |
| `productCode` | 产品编码 | text | 通用报价行字段 |
| `brand` | 品牌 | enum | `精诚`、`JC-TIMES`、`古迪` |
| `quantity` | 数量 | number | 通用报价行字段 |
| `unit` | 单位 | enum | 报价行：`套`、`米`、`千克`；配件：`件`、`套`、`个` |
| `unitPrice` | 单价 | number | 通用报价行字段 |
| `discountRate` | 折扣率(%) | number | 通用报价行字段 |
| `remark` | 备注/规格型号/其他备注 | text | 多个表单复用 |
| `material` | 适用原料/适用塑料原料 | enums | 见“通用标准值” |
| `dieMaterial` | 模体材质/分配器材质 | enum | 见“通用标准值” |
| `heatingMethod` | 加热方式/机体加热方式/模体加热方式 | enums | 见“通用标准值” |
| `powerInput` | 加热电压 | text | 复合对象：电压、频率、相 |
| `voltage` | 电压 | text | 复合对象：电压、频率、相 |
| `power` | 电压/功率 | text | 表单中语义不完全统一，建议后端确认是否拆分 |
| `temperature` | 工艺温度(℃) | number | 区间值，单位 ℃ |
| `production` | 产量/适用产量 | number | 区间值，常用单位 `kg/h`、`l/h` |
| `fastener` | 紧固件（螺丝） | enum | `12.9高强度` |

## 通用标准值

### `material`

| 分组 | canonicalValue |
| --- | --- |
| 高粘度 | `PEEK`、`PC`、`PET`、`PMMA`、`PVC`、`PES-P`、`PES-T`、`PVB` |
| 中粘度 | `ABS`、`HIPS`、`GPPS`、`PP`、`PETG`、`PLA` |
| 低粘度 | `LDPE`、`LLDPE`、`HDPE`、`EVA`、`POE`、`TPE` |

### `dieMaterial`

| 分组 | canonicalValue |
| --- | --- |
| 合金钢 | `XPM光学级`、`1.2311锻件`、`1.2311A锻件`、`1.2714锻件`、`SUS420锻件` |
| 不锈钢 | `SUS630锻件`、`SUS304锻件`、`SUS316锻件`、`SUS316L锻件`、`4Cr13锻件`、`3Cr13锻件` |
| 特殊材料 | `哈氏合金钢锻件` |

### `heatingMethod`

标准值：`油加温`、`加热棒`、`加热圈`、`铸铝加热板`、`铸铜加热板`。

规则提示：

- `加热圈` 只在部分场景显示，例如过滤器。
- 温度达到或超过 330℃ 时，`铸铝加热板` 前端会禁用/移除。
- `铸铝加热板` 和 `铸铜加热板` 不能同时选择。

### 电源复合值

| 子字段 | 标准值 |
| --- | --- |
| voltage | `220`、`380` |
| frequency | `50`、`60` |
| phase | `单相`、`三相` |

### boolean 类值

前端同时存在两套展示：

- 是/否：`true`、`false`
- 有/无：`true`、`false`
- 选配/不选配：`true`、`false`

建议后端存储 canonicalValue 为布尔值或字符串 `true/false`，展示名按字段场景决定。

## DieForm 平模/模头字段

| termType | displayName | valueKind | 标准值/说明 |
| --- | --- | --- | --- |
| `dieMaterial` | 模体材质 | enum | 见通用 `dieMaterial` |
| `widthAdjustment` | 宽幅调节方式 | enums | `不可调节`、`外挡（技术设计）`、`开槽外挡`、`挂钩外挡`、`手动丝杆外挡`、`电动丝杆外挡`、`齿轮调节外挡`、`固定式内挡`、`手动丝杆内挡`、`电动丝杆内挡`、`不锈钢垫片`、`无` |
| `upperLipStructure` | 上模唇结构 | enum | `手动差动推式`、`手动全推式`、`手动推拉式`、`手动减力推拉式`、`自动全推式`、`自动推拉式`、`上模整体结构`、`推式弹性微调（中空专用）` |
| `lowerLipStructure` | 下模唇结构 | enum | `下模整体结构`、`下模固定可拆卸`、`下模可预粗调`、`下模快速开口`、`推式弹性微调（中空专用）` |
| `fineTuningSpacing` | 微调间距 | enum | `19`、`21`、`25.4`、`28.5`、`30` |
| `topFlowRestrictor` | 上模阻流棒 | enum | `无阻流棒`、`45°阻流棒`、`70°阻流棒`、`90°阻流棒` |
| `bottomFlowRestrictor` | 下模阻流棒 | enum | `无阻流棒`、`90°阻流棒` |
| `lipCount` | 模唇数量 | number | 1-5 |
| `lipThicknessRange` | 模唇厚度范围 | number | 列表/区间，单位 mm |
| `smartRegulator` | 是否搭配智能调节器 | boolean | 是/否 |
| `thicknessGauge` | 是否选配测厚仪 | boolean | 是/否 |
| `hasManifold` | 是否选配合流器 | boolean | 是/否 |
| `materialSource` | 原料来源 | enum | `乙方提供各原料样品流变曲线`、`甲方提供各原料样品500g供乙方检测`、`NA` |
| `productWidth` | 制品宽度(mm) | number | 区间，单位 mm |
| `dieWidth` | 口模有效宽度(mm) | number | 区间，单位 mm |
| `thickness` | 制品厚度(mm) | number | 区间，单位 mm |
| `lipOpening` | 模唇开口(mm) | number | 区间，单位 mm |
| `production` | 适用产量 | number | 区间，单位 `kg/h` 或 `l/h` |
| `temperature` | 工艺温度(℃) | number | 区间，单位 ℃ |
| `runnerType` | 流道形式 | enum | `单腔流道/衣架式`、`单腔流道/特殊支管式`、`单腔流道/PVB专用流道`、`单腔流道/TPU专用流道`、`单腔流道/EVA专用流道`、`单腔流道/中空专用流道`、`多腔流道` |
| `extrudeType` | 挤出类型/复合类型 | enum | `单层挤出`、`模内共挤`、`分配器共挤`、`分配器+模内共挤` |
| `runnerNumber` | 层数 | number | 常见 2-6 |
| `compositeStructure` | 复合结构 | text | 例如 A/B/C |
| `runnerLayers` | 每层复合比例 | text | 列表结构 |
| `haveThermalInsulation` | 是否选配隔热装置 | boolean | 是/否 |
| `installMethod` | 模头安装方式 | enum | `平挤出`、`下挤出`、`45° 挤出微调朝上`、`45° 挤出微调朝下`、`30° 斜三辊安装` |
| `feedingMethod` | 进料口方式 | enum | `中央圆口进料`、`中央方口进料`、`其他形状或不同位置进料` |
| `feedingSize` | 进料口尺寸 | enum | `供方设计`、`需方提供尺寸` |
| `hasCart` | 模头固定小车 | enum | `有`、`无` |
| `centerHeight` | 小车中心高度 | number | 单位 m |
| `wiringMethod` | 接线方式 | enum | `按精诚标准接线`、`带护罩全封闭接线`、`模体开槽接线`、`其他` |
| `powerCableLength` | 电源线长度 | number | 单位 m |
| `thermalExpansionCableLength` | 热膨胀数据长 | number | 单位 m |
| `bodyConnector` | 模体接插件 | enum | `方形`、`特殊` |
| `sideConnector` | 侧板接插件 | enum | `插头`、`金属软线`、`无` |
| `isBuySameProduct` | 是否购买过相同型号产品 | boolean | 是/否 |
| `lastProductCode` | 同型号产品编号/原产品编号 | text | 文本 |
| `isIntercompatible` | 是否与购买过的产品互配 | boolean | 是/否 |
| `intercompatibleProductCode` | 互配产品编号 | text | 文本 |
| `precisionLevel` | 精度等级 | enum | `S`、`A`、`B`、`custom` |
| `lipSurfacePrecision` | 模唇流面抛光精度 | enum | `0.015~0.025`、`0.02~0.03`、`0.04~0.05` |
| `otherSurfacePrecision` | 其它流面抛光精度 | enum | `0.02~0.03`、`0.03~0.04`、`0.04~0.06` |
| `shapePrecision` | 外形抛光精度 | enum | `0.06~0.08` |
| `hasLaser` | 是否激光硬化 | boolean | 是/否 |
| `hasPlating` | 是否电镀 | boolean | 是/否 |
| `platingRequirement` | 表面镀层要求 | enum | `镀铬`、`镀镍磷合金`、`其他` |
| `channelHardness` | 流道表面镀层硬度 | enum | `60-65Rockwellc` |
| `channelThickness` | 流道表面镀层厚度 | enum | `0.02~0.03`、`0.025~0.05`、`0.04~0.05` |
| `outerThickness` | 外表面镀层厚度 | enum | `0.01~0.02`、`0.02~0.03`、`0.03~0.04` |
| `surfaceRemark` | 表面处理备注 | text | 文本 |
| `thermostat` | 模温控制器 | boolean | `选配`/`不选配` |
| `每区电压` | 每区电压 | text | 默认 `5KW以内`，建议后端改成英文 key |
| `thermocoupleHoles` | 热电偶孔 | enum | `有`、`无`、`自定义` |
| `customThermocoupleHoles` | 自定义热电偶孔 | text | 文本 |
| `glassThermocouple` | 玻璃测温孔 | boolean | 有/无 |
| `heatingZones` | 模头加热分区数量 | number | 整数 |
| `glassHeatingZones` | 玻璃测温孔分区 | number | 整数 |
| `sideHeating` | 侧板加热 | boolean | 有/无 |
| `lipHeating` | 模唇加热 | boolean | 有/无 |
| `lipHeatingMethod` | 模唇加热方式 | enums | 见通用 `heatingMethod` |

## FeedblockForm 分配器字段

| termType | displayName | valueKind | 标准值/说明 |
| --- | --- | --- | --- |
| `material` | 适用塑料原料 | enums | 见通用 `material` |
| `dieMaterial` | 分配器材质 | enum | 见通用 `dieMaterial`，默认 `3Cr13锻件` |
| `production` | 分配器产量(kg/h) | number | 区间，单位 kg/h |
| `structure` | 分配器结构 | enum | `镶块式`、`摆叶式`、`芯棒式`、`精诚设计`、`特殊定制` |
| `customStructure` | 特殊定制说明 | text | 文本 |
| `layers` | 分配器层数 | enum | `两层`、`三层`、`四层`、`五层`、`七层`、`九层` |
| `extruderNumber` | 挤出机数量 | enum | `两台机`、`三台机`、`四台机`、`五台机`、`六台机`、`七台机`、`八台机`、`九台机` |
| `compositeList` | 层结构及比例 | text | 列表结构 |
| `heatingMethod` | 加热方式 | enums | 见通用 `heatingMethod` |
| `power` | 电压 | text | 复合对象：电压/频率/相 |
| `heatingPower` | 加热功率 | number | 单位 kw |
| `fastener` | 紧固件（螺丝） | enum | `12.9高强度` |
| `extruderOrientation` | 挤出机排列方向 | enum | `按供方提供图纸确认回传为准` |
| `wiredMethod` | 接线方式 | enum | `专用接线盒封闭接线` |
| `remark` | 其他备注 | text | 文本 |

## MeteringPumpForm 熔体计量泵字段

| termType | displayName | valueKind | 标准值/说明 |
| --- | --- | --- | --- |
| `material` | 适用原料 | enums | 见通用 `material` |
| `temperature` | 工艺温度(℃) | number | 区间，单位 ℃ |
| `type` | 类型 | enum | `普通计量泵`、`内冷式计量泵` |
| `shearSensitivity` | 材料特性 | enum | `低剪切敏感度`、`中剪切敏感度`、`高剪切敏感度` |
| `isCustomization` | 是否定制 | enum | `常规`、`定制` |
| `model` | 型号 | enum/text | 来源于泵产品数据；定制时可输入 |
| `pumpage` | 排量 | number | 单位 cm³/rev |
| `rotateSpeed` | 转速 | number | 单位 rpm |
| `production` | 产量 | number | 单位 kg/h |
| `heatingPower` | 加热功率 | number | 单位 kw |
| `options` | 计量泵配置 | enums | `泵体`、`传动系统`、`控制系统` |
| `pumpBracket` | 计量泵支架 | boolean | 是/否 |
| `pumpBracketSpec` | 计量泵支架配置 | enum | `精诚标准` |
| `pressureSensorHole` | 压力传感器孔 | boolean | 是/否 |
| `prePump` | 泵前 | enum | `国产`、`进口` |
| `postPump` | 泵后 | enum | `国产`、`进口` |
| `tcHoleSpec` | 热电偶孔规格 | enum | `螺纹规格M12×1.5，热电偶由需方自配。` |
| `pumpHeatingType` | 泵体加热方式 | enums | 见通用 `heatingMethod` |
| `pumpHeatingVoltage` | 泵体加热电压 | text | 复合对象：电压/频率/相 |
| `fastener` | 紧固件（螺丝） | enum | `12.9高强度` |
| `transmissionSystemBrand` | 传动系统品牌 | enum | `常州莱克斯诺公司`、`捷诺` |
| `variableSpeedMotor` | 调速电机 | enum | `【】KW变频`、`NA` |
| `reducer` | 减速箱 | enum | `1:【】（卧式）`、`NA` |
| `driveShaft` | 万向传动轴 | enum | `需方挤出机的中心高为：【】mm`、`NA` |
| `transmissionSystemVoltage` | 电机电压 | text | 复合对象：电压/频率/相 |
| `prePumpControlSystem` | 泵前控制系统 | enum | `泵前国产熔体压力传感器；泵前压力闭环控制系统`、`泵前进口熔体压力传感器；泵前压力闭环控制系统`、`NA` |
| `prePumpControlSystemBrand` | 泵前控制系统品牌 | enum | `意大利杰弗伦` |
| `postPumpControlSystem` | 泵后控制系统 | enum | `泵后国产压力传感器`、`泵后进口压力传感器`、`NA` |
| `vfdPower` | 变频调速器功率 | number | 单位 KW |
| `vfdBrand` | 变频调速器品牌 | enum | `日本富士`、`安川` |
| `remark` | 其他备注 | text | 文本 |

## FilterForm 过滤器字段

| termType | displayName | valueKind | 标准值/说明 |
| --- | --- | --- | --- |
| `name` | 名称 | enum/text | 来源过滤器产品数据 |
| `isCustomization` | 常规/定制 | enum | `常规`、`定制` |
| `model` | 型号 | enum/text | 来源过滤器产品数据；定制时可输入 |
| `filterBoard` | 过滤板 | text | 来源过滤器产品数据 |
| `production` | 产量 | text | 来源过滤器产品数据 |
| `dimension` | 尺寸 | text | 来源过滤器产品数据 |
| `weight` | 重量 | text | 来源过滤器产品数据 |
| `filterDiameter` | 滤网直径 | text | 来源过滤器产品数据 |
| `effectiveFilterArea` | 有效过滤面积 | text | 来源过滤器产品数据 |
| `pressure` | 压力 | text | 来源过滤器产品数据 |
| `material` | 适用塑料原料 | enums | 见通用 `material` |
| `temperature` | 工艺温度(℃) | number | 区间，单位 ℃ |
| `voltage` | 电压 | text | 复合对象：电压/频率/相 |
| `power` | 过滤器功率 | number | 单位 kw |
| `heatingMethod` | 机体加热方式 | enums | 见通用 `heatingMethod`，此处显示 `加热圈` |
| `filterHolder` | 是否选配过滤器支架 | boolean | 是/否 |
| `safetyShield` | 过滤器安全护罩 | boolean | 是/否 |
| `safetyShieldSpec` | 安全护罩配置 | enum | `精诚标准` |
| `hydraulicStation` | 是否配置液压站 | boolean | 是/否 |
| `pressureSensorHole` | 压力传感器孔 | boolean | 是/否 |
| `preMesh` | 网前 | enum | `国产`、`进口` |
| `postMesh` | 网后 | enum | `国产`、`进口` |
| `meshBeltSpec` | 网带规格 | text | 列表结构 |
| `controlSystemCount` | 控制系统数量 | number | 整数 |
| `controlSystem` | 控制系统 | enum/text | 前端可输入 |
| `remark` | 备注 | text | 文本 |

## ThicknessGaugeForm 测厚仪字段

| termType | displayName | valueKind | 标准值/说明 |
| --- | --- | --- | --- |
| `model` | 型号 | enum | `WLV5`、`ULO3` |
| `operation` | 控制方式 | enum | `手动`、`自动`；`WLV5` 只能 `手动` |
| `width` | 适用宽度(mm) | enum | `500`、`1000`、`1500`、`2000`、`2500`、`3000`、`3500`；`WLV5` 最大 3000 |
| `robotControlBox` | 选配机械臂控制盒 | boolean | 是/否；仅 `ULO3` 可选是 |
| `boltControlBox` | 选配全马达螺栓控制盒 | boolean | 是/否；仅 `ULO3` 可选是 |

## SmartRegulator 智能调节器字段

| termType | displayName | valueKind | 标准值/说明 |
| --- | --- | --- | --- |
| `isBundled` | 是否配套新产品 | boolean | 是/否 |
| `lastProductCode` | 原产品编号 | text | 文本 |
| `torque` | 扭矩 | enum | `小扭矩`、`大扭矩` |
| `operator` | 机头 | enum | `单机头`、`双机头` |
| `vison` | 视觉 | enum | `含视觉`、`不含视觉`；前端 key 拼写为 `vison` |
| `thicknessGauge` | 是否选配测厚仪 | boolean | 是/否 |
| `remark` | 其他备注 | text | 文本 |

## PartsForm 配件字段

| termType | displayName | valueKind | 标准值/说明 |
| --- | --- | --- | --- |
| `quantity` | 数量 | number | 数量 |
| `unit` | 单位 | enum | `件`、`套`、`个` |
| `unitPrice` | 单价 | number | 单价 |
| `parts` | 配件明细 | text | 列表结构 |

## CoatingDieForm 涂布模头字段补充

源码里有专用涂布模头表单，但 `form_fields.json` 当前未提取到完整字段，建议后端单独补一批：

| termType | displayName | valueKind | 标准值/说明 |
| --- | --- | --- | --- |
| `process` | 工艺 | enum | 以源码 `PROCESS_OPTIONS` 为准 |
| `microAdjust` | 调节方式 | enum | `垫片调节`、`差动调节` |
| `installDirection` | 安装方向 | enum | `水平`、`垂直` |
| `liquidProperties` | 液体属性 | enums | `腐蚀性`、`磨蚀性`、`毒性`、`粘性`、`易结晶`、`易沉淀` |
| `liquidFeatures` | 液体特征 | enums | `水状`、`蜂蜜状`、`乳胶状`、`砂浆状`、`粘土浆状` |
| `fluidType` | 流体类型 | enum | `牛顿流体`、`非牛顿流体` |
| `processTemp` | 工艺温度 | number | 默认 `15~25℃` |
| `yieldUnit` | 产量单位 | enum | `kg/h`、`ml/min` |
| `substrate` | 基材 | enum | `玻璃` |
| `polishingRequired` | 是否抛光/处理 | enum | `需要`、`不需要` |
| `screwType` | 螺丝 | enum | `不锈钢螺丝` |
| `designSource` | 设计来源 | enum | `供方设计`、`需方提供尺寸` |

## quoteAgent 字典审核相关枚举

### 文档状态 `DocumentStatus`

| value | 说明 |
| --- | --- |
| `uploaded` | 已上传 |
| `parsed_blocks` | 已分块 |
| `extracted` | 已提取 |
| `normalized` | 已归一化 |
| `dictionary_dirty` | 待字典审核 |
| `failed` | 失败 |

### 候选状态 `CandidateStatus`

| value | 说明 |
| --- | --- |
| `pending` | 待审核 |
| `approved` | 已通过 |
| `rejected` | 已拒绝 |

### 候选类型 `CandidateType`

| value | 说明 |
| --- | --- |
| `term_type` | 字段 key 候选 |
| `value` | 标准值候选 |

### 审核动作 `ReviewAction`

| value | 说明 |
| --- | --- |
| `create_term_type` | 新建字段 key |
| `approve_term_type_as_alias` | 作为已有字段 key 的 alias |
| `create_value` | 新建标准值 |
| `approve_value_as_alias` | 作为已有标准值 alias |
| `split_value` | 拆分值 |
| `move_value_to_other_term_type` | 移动值到其他字段 key |
| `update_term_type_value_kind` | 更新字段值类型 |
| `reject` | 拒绝 |

### 字段值类型 `valueKind`

前端审核页可选：`enum`、`enums`、`text`、`number`、`boolean`、`date`。

## 需要后端确认/清洗的点

1. `每区电压` 当前直接作为字段 key 使用中文，建议后端迁移为英文 key，例如 `zoneVoltage`，同时保留 alias `每区电压`。
2. `vison` 是前端现有拼写，建议数据库标准 key 可用 `vision`，并把 `vison` 作为 alias，或短期沿用前端 key 避免兼容问题。
3. `power` 在不同表单里既表示电压复合值，也表示功率，建议拆成更明确的 `voltage`、`heatingPower`、`filterPower`。
4. `production` 在不同产品中表示产量，但单位和结构不同；建议保留同一 termType，使用单位字段区分，或按产品拆分。
5. `remark`、`lastProductCode`、`thicknessGauge` 等跨表单复用字段，应按业务含义决定是否共用同一个 termType。
6. CoatingDieForm、HydraulicStationForm、ManifoldForm 目前没有被 `form_fields.json` 完整覆盖，建议后续单独跑一次更强的字段提取脚本或人工补齐。
7. 产品型号、过滤器型号、泵型号来自后端产品数据，不应硬编码进字典标准值；字典里可只定义 termType 和 valueKind。
