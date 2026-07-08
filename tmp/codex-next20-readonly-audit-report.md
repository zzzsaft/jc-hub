# Codex Next 20 Readonly Audit

## Document 10 配件生产明细表：（2018-371-E & 2018-372-E & 2018-373-E）2018-09-06-GD-E45&56计量泵（泵体）带减速箱.xls

- extractionResultId: 14317
- approxBlocksTokens: 4225
- candidates: 8

### Normalized
```json
{
  "documentInfo": {
    "order_number": {
      "value": "",
      "rawKey": "order_number",
      "evidence": {},
      "confidence": 0,
      "canonicalKey": "order_number"
    },
    "customer_notes": [
      {
        "evidence": {},
        "raw_text": ">>>打“古迪Goodee\"标志！",
        "raw_value": "打古迪Goodee标志",
        "field_name": "标志要求/备注",
        "item_index": 1,
        "document_id": "10",
        "extraction_result_id": "14317"
      }
    ],
    "product_number": {
      "value": "2018-371-E & 2018-372-E & 2018-373-E",
      "rawKey": "product_number",
      "evidence": {},
      "confidence": 0.9,
      "canonicalKey": "product_number"
    },
    "contract_number": {
      "value": "7180822",
      "rawKey": "contract_number",
      "evidence": {},
      "confidence": 0.9,
      "canonicalKey": "contract_number"
    }
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "计量泵（GD-E56）",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "GD-E56",
          "selected": true,
          "warnings": [],
          "raw_value": "GD-E56",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "metering_pump_model",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "masterDataMatch": {
              "id": "10",
              "model": "GD-E56",
              "source": "crm_products_pump",
              "details": {
                "remark": "PET/PC/PMMA",
                "pumpage": "92.6cm³/rev",
                "production": "59.4~534.8kg/h",
                "rotateSpeed": "10~90rmp",
                "heatingPower": "3.2kw",
                "shearSensitivity": "低剪切敏感度"
              },
              "matched": true,
              "rawValue": "GD-E56",
              "matchMethod": "model_exact"
            },
            "normalized_value": "gde56",
            "normalized_field_name": "计量泵型号"
          },
          "field_name": "计量泵型号"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "壹套 [泵体序列号：2018100334]",
          "selected": true,
          "warnings": [],
          "raw_value": "2018100334",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "serial_number",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "2018100334",
            "candidate_term_types": [
              "serial_number",
              "metering_pump_serial_number"
            ],
            "normalized_field_name": "泵体序列号"
          },
          "field_name": "泵体序列号"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "排量 92.6 cm3/rev",
          "selected": true,
          "warnings": [],
          "raw_value": "92.6 cm3/rev",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "pump_displacement",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "92.6",
              "unitRaw": "cm3/rev",
              "rawValue": "92.6 cm3/rev",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "cm³/rev",
              "numericText": "92.6",
              "unitCanonical": "cm3/rev",
              "matchedAliasId": "6",
              "normalizedValue": "92.6 cm³/rev",
              "normalizedUnitRaw": "cm3/rev"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "92.6 cm³/rev",
            "normalized_field_name": "排量"
          },
          "field_name": "排量"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "转速 （  10－120  )转可调/每分钟",
          "selected": true,
          "warnings": [],
          "raw_value": "(10－120)转可调/每分钟",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "rotation_speed",
            "value_kind": "number_unit",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "(10－120)转可调/每分钟",
            "normalized_field_name": "转速"
          },
          "field_name": "转速"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "产量250kg/h",
          "selected": true,
          "warnings": [],
          "raw_value": "250kg/h",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "capacity",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "250",
              "unitRaw": "kg/h",
              "rawValue": "250kg/h",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "kg/h",
              "numericText": "250",
              "unitCanonical": "kg/h",
              "matchedAliasId": "7",
              "normalizedValue": "250 kg/h",
              "normalizedUnitRaw": "kg/h"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "250 kg/h",
            "normalized_field_name": "产量"
          },
          "field_name": "产量"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "原料：PP/PS",
          "selected": true,
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀",
              "raw_value": "PP/PS",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "raw_value": "PP/PS",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "PP",
                "confidence": 1,
                "displayName": "PP",
                "canonicalValue": "PP"
              },
              {
                "rawValue": "PS",
                "confidence": 0.9,
                "displayName": "PS",
                "canonicalValue": "PS"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "PP",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PP",
            "normalized_value": "pp/ps",
            "material_prefix_split": {
              "sourceRawValue": "PP/PS",
              "matchedMaterialTokens": [
                "PP",
                "PS"
              ]
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "电源电压及加热功率： ( 380V )/( 50 Hz)",
          "selected": true,
          "warnings": [],
          "raw_value": "380V",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "heating_voltage",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "380",
              "unitRaw": "V",
              "rawValue": "380V",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "V",
              "numericText": "380",
              "unitCanonical": "V",
              "matchedAliasId": "34",
              "normalizedValue": "380V",
              "normalizedUnitRaw": "v"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "380V",
            "normalized_field_name": "电源电压"
          },
          "field_name": "电源电压"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "电源电压及加热功率： ( 380V )/( 50 Hz)",
          "selected": true,
          "warnings": [],
          "raw_value": "50 Hz",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "heating_frequency",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "50",
              "unitRaw": "Hz",
              "rawValue": "50 Hz",
              "warnings": [],
              "numberKind": "single",
              "numericText": "50",
              "normalizedValue": "50Hz",
              "normalizedUnitRaw": "hz"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "50Hz",
            "normalized_field_name": "加热频率"
          },
          "field_name": "加热频率"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "功率 ( 7.5-11KW )",
          "selected": true,
          "warnings": [],
          "raw_value": "7.5-11KW",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "heating_power",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "KW",
              "rangeEnd": "11",
              "rangeMax": "11",
              "rangeMin": "7.5",
              "rawValue": "7.5-11KW",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "7.5",
              "displayUnit": "kW",
              "numericText": "7.5-11",
              "unitCanonical": "kW",
              "matchedAliasId": "8",
              "normalizedValue": "7.5-11 kW",
              "normalizedUnitRaw": "kw"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "7.5-11 kW",
            "normalized_field_name": "加热功率"
          },
          "field_name": "加热功率"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 加热棒",
          "selected": true,
          "warnings": [],
          "raw_value": "加热棒",
          "confidence": 0.95,
          "dictionary": {
            "note": "active term canonical/display self alias",
            "matched": true,
            "term_type": "heating_method",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "加热棒",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "heating_rod",
            "normalized_value": "加热棒",
            "normalized_field_name": "加热方式"
          },
          "field_name": "加热方式"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "紧固件（螺丝）： 12.9高强度",
          "selected": true,
          "warnings": [],
          "raw_value": "12.9高强度",
          "confidence": 0.95,
          "dictionary": {
            "note": "active term canonical/display self alias",
            "matched": true,
            "term_type": "screw_type",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "12.9高强度",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "12.9高强度",
            "normalized_value": "12.9高强度",
            "normalized_field_name": "紧固件"
          },
          "field_name": "紧固件"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "接线方式： 专用接线盒封闭接线",
          "selected": true,
          "warnings": [],
          "raw_value": "专用接线盒封闭接线",
          "confidence": 0.95,
          "dic
```

### Candidate
```json
[
  {
    "id": 88,
    "candidateType": "value",
    "termType": "metering_pump_model",
    "rawValue": "GD-E56",
    "normalizedRawValue": "gde56",
    "proposedCanonicalValue": null,
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "cell": "B28",
      "text": "GD-E56 壹套 [泵体序列号：2018100335\n]",
      "sheet": "生产明细表",
      "phase1_snapshot": true,
      "phase1_snapshot_reason": [
        "non_enum_value_candidate",
        "text_value_candidate"
      ]
    }
  },
  {
    "id": 89,
    "candidateType": "value",
    "termType": "metering_pump_model",
    "rawValue": "GD-E70",
    "normalizedRawValue": "gde70",
    "proposedCanonicalValue": null,
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "cell": "B49",
      "text": "GD-E70 壹套 [泵体序列号：2018100336\n]",
      "sheet": "生产明细表",
      "phase1_snapshot": true,
      "phase1_snapshot_reason": [
        "non_enum_value_candidate",
        "text_value_candidate"
      ]
    }
  },
  {
    "id": 292,
    "candidateType": "value",
    "termType": "heating_voltage",
    "rawValue": "380 V",
    "normalizedRawValue": "380v",
    "proposedCanonicalValue": "380",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "cell": "B55",
      "text": "( 380V )/( 50 Hz)",
      "sheet": "生产明细表",
      "phase1_snapshot": true,
      "phase1_snapshot_reason": [
        "non_enum_value_candidate"
      ]
    }
  },
  {
    "id": 297,
    "candidateType": "value",
    "termType": "metering_pump_options",
    "rawValue": "传动系统",
    "normalizedRawValue": "传动系统",
    "proposedCanonicalValue": "transmission_system",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "cell": "B8",
      "text": "[SEL] 传动系统",
      "source": "生产明细表",
      "block_id": "B8",
      "sourceRawValue": "传动系统",
      "splitFromRawValue": "传动系统"
    }
  },
  {
    "id": 369,
    "candidateType": "value",
    "termType": "reducer_mounting_type",
    "rawValue": "卧式",
    "normalizedRawValue": "卧式",
    "proposedCanonicalValue": "horizontal",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B63",
      "text": "[SEL] 卧式",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 497,
    "candidateType": "value",
    "termType": "transmission_system_config",
    "rawValue": "变频电机",
    "normalizedRawValue": "变频电机",
    "proposedCanonicalValue": null,
    "status": "pending",
    "confidence": null,
    "evidence": {
      "sourceRawValue": "变频电机, 减速箱, 万向传动轴",
      "splitFromRawValue": "变频电机"
    }
  },
  {
    "id": 498,
    "candidateType": "value",
    "termType": "transmission_system_brand",
    "rawValue": "莱克斯诺",
    "normalizedRawValue": "莱克斯诺",
    "proposedCanonicalValue": null,
    "status": "pending",
    "confidence": null,
    "evidence": {}
  },
  {
    "id": 3858,
    "candidateType": "value",
    "termType": "transmission_system_config",
    "rawValue": "减速箱",
    "normalizedRawValue": "减速箱",
    "proposedCanonicalValue": null,
    "status": "pending",
    "confidence": null,
    "evidence": {
      "sourceRawValue": "变频电机, 减速箱, 万向传动轴",
      "splitFromRawValue": "减速箱"
    }
  }
]
```

### Lines
- L1: 文件名：配件生产明细表：（2018-371-E & 2018-372-E & 2018-373-E）2018-09-06-GD-E45&56计量泵（泵体）带减速箱.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 客户ID：40214
- L14: [ ] 国内使用(   )
- L15: [SEL] 出口使用 国家( 亚美尼亚 )
- L16: option_set: {"options":[{"selected":false,"value":"国内使用(   )"},{"selected":true,"value":"出口使用 国家( 亚美尼亚 )"}],"field":"客户ID"}
- L19: 合同编号：7180822
- L20: 合同规定交货日期：2018-10-16
- L24: 下单日期：2018-09-06
- L25: 交货日期：2018-10-16
- L26: 完工日期：
- L32: [A7] 计量泵型号、数量
- L45: [A9] 挤出机型号、产量
- L59: 电源电压及加热功率： ( 380V )/( 50 Hz)
- L60: 功率 ( 7.5-11KW )
- L61: 加热方式：
- L62: [SEL] 加热棒
- L63: [ ] 加热板
- L66: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"加热板"}],"field":"电源电压及加热功率"}
- L70: 接线方式：
- L71: 专用接线盒封闭接线
- L75: 泵体材料选用：
- L78: option_set: {"options":[{"selected":true,"value":"标准"},{"selected":false,"value":"特殊"}],"field":"泵体材料选用"}
- L80: [A16] 压力传感器孔尺寸
- L87: 上下文：压力传感器孔尺寸
- L103: [A19] 备注
- L118: 规格（安装方式）：
- L122: option_set: {"options":[{"selected":true,"value":"卧式"},{"selected":false,"value":"直立"},{"selected":false,"value":"其它"}],"field":"规格（安装方式）"}
- L145: 下单日期：2018-09-06
- L146: 交货日期：2018-10-16
- L147: 完工日期：
- L153: [A28] 计量泵型号、数量
- L166: [A30] 挤出机型号、产量
- L180: 电源电压及加热功率： ( 380V )/( 50 Hz)
- L181: 功率 ( 7.5-11KW )
- L182: 加热方式：
- L183: [SEL] 加热棒
- L184: [ ] 加热板
- L187: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"加热板"}],"field":"电源电压及加热功率"}
- L191: 接线方式：
- L192: 专用接线盒封闭接线
- L196: 泵体材料选用：
- L199: option_set: {"options":[{"selected":true,"value":"标准"},{"selected":false,"value":"特殊"}],"field":"泵体材料选用"}
- L201: [A37] 压力传感器孔尺寸
- L208: 上下文：压力传感器孔尺寸
- L224: [A40] 备注
- L239: 规格（安装方式）：
- L243: option_set: {"options":[{"selected":true,"value":"卧式"},{"selected":false,"value":"直立"},{"selected":false,"value":"其它"}],"field":"规格（安装方式）"}
- L266: 下单日期：2018-09-06
- L267: 交货日期：2018-10-16
- L268: 完工日期：
- L274: [A49] 计量泵型号、数量
- L287: [A51] 挤出机型号、产量
- L301: 电源电压及加热功率： ( 380V )/( 50 Hz)
- L302: 功率 ( 11-15KW )
- L303: 加热方式：
- L304: [SEL] 加热棒
- L305: [ ] 加热板
- L308: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"加热板"}],"field":"电源电压及加热功率"}
- L312: 接线方式：
- L313: 专用接线盒封闭接线
- L317: 泵体材料选用：
- L320: option_set: {"options":[{"selected":true,"value":"标准"},{"selected":false,"value":"特殊"}],"field":"泵体材料选用"}
- L322: [A58] 压力传感器孔尺寸
- L329: 上下文：压力传感器孔尺寸
- L345: [A61] 备注
- L360: 规格（安装方式）：
- L364: option_set: {"options":[{"selected":true,"value":"卧式"},{"selected":false,"value":"直立"},{"selected":false,"value":"其它"}],"field":"规格（安装方式）"}
- L386: 计量泵图纸完工日期：
- L387: 联接器图纸完工日期：
- L396: 合同制作人：蔡金枝
- L400: 合同及生产单审核人员1：

## Document 11 连接器生产明细表（190282-E-200）2019-04-24连接器.xls

- extractionResultId: 14316
- approxBlocksTokens: 1836
- candidates: 2

### Normalized
```json
{
  "documentInfo": {
    "order_number": {
      "value": "",
      "rawKey": "order_number",
      "evidence": {
        "line": 0,
        "text": ""
      },
      "confidence": 0,
      "canonicalKey": "order_number"
    },
    "customer_notes": [
      {
        "evidence": {
          "line": 1,
          "text": "》》》要求打JCTIMES 标志! 加急"
        },
        "raw_text": "》》》要求打JCTIMES 标志! 加急",
        "raw_value": "要求打JCTIMES 标志! 加急",
        "field_name": "标志要求/备注",
        "item_index": 2,
        "document_id": "11",
        "extraction_result_id": "14316"
      }
    ],
    "product_number": {
      "value": "190282-E-200",
      "rawKey": "product_number",
      "evidence": {
        "line": 15,
        "text": "配件编号：190282-E-200"
      },
      "confidence": 0.95,
      "canonicalKey": "product_number"
    },
    "contract_number": {
      "value": "7190110",
      "rawKey": "contract_number",
      "evidence": {
        "line": 23,
        "text": "合同编号：7190110"
      },
      "confidence": 0.95,
      "canonicalKey": "contract_number"
    }
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "连接器",
      "quantity": "1件",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 有　　数量：共（          ）件",
          "selected": true,
          "warnings": [],
          "qualifier": {
            "area": "connector",
            "sourceText": "连接器"
          },
          "raw_value": "有",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "connector_config",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "有",
            "normalized_field_name": "连接器配置"
          },
          "field_name": "连接器配置"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 不锈钢加热圈",
          "selected": true,
          "warnings": [],
          "qualifier": {
            "area": "connector",
            "sourceText": "连接器"
          },
          "raw_value": "不锈钢加热圈",
          "confidence": 0.95,
          "dictionary": {
            "note": "active term canonical/display self alias",
            "matched": true,
            "term_type": "heating_method",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "不锈钢加热圈",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "stainless_steel_heating_coil",
            "normalized_value": "不锈钢加热圈",
            "normalized_field_name": "连接器加热方式"
          },
          "field_name": "连接器加热方式"
        },
        {
          "evidence": {
            "splitRule": "heating_method_implies_config",
            "sourceRawValue": "不锈钢加热圈",
            "sourceRawFieldName": "连接器加热方式"
          },
          "original": false,
          "raw_text": "[SEL] 不锈钢加热圈",
          "warnings": [],
          "qualifier": {
            "area": "connector",
            "sourceText": "连接器"
          },
          "raw_value": "有",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "heating_config",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "有",
            "normalized_field_name": "加热配置"
          },
          "field_name": "加热配置"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 供方精诚设计图纸",
          "selected": true,
          "warnings": [],
          "raw_value": "供方精诚设计图纸",
          "confidence": 0.95,
          "dictionary": {
            "note": "active term canonical/display self alias",
            "matched": true,
            "term_type": "connection_drawing_status",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "供方精诚设计图纸",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "jctimes_drawing",
            "normalized_value": "供方精诚设计图纸",
            "normalized_field_name": "联接尺寸图纸提供情况"
          },
          "field_name": "联接尺寸图纸提供情况"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 中英文",
          "selected": true,
          "warnings": [],
          "raw_value": "中英文",
          "confidence": 0.95,
          "dictionary": {
            "note": "active term canonical/display self alias",
            "matched": true,
            "term_type": "manual_requirement",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "中英文",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "中英文",
            "normalized_value": "中英文",
            "normalized_field_name": "模具说明书要求"
          },
          "field_name": "模具说明书要求"
        }
      ],
      "rawFieldCount": 0
    },
    {
      "itemIndex": 2,
      "itemName": "3层分配器",
      "quantity": "2套",
      "fields": [
        {
          "evidence": {
            "line": 6,
            "text": "总计共（    2    ）套"
          },
          "original": false,
          "raw_text": "总计共（    2    ）套",
          "warnings": [],
          "qualifier": {
            "area": "feedblock",
            "sourceText": "分配器"
          },
          "raw_value": "总计共（    2    ）套",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "item_quantity",
            "value_kind": "number",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "总计共2套",
            "normalized_field_name": "分配器数量"
          },
          "field_name": "分配器数量"
        },
        {
          "evidence": {
            "line": 7,
            "text": "LDPE LLDPE"
          },
          "original": false,
          "raw_text": "LDPE LLDPE",
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀",
              "raw_value": "LDPE LLDPE",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 2
            }
          ],
          "raw_value": "LDPE LLDPE",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "LDPE",
                "confidence": 1,
                "displayName": "LDPE",
                "canonicalValue": "LDPE"
              },
              {
                "rawValue": "LLDPE",
                "confidence": 1,
                "displayName": "LLDPE",
                "canonicalValue": "LLDPE"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "LDPE",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "LDPE",
            "normalized_value": "ldpelldpe",
            "material_prefix_split": {
              "sourceRawValue": "LDPE LLDPE",
              "matchedMaterialTokens": [
                "LDPE",
                "LLDPE"
              ]
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {
            "line": 8,
            "text": "（      3     ）层"
          },
          "original": false,
          "raw_text": "（      3     ）层",
          "warnings": [],
          "raw_value": "（      3     ）层",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "layer_count",
            "value_kind": "number",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "3层",
            "normalized_field_name": "复合层次"
          },
          "field_name": "复合层次"
        },
        {
          "evidence": {
            "line": 9,
            "text": "ABA"
          },
          "original": false,
          "raw_text": "ABA",
          "warnings": [],
          "raw_value": "ABA",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "layer_structure",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "aba",
            "normalized_field_name": "结构形式"
          },
          "field_name": "结构形式"
        },
        {
          "evidence": {
            "line": 10,
            "text": "15%/70%/15%"
          },
          "original": false,
          "raw_text": "15%/70%/15%",
          "warnings": [],
          "raw_value": "15%/70%/15%",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "layer_ratio",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "每层复合比例: 15%/70%/15%",
            "normalized_field_name": "每层复合比例"
          },
          "field_name": "每层复合比例"
        },
        {
          "evidence": {
            "line": 11,
            "text": "[SEL] 加热棒"
          },
          "original": false,
          "raw_text": "[SEL] 加热棒",
          "warnings": [],
          "raw_value": "加热棒",
          "confidence": 0.95,
          "dictionary": {
            "note": "active term canonical/display self alias",
            "matched": true,
            "term_type": "heating_method",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "加热棒",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "heating_rod",
            "normalized_value": "加热棒",
            "normalized_field_name": "加热方式"
          },
          "field_name": "加热方式"
        },
        {
          "evidence": {
            "line": 12,
            "text": "(   220  V )/(     50   Hz)/ (      相 ) 功率 (    5  KW )",
            "ruleSignals": [
              {
                "after": [
                  {
                    "value": "220 V",
                    "field_name": "电压"
                  },
                  {
                    "value": "50 Hz",
                    "field_name": "频率"
                  },
                  {
                    "value": "",
                    "field_name": "相"
                  },
                  {
                    "value": "5 KW",
                    "field_name": "功率"
                  }
                ],
                "before": {
                  "value": "(   220  V )/(     50   Hz)/ (      相 ) 功率 (    5  KW )",
                  "fieldName": "电压及加热功率"
                },
                "ruleId": "selection_split",
                "message": "LLM split_fields were normalized into selected option fields.",
                "confidence": 0.8,
                "relationType": "split_component",
                "recommendedAction": "split_value"
              }
            ]
          },
          "original": true,
          "raw_text": "(   220  V )/(     50   Hz)/ (      相 ) 功率 (    5  KW )",
          "warnings": [
            {
              "type": "split_original_retained",
              "message": "字段值包含多个业务属性，已拆分为独立字段",
              "evidence": {
                "line": 12,
                "text": "(   220  V )/(     50   Hz)/ (      相 ) 功率 (    5  KW )"
              },
              "raw_va
```

### Candidate
```json
[
  {
    "id": 51,
    "candidateType": "value",
    "termType": "surface_plating_type",
    "rawValue": "镀铬",
    "normalizedRawValue": "镀铬",
    "proposedCanonicalValue": "chrome_plating",
    "status": "done_51",
    "confidence": null,
    "evidence": {
      "cell": "B17",
      "text": "[SEL] 镀铬",
      "sheet": "Sheet1"
    }
  },
  {
    "id": 56,
    "candidateType": "value",
    "termType": "connection_drawing_status",
    "rawValue": "供方精诚设计图纸",
    "normalizedRawValue": "供方精诚设计图纸",
    "proposedCanonicalValue": "jctimes_drawing",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B10",
      "text": "[SEL] 供方精诚设计图纸",
      "sheet": "生产明细表",
      "phase1_snapshot": true,
      "phase1_snapshot_reason": [
        "document_info_suspected_pollution"
      ]
    }
  }
]
```

### Lines
- L1: 文件名：连接器生产明细表（190282-E-200）2019-04-24连接器.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 配件编号：190282-E-200
- L14: 客户ID：40217
- L15: [ ] 国内使用
- L17: 国家(     印度                      )
- L21: 合同编号：7190110
- L22: 合同规定交货日期：
- L26: 下单日期：2019-04-24
- L27: 交货日期：2019-05-10
- L28: 完工日期：
- L29: 实际发货日期：
- L33: [SEL] 有　　数量：共（          ）件
- L35: option_set: {"options":[{"selected":true,"value":"有　　数量：共（          ）件"},{"selected":false,"value":"没有"}]}
- L37: [A7] 连接器加热方式
- L39: [SEL] 不锈钢加热圈
- L40: [ ] 铸铝加热圈
- L42: option_set: {"options":[{"selected":true,"value":"不锈钢加热圈"},{"selected":false,"value":"铸铝加热圈"},{"selected":false,"value":"其他"}]}
- L46: [ ] 需方客户提供图纸　　提供图纸日期：
- L48: option_set: {"options":[{"selected":false,"value":"需方客户提供图纸　　提供图纸日期：        图纸接收人签名："}]}
- L68: 合同制作人：蔡金枝
- L72: 合同及生产单审核人员1：
- L82: 1）3层分配器
- L85: [A2] 分配器型号
- L88: 镶块数量：（            ）块
- L89: option_set: {"options":[{"selected":false,"value":"镶块式     镶块数量：（            ）块"}]}
- L91: 上下文：分配器型号
- L94: 分流杆数量：（            ）支
- L95: option_set: {"options":[{"selected":false,"value":"摆叶式     分流杆数量：（            ）支"}]}
- L97: 上下文：分配器型号
- L101: 上下文：分配器型号
- L105: [A6] 分配器数量
- L108: 大分流芯棒数量（            ）套
- L113: [A8] 复合层次
- L114: [B8] （      3     ）层
- L119: [A10] 每层复合比例
- L122: [A11] 加热方式
- L124: [SEL] 加热棒
- L125: [ ] 加热板
- L126: [ ] 加热棒、加热板组合
- L127: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"加热棒、加热板组合"}]}
- L129: [A12] 电压及加热功率
- L132: 功率 (    5  KW )
- L140: [A15] 接线方式
- L141: [B15] 专用接线盒封闭接线
- L143: [A16] 分配器材料选用
- L149: [A17] 表面镀层要求
- L166: 合同制作人：华丽莎
- L170: 合同及生产单审核人员1：

## Document 12 连接器生产明细表（191225-E-200）2019-10-21连接器.xls

- extractionResultId: 14313
- approxBlocksTokens: 1837
- candidates: 0

### Normalized
```json
{
  "documentInfo": {
    "order_number": {
      "value": "",
      "rawKey": "order_number",
      "evidence": {
        "line": 0,
        "text": ""
      },
      "confidence": 0,
      "canonicalKey": "order_number"
    },
    "product_number": {
      "value": "191225-E-200",
      "rawKey": "product_number",
      "evidence": {
        "line": 15,
        "text": "配件编号：191225-E-200"
      },
      "confidence": 0.9,
      "canonicalKey": "product_number"
    },
    "contract_number": {
      "value": "7190110",
      "rawKey": "contract_number",
      "evidence": {
        "line": 23,
        "text": "合同编号：7190110"
      },
      "confidence": 0.9,
      "canonicalKey": "contract_number"
    }
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "连接器",
      "quantity": "共（          ）件",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 有　　数量：共（          ）件",
          "selected": true,
          "warnings": [],
          "qualifier": {
            "area": "connector",
            "sourceText": "连接器"
          },
          "raw_value": "有",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "connector_config",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "有",
            "normalized_field_name": "连接器配置"
          },
          "field_name": "连接器配置"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 不锈钢加热圈",
          "selected": true,
          "warnings": [],
          "qualifier": {
            "area": "connector",
            "sourceText": "连接器"
          },
          "raw_value": "不锈钢加热圈",
          "confidence": 0.95,
          "dictionary": {
            "note": "active term canonical/display self alias",
            "matched": true,
            "term_type": "heating_method",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "不锈钢加热圈",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "stainless_steel_heating_coil",
            "normalized_value": "不锈钢加热圈",
            "normalized_field_name": "连接器加热方式"
          },
          "field_name": "连接器加热方式"
        },
        {
          "evidence": {
            "splitRule": "heating_method_implies_config",
            "sourceRawValue": "不锈钢加热圈",
            "sourceRawFieldName": "连接器加热方式"
          },
          "original": false,
          "raw_text": "[SEL] 不锈钢加热圈",
          "warnings": [],
          "qualifier": {
            "area": "connector",
            "sourceText": "连接器"
          },
          "raw_value": "有",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "heating_config",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "有",
            "normalized_field_name": "加热配置"
          },
          "field_name": "加热配置"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 供方精诚设计图纸",
          "selected": true,
          "warnings": [],
          "raw_value": "供方精诚设计图纸",
          "confidence": 0.95,
          "dictionary": {
            "note": "active term canonical/display self alias",
            "matched": true,
            "term_type": "connection_drawing_status",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "供方精诚设计图纸",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "jctimes_drawing",
            "normalized_value": "供方精诚设计图纸",
            "normalized_field_name": "联接尺寸图纸提供情况"
          },
          "field_name": "联接尺寸图纸提供情况"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 中英文",
          "selected": true,
          "warnings": [],
          "raw_value": "中英文",
          "confidence": 0.95,
          "dictionary": {
            "note": "active term canonical/display self alias",
            "matched": true,
            "term_type": "manual_requirement",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "中英文",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "中英文",
            "normalized_value": "中英文",
            "normalized_field_name": "模具说明书要求"
          },
          "field_name": "模具说明书要求"
        }
      ],
      "rawFieldCount": 0
    },
    {
      "itemIndex": 2,
      "itemName": "3层分配器",
      "quantity": "2套",
      "fields": [
        {
          "evidence": {
            "line": 7
          },
          "original": false,
          "raw_text": "LDPE LLDPE",
          "selected": true,
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀",
              "raw_value": "LDPE LLDPE",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 2
            }
          ],
          "raw_value": "LDPE LLDPE",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "LDPE",
                "confidence": 1,
                "displayName": "LDPE",
                "canonicalValue": "LDPE"
              },
              {
                "rawValue": "LLDPE",
                "confidence": 1,
                "displayName": "LLDPE",
                "canonicalValue": "LLDPE"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "LDPE",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "LDPE",
            "normalized_value": "ldpelldpe",
            "material_prefix_split": {
              "sourceRawValue": "LDPE LLDPE",
              "matchedMaterialTokens": [
                "LDPE",
                "LLDPE"
              ]
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {
            "line": 8
          },
          "original": false,
          "raw_text": "（      3     ）层",
          "selected": true,
          "warnings": [],
          "raw_value": "3层",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "layer_count",
            "value_kind": "number",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "3层",
            "normalized_field_name": "层数"
          },
          "field_name": "层数"
        },
        {
          "evidence": {
            "line": 9
          },
          "original": false,
          "raw_text": "ABA",
          "selected": true,
          "warnings": [],
          "raw_value": "ABA",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "layer_structure",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "aba",
            "normalized_field_name": "层结构"
          },
          "field_name": "层结构"
        },
        {
          "evidence": {
            "line": 10
          },
          "original": false,
          "raw_text": "15%/70%/15%",
          "selected": true,
          "warnings": [],
          "raw_value": "15%/70%/15%",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "layer_ratio",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "每层复合比例: 15%/70%/15%",
            "normalized_field_name": "每层复合比例"
          },
          "field_name": "每层复合比例"
        },
        {
          "evidence": {
            "line": 11
          },
          "original": false,
          "raw_text": "[SEL] 加热棒",
          "selected": true,
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "加热棒",
              "field_name": "产品主体加热方式",
              "item_index": 2
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 2,
            "candidate_id": "1961",
            "candidate_type": "term_type",
            "raw_field_name": "产品主体加热方式",
            "source_product_type": "feedblock"
          },
          "qualifier": {
            "area": "body",
            "sourceText": "主体"
          },
          "raw_value": "加热棒",
          "confidence": 0.95,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "加热棒",
            "normalized_field_name": "产品主体加热方式"
          },
          "field_name": "产品主体加热方式"
        },
        {
          "evidence": {
            "line": 12
          },
          "original": false,
          "raw_text": "(   220  V )/(     50   Hz)/ (      相 ) 功率 (    5  KW )",
          "selected": true,
          "warnings": [],
          "raw_value": "220V",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "heating_voltage",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "220",
              "unitRaw": "V",
              "rawValue": "220 V",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "V",
              "numericText": "220",
              "unitCanonical": "V",
              "matchedAliasId": "34",
              "normalizedValue": "220V",
              "normalizedUnitRaw": "v"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "220V",
            "normalized_field_name": "加热电压"
          },
          "field_name": "加热电压"
        },
        {
          "evidence": {
            "line": 12
          },
          "original": false,
          "raw_text": "(   220  V )/(     50   Hz)/ (      相 ) 功率 (    5  KW )",
          "selected": true,
          "warnings": [],
          "raw_value": "50 Hz",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "heating_frequency",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "50",
              "unitRaw": "Hz",
              "rawValue": "50 Hz",
              "warnings": [],
              "numberKind": "single",
              "numericText": "50",
              "normalizedValue": "50Hz",
              "normalizedUnitRaw": "hz"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "50Hz",
            "normalized_field_name": "加热频率"
          },
          "field_name": "加热频率"
        },
        {
          "evidence": {
            "line": 12
          },
          "original": false,
          "raw_text": "(   220  V )/(     50   Hz)/ (      相 ) 功率 (    5  KW )",
          "selected": true,
          "warnings": [],
          "raw_value": "5 KW",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
      
```

### Candidate
```json
[]
```

### Lines
- L1: 文件名：连接器生产明细表（191225-E-200）2019-10-21连接器.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 配件编号：191225-E-200
- L14: 客户ID：40315
- L15: [ ] 国内使用
- L17: 国家(     越南                      )
- L21: 合同编号：7190110
- L22: 合同规定交货日期：
- L26: 下单日期：2019-10-21
- L27: 交货日期：2019-11-20
- L28: 完工日期：
- L29: 实际发货日期：
- L33: [SEL] 有　　数量：共（          ）件
- L35: option_set: {"options":[{"selected":true,"value":"有　　数量：共（          ）件"},{"selected":false,"value":"没有"}]}
- L37: [A7] 连接器加热方式
- L39: [SEL] 不锈钢加热圈
- L40: [ ] 铸铝加热圈
- L42: option_set: {"options":[{"selected":true,"value":"不锈钢加热圈"},{"selected":false,"value":"铸铝加热圈"},{"selected":false,"value":"其他"}]}
- L46: [ ] 需方客户提供图纸　　提供图纸日期：
- L48: option_set: {"options":[{"selected":false,"value":"需方客户提供图纸　　提供图纸日期：        图纸接收人签名："}]}
- L68: 合同制作人：蔡金枝
- L72: 合同及生产单审核人员1：
- L82: 1）3层分配器
- L85: [A2] 分配器型号
- L88: 镶块数量：（            ）块
- L89: option_set: {"options":[{"selected":false,"value":"镶块式     镶块数量：（            ）块"}]}
- L91: 上下文：分配器型号
- L94: 分流杆数量：（            ）支
- L95: option_set: {"options":[{"selected":false,"value":"摆叶式     分流杆数量：（            ）支"}]}
- L97: 上下文：分配器型号
- L101: 上下文：分配器型号
- L105: [A6] 分配器数量
- L108: 大分流芯棒数量（            ）套
- L113: [A8] 复合层次
- L114: [B8] （      3     ）层
- L119: [A10] 每层复合比例
- L122: [A11] 加热方式
- L124: [SEL] 加热棒
- L125: [ ] 加热板
- L126: [ ] 加热棒、加热板组合
- L127: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"加热棒、加热板组合"}]}
- L129: [A12] 电压及加热功率
- L132: 功率 (    5  KW )
- L140: [A15] 接线方式
- L141: [B15] 专用接线盒封闭接线
- L143: [A16] 分配器材料选用
- L149: [A17] 表面镀层要求
- L166: 合同制作人：华丽莎
- L170: 合同及生产单审核人员1：

## Document 13 连接器生产明细表（2019-281-E-200）2019-06-29连接器.xls

- extractionResultId: 14314
- approxBlocksTokens: 1837
- candidates: 0

### Normalized
```json
{
  "documentInfo": {
    "order_number": {
      "value": "",
      "rawKey": "order_number",
      "evidence": {
        "line": 0,
        "text": ""
      },
      "confidence": 0,
      "canonicalKey": "order_number"
    },
    "customer_notes": [
      {
        "evidence": {},
        "raw_text": "》》》要求打JCTIMES 标志! 加急",
        "raw_value": "要求打JCTIMES 标志! 加急",
        "field_name": "标志要求/备注",
        "item_index": 2,
        "document_id": "13",
        "extraction_result_id": "14314"
      }
    ],
    "product_number": {
      "value": "2019-281-E-200",
      "rawKey": "product_number",
      "evidence": {
        "line": 15,
        "text": "配件编号：2019-281-E-200"
      },
      "confidence": 0.9,
      "canonicalKey": "product_number"
    },
    "contract_number": {
      "value": "7190620",
      "rawKey": "contract_number",
      "evidence": {
        "line": 23,
        "text": "合同编号：7190620"
      },
      "confidence": 0.9,
      "canonicalKey": "contract_number"
    }
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "连接器",
      "quantity": "共（          ）件",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 有　　数量：共（          ）件",
          "selected": true,
          "warnings": [],
          "qualifier": {
            "area": "connector",
            "sourceText": "连接器"
          },
          "raw_value": "有",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "connector_config",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "有",
            "normalized_field_name": "连接器配置"
          },
          "field_name": "连接器配置"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 不锈钢加热圈",
          "selected": true,
          "warnings": [],
          "qualifier": {
            "area": "connector",
            "sourceText": "连接器"
          },
          "raw_value": "不锈钢加热圈",
          "confidence": 0.95,
          "dictionary": {
            "note": "active term canonical/display self alias",
            "matched": true,
            "term_type": "heating_method",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "不锈钢加热圈",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "stainless_steel_heating_coil",
            "normalized_value": "不锈钢加热圈",
            "normalized_field_name": "连接器加热方式"
          },
          "field_name": "连接器加热方式"
        },
        {
          "evidence": {
            "splitRule": "heating_method_implies_config",
            "sourceRawValue": "不锈钢加热圈",
            "sourceRawFieldName": "连接器加热方式"
          },
          "original": false,
          "raw_text": "[SEL] 不锈钢加热圈",
          "warnings": [],
          "qualifier": {
            "area": "connector",
            "sourceText": "连接器"
          },
          "raw_value": "有",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "heating_config",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "有",
            "normalized_field_name": "加热配置"
          },
          "field_name": "加热配置"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 供方精诚设计图纸",
          "selected": true,
          "warnings": [],
          "raw_value": "供方精诚设计图纸",
          "confidence": 0.95,
          "dictionary": {
            "note": "active term canonical/display self alias",
            "matched": true,
            "term_type": "connection_drawing_status",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "供方精诚设计图纸",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "jctimes_drawing",
            "normalized_value": "供方精诚设计图纸",
            "normalized_field_name": "联接尺寸图纸提供情况"
          },
          "field_name": "联接尺寸图纸提供情况"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 中英文",
          "selected": true,
          "warnings": [],
          "raw_value": "中英文",
          "confidence": 0.95,
          "dictionary": {
            "note": "active term canonical/display self alias",
            "matched": true,
            "term_type": "manual_requirement",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "中英文",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "中英文",
            "normalized_value": "中英文",
            "normalized_field_name": "模具说明书要求"
          },
          "field_name": "模具说明书要求"
        }
      ],
      "rawFieldCount": 0
    },
    {
      "itemIndex": 2,
      "itemName": "3层分配器",
      "quantity": "2套",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "LDPE LLDPE",
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀",
              "raw_value": "LDPE LLDPE",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 2
            }
          ],
          "raw_value": "LDPE LLDPE",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "LDPE",
                "confidence": 1,
                "displayName": "LDPE",
                "canonicalValue": "LDPE"
              },
              {
                "rawValue": "LLDPE",
                "confidence": 1,
                "displayName": "LLDPE",
                "canonicalValue": "LLDPE"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "LDPE",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "LDPE",
            "normalized_value": "ldpelldpe",
            "material_prefix_split": {
              "sourceRawValue": "LDPE LLDPE",
              "matchedMaterialTokens": [
                "LDPE",
                "LLDPE"
              ]
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "（      3     ）层",
          "warnings": [],
          "raw_value": "3",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "layer_count",
            "value_kind": "number",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "3",
            "normalized_field_name": "层数"
          },
          "field_name": "层数"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "ABA",
          "warnings": [],
          "raw_value": "ABA",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "layer_structure",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "aba",
            "normalized_field_name": "层结构"
          },
          "field_name": "层结构"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "15%/70%/15%",
          "warnings": [],
          "raw_value": "15%/70%/15%",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "layer_ratio",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "每层复合比例: 15%/70%/15%",
            "normalized_field_name": "每层复合比例"
          },
          "field_name": "每层复合比例"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 加热棒",
          "selected": true,
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "加热棒",
              "field_name": "产品主体加热方式",
              "item_index": 2
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 2,
            "candidate_id": "1961",
            "candidate_type": "term_type",
            "raw_field_name": "产品主体加热方式",
            "source_product_type": "feedblock"
          },
          "qualifier": {
            "area": "body",
            "sourceText": "主体"
          },
          "raw_value": "加热棒",
          "confidence": 0.95,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "加热棒",
            "normalized_field_name": "产品主体加热方式"
          },
          "field_name": "产品主体加热方式"
        },
        {
          "evidence": {
            "ruleSignals": [
              {
                "after": [
                  {
                    "value": "220 V",
                    "field_name": "加热电压"
                  },
                  {
                    "value": "50 Hz",
                    "field_name": "加热频率"
                  },
                  {
                    "value": "",
                    "field_name": "加热相"
                  },
                  {
                    "value": "5 KW",
                    "field_name": "加热功率"
                  }
                ],
                "before": {
                  "value": "(   220  V )/(     50   Hz)/ (      相 ) 功率 (    5  KW )",
                  "fieldName": "电压及加热功率"
                },
                "ruleId": "selection_split",
                "message": "LLM split_fields were normalized into selected option fields.",
                "confidence": 0.8,
                "relationType": "split_component",
                "recommendedAction": "split_value"
              }
            ]
          },
          "original": true,
          "raw_text": "(   220  V )/(     50   Hz)/ (      相 ) 功率 (    5  KW )",
          "warnings": [
            {
              "type": "split_original_retained",
              "message": "字段值包含多个业务属性，已拆分为独立字段",
              "evidence": {},
              "raw_value": "(   220  V )/(     50   Hz)/ (      相 ) 功率 (    5  KW )",
              "field_name": "电压及加热功率",
              "item_index": 2
            }
          ],
          "raw_value": "(   220  V )/(     50   Hz)/ (      相 ) 功率 (    5  KW )",
          "confidence": 0.95,
          "dictionary": {
            "note": "复合字段已拆分，原字段仅保留作追溯",
            "matched": false,
            "field_matched": false
          },
          "field_name": "电压及加热功率"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "(   220  V )/(     50   Hz)/ (      相 ) 功率 (    5  KW )",
          "warnings": [],
          "raw_value": "220V",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "heating_voltage",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "220",
              "unitRaw": "V",
              "rawValue": "220 V",
              "warnings": [],
              "numberKind": "single",
 
```

### Candidate
```json
[]
```

### Lines
- L1: 文件名：连接器生产明细表（2019-281-E-200）2019-06-29连接器.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 配件编号：2019-281-E-200
- L14: 客户ID：40320
- L15: [ ] 国内使用
- L17: 国家(     阿曼                    )
- L21: 合同编号：7190620
- L22: 合同规定交货日期：
- L26: 下单日期：2019-06-29
- L27: 交货日期：2019-07-15
- L28: 完工日期：
- L29: 实际发货日期：
- L33: [SEL] 有　　数量：共（          ）件
- L35: option_set: {"options":[{"selected":true,"value":"有　　数量：共（          ）件"},{"selected":false,"value":"没有"}]}
- L37: [A7] 连接器加热方式
- L39: [SEL] 不锈钢加热圈
- L40: [ ] 铸铝加热圈
- L42: option_set: {"options":[{"selected":true,"value":"不锈钢加热圈"},{"selected":false,"value":"铸铝加热圈"},{"selected":false,"value":"其他"}]}
- L46: [ ] 需方客户提供图纸　　提供图纸日期：
- L48: option_set: {"options":[{"selected":false,"value":"需方客户提供图纸　　提供图纸日期：        图纸接收人签名："}]}
- L68: 合同制作人：蔡金枝
- L72: 合同及生产单审核人员1：
- L82: 1）3层分配器
- L85: [A2] 分配器型号
- L88: 镶块数量：（            ）块
- L89: option_set: {"options":[{"selected":false,"value":"镶块式     镶块数量：（            ）块"}]}
- L91: 上下文：分配器型号
- L94: 分流杆数量：（            ）支
- L95: option_set: {"options":[{"selected":false,"value":"摆叶式     分流杆数量：（            ）支"}]}
- L97: 上下文：分配器型号
- L101: 上下文：分配器型号
- L105: [A6] 分配器数量
- L108: 大分流芯棒数量（            ）套
- L113: [A8] 复合层次
- L114: [B8] （      3     ）层
- L119: [A10] 每层复合比例
- L122: [A11] 加热方式
- L124: [SEL] 加热棒
- L125: [ ] 加热板
- L126: [ ] 加热棒、加热板组合
- L127: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"加热棒、加热板组合"}]}
- L129: [A12] 电压及加热功率
- L132: 功率 (    5  KW )
- L140: [A15] 接线方式
- L141: [B15] 专用接线盒封闭接线
- L143: [A16] 分配器材料选用
- L149: [A17] 表面镀层要求
- L166: 合同制作人：华丽莎
- L170: 合同及生产单审核人员1：

## Document 14 模头生产明细表（190128-E）2019-1-22-1400mmEVA 太阳能膜和3层ABC分配器.xls

- extractionResultId: 14315
- approxBlocksTokens: 6969
- candidates: 7

### Normalized
```json
{
  "documentInfo": {
    "order_number": {
      "value": "",
      "rawKey": "order_number",
      "evidence": {
        "line": 0,
        "text": ""
      },
      "confidence": 0,
      "canonicalKey": "order_number"
    },
    "customer_notes": [
      {
        "evidence": {},
        "raw_text": "》》》要求打JCTIMES 标志!",
        "raw_value": "要求打JCTIMES 标志!",
        "field_name": "标志要求/备注",
        "item_index": 2,
        "document_id": "14",
        "extraction_result_id": "14315"
      },
      {
        "evidence": {
          "line": 1,
          "text": "》》》要求打JCTIMES 标志! 加急"
        },
        "raw_text": "》》》要求打JCTIMES 标志! 加急",
        "raw_value": "要求打JCTIMES 标志! 加急",
        "field_name": "标志要求/备注",
        "item_index": 3,
        "document_id": "14",
        "extraction_result_id": "14315"
      }
    ],
    "product_number": {
      "value": "190128-E",
      "rawKey": "product_number",
      "evidence": {
        "line": 15,
        "text": "模具编号：190128-E"
      },
      "confidence": 0.9,
      "canonicalKey": "product_number"
    },
    "contract_number": {
      "value": "7190104",
      "rawKey": "contract_number",
      "evidence": {
        "line": 23,
        "text": "合同编号：7190104"
      },
      "confidence": 0.9,
      "canonicalKey": "contract_number"
    }
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "EVA 太阳能膜自动模头",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "EVA 太阳能膜自动模头（产量300KG/每小时）",
          "selected": true,
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀并识别应用领域后缀",
              "raw_value": "EVA 太阳能膜自动模头（产量300KG/每小时）",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "EVA 太阳能膜自动模头（产量300KG/每小时）",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "EVA",
                "confidence": 1,
                "displayName": "EVA",
                "canonicalValue": "EVA"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "EVA",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "EVA",
            "normalized_value": "eva太阳能膜自动模头产量300kg/每小时",
            "material_prefix_split": {
              "sourceRawValue": "EVA 太阳能膜自动模头（产量300KG/每小时）",
              "suffixRawValue": "太阳能膜自动模头产量300kg、每小时",
              "matchedMaterialTokens": [
                "EVA"
              ],
              "suffixCandidateTermType": "application"
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "1250MM",
          "selected": true,
          "warnings": [],
          "raw_value": "1250MM",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "1250",
              "unitRaw": "MM",
              "rawValue": "1250MM",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "1250",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1250 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1250 mm",
            "normalized_field_name": "制品有效宽度"
          },
          "field_name": "制品有效宽度"
        },
        {
          "evidence": {
            "ruleSignals": [
              {
                "after": [
                  {
                    "value": "0.7mm",
                    "field_name": "制品有效厚度"
                  },
                  {
                    "value": "0.9mm",
                    "field_name": "开口"
                  }
                ],
                "before": {
                  "value": "0.7mm，开口0.9mm",
                  "fieldName": "制品有效厚度"
                },
                "ruleId": "selection_split",
                "message": "LLM split_fields were normalized into selected option fields.",
                "confidence": 0.8,
                "relationType": "split_component",
                "recommendedAction": "split_value"
              }
            ]
          },
          "original": true,
          "raw_text": "0.7mm，开口0.9mm",
          "selected": true,
          "warnings": [
            {
              "type": "split_original_retained",
              "message": "字段值包含多个业务属性，已拆分为独立字段",
              "evidence": {},
              "raw_value": "0.7mm，开口0.9mm",
              "field_name": "制品有效厚度",
              "item_index": 1
            }
          ],
          "raw_value": "0.7mm，开口0.9mm",
          "confidence": 0.95,
          "dictionary": {
            "note": "复合字段已拆分，原字段仅保留作追溯",
            "matched": false,
            "field_matched": false
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "0.7mm，开口0.9mm",
          "selected": true,
          "warnings": [],
          "raw_value": "0.7mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "0.7",
              "unitRaw": "mm",
              "rawValue": "0.7mm",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "0.7",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "0.7 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "0.7 mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "0.7mm，开口0.9mm",
          "selected": true,
          "warnings": [
            {
              "type": "term_type_candidate_previously_rejected",
              "message": "字段名候选此前已被拒绝，已跳过重新生成候选",
              "raw_value": "0.9mm",
              "field_name": "开口",
              "item_index": 1
            }
          ],
          "raw_value": "0.9mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "0.9mm",
            "normalized_field_name": "开口"
          },
          "field_name": "开口"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "1400mm",
          "selected": true,
          "warnings": [],
          "raw_value": "1400mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "die_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "1400",
              "unitRaw": "mm",
              "rawValue": "1400mm",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "1400",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1400 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1400 mm",
            "normalized_field_name": "模头有效宽度"
          },
          "field_name": "模头有效宽度"
        },
        {
          "evidence": {
            "rule": "runtime_qualifier_matcher",
            "qualifier": {
              "area": "lip",
              "position": "upper_die",
              "sourceText": "上模"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "唇调节方式",
                  "qualifier": {
                    "area": "lip",
                    "position": "upper_die",
                    "sourceText": "上模"
                  }
                },
                "before": {
                  "fieldName": "上模唇调节方式"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the field name into structured qualifier metadata.",
                "confidence": 0.86,
                "relationType": "qualifier_variant",
                "recommendedAction": "map_as_qualifier_variant"
              }
            ],
            "qualifierKey": "upper_die",
            "baseFieldName": "唇调节方式",
            "qualifierKind": "position",
            "qualifierRule": "runtime_qualifier_matcher",
            "originalFieldName": "上模唇调节方式",
            "qualifierSourceText": "上模",
            "matchedQualifierAlias": "上模"
          },
          "original": false,
          "raw_text": "[SEL] 上模唇采用膨胀螺栓自动调节，参考图纸",
          "selected": true,
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "上模唇采用膨胀螺栓自动调节，参考图纸",
              "field_name": "唇调节方式",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 1,
            "candidate_id": "1901",
            "candidate_type": "term_type",
            "raw_field_name": "唇调节方式",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "lip",
            "position": "upper_die",
            "sourceText": "上模"
          },
          "raw_value": "上模唇采用膨胀螺栓自动调节，参考图纸",
          "confidence": 0.95,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "上模唇采用膨胀螺栓自动调节参考图纸",
            "normalized_field_name": "唇调节方式"
          },
          "field_name": "唇调节方式"
        },
        {
          "evidence": {
            "rule": "runtime_qualifier_matcher",
            "qualifier": {
              "area": "lip",
              "position": "lower_die",
              "sourceText": "下模"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "唇调节方式",
                  "qualifier": {
                    "area": "lip",
                    "position": "lower_die",
                    "sourceText": "下模"
                  }
                },
                "before": {
                  "fieldName": "下模唇调节方式"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the field name into structured qualifier metadata.",
                "confidence": 0.86,
                "relationType": "qualifier_variant",
                "recommendedAction": "map_as_qualifier_variant"
              }
            ],
            "qualifierKey": "lower_die",
            "baseFieldName": "唇调节方式",
            "qualifierKind": "position",
            "qualifierRu
```

### Candidate
```json
[
  {
    "id": 59,
    "candidateType": "value",
    "termType": "upper_lip_adjustment_method",
    "rawValue": "上模唇采用膨胀螺栓自动调节，参考图纸",
    "normalizedRawValue": "上模唇采用膨胀螺栓自动调节参考图纸",
    "proposedCanonicalValue": "upper_auto_push_pull_fine_adjustment",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B17",
      "text": "[SEL] 上模唇采用膨胀螺栓自动调节，参考图纸",
      "sheet": "生产明细表",
      "phase1_snapshot": true,
      "phase1_snapshot_reason": [
        "document_info_suspected_pollution"
      ]
    }
  },
  {
    "id": 62,
    "candidateType": "value",
    "termType": "die_mounting_method",
    "rawValue": "45°斜挤出安装",
    "normalizedRawValue": "45°斜挤出安装",
    "proposedCanonicalValue": "45°斜挤出安装",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B47",
      "text": "[SEL] 45°斜挤出安装",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 63,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "EVA",
    "normalizedRawValue": "eva",
    "proposedCanonicalValue": "EVA",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B69",
      "text": "EVA",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 64,
    "candidateType": "value",
    "termType": "lower_lip_adjustment_method",
    "rawValue": "下模整体结构",
    "normalizedRawValue": "下模整体结构",
    "proposedCanonicalValue": "lower_integral_structure",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "cell": "B22",
      "text": "[SEL] 下模整体结构",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 65,
    "candidateType": "value",
    "termType": "flow_channel_type",
    "rawValue": "衣架式",
    "normalizedRawValue": "衣架式",
    "proposedCanonicalValue": "coat_hanger_manifold",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "cell": "B26",
      "text": "[SEL] 衣架式",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 684,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "太阳能膜自动模头（产量300KG",
    "normalizedRawValue": "太阳能膜自动模头产量300kg",
    "proposedCanonicalValue": null,
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "sourceRawValue": "EVA 太阳能膜自动模头（产量300KG/每小时）",
      "splitFromRawValue": "太阳能膜自动模头（产量300KG"
    }
  },
  {
    "id": 2923,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "太阳能膜自动模头产量300kg、每小时",
    "normalizedRawValue": "太阳能膜自动模头产量300kg每小时",
    "proposedCanonicalValue": null,
    "status": "done_2923",
    "confidence": "0.72",
    "evidence": {
      "sourceRawValue": "EVA 太阳能膜自动模头（产量300KG/每小时）",
      "suffixRawValue": "太阳能膜自动模头产量300kg、每小时",
      "splitFromRawValue": "太阳能膜自动模头产量300kg、每小时",
      "matchedMaterialTokens": [
        "EVA"
      ],
      "suffixCandidateTermType": "application"
    }
  }
]
```

### Lines
- L1: 文件名：模头生产明细表（190128-E）2019-1-22-1400mmEVA 太阳能膜和3层ABC分配器.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 模具编号：190128-E
- L14: 客户ID：40216
- L15: [ ] 国内使用
- L17: 国家(     印度                      )
- L21: 合同编号：7190104
- L22: 合同规定交货日期：
- L26: 下单日期：2019-1-22
- L27: 交货日期：2019-4-20
- L28: 完工日期：
- L29: 实际发货日期：
- L33: [A7] 规格型号与原产品互配
- L36: 原产品编号（             ）
- L44: [A9] 制品有效宽度
- L47: [A10] 制品有效厚度
- L52: [A12] 模头有效宽度
- L55: [A13] 模头宽度调节方式
- L64: [A14] 模唇厚度调节范围
- L65: [B14] 模唇厚度调节范围（                ）
- L67: 上下文：模唇厚度调节范围
- L74: [A16] 模唇数量
- L76: [ ] 上模唇（           ）套
- L77: [ ] 下模唇（         ）套
- L79: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L81: [A17] 模唇调节方式
- L82: [B17] [SEL] 上模唇采用膨胀螺栓自动调节，参考图纸
- L83: option_set: {"options":[{"selected":true,"value":"上模唇采用膨胀螺栓自动调节，参考图纸"}]}
- L85: 上下文：模唇调节方式
- L91: 上下文：模唇调节方式
- L97: 上下文：模唇调节方式
- L98: [B20] [ ] 下模唇可预调节（粗调）
- L99: option_set: {"options":[{"selected":false,"value":"下模唇可预调节（粗调）"}]}
- L101: 上下文：模唇调节方式
- L102: [B21] [ ] 下模唇固定、并可更换
- L103: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L105: 上下文：模唇调节方式
- L106: [B22] [SEL] 下模整体结构
- L107: option_set: {"options":[{"selected":true,"value":"下模整体结构"}]}
- L109: 上下文：模唇调节方式
- L124: [ ] 上模
- L125: [ ] 下模   ）
- L126: option_set: {"options":[{"selected":false,"value":"有            分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"}]}
- L128: [A26] 流道形式
- L132: [ ] 模内多流道
- L134: option_set: {"options":[{"selected":true,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":false,"value":"其他"}]}
- L136: [A27] 加热方式
- L138: [SEL] 不锈钢加热棒
- L139: [ ] 加热板
- L141: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L143: [A28] 模头加热分区
- L146: 两侧板
- L149: 模唇
- L154: [A29] 模唇加热方式
- L156: [ ] 加热棒
- L161: [ ] 加热板
- L162: option_set: {"options":[{"selected":false,"value":"加热棒"},{"selected":true,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":false,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L164: [A30] 加热电压
- L167: [A31] 每区功率
- L169: [A32] 接线方式
- L171: [SEL] 带护罩全封闭接线
- L172: [ ] 模体开槽接线
- L174: option_set: {"options":[{"selected":true,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":false,"value":"其他"}]}
- L189: [A35] 侧板接插件
- L195: [A36] 热电偶孔
- L200: [A37] 热电偶孔规格
- L202: [SEL] 根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。
- L203: [ ] 客户要求
- L204: option_set: {"options":[{"selected":true,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。"},{"selected":false,"value":"客户要求"}]}
- L209: [A39] 模头材料选用
- L220: 模唇表面粗糙度：
- L225: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L238: 表面镀层要求：
- L242: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L246: 流道表面镀层厚度：
- L251: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L255: 流道表面镀层硬度：
- L258: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L262: 外表面镀层厚度：
- L267: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L269: [A47] 模头安装方式
- L274: [SEL] 45°斜挤出安装 （分为：
- L277: option_set: {"options":[{"selected":false,"value":"平挤出"},{"selected":false,"value":"下挤出"},{"selected":false,"value":"其他"},{"selected":true,"value":"45°斜挤出安装 （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":true,"value":"45°挤出微调朝下"}
- L279: [A48] 平挤出安装方式时
- L280: [B48] 支架孔规格、型号（                                                     ）
- L282: 上下文：平挤出安装方式时
- L290: [A50] 其它安装方式时
- L291: [B50] 吊装孔规格、型号（                                                     ）
- L293: 上下文：其它安装方式时
- L294: [B51] 吊装时中心距、规格（                                                  ）
- L297: [B52] 平挤出安装方式时，在模头（                            ）边
- L300: [B53] 其他安装方式时，在模头（                                ）边
- L302: [A54] 进料口方式
- L304: [ ] 中央圆口进料
- L305: [SEL] 中央方口进料
- L306: [ ] 其他形状或不同位置进料
- L307: option_set: {"options":[{"selected":false,"value":"中央圆口进料"},{"selected":true,"value":"中央方口进料"},{"selected":false,"value":"其他形状或不同位置进料"}]}
- L309: [A55] 进料口尺寸
- L316: [A56] 配合三辊进料方式
- L318: [ ] 中、上辊进料
- L319: [ ] 中、下辊进料
- L321: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}
- L325: [ ] 有　　数量：共（          ）件
- L327: option_set: {"options":[{"selected":false,"value":"有　　数量：共（          ）件"},{"selected":true,"value":"没有"}]}
- L329: [A58] 连接器加热方式
- L331: [ ] 不锈钢加热圈
- L332: [ ] 铸铝加热圈
- L334: option_set: {"options":[{"selected":false,"value":"不锈钢加热圈"},{"selected":false,"value":"铸铝加热圈"},{"selected":false,"value":"其他"}]}
- L338: [ ] 需方客户提供图纸　　提供图纸日期：
- L340: option_set: {"options":[{"selected":false,"value":"需方客户提供图纸　　提供图纸日期：        图纸接收人签名："}]}

## Document 15 模头生产明细表（190282-E）2019-3-7-2400mm软质不透明PVC板材模头和2层AB分配器.xls

- extractionResultId: 14334
- approxBlocksTokens: 6961
- candidates: 10

### Normalized
```json
{
  "documentInfo": {
    "order_number": {
      "value": "",
      "rawKey": "order_number",
      "evidence": {
        "line": 0,
        "text": ""
      },
      "confidence": 0,
      "canonicalKey": "order_number"
    },
    "customer_notes": [
      {
        "evidence": {
          "line": 6,
          "text": "》》》要求打JCTIMES 标志!"
        },
        "raw_text": "要求打JCTIMES 标志",
        "raw_value": "要求打JCTIMES 标志",
        "field_name": "标志要求/备注",
        "item_index": 1,
        "document_id": "15",
        "extraction_result_id": "14334"
      },
      {
        "evidence": {},
        "raw_text": "要求打JCTIMES 标志! 加急",
        "raw_value": "要求打JCTIMES 标志! 加急",
        "field_name": "标志要求/备注",
        "item_index": 3,
        "document_id": "15",
        "extraction_result_id": "14334"
      }
    ],
    "product_number": {
      "value": "190282-E",
      "rawKey": "product_number",
      "evidence": {
        "line": 15,
        "text": "模具编号：190282-E"
      },
      "confidence": 0.95,
      "canonicalKey": "product_number"
    },
    "contract_number": {
      "value": "7190110",
      "rawKey": "contract_number",
      "evidence": {
        "line": 23,
        "text": "合同编号：7190110"
      },
      "confidence": 0.95,
      "canonicalKey": "contract_number"
    }
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "2400mm软质不透明PVC板材模头",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {
            "line": 8,
            "text": "B8 PVC软质不透明板材模头（产量400-500KG/每小时）"
          },
          "original": false,
          "raw_text": "PVC软质不透明板材模头（产量400-500KG/每小时）",
          "selected": true,
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀并识别应用领域后缀",
              "raw_value": "PVC软质不透明板材模头（产量400-500KG/每小时）",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            },
            {
              "type": "value_no_match",
              "message": "字段值未命中字典，已创建字段值候选",
              "evidence": {
                "line": 8,
                "text": "B8 PVC软质不透明板材模头（产量400-500KG/每小时）"
              },
              "raw_value": "PVC软质不透明板材模头（产量400-500KG/每小时）",
              "term_type": "application",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "raw_value": "软质不透明板材",
            "term_type": "application",
            "item_index": 1,
            "candidate_id": "3859",
            "candidate_type": "value",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "PVC软质不透明板材模头（产量400-500KG/每小时）",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "PVC",
                "confidence": 1,
                "displayName": "PVC",
                "canonicalValue": "PVC"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "PVC",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PVC",
            "normalized_value": "pvc软质不透明板材模头产量400500kg/每小时",
            "material_prefix_split": {
              "sourceRawValue": "PVC软质不透明板材模头（产量400-500KG/每小时）",
              "suffixRawValue": "软质不透明板材模头产量400500kg、每小时",
              "matchedMaterialTokens": [
                "PVC"
              ],
              "suffixCandidateTermType": "application"
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {
            "line": 9,
            "text": "B9 2250MM"
          },
          "original": false,
          "raw_text": "2250MM",
          "selected": true,
          "warnings": [],
          "raw_value": "2250MM",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "2250",
              "unitRaw": "MM",
              "rawValue": "2250MM",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "2250",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "2250 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "2250 mm",
            "normalized_field_name": "制品有效宽度"
          },
          "field_name": "制品有效宽度"
        },
        {
          "evidence": {
            "line": 10,
            "text": "B10 0.4-5mm，开口1-6mm"
          },
          "original": false,
          "raw_text": "0.4-5mm，开口1-6mm",
          "selected": true,
          "warnings": [
            {
              "type": "number_unit_trailing_text",
              "message": "number_unit 解析存在异常，请人工确认",
              "raw_value": "0.4-5mm，开口1-6mm",
              "term_type": "product_effective_thickness",
              "field_name": "制品有效厚度",
              "item_index": 1
            },
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，已创建字段名候选",
              "evidence": {
                "line": 10,
                "text": "B10 0.4-5mm，开口1-6mm"
              },
              "raw_value": "0.4-5mm，开口1-6mm",
              "field_name": "制品有效厚度",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 2,
            "candidate_id": "1090",
            "candidate_type": "term_type",
            "raw_field_name": "开口",
            "source_product_type": "flat_die"
          },
          "raw_value": "0.4-5mm，开口1-6mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "5",
              "rangeMax": "5",
              "rangeMin": "0.4",
              "rawValue": "0.4-5mm，开口1-6mm",
              "warnings": [
                "number_unit_trailing_text"
              ],
              "numberKind": "range",
              "rangeStart": "0.4",
              "displayUnit": "mm",
              "numericText": "0.4-5",
              "trailingText": "开口1-6mm",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "0.4-5 mm",
              "trailingRawValue": "1-6mm",
              "normalizedUnitRaw": "mm",
              "trailingFieldName": "开口"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "0.4-5 mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {
            "line": 12,
            "text": "B12 2400mm"
          },
          "original": false,
          "raw_text": "2400mm",
          "selected": true,
          "warnings": [],
          "raw_value": "2400mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "die_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "2400",
              "unitRaw": "mm",
              "rawValue": "2400mm",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "2400",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "2400 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "2400 mm",
            "normalized_field_name": "模头有效宽度"
          },
          "field_name": "模头有效宽度"
        },
        {
          "evidence": {
            "line": 7,
            "text": "[SEL] 不是"
          },
          "original": false,
          "raw_text": "不是",
          "selected": true,
          "warnings": [],
          "raw_value": "不是",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "specification_compatible_with_original",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "不是",
            "normalized_field_name": "规格型号与原产品互配"
          },
          "field_name": "规格型号与原产品互配"
        }
      ],
      "rawFieldCount": 0
    },
    {
      "itemIndex": 2,
      "itemName": "2层分配器",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {
            "line": [
              63,
              80
            ]
          },
          "original": false,
          "raw_text": "2层分配器",
          "selected": true,
          "warnings": [],
          "raw_value": "2",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "layer_count",
            "value_kind": "number",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "2",
            "normalized_field_name": "层数"
          },
          "field_name": "层数"
        }
      ],
      "rawFieldCount": 0
    },
    {
      "itemIndex": 3,
      "itemName": "3层分配器",
      "quantity": "2套",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "LDPE LLDPE",
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀",
              "raw_value": "LDPE LLDPE",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 3
            }
          ],
          "raw_value": "LDPE LLDPE",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "LDPE",
                "confidence": 1,
                "displayName": "LDPE",
                "canonicalValue": "LDPE"
              },
              {
                "rawValue": "LLDPE",
                "confidence": 1,
                "displayName": "LLDPE",
                "canonicalValue": "LLDPE"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "LDPE",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "LDPE",
            "normalized_value": "ldpelldpe",
            "material_prefix_split": {
              "sourceRawValue": "LDPE LLDPE",
              "matchedMaterialTokens": [
                "LDPE",
                "LLDPE"
              ]
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "（      3     ）层",
          "warnings": [],
          "raw_value": "3层",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "layer
```

### Candidate
```json
[
  {
    "id": 61,
    "candidateType": "value",
    "termType": "product_material",
    "rawValue": "A （2714A）",
    "normalizedRawValue": "a2714a",
    "proposedCanonicalValue": "1.2714_Forged",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B39",
      "text": "[SEL] A （2714A）",
      "sheet": "生产明细表",
      "source": "local",
      "block_id": "Row39"
    }
  },
  {
    "id": 72,
    "candidateType": "value",
    "termType": "product_type",
    "rawValue": "板材模头",
    "normalizedRawValue": "板材模头",
    "proposedCanonicalValue": "flat_die",
    "status": "rejected",
    "confidence": null,
    "evidence": {
      "cell": "B8",
      "text": "板材模头",
      "sheet": "生产明细表",
      "source": "local",
      "block_id": "Row8"
    }
  },
  {
    "id": 73,
    "candidateType": "value",
    "termType": "lower_lip_adjustment_method",
    "rawValue": "可预调节",
    "normalizedRawValue": "可预调节",
    "proposedCanonicalValue": "lower_adjustable_lip",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B20",
      "text": "[SEL] 下模唇可预调节",
      "sheet": "生产明细表",
      "source": "local",
      "block_id": "Row20"
    }
  },
  {
    "id": 77,
    "candidateType": "value",
    "termType": "die_mounting_method",
    "rawValue": "45°挤出微调朝下",
    "normalizedRawValue": "45°挤出微调朝下",
    "proposedCanonicalValue": "forty_five_degree_adjustment_down",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "cell": "B47",
      "text": "[SEL] 45°挤出微调朝下",
      "sheet": "生产明细表",
      "source": "local",
      "block_id": "Row47"
    }
  },
  {
    "id": 78,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC软质不透明",
    "normalizedRawValue": "pvc软质不透明",
    "proposedCanonicalValue": "plastic_material:PVC|application:soft_opaque",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B69",
      "text": "PVC软质不透明",
      "sheet": "生产明细表",
      "source": "local",
      "block_id": "Row69",
      "sourceRawValue": "PVC软质不透明",
      "splitFromRawValue": "PVC软质不透明"
    }
  },
  {
    "id": 118,
    "candidateType": "value",
    "termType": "upper_choker_bar_angle",
    "rawValue": "70度",
    "normalizedRawValue": "70度",
    "proposedCanonicalValue": "70°阻流棒",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B25",
      "text": "70度阻流棒",
      "sheet": "生产明细表",
      "source": "local",
      "block_id": "Row25"
    }
  },
  {
    "id": 676,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC软质不透明板材模头（产量400-500KG",
    "normalizedRawValue": "pvc软质不透明板材模头产量400500kg",
    "proposedCanonicalValue": "PVC",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "line": 8,
      "text": "B8 PVC软质不透明板材模头（产量400-500KG/每小时）",
      "sourceRawValue": "PVC软质不透明板材模头（产量400-500KG/每小时）",
      "splitFromRawValue": "PVC软质不透明板材模头（产量400-500KG"
    }
  },
  {
    "id": 2916,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "软质不透明板材模头产量400500kg、每小时",
    "normalizedRawValue": "软质不透明板材模头产量400500kg每小时",
    "proposedCanonicalValue": null,
    "status": "done_2916",
    "confidence": "0.72",
    "evidence": {
      "line": 8,
      "text": "B8 PVC软质不透明板材模头（产量400-500KG/每小时）",
      "sourceRawValue": "PVC软质不透明板材模头（产量400-500KG/每小时）",
      "suffixRawValue": "软质不透明板材模头产量400500kg、每小时",
      "splitFromRawValue": "软质不透明板材模头产量400500kg、每小时",
      "matchedMaterialTokens": [
        "PVC"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 3240,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "软质不透明板材",
    "normalizedRawValue": "软质不透明板材",
    "proposedCanonicalValue": null,
    "status": "done_3240",
    "confidence": "0.72",
    "evidence": {
      "line": 8,
      "text": "B8 PVC软质不透明板材模头（产量400-500KG/每小时）",
      "routedBy": "plastic_material_residual_classifier",
      "splitRule": "plastic_material_residual_classifier",
      "residualPart": "模头产量400500kg",
      "sourceRawValue": "PVC软质不透明板材模头（产量400-500KG/每小时）",
      "suffixRawValue": "软质不透明板材",
      "splitFromRawValue": "软质不透明板材",
      "applicationLikePart": "软质不透明板材",
      "matchedMaterialTokens": [
        "PVC"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 3859,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "软质不透明板材",
    "normalizedRawValue": "软质不透明板材",
    "proposedCanonicalValue": null,
    "status": "pending",
    "confidence": "0.72",
    "evidence": {
      "line": 8,
      "text": "B8 PVC软质不透明板材模头（产量400-500KG/每小时）",
      "routedBy": "plastic_material_residual_classifier",
      "splitRule": "plastic_material_residual_classifier",
      "residualPart": "模头产量400500kg",
      "sourceRawValue": "PVC软质不透明板材模头（产量400-500KG/每小时）",
      "suffixRawValue": "软质不透明板材",
      "splitFromRawValue": "软质不透明板材",
      "applicationLikePart": "软质不透明板材",
      "matchedMaterialTokens": [
        "PVC"
      ],
      "suffixCandidateTermType": "application"
    }
  }
]
```

### Lines
- L1: 文件名：模头生产明细表（190282-E）2019-3-7-2400mm软质不透明PVC板材模头和2层AB分配器.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 模具编号：190282-E
- L14: 客户ID：40217
- L15: [ ] 国内使用
- L17: 国家(     印度                      )
- L21: 合同编号：7190110
- L22: 合同规定交货日期：
- L26: 下单日期：2019-3-7
- L27: 交货日期：2019-5-7
- L28: 完工日期：
- L29: 实际发货日期：
- L33: [A7] 规格型号与原产品互配
- L36: 原产品编号（             ）
- L44: [A9] 制品有效宽度
- L47: [A10] 制品有效厚度
- L52: [A12] 模头有效宽度
- L55: [A13] 模头宽度调节方式
- L64: [A14] 模唇厚度调节范围
- L65: [B14] 模唇厚度调节范围（                ）
- L67: 上下文：模唇厚度调节范围
- L74: [A16] 模唇数量
- L76: [ ] 上模唇（           ）套
- L77: [ ] 下模唇（         ）套
- L79: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L81: [A17] 模唇调节方式
- L82: [B17] [ ] 上模唇采用膨胀螺栓自动调节，参考图纸
- L83: option_set: {"options":[{"selected":false,"value":"上模唇采用膨胀螺栓自动调节，参考图纸"}]}
- L85: 上下文：模唇调节方式
- L87: [SEL] 上模手动推式微调
- L89: option_set: {"options":[{"selected":true,"value":"上模手动推式微调"},{"selected":false,"value":"手动推、拉式微调"}]}
- L91: 上下文：模唇调节方式
- L97: 上下文：模唇调节方式
- L98: [B20] [SEL] 下模唇可预调节
- L99: option_set: {"options":[{"selected":true,"value":"下模唇可预调节"}]}
- L101: 上下文：模唇调节方式
- L102: [B21] [ ] 下模唇固定、并可更换
- L103: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L105: 上下文：模唇调节方式
- L106: [B22] [ ] 下模整体结构
- L107: option_set: {"options":[{"selected":false,"value":"下模整体结构"}]}
- L109: 上下文：模唇调节方式
- L125: [ ] 上模
- L126: [ ] 下模   ）
- L127: option_set: {"options":[{"selected":true,"value":"有      70度阻流棒      分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"}]}
- L129: [A26] 流道形式
- L133: [ ] 模内多流道
- L135: option_set: {"options":[{"selected":true,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":false,"value":"其他"}]}
- L137: [A27] 加热方式
- L139: [SEL] 不锈钢加热棒
- L140: [ ] 加热板
- L142: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L144: [A28] 模头加热分区
- L147: 两侧板
- L150: 模唇
- L155: [A29] 模唇加热方式
- L157: [SEL] 加热棒
- L162: [ ] 加热板
- L163: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":false,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L165: [A30] 加热电压
- L168: [A31] 每区功率
- L170: [A32] 接线方式
- L172: [SEL] 带护罩全封闭接线
- L173: [ ] 模体开槽接线
- L175: option_set: {"options":[{"selected":true,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":false,"value":"其他"}]}
- L190: [A35] 侧板接插件
- L196: [A36] 热电偶孔
- L201: [A37] 热电偶孔规格
- L203: [SEL] 根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。
- L204: [ ] 客户要求
- L205: option_set: {"options":[{"selected":true,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。"},{"selected":false,"value":"客户要求"}]}
- L210: [A39] 模头材料选用
- L221: 模唇表面粗糙度：
- L226: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L239: 表面镀层要求：
- L243: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L247: 流道表面镀层厚度：
- L252: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L256: 流道表面镀层硬度：
- L259: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L263: 外表面镀层厚度：
- L268: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L270: [A47] 模头安装方式
- L275: [ ] 45°斜挤出安装 （分为：
- L278: option_set: {"options":[{"selected":true,"value":"平挤出"},{"selected":false,"value":"下挤出"},{"selected":false,"value":"其他"},{"selected":false,"value":"45°斜挤出安装 （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":true,"value":"45°挤出微调朝下"}
- L280: [A48] 平挤出安装方式时
- L281: [B48] 支架孔规格、型号（                                                     ）
- L283: 上下文：平挤出安装方式时
- L291: [A50] 其它安装方式时
- L292: [B50] 吊装孔规格、型号（                                                     ）
- L294: 上下文：其它安装方式时
- L295: [B51] 吊装时中心距、规格（                                                  ）
- L298: [B52] 平挤出安装方式时，在模头（                            ）边
- L301: [B53] 其他安装方式时，在模头（                                ）边
- L303: [A54] 进料口方式
- L305: [ ] 中央圆口进料
- L306: [SEL] 中央方口进料
- L307: [ ] 其他形状或不同位置进料
- L308: option_set: {"options":[{"selected":false,"value":"中央圆口进料"},{"selected":true,"value":"中央方口进料"},{"selected":false,"value":"其他形状或不同位置进料"}]}
- L310: [A55] 进料口尺寸
- L317: [A56] 配合三辊进料方式
- L319: [ ] 中、上辊进料
- L320: [ ] 中、下辊进料
- L322: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}
- L326: [ ] 有　　数量：共（          ）件
- L328: option_set: {"options":[{"selected":false,"value":"有　　数量：共（          ）件"},{"selected":true,"value":"没有"}]}
- L330: [A58] 连接器加热方式
- L332: [ ] 不锈钢加热圈
- L333: [ ] 铸铝加热圈
- L335: option_set: {"options":[{"selected":false,"value":"不锈钢加热圈"},{"selected":false,"value":"铸铝加热圈"},{"selected":false,"value":"其他"}]}

## Document 16 模头生产明细表（190465-E）2019-04-07-1150mmPVC硬质不透明片材模头（产品厚度：1-5mm）.xls

- extractionResultId: 14318
- approxBlocksTokens: 5417
- candidates: 7

### Normalized
```json
{
  "documentInfo": {},
  "items": [
    {
      "itemIndex": 1,
      "itemName": "模头",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "PVC硬质不透明片材",
          "selected": true,
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀",
              "raw_value": "PVC硬质不透明片材",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "raw_value": "PVC硬质不透明片材",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "PVC",
                "confidence": 0.9,
                "displayName": "PVC",
                "canonicalValue": "PVC"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 0.9,
            "value_kind": "enums",
            "display_name": "PVC",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PVC",
            "normalized_value": "pvc硬质不透明片材",
            "material_prefix_split": {
              "sourceRawValue": "PVC硬质不透明片材",
              "matchedMaterialTokens": [
                "PVC"
              ]
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "1000mm",
          "selected": true,
          "warnings": [],
          "raw_value": "1000mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "1000",
              "unitRaw": "mm",
              "rawValue": "1000mm",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "1000",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1000 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1000 mm",
            "normalized_field_name": "制品有效宽度"
          },
          "field_name": "制品有效宽度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "1-4mm",
          "selected": true,
          "warnings": [],
          "raw_value": "1-4mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "4",
              "rangeMax": "4",
              "rangeMin": "1",
              "rawValue": "1-4mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "1",
              "displayUnit": "mm",
              "numericText": "1-4",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1-4 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1-4 mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "250-300kg/h以下",
          "selected": true,
          "warnings": [],
          "raw_value": "250-300kg/h以下",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "capacity",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "kg/h",
              "rangeEnd": "300",
              "rangeMax": "300",
              "rangeMin": "250",
              "rawValue": "250-300kg/h以下",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "250",
              "displayUnit": "kg/h",
              "numericText": "250-300",
              "unitCanonical": "kg/h",
              "matchedAliasId": "7",
              "normalizedValue": "250-300 kg/h",
              "normalizedUnitRaw": "kg/h"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "250-300 kg/h",
            "normalized_field_name": "产量"
          },
          "field_name": "产量"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "1150mm",
          "selected": true,
          "warnings": [],
          "raw_value": "1150mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "die_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "1150",
              "unitRaw": "mm",
              "rawValue": "1150mm",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "1150",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1150 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1150 mm",
            "normalized_field_name": "模头有效宽度"
          },
          "field_name": "模头有效宽度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "模唇厚度调节范围（    1—5mm    ）",
          "selected": true,
          "warnings": [],
          "qualifier": {
            "area": "lip",
            "sourceText": "模唇"
          },
          "raw_value": "1—5mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "lip_thickness_adjustment_range",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "5",
              "rangeMax": "5",
              "rangeMin": "1",
              "rawValue": "1—5mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "1",
              "displayUnit": "mm",
              "numericText": "1-5",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1-5 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1-5 mm",
            "normalized_field_name": "模唇厚度调节范围"
          },
          "field_name": "模唇厚度调节范围"
        },
        {
          "evidence": {
            "rule": "runtime_qualifier_matcher",
            "qualifier": {
              "area": "lip",
              "position": "upper_die",
              "sourceText": "上模"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "唇调节方式",
                  "qualifier": {
                    "area": "lip",
                    "position": "upper_die",
                    "sourceText": "上模"
                  }
                },
                "before": {
                  "fieldName": "上模唇调节方式"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the field name into structured qualifier metadata.",
                "confidence": 0.86,
                "relationType": "qualifier_variant",
                "recommendedAction": "map_as_qualifier_variant"
              }
            ],
            "qualifierKey": "upper_die",
            "baseFieldName": "唇调节方式",
            "qualifierKind": "position",
            "qualifierRule": "runtime_qualifier_matcher",
            "originalFieldName": "上模唇调节方式",
            "qualifierSourceText": "上模",
            "matchedQualifierAlias": "上模"
          },
          "original": false,
          "raw_text": "[SEL] 手动推式微调",
          "selected": true,
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "手动推式微调",
              "field_name": "唇调节方式",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 1,
            "candidate_id": "1901",
            "candidate_type": "term_type",
            "raw_field_name": "唇调节方式",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "lip",
            "position": "upper_die",
            "sourceText": "上模"
          },
          "raw_value": "手动推式微调",
          "confidence": 0.95,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "手动推式微调",
            "normalized_field_name": "唇调节方式"
          },
          "field_name": "唇调节方式"
        },
        {
          "evidence": {
            "rule": "runtime_qualifier_matcher",
            "qualifier": {
              "area": "lip",
              "position": "lower_die",
              "sourceText": "下模"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "唇调节方式",
                  "qualifier": {
                    "area": "lip",
                    "position": "lower_die",
                    "sourceText": "下模"
                  }
                },
                "before": {
                  "fieldName": "下模唇调节方式"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the field name into structured qualifier metadata.",
                "confidence": 0.86,
                "relationType": "qualifier_variant",
                "recommendedAction": "map_as_qualifier_variant"
              }
            ],
            "qualifierKey": "lower_die",
            "baseFieldName": "唇调节方式",
            "qualifierKind": "position",
            "qualifierRule": "runtime_qualifier_matcher",
            "originalFieldName": "下模唇调节方式",
            "qualifierSourceText": "下模",
            "matchedQualifierAlias": "下模"
          },
          "original": false,
          "raw_text": "[SEL] 下模唇可预调节（粗调）",
          "selected": true,
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "下模唇可预调节（粗调）",
              "field_name": "唇调节方式",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 1,
            "candidate_id": "1901",
            "candidate_type": "term_type",
            "raw_field_name": "唇调节方式",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "lip",
            "position": "lower_die",
            "sourceText": "下模"
          },
          "raw_value": "下模唇可预调节（粗调）",
          "confidence": 0.95,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "下模唇可预调节粗调",
            "normalized_field_name": "唇调节方式"
          },
          "field_name": "唇调节方式"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "
```

### Candidate
```json
[
  {
    "id": 68,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC硬质不透明片材",
    "normalizedRawValue": "pvc硬质不透明片材",
    "proposedCanonicalValue": "plastic_material:PVC|application:rigid_opaque_sheet",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B9",
      "text": "PVC硬质不透明片材",
      "sheet": "生产明细表",
      "source": "excel",
      "block_id": "Row9"
    }
  },
  {
    "id": 71,
    "candidateType": "value",
    "termType": "product_material",
    "rawValue": "A （2714A钢材）",
    "normalizedRawValue": "a2714a钢材",
    "proposedCanonicalValue": "1.2714_Forged",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B40",
      "text": "[SEL] A （2714A钢材）",
      "sheet": "生产明细表",
      "source": "excel",
      "block_id": "Row40"
    }
  },
  {
    "id": 112,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "适用塑料原料",
    "normalizedRawValue": "适用塑料原料",
    "proposedCanonicalValue": "PVC",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "适用塑料原料",
      "splitFromRawValue": "适用塑料原料"
    }
  },
  {
    "id": 113,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "应用领域",
    "normalizedRawValue": "应用领域",
    "proposedCanonicalValue": "rigid_opaque_sheet",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B9",
      "text": "PVC硬质不透明片材",
      "sheet": "生产明细表",
      "source": "excel",
      "block_id": "Row9"
    }
  },
  {
    "id": 114,
    "candidateType": "value",
    "termType": "upper_choker_bar_angle",
    "rawValue": "70°",
    "normalizedRawValue": "70°",
    "proposedCanonicalValue": "70°",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B26",
      "text": "[SEL] 70° 阻流棒",
      "sheet": "生产明细表",
      "source": "excel",
      "block_id": "Row26"
    }
  },
  {
    "id": 359,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "应用领域",
    "normalizedRawValue": "应用领域",
    "proposedCanonicalValue": null,
    "status": "rejected",
    "confidence": null,
    "evidence": {
      "cell": "B9",
      "text": "PVC硬质不透明片材",
      "sheet": "生产明细表",
      "source": "excel",
      "block_id": "Row9"
    }
  },
  {
    "id": 394,
    "candidateType": "value",
    "termType": "upper_choker_bar_angle",
    "rawValue": "70°",
    "normalizedRawValue": "70°",
    "proposedCanonicalValue": "70°阻流棒",
    "status": "done_394",
    "confidence": null,
    "evidence": {
      "cell": "B26",
      "text": "[SEL] 70° 阻流棒",
      "sheet": "生产明细表",
      "source": "excel",
      "block_id": "Row26"
    }
  }
]
```

### Lines
- L1: 文件名：模头生产明细表（190465-E）2019-04-07-1150mmPVC硬质不透明片材模头（产品厚度：1-5mm）.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 客户ID：40218
- L14: [ ] 国内使用
- L15: [SEL] 出口使用
- L16: 国家(马其顿        )
- L17: option_set: {"options":[{"selected":false,"value":"国内使用"},{"selected":true,"value":"出口使用"}],"field":"客户ID"}
- L20: 合同编号：7181109
- L21: 合同规定交货日期：2019-05-22
- L24: 模具编号：190465-E下单日期：2019-04-07
- L25: 交货日期：2019-05-22
- L26: 完工日期：
- L30: [A7] 规格型号与原产品相同
- L33: 原产品编号（                          ）
- L38: [A8] 规格型号与原产品互配
- L41: 原产品编号（        160609                  ）
- L49: [A10] 制品有效宽度
- L52: [A11] 制品有效厚度
- L58: [A13] 模头有效宽度
- L61: [A14] 模头宽度调节方式
- L69: [A15] 模唇厚度调节范围
- L70: [B15] 模唇厚度调节范围（    1—5mm    ）
- L72: 上下文：模唇厚度调节范围
- L79: [A17] 模唇数量
- L81: [ ] 上模唇（           ）套
- L82: [ ] 下模唇（         ）套
- L84: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L86: [A18] 模唇调节方式
- L87: [B18] [ ] 上模唇采用减力推、拉式机械装置微调结构，下模唇可更换或固定。（90°）
- L88: option_set: {"options":[{"selected":false,"value":"上模唇采用减力推、拉式机械装置微调结构，下模唇可更换或固定。（90°）"}]}
- L90: 上下文：模唇调节方式
- L96: 上下文：模唇调节方式
- L102: 上下文：模唇调节方式
- L103: [B21] [SEL] 下模唇可预调节（粗调）
- L104: option_set: {"options":[{"selected":true,"value":"下模唇可预调节（粗调）"}]}
- L106: 上下文：模唇调节方式
- L107: [B22] [ ] 下模唇固定、并可更换
- L108: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L110: 上下文：模唇调节方式
- L111: [B23] [ ] 下模整体结构
- L112: option_set: {"options":[{"selected":false,"value":"下模整体结构"}]}
- L114: 上下文：模唇调节方式
- L129: [ ] 上模
- L130: [ ] 下模   ）
- L133: [ ] 上模
- L134: [ ] 下模   ）
- L135: option_set: {"options":[{"selected":true,"value":"有     分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"},{"selected":true,"value":"70° 阻流棒"},{"sele
- L137: [A27] 流道形式
- L141: [ ] 模内多流道
- L143: option_set: {"options":[{"selected":true,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":false,"value":"其他"}]}
- L145: [A28] 加热方式
- L147: [SEL] 不锈钢加热棒
- L148: [ ] 加热板
- L150: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L152: [A29] 模头加热分区
- L155: 两侧板
- L158: 模唇
- L163: [A30] 模唇加热方式
- L165: [ ] 加热棒
- L170: [ ] 加热板
- L171: option_set: {"options":[{"selected":false,"value":"加热棒"},{"selected":false,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":false,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L173: [A31] 加热电压
- L178: [A32] 每区功率
- L180: [A33] 接线方式
- L182: [ ] 带护罩全封闭接线
- L183: [ ] 模体开槽接线
- L184: [SEL] 精诚标准接线
- L185: option_set: {"options":[{"selected":false,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":true,"value":"精诚标准接线"}]}
- L200: [A36] 侧板接插件
- L206: [A37] 热电偶孔
- L208: [ ] 上模
- L209: [ ] 下模
- L212: option_set: {"options":[{"selected":false,"value":"上模"},{"selected":false,"value":"下模  分区情况（   11　  ）区"}]}
- L214: [A38] 热电偶孔规格
- L216: [SEL] 根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。
- L217: [ ] 客户要求
- L218: option_set: {"options":[{"selected":true,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。"},{"selected":false,"value":"客户要求"}]}
- L223: [A40] 模头材料选用
- L233: 模唇表面粗糙度：
- L238: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L251: 表面镀层要求：
- L255: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L259: 流道表面镀层厚度：
- L264: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L268: 流道表面镀层硬度：
- L271: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L275: 外表面镀层厚度：
- L280: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L282: [A48] 模头安装方式
- L287: [ ] 45°斜挤出安装
- L291: option_set: {"options":[{"selected":true,"value":"平挤出"},{"selected":false,"value":"其他"},{"selected":false,"value":"45°斜挤出安装    （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":false,"value":"45°挤出微调朝下"}]}
- L293: [A49] 平挤出安装方式时
- L294: [B49] 支架孔规格、型号（                                                     ）
- L296: 上下文：平挤出安装方式时
- L304: [A51] 其它安装方式时
- L305: [B51] 吊装孔规格、型号（                                                     ）
- L307: 上下文：其它安装方式时
- L308: [B52] 吊装时中心距、规格（                                                  ）
- L311: [B53] 平挤出安装方式时，在模头（                            ）边
- L314: [B54] 其他安装方式时，在模头（                                ）边
- L316: [A55] 进料口方式
- L318: [SEL] 中央圆口进料
- L319: [ ] 中央方口进料
- L320: [ ] 其他形状或不同位置进料
- L321: option_set: {"options":[{"selected":true,"value":"中央圆口进料"},{"selected":false,"value":"中央方口进料"},{"selected":false,"value":"其他形状或不同位置进料"}]}
- L323: [A56] 进料口尺寸
- L329: [A57] 配合三辊进料方式
- L331: [ ] 中、上辊进料
- L332: [ ] 中、下辊进料
- L334: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}

## Document 17 模头生产明细表（190666-E）2019-05-13-850mm硬质透明PVC片材模头.xls

- extractionResultId: 14319
- approxBlocksTokens: 6087
- candidates: 5

### Normalized
```json
{
  "documentInfo": {
    "order_number": {
      "value": "",
      "rawKey": "order_number",
      "evidence": {},
      "confidence": 0,
      "canonicalKey": "order_number"
    },
    "customer_notes": [
      {
        "evidence": {},
        "raw_text": "要求打JCTIMES 标志!",
        "raw_value": "要求打JCTIMES 标志!",
        "field_name": "标志要求/备注",
        "item_index": 1,
        "document_id": "17",
        "extraction_result_id": "14319"
      },
      {
        "evidence": {
          "line": 1,
          "text": "》》》要求打JCTIMES 标志! 加急"
        },
        "raw_text": "》》》要求打JCTIMES 标志! 加急",
        "raw_value": "要求打JCTIMES 标志! 加急",
        "field_name": "标志要求/备注",
        "item_index": 2,
        "document_id": "17",
        "extraction_result_id": "14319"
      }
    ],
    "product_number": {
      "value": "190666-E",
      "rawKey": "product_number",
      "evidence": {
        "line": 15,
        "text": "模具编号：190666-E"
      },
      "confidence": 0.9,
      "canonicalKey": "product_number"
    },
    "contract_number": {
      "value": "7190321",
      "rawKey": "contract_number",
      "evidence": {
        "line": 23,
        "text": "合同编号：7190321"
      },
      "confidence": 0.9,
      "canonicalKey": "contract_number"
    }
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "PVC硬质透明片材模头",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "PVC硬质透明片材模头（产量350KG/每小时）",
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀并识别应用领域后缀",
              "raw_value": "PVC硬质透明片材模头（产量350KG/每小时）",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            },
            {
              "type": "value_no_match",
              "message": "字段值未命中字典，已创建字段值候选",
              "evidence": {},
              "raw_value": "PVC硬质透明片材模头（产量350KG/每小时）",
              "term_type": "application",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "raw_value": "硬质透明片材",
            "term_type": "application",
            "item_index": 1,
            "candidate_id": "3860",
            "candidate_type": "value",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "PVC硬质透明片材模头（产量350KG/每小时）",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "PVC",
                "confidence": 1,
                "displayName": "PVC",
                "canonicalValue": "PVC"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "PVC",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PVC",
            "normalized_value": "pvc硬质透明片材模头产量350kg/每小时",
            "material_prefix_split": {
              "sourceRawValue": "PVC硬质透明片材模头（产量350KG/每小时）",
              "suffixRawValue": "硬质透明片材模头产量350kg、每小时",
              "matchedMaterialTokens": [
                "PVC"
              ],
              "suffixCandidateTermType": "application"
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "产量350KG/每小时",
          "warnings": [],
          "raw_value": "350KG/每小时",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "capacity",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "350",
              "unitRaw": "KG/小时",
              "rawValue": "350KG/每小时",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "kg/h",
              "numericText": "350",
              "unitCanonical": "kg/h",
              "matchedAliasId": "7",
              "normalizedValue": "350 kg/h",
              "normalizedUnitRaw": "kg/h"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "350 kg/h",
            "normalized_field_name": "产量"
          },
          "field_name": "产量"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "720MM",
          "warnings": [],
          "raw_value": "720MM",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "720",
              "unitRaw": "MM",
              "rawValue": "720MM",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "720",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "720 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "720 mm",
            "normalized_field_name": "制品有效宽度"
          },
          "field_name": "制品有效宽度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "0.2-0.5mm",
          "warnings": [],
          "raw_value": "0.2-0.5mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "0.5",
              "rangeMax": "0.5",
              "rangeMin": "0.2",
              "rawValue": "0.2-0.5mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "0.2",
              "displayUnit": "mm",
              "numericText": "0.2-0.5",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "0.2-0.5 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "0.2-0.5 mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "850mm",
          "warnings": [],
          "raw_value": "850mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "die_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "850",
              "unitRaw": "mm",
              "rawValue": "850mm",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "850",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "850 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "850 mm",
            "normalized_field_name": "模头有效宽度"
          },
          "field_name": "模头有效宽度"
        },
        {
          "evidence": {
            "rule": "runtime_qualifier_matcher",
            "qualifier": {
              "area": "lip",
              "position": "upper_die",
              "sourceText": "上模"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "唇调节方式",
                  "qualifier": {
                    "area": "lip",
                    "position": "upper_die",
                    "sourceText": "上模"
                  }
                },
                "before": {
                  "fieldName": "上模唇调节方式"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the field name into structured qualifier metadata.",
                "confidence": 0.86,
                "relationType": "qualifier_variant",
                "recommendedAction": "map_as_qualifier_variant"
              }
            ],
            "qualifierKey": "upper_die",
            "baseFieldName": "唇调节方式",
            "qualifierKind": "position",
            "qualifierRule": "runtime_qualifier_matcher",
            "originalFieldName": "上模唇调节方式",
            "qualifierSourceText": "上模",
            "matchedQualifierAlias": "上模"
          },
          "original": false,
          "raw_text": "上模手动推式微调",
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "上模手动推式微调",
              "field_name": "唇调节方式",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 1,
            "candidate_id": "1901",
            "candidate_type": "term_type",
            "raw_field_name": "唇调节方式",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "lip",
            "position": "upper_die",
            "sourceText": "上模"
          },
          "raw_value": "上模手动推式微调",
          "confidence": 0.95,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "上模手动推式微调",
            "normalized_field_name": "唇调节方式"
          },
          "field_name": "唇调节方式"
        },
        {
          "evidence": {
            "rule": "runtime_qualifier_matcher",
            "qualifier": {
              "area": "lip",
              "position": "lower_die",
              "sourceText": "下模"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "唇调节方式",
                  "qualifier": {
                    "area": "lip",
                    "position": "lower_die",
                    "sourceText": "下模"
                  }
                },
                "before": {
                  "fieldName": "下模唇调节方式"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the field name into structured qualifier metadata.",
                "confidence": 0.86,
                "relationType": "qualifier_variant",
                "recommendedAction": "map_as_qualifier_variant"
              }
            ],
            "qualifierKey": "lower_die",
            "baseFieldName": "唇调节方式",
            "qualifierKind": "position",
            "qualifierRule": "runtime_qualifier_matcher",
            "originalFieldName": "下模唇调节方式",
            "qualifierSourceText": "下模",
            "matchedQualifierAlias": "下模"
          },
          "original": false,
          "raw_text": "下模整体结构",
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "下模整体结构",
              "field_name": "唇调节方式",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 1,
            "candidate_id": "1901",
            "candidate_type": "term_type",
            "raw_field_name": "唇调节方式",
            "source_product_type": "flat_di
```

### Candidate
```json
[
  {
    "id": 700,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC硬质透明片材模头（产量350KG",
    "normalizedRawValue": "pvc硬质透明片材模头产量350kg",
    "proposedCanonicalValue": "PVC",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "sourceRawValue": "PVC硬质透明片材模头（产量350KG/每小时）",
      "splitFromRawValue": "PVC硬质透明片材模头（产量350KG"
    }
  },
  {
    "id": 2922,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "硬质透明片材模头产量350kg、每小时",
    "normalizedRawValue": "硬质透明片材模头产量350kg每小时",
    "proposedCanonicalValue": null,
    "status": "done_2922",
    "confidence": "0.72",
    "evidence": {
      "sourceRawValue": "PVC硬质透明片材模头（产量350KG/每小时）",
      "suffixRawValue": "硬质透明片材模头产量350kg、每小时",
      "splitFromRawValue": "硬质透明片材模头产量350kg、每小时",
      "matchedMaterialTokens": [
        "PVC"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 3241,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "硬质透明片材",
    "normalizedRawValue": "硬质透明片材",
    "proposedCanonicalValue": null,
    "status": "done_3241",
    "confidence": "0.72",
    "evidence": {
      "routedBy": "plastic_material_residual_classifier",
      "splitRule": "plastic_material_residual_classifier",
      "residualPart": "模头产量350kg",
      "sourceRawValue": "PVC硬质透明片材模头（产量350KG/每小时）",
      "suffixRawValue": "硬质透明片材",
      "splitFromRawValue": "硬质透明片材",
      "applicationLikePart": "硬质透明片材",
      "matchedMaterialTokens": [
        "PVC"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 3630,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "硬质透明片材",
    "normalizedRawValue": "硬质透明片材",
    "proposedCanonicalValue": null,
    "status": "done_3630",
    "confidence": "0.72",
    "evidence": {
      "routedBy": "plastic_material_residual_classifier",
      "splitRule": "plastic_material_residual_classifier",
      "residualPart": "模头产量350kg",
      "sourceRawValue": "PVC硬质透明片材模头（产量350KG/每小时）",
      "suffixRawValue": "硬质透明片材",
      "splitFromRawValue": "硬质透明片材",
      "applicationLikePart": "硬质透明片材",
      "matchedMaterialTokens": [
        "PVC"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 3860,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "硬质透明片材",
    "normalizedRawValue": "硬质透明片材",
    "proposedCanonicalValue": null,
    "status": "pending",
    "confidence": "0.72",
    "evidence": {
      "routedBy": "plastic_material_residual_classifier",
      "splitRule": "plastic_material_residual_classifier",
      "residualPart": "模头产量350kg",
      "sourceRawValue": "PVC硬质透明片材模头（产量350KG/每小时）",
      "suffixRawValue": "硬质透明片材",
      "splitFromRawValue": "硬质透明片材",
      "applicationLikePart": "硬质透明片材",
      "matchedMaterialTokens": [
        "PVC"
      ],
      "suffixCandidateTermType": "application"
    }
  }
]
```

### Lines
- L1: 文件名：模头生产明细表（190666-E）2019-05-13-850mm硬质透明PVC片材模头.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 模具编号：190666-E
- L14: 客户ID：40219
- L15: [ ] 国内使用
- L17: 国家(     巴基斯坦                      )
- L21: 合同编号：7190321
- L22: 合同规定交货日期：
- L26: 下单日期：2019-05-13
- L27: 交货日期：2019-07-01
- L28: 完工日期：
- L29: 实际发货日期：
- L33: [A7] 规格型号与原产品互配
- L36: 原产品编号（             ）
- L44: [A9] 制品有效宽度
- L47: [A10] 制品有效厚度
- L52: [A12] 模头有效宽度
- L55: [A13] 模头宽度调节方式
- L64: [A14] 模唇厚度调节范围
- L65: [B14] 模唇厚度调节范围（                ）
- L67: 上下文：模唇厚度调节范围
- L74: [A16] 模唇数量
- L76: [ ] 上模唇（           ）套
- L77: [ ] 下模唇（         ）套
- L79: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L81: [A17] 模唇调节方式
- L82: [B17] [ ] 上模唇采用膨胀螺栓自动调节，参考图纸
- L83: option_set: {"options":[{"selected":false,"value":"上模唇采用膨胀螺栓自动调节，参考图纸"}]}
- L85: 上下文：模唇调节方式
- L87: [SEL] 上模手动推式微调
- L89: option_set: {"options":[{"selected":true,"value":"上模手动推式微调"},{"selected":false,"value":"手动推、拉式微调"}]}
- L91: 上下文：模唇调节方式
- L97: 上下文：模唇调节方式
- L98: [B20] [ ] 下模唇可预调节
- L99: option_set: {"options":[{"selected":false,"value":"下模唇可预调节"}]}
- L101: 上下文：模唇调节方式
- L102: [B21] [ ] 下模唇固定、并可更换
- L103: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L105: 上下文：模唇调节方式
- L106: [B22] [SEL] 下模整体结构
- L107: option_set: {"options":[{"selected":true,"value":"下模整体结构"}]}
- L109: 上下文：模唇调节方式
- L125: [ ] 上模
- L126: [ ] 下模   ）
- L127: option_set: {"options":[{"selected":false,"value":"有"},{"selected":true,"value":"无     分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"}]}
- L129: [A26] 流道形式
- L133: [ ] 模内多流道
- L135: option_set: {"options":[{"selected":true,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":false,"value":"其他"}]}
- L137: [A27] 加热方式
- L139: [SEL] 不锈钢加热棒
- L140: [ ] 加热板
- L142: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L144: [A28] 模头加热分区
- L147: 两侧板
- L150: 模唇
- L155: [A29] 模唇加热方式
- L157: [SEL] 加热棒
- L162: [ ] 加热板
- L163: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":false,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L165: [A30] 加热电压
- L168: [A31] 每区功率
- L170: [A32] 接线方式
- L172: [SEL] 带护罩全封闭接线
- L173: [ ] 模体开槽接线
- L175: option_set: {"options":[{"selected":true,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":false,"value":"其他"}]}
- L190: [A35] 侧板接插件
- L196: [A36] 热电偶孔
- L201: [A37] 热电偶孔规格
- L203: [SEL] 根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。
- L204: [ ] 客户要求
- L205: option_set: {"options":[{"selected":true,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。"},{"selected":false,"value":"客户要求"}]}
- L210: [A39] 模头材料选用
- L222: 模唇表面粗糙度：
- L227: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L240: 表面镀层要求：
- L244: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L248: 流道表面镀层厚度：
- L253: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L257: 流道表面镀层硬度：
- L260: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L264: 外表面镀层厚度：
- L269: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L271: [A47] 模头安装方式
- L276: [ ] 45°斜挤出安装 （分为：
- L279: option_set: {"options":[{"selected":true,"value":"平挤出"},{"selected":false,"value":"下挤出"},{"selected":false,"value":"其他"},{"selected":false,"value":"45°斜挤出安装 （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":true,"value":"45°挤出微调朝下"}
- L281: [A48] 平挤出安装方式时
- L282: [B48] 支架孔规格、型号（                                                     ）
- L284: 上下文：平挤出安装方式时
- L292: [A50] 其它安装方式时
- L293: [B50] 吊装孔规格、型号（                                                     ）
- L295: 上下文：其它安装方式时
- L296: [B51] 吊装时中心距、规格（                                                  ）
- L299: [B52] 平挤出安装方式时，在模头（                            ）边
- L302: [B53] 其他安装方式时，在模头（                                ）边
- L304: [A54] 进料口方式
- L306: [SEL] 中央圆口进料
- L307: [ ] 中央方口进料
- L308: [ ] 其他形状或不同位置进料
- L309: option_set: {"options":[{"selected":true,"value":"中央圆口进料"},{"selected":false,"value":"中央方口进料"},{"selected":false,"value":"其他形状或不同位置进料"}]}
- L311: [A55] 进料口尺寸
- L318: [A56] 配合三辊进料方式
- L320: [ ] 中、上辊进料
- L321: [ ] 中、下辊进料
- L323: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}
- L327: [ ] 有　　数量：共（          ）件
- L329: option_set: {"options":[{"selected":false,"value":"有　　数量：共（          ）件"},{"selected":true,"value":"没有"}]}
- L331: [A58] 连接器加热方式
- L333: [ ] 不锈钢加热圈
- L334: [ ] 铸铝加热圈
- L336: option_set: {"options":[{"selected":false,"value":"不锈钢加热圈"},{"selected":false,"value":"铸铝加热圈"},{"selected":false,"value":"其他"}]}

## Document 18 模头生产明细表（190893-E）2019-7-2-2050mmPVC保鲜膜模头.xls

- extractionResultId: 14320
- approxBlocksTokens: 6000
- candidates: 5

### Normalized
```json
{
  "documentInfo": {
    "order_number": {
      "value": "",
      "rawKey": "order_number",
      "evidence": {
        "line": 0,
        "text": ""
      },
      "confidence": 0,
      "canonicalKey": "order_number"
    },
    "customer_notes": [
      {
        "evidence": {},
        "raw_text": "要求打JCTIMES 标志! 新客户，后续还有订单，请注意品质！",
        "raw_value": "要求打JCTIMES 标志! 新客户，后续还有订单，请注意品质！",
        "field_name": "标志要求/备注",
        "item_index": 1,
        "document_id": "18",
        "extraction_result_id": "14320"
      },
      {
        "evidence": {
          "line": 1,
          "text": "》》》要求打JCTIMES 标志! 加急"
        },
        "raw_text": "》》》要求打JCTIMES 标志! 加急",
        "raw_value": "要求打JCTIMES 标志! 加急",
        "field_name": "标志要求/备注",
        "item_index": 2,
        "document_id": "18",
        "extraction_result_id": "14320"
      }
    ],
    "product_number": {
      "value": "190893-E",
      "rawKey": "product_number",
      "evidence": {
        "line": 15,
        "text": "模具编号：190893-E"
      },
      "confidence": 1,
      "canonicalKey": "product_number"
    },
    "contract_number": {
      "value": "7190527",
      "rawKey": "contract_number",
      "evidence": {
        "line": 23,
        "text": "合同编号：7190527"
      },
      "confidence": 1,
      "canonicalKey": "contract_number"
    }
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "PVC保鲜膜模头",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "PVC保鲜膜模头（产量500KG/每小时）",
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀并识别应用领域后缀",
              "raw_value": "PVC保鲜膜模头（产量500KG/每小时）",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "PVC保鲜膜模头（产量500KG/每小时）",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "PVC",
                "confidence": 1,
                "displayName": "PVC",
                "canonicalValue": "PVC"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "PVC",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PVC",
            "normalized_value": "pvc保鲜膜模头产量500kg/每小时",
            "material_prefix_split": {
              "sourceRawValue": "PVC保鲜膜模头（产量500KG/每小时）",
              "suffixRawValue": "保鲜膜模头产量500kg、每小时",
              "matchedMaterialTokens": [
                "PVC"
              ],
              "suffixCandidateTermType": "application"
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "产量500KG/每小时",
          "warnings": [],
          "raw_value": "500KG/每小时",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "capacity",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "500",
              "unitRaw": "KG/小时",
              "rawValue": "500KG/每小时",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "kg/h",
              "numericText": "500",
              "unitCanonical": "kg/h",
              "matchedAliasId": "7",
              "normalizedValue": "500 kg/h",
              "normalizedUnitRaw": "kg/h"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "500 kg/h",
            "normalized_field_name": "产量"
          },
          "field_name": "产量"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "1800MM",
          "warnings": [],
          "raw_value": "1800MM",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "1800",
              "unitRaw": "MM",
              "rawValue": "1800MM",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "1800",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1800 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1800 mm",
            "normalized_field_name": "制品有效宽度"
          },
          "field_name": "制品有效宽度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "0.01-0.015mm",
          "warnings": [],
          "raw_value": "0.01-0.015mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "0.015",
              "rangeMax": "0.015",
              "rangeMin": "0.01",
              "rawValue": "0.01-0.015mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "0.01",
              "displayUnit": "mm",
              "numericText": "0.01-0.015",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "0.01-0.015 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "0.01-0.015 mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "2050mm",
          "warnings": [],
          "raw_value": "2050mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "die_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "2050",
              "unitRaw": "mm",
              "rawValue": "2050mm",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "2050",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "2050 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "2050 mm",
            "normalized_field_name": "模头有效宽度"
          },
          "field_name": "模头有效宽度"
        },
        {
          "evidence": {
            "rule": "runtime_qualifier_matcher",
            "qualifier": {
              "area": "lip",
              "position": "upper_die",
              "sourceText": "上模"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "唇调节方式",
                  "qualifier": {
                    "area": "lip",
                    "position": "upper_die",
                    "sourceText": "上模"
                  }
                },
                "before": {
                  "fieldName": "上模唇调节方式"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the field name into structured qualifier metadata.",
                "confidence": 0.86,
                "relationType": "qualifier_variant",
                "recommendedAction": "map_as_qualifier_variant"
              }
            ],
            "qualifierKey": "upper_die",
            "baseFieldName": "唇调节方式",
            "qualifierKind": "position",
            "qualifierRule": "runtime_qualifier_matcher",
            "originalFieldName": "上模唇调节方式",
            "qualifierSourceText": "上模",
            "matchedQualifierAlias": "上模"
          },
          "original": false,
          "raw_text": "上模减力推拉",
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "上模减力推拉",
              "field_name": "唇调节方式",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 1,
            "candidate_id": "1901",
            "candidate_type": "term_type",
            "raw_field_name": "唇调节方式",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "lip",
            "position": "upper_die",
            "sourceText": "上模"
          },
          "raw_value": "上模减力推拉",
          "confidence": 0.95,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "上模减力推拉",
            "normalized_field_name": "唇调节方式"
          },
          "field_name": "唇调节方式"
        },
        {
          "evidence": {
            "rule": "runtime_qualifier_matcher",
            "qualifier": {
              "area": "lip",
              "position": "lower_die",
              "sourceText": "下模"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "唇调节方式",
                  "qualifier": {
                    "area": "lip",
                    "position": "lower_die",
                    "sourceText": "下模"
                  }
                },
                "before": {
                  "fieldName": "下模唇调节方式"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the field name into structured qualifier metadata.",
                "confidence": 0.86,
                "relationType": "qualifier_variant",
                "recommendedAction": "map_as_qualifier_variant"
              }
            ],
            "qualifierKey": "lower_die",
            "baseFieldName": "唇调节方式",
            "qualifierKind": "position",
            "qualifierRule": "runtime_qualifier_matcher",
            "originalFieldName": "下模唇调节方式",
            "qualifierSourceText": "下模",
            "matchedQualifierAlias": "下模"
          },
          "original": false,
          "raw_text": "下模整体结构",
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "下模整体结构",
              "field_name": "唇调节方式",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 1,
            "candidate_id": "1901",
            "candidate_type": "term_type",
            "raw_field_name": "唇调节方式",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "lip",
            "position": "lower_die",
            "sourceText": "下模"
          },
          "raw_value": "下模整体结构",
          "confidence": 0.95,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "下模整体结构",
            "normalized_field_name": "唇调节方式"
          },
          "field_name": "唇调节方式"
        },
        {
          "evidence": {},
 
```

### Candidate
```json
[
  {
    "id": 124,
    "candidateType": "value",
    "termType": "product_material",
    "rawValue": "1.2316不锈钢",
    "normalizedRawValue": "1.2316不锈钢",
    "proposedCanonicalValue": "1.2316_stainless_steel",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "text": "[SEL] B（1.2316不锈钢）",
      "block_id": "B39"
    }
  },
  {
    "id": 264,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "保鲜膜",
    "normalizedRawValue": "保鲜膜",
    "proposedCanonicalValue": "preservative_film",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "text": "PVC保鲜膜模头"
    }
  },
  {
    "id": 701,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC保鲜膜模头（产量500KG",
    "normalizedRawValue": "pvc保鲜膜模头产量500kg",
    "proposedCanonicalValue": "PVC",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "sourceRawValue": "PVC保鲜膜模头（产量500KG/每小时）",
      "splitFromRawValue": "PVC保鲜膜模头（产量500KG"
    }
  },
  {
    "id": 2921,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "保鲜膜模头产量500kg、每小时",
    "normalizedRawValue": "保鲜膜模头产量500kg每小时",
    "proposedCanonicalValue": null,
    "status": "auto_resolved",
    "confidence": "0.72",
    "evidence": {
      "sourceRawValue": "PVC保鲜膜模头（产量500KG/每小时）",
      "suffixRawValue": "保鲜膜模头产量500kg、每小时",
      "splitFromRawValue": "保鲜膜模头产量500kg、每小时",
      "matchedMaterialTokens": [
        "PVC"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 2934,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "保鲜膜",
    "normalizedRawValue": "保鲜膜",
    "proposedCanonicalValue": "preservative_film",
    "status": "auto_resolved",
    "confidence": "0.72",
    "evidence": {
      "routedBy": "plastic_material_residual_classifier",
      "splitRule": "plastic_material_residual_classifier",
      "residualPart": "模头产量500kg",
      "sourceRawValue": "PVC保鲜膜模头（产量500KG/每小时）",
      "suffixRawValue": "保鲜膜",
      "splitFromRawValue": "保鲜膜",
      "applicationLikePart": "保鲜膜",
      "matchedMaterialTokens": [
        "PVC"
      ],
      "suffixCandidateTermType": "application"
    }
  }
]
```

### Lines
- L1: 文件名：模头生产明细表（190893-E）2019-7-2-2050mmPVC保鲜膜模头.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 模具编号：190893-E
- L14: 客户ID：40220
- L15: [ ] 国内使用
- L17: 国家(     伊朗                      )
- L21: 合同编号：7190527
- L22: 合同规定交货日期：
- L26: 下单日期：2019-7-2
- L27: 交货日期：2019-9-29
- L28: 完工日期：
- L29: 实际发货日期：
- L31: [A6] 》》》要求打JCTIMES 标志! 新客户，后续还有订单，请注意品质！
- L33: [A7] 规格型号与原产品互配
- L36: 原产品编号（             ）
- L44: [A9] 制品有效宽度
- L47: [A10] 制品有效厚度
- L52: [A12] 模头有效宽度
- L55: [A13] 模头宽度调节方式
- L64: [A14] 模唇厚度调节范围
- L65: [B14] 模唇厚度调节范围（                ）
- L67: 上下文：模唇厚度调节范围
- L74: [A16] 模唇数量
- L76: [ ] 上模唇（           ）套
- L77: [ ] 下模唇（         ）套
- L79: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L81: [A17] 模唇调节方式
- L83: 上下文：模唇调节方式
- L85: [SEL] 上模减力推拉
- L87: option_set: {"options":[{"selected":true,"value":"上模减力推拉"},{"selected":false,"value":"手动推、拉式微调"}]}
- L89: 上下文：模唇调节方式
- L95: 上下文：模唇调节方式
- L96: [B20] [ ] 下模唇可预调节
- L97: option_set: {"options":[{"selected":false,"value":"下模唇可预调节"}]}
- L99: 上下文：模唇调节方式
- L100: [B21] [ ] 下模唇固定、并可更换
- L101: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L103: 上下文：模唇调节方式
- L104: [B22] [SEL] 下模整体结构
- L105: option_set: {"options":[{"selected":true,"value":"下模整体结构"}]}
- L107: 上下文：模唇调节方式
- L122: [ ] 上模
- L123: [ ] 下模   ）
- L124: option_set: {"options":[{"selected":false,"value":"有           分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"}]}
- L126: [A26] 流道形式
- L130: [ ] 模内多流道
- L132: option_set: {"options":[{"selected":true,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":false,"value":"其他"}]}
- L134: [A27] 加热方式
- L136: [SEL] 不锈钢加热棒
- L137: [ ] 加热板
- L139: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L141: [A28] 模头加热分区
- L144: 两侧板
- L147: 模唇
- L152: [A29] 模唇加热方式
- L154: [SEL] 加热棒
- L159: [ ] 加热板
- L160: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":false,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L162: [A30] 加热电压
- L165: [A31] 每区功率
- L167: [A32] 接线方式
- L169: [SEL] 带护罩全封闭接线
- L170: [ ] 模体开槽接线
- L172: option_set: {"options":[{"selected":true,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":false,"value":"其他"}]}
- L187: [A35] 侧板接插件
- L193: [A36] 热电偶孔
- L198: [A37] 热电偶孔规格
- L200: [SEL] 根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。
- L201: [ ] 客户要求
- L202: option_set: {"options":[{"selected":true,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。"},{"selected":false,"value":"客户要求"}]}
- L207: [A39] 模头材料选用
- L218: 模唇表面粗糙度：
- L223: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L236: 表面镀层要求：
- L240: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L244: 流道表面镀层厚度：
- L249: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L253: 流道表面镀层硬度：
- L256: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L260: 外表面镀层厚度：
- L265: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L267: [A47] 模头安装方式
- L272: [ ] 45°斜挤出安装 （分为：
- L275: option_set: {"options":[{"selected":false,"value":"平挤出"},{"selected":true,"value":"下挤出"},{"selected":false,"value":"其他"},{"selected":false,"value":"45°斜挤出安装 （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":false,"value":"45°挤出微调朝下"
- L277: [A48] 平挤出安装方式时
- L278: [B48] 支架孔规格、型号（                                                     ）
- L280: 上下文：平挤出安装方式时
- L288: [A50] 其它安装方式时
- L289: [B50] 吊装孔规格、型号（                                                     ）
- L291: 上下文：其它安装方式时
- L292: [B51] 吊装时中心距、规格（                                                  ）
- L295: [B52] 平挤出安装方式时，在模头（                            ）边
- L298: [B53] 其他安装方式时，在模头（                                ）边
- L300: [A54] 进料口方式
- L302: [SEL] 上模面圆口进料
- L303: [ ] 中央方口进料
- L304: [ ] 其他形状或不同位置进料
- L305: option_set: {"options":[{"selected":true,"value":"上模面圆口进料"},{"selected":false,"value":"中央方口进料"},{"selected":false,"value":"其他形状或不同位置进料"}]}
- L307: [A55] 进料口尺寸
- L314: [A56] 配合三辊进料方式
- L316: [ ] 中、上辊进料
- L317: [ ] 中、下辊进料
- L319: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}
- L323: [ ] 有　　数量：共（          ）件
- L325: option_set: {"options":[{"selected":false,"value":"有　　数量：共（          ）件"},{"selected":true,"value":"没有"}]}
- L327: [A58] 连接器加热方式
- L329: [ ] 不锈钢加热圈
- L330: [ ] 铸铝加热圈
- L332: option_set: {"options":[{"selected":false,"value":"不锈钢加热圈"},{"selected":false,"value":"铸铝加热圈"},{"selected":false,"value":"其他"}]}
- L336: [ ] 需方客户提供图纸　　提供图纸日期：

## Document 19 模头生产明细表（191074-E）2019--08-22-2500mm LLDPE拉伸膜模头(2).xls

- extractionResultId: 14321
- approxBlocksTokens: 6001
- candidates: 5

### Normalized
```json
{
  "documentInfo": {
    "order_number": {
      "value": "unknown",
      "rawKey": "order_number",
      "evidence": {
        "line": 0,
        "text": ""
      },
      "confidence": 0,
      "canonicalKey": "order_number"
    },
    "customer_notes": [
      {
        "evidence": {},
        "raw_text": "要求打JCTIMES 标志!",
        "raw_value": "要求打JCTIMES 标志!",
        "field_name": "标志要求/备注",
        "item_index": 1,
        "document_id": "19",
        "extraction_result_id": "14321"
      },
      {
        "evidence": {
          "line": 1,
          "text": "》》》要求打JCTIMES 标志! 加急"
        },
        "raw_text": "》》》要求打JCTIMES 标志! 加急",
        "raw_value": "要求打JCTIMES 标志! 加急",
        "field_name": "标志要求/备注",
        "item_index": 2,
        "document_id": "19",
        "extraction_result_id": "14321"
      }
    ],
    "product_number": {
      "value": "191074-E",
      "rawKey": "product_number",
      "evidence": {
        "line": 15,
        "text": "模具编号：191074-E"
      },
      "confidence": 0.9,
      "canonicalKey": "product_number"
    },
    "contract_number": {
      "value": "7190816",
      "rawKey": "contract_number",
      "evidence": {
        "line": 23,
        "text": "合同编号：7190816"
      },
      "confidence": 0.9,
      "canonicalKey": "contract_number"
    }
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "LLDPE拉伸膜模头",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "LLDPE 拉伸膜模头（产量800KG/每小时）",
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀并识别应用领域后缀",
              "raw_value": "LLDPE 拉伸膜模头（产量800KG/每小时）",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            },
            {
              "type": "value_no_match",
              "message": "字段值未命中字典，已创建字段值候选",
              "evidence": {},
              "raw_value": "LLDPE 拉伸膜模头（产量800KG/每小时）",
              "term_type": "application",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "raw_value": "拉伸膜",
            "term_type": "application",
            "item_index": 1,
            "candidate_id": "3861",
            "candidate_type": "value",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "LLDPE 拉伸膜模头（产量800KG/每小时）",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "LLDPE",
                "confidence": 1,
                "displayName": "LLDPE",
                "canonicalValue": "LLDPE"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "LLDPE",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "LLDPE",
            "normalized_value": "lldpe拉伸膜模头产量800kg/每小时",
            "material_prefix_split": {
              "sourceRawValue": "LLDPE 拉伸膜模头（产量800KG/每小时）",
              "suffixRawValue": "拉伸膜模头产量800kg、每小时",
              "matchedMaterialTokens": [
                "LLDPE"
              ],
              "suffixCandidateTermType": "application"
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "产量800KG/每小时",
          "warnings": [],
          "raw_value": "800KG/每小时",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "capacity",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "800",
              "unitRaw": "KG/小时",
              "rawValue": "800KG/每小时",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "kg/h",
              "numericText": "800",
              "unitCanonical": "kg/h",
              "matchedAliasId": "7",
              "normalizedValue": "800 kg/h",
              "normalizedUnitRaw": "kg/h"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "800 kg/h",
            "normalized_field_name": "产量"
          },
          "field_name": "产量"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "0.015-0.0.03mm",
          "warnings": [],
          "raw_value": "0.015-0.0.03mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "0.015-0.0.03mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "2500-2100mm",
          "warnings": [],
          "raw_value": "2500-2100mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "die_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "2100",
              "rangeMax": "2500",
              "rangeMin": "2100",
              "rawValue": "2500-2100mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "2500",
              "displayUnit": "mm",
              "numericText": "2500-2100",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "2500-2100 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "2500-2100 mm",
            "normalized_field_name": "模头有效宽度"
          },
          "field_name": "模头有效宽度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "外堵式",
          "warnings": [],
          "raw_value": "外堵式",
          "confidence": 0.95,
          "dictionary": {
            "note": "泛称普通外挡",
            "matched": true,
            "term_type": "deckle_type",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "普通外挡",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "external_standard_deckle",
            "normalized_value": "外堵式",
            "normalized_field_name": "模头宽度调节方式"
          },
          "field_name": "模头宽度调节方式"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "T型挂钩外挡每块25mm",
          "warnings": [],
          "raw_value": "T型挂钩外挡每块25mm",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "deckle_note",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "t型挂钩外挡每块25mm",
            "normalized_field_name": "堵边详细说明"
          },
          "field_name": "堵边详细说明"
        },
        {
          "evidence": {
            "rule": "runtime_qualifier_matcher",
            "qualifier": {
              "area": "lip",
              "position": "upper_die",
              "sourceText": "上模"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "唇调节方式",
                  "qualifier": {
                    "area": "lip",
                    "position": "upper_die",
                    "sourceText": "上模"
                  }
                },
                "before": {
                  "fieldName": "上模唇调节方式"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the field name into structured qualifier metadata.",
                "confidence": 0.86,
                "relationType": "qualifier_variant",
                "recommendedAction": "map_as_qualifier_variant"
              }
            ],
            "qualifierKey": "upper_die",
            "baseFieldName": "唇调节方式",
            "qualifierKind": "position",
            "qualifierRule": "runtime_qualifier_matcher",
            "originalFieldName": "上模唇调节方式",
            "qualifierSourceText": "上模",
            "matchedQualifierAlias": "上模"
          },
          "original": false,
          "raw_text": "上模手动推式微调",
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "上模手动推式微调",
              "field_name": "唇调节方式",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 1,
            "candidate_id": "1901",
            "candidate_type": "term_type",
            "raw_field_name": "唇调节方式",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "lip",
            "position": "upper_die",
            "sourceText": "上模"
          },
          "raw_value": "上模手动推式微调",
          "confidence": 0.95,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "上模手动推式微调",
            "normalized_field_name": "唇调节方式"
          },
          "field_name": "唇调节方式"
        },
        {
          "evidence": {
            "rule": "runtime_qualifier_matcher",
            "qualifier": {
              "area": "lip",
              "position": "lower_die",
              "sourceText": "下模"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "唇调节方式",
                  "qualifier": {
                    "area": "lip",
                    "position": "lower_die",
                    "sourceText": "下模"
                  }
                },
                "before": {
                  "fieldName": "下模唇调节方式"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the field name into structured qualifier metadata.",
                "confidence": 0.86,
                "relationType": "qualifier_variant",
                "recommendedAction": "map_as_qualifier_variant"
              }
            ],
            "qualifierKey": "lower_die",
            "baseFieldName": "唇调节方式",
            "qualifierKind": "position",
            "qualifierRule": "runtime_qualifier_matcher",
            "originalFieldName": "下模唇调节方式",
            "qualifierSourceText": "下模",
            "matchedQualifierAlias": "下模"
          },
          "original": false,
          "raw_text": "下模整体结构",
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "下模整体结构",
              "field_name": "唇调节方式",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 1,
            "candidate_id": "1901",
            "candidate_type": "term_type",
            "raw_field_name": "唇调节方式",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            
```

### Candidate
```json
[
  {
    "id": 130,
    "candidateType": "value",
    "termType": "upper_lip_adjustment_method",
    "rawValue": "上模手动推式微调",
    "normalizedRawValue": "上模手动推式微调",
    "proposedCanonicalValue": "external_standard_deckle",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B18",
      "text": "[SEL] 上模手动推式微调",
      "sheet": "生产明细表",
      "source": "excel",
      "block_id": "B18"
    }
  },
  {
    "id": 698,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "拉伸膜模头（产量800KG",
    "normalizedRawValue": "拉伸膜模头产量800kg",
    "proposedCanonicalValue": null,
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "line": 8,
      "sourceRawValue": "LLDPE 拉伸膜模头（产量800KG/每小时）",
      "splitFromRawValue": "拉伸膜模头（产量800KG"
    }
  },
  {
    "id": 3243,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "拉伸膜",
    "normalizedRawValue": "拉伸膜",
    "proposedCanonicalValue": null,
    "status": "done_3243",
    "confidence": "0.72",
    "evidence": {
      "routedBy": "plastic_material_residual_classifier",
      "splitRule": "plastic_material_residual_classifier",
      "residualPart": "产量800kg",
      "sourceRawValue": "LLDPE 拉伸膜模头（产量800KG/每小时）",
      "suffixRawValue": "拉伸膜",
      "splitFromRawValue": "拉伸膜",
      "applicationLikePart": "拉伸膜",
      "matchedMaterialTokens": [
        "LLDPE"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 3632,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "拉伸膜",
    "normalizedRawValue": "拉伸膜",
    "proposedCanonicalValue": null,
    "status": "done_3632",
    "confidence": "0.72",
    "evidence": {
      "routedBy": "plastic_material_residual_classifier",
      "splitRule": "plastic_material_residual_classifier",
      "residualPart": "产量800kg",
      "sourceRawValue": "LLDPE 拉伸膜模头（产量800KG/每小时）",
      "suffixRawValue": "拉伸膜",
      "splitFromRawValue": "拉伸膜",
      "applicationLikePart": "拉伸膜",
      "matchedMaterialTokens": [
        "LLDPE"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 3861,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "拉伸膜",
    "normalizedRawValue": "拉伸膜",
    "proposedCanonicalValue": null,
    "status": "pending",
    "confidence": "0.72",
    "evidence": {
      "routedBy": "plastic_material_residual_classifier",
      "splitRule": "plastic_material_residual_classifier",
      "residualPart": "产量800kg",
      "sourceRawValue": "LLDPE 拉伸膜模头（产量800KG/每小时）",
      "suffixRawValue": "拉伸膜",
      "splitFromRawValue": "拉伸膜",
      "applicationLikePart": "拉伸膜",
      "matchedMaterialTokens": [
        "LLDPE"
      ],
      "suffixCandidateTermType": "application"
    }
  }
]
```

### Lines
- L1: 文件名：模头生产明细表（191074-E）2019--08-22-2500mm LLDPE拉伸膜模头(2).xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 模具编号：191074-E
- L14: 客户ID：40221
- L15: [ ] 国内使用
- L17: 国家(                           )
- L21: 合同编号：7190816
- L22: 合同规定交货日期：
- L26: 下单日期：2019-08-22
- L27: 交货日期：2019-11-02
- L28: 完工日期：
- L29: 实际发货日期：
- L33: [A7] 规格型号与原产品互配
- L36: 原产品编号（             ）
- L44: [A9] 制品有效宽度
- L46: [A10] 制品有效厚度
- L51: [A12] 模头有效宽度
- L54: [A13] 模头宽度调节方式
- L64: [A14] 模唇厚度调节范围
- L65: [B14] 模唇厚度调节范围（                ）
- L67: 上下文：模唇厚度调节范围
- L74: [A16] 模唇数量
- L76: [ ] 上模唇（           ）套
- L77: [ ] 下模唇（         ）套
- L79: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L81: [A17] 模唇调节方式
- L82: [B17] [ ] 上模唇采用膨胀螺栓自动调节，参考图纸
- L83: option_set: {"options":[{"selected":false,"value":"上模唇采用膨胀螺栓自动调节，参考图纸"}]}
- L85: 上下文：模唇调节方式
- L87: [SEL] 上模手动推式微调
- L89: option_set: {"options":[{"selected":true,"value":"上模手动推式微调"},{"selected":false,"value":"手动推、拉式微调"}]}
- L91: 上下文：模唇调节方式
- L97: 上下文：模唇调节方式
- L98: [B20] [ ] 下模唇可预调节
- L99: option_set: {"options":[{"selected":false,"value":"下模唇可预调节"}]}
- L101: 上下文：模唇调节方式
- L102: [B21] [ ] 下模唇固定、并可更换
- L103: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L105: 上下文：模唇调节方式
- L106: [B22] [SEL] 下模整体结构
- L107: option_set: {"options":[{"selected":true,"value":"下模整体结构"}]}
- L109: 上下文：模唇调节方式
- L124: [ ] 上模
- L125: [ ] 下模   ）
- L126: option_set: {"options":[{"selected":false,"value":"有            分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"}]}
- L128: [A26] 流道形式
- L132: [ ] 模内多流道
- L134: option_set: {"options":[{"selected":true,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":false,"value":"其他"}]}
- L136: [A27] 加热方式
- L138: [SEL] 不锈钢加热棒
- L139: [ ] 加热板
- L141: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L143: [A28] 模头加热分区
- L146: 两侧板
- L149: 模唇
- L154: [A29] 模唇加热方式
- L156: [SEL] 加热棒
- L161: [ ] 加热板
- L162: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":false,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L164: [A30] 加热电压
- L167: [A31] 每区功率
- L169: [A32] 接线方式
- L171: [SEL] 带护罩全封闭接线
- L172: [ ] 模体开槽接线
- L174: option_set: {"options":[{"selected":true,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":false,"value":"其他"}]}
- L189: [A35] 侧板接插件
- L195: [A36] 热电偶孔
- L200: [A37] 热电偶孔规格
- L202: [SEL] 根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。
- L203: [ ] 客户要求
- L204: option_set: {"options":[{"selected":true,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。"},{"selected":false,"value":"客户要求"}]}
- L209: [A39] 模头材料选用
- L220: 模唇表面粗糙度：
- L225: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L238: 表面镀层要求：
- L242: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L246: 流道表面镀层厚度：
- L251: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L255: 流道表面镀层硬度：
- L258: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L262: 外表面镀层厚度：
- L267: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L269: [A47] 模头安装方式
- L274: [ ] 45°斜挤出安装 （分为：
- L277: option_set: {"options":[{"selected":false,"value":"平挤出"},{"selected":true,"value":"下挤出"},{"selected":false,"value":"其他"},{"selected":false,"value":"45°斜挤出安装 （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":false,"value":"45°挤出微调朝下"
- L279: [A48] 平挤出安装方式时
- L280: [B48] 支架孔规格、型号（                                                     ）
- L282: 上下文：平挤出安装方式时
- L290: [A50] 其它安装方式时
- L291: [B50] 吊装孔规格、型号（                                                     ）
- L293: 上下文：其它安装方式时
- L294: [B51] 吊装时中心距、规格（                                                  ）
- L297: [B52] 平挤出安装方式时，在模头（                            ）边
- L300: [B53] 其他安装方式时，在模头（                                ）边
- L302: [A54] 进料口方式
- L304: [ ] 中央圆口进料
- L305: [SEL] 中央方口进料
- L306: [ ] 其他形状或不同位置进料
- L307: option_set: {"options":[{"selected":false,"value":"中央圆口进料"},{"selected":true,"value":"中央方口进料"},{"selected":false,"value":"其他形状或不同位置进料"}]}
- L309: [A55] 进料口尺寸
- L316: [A56] 配合三辊进料方式
- L318: [ ] 中、上辊进料
- L319: [ ] 中、下辊进料
- L321: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}
- L325: [ ] 有　　数量：共（          ）件
- L327: option_set: {"options":[{"selected":false,"value":"有　　数量：共（          ）件"},{"selected":true,"value":"没有"}]}
- L329: [A58] 连接器加热方式
- L331: [ ] 不锈钢加热圈
- L332: [ ] 铸铝加热圈
- L334: option_set: {"options":[{"selected":false,"value":"不锈钢加热圈"},{"selected":false,"value":"铸铝加热圈"},{"selected":false,"value":"其他"}]}

## Document 20 模头生产明细表（191225-E）2019--09-19-850mm PC光学级薄片模头+5层分配器(1).xls

- extractionResultId: 14323
- approxBlocksTokens: 6977
- candidates: 6

### Normalized
```json
{
  "documentInfo": {
    "customer_notes": [
      {
        "evidence": {
          "text": "Row 6, A6"
        },
        "raw_text": "要求打JCTIMES 标志! 客户要求极高，按照日本要求加工检测，请注意品质！！！",
        "raw_value": "要求打JCTIMES 标志! 客户要求极高，按照日本要求加工检测，请注意品质！！！",
        "field_name": "标志要求/备注",
        "item_index": 1,
        "document_id": "20",
        "extraction_result_id": "14323"
      },
      {
        "evidence": {
          "text": "》》》要求打JCTIMES 标志! 加急"
        },
        "raw_text": "》》》要求打JCTIMES 标志! 加急",
        "raw_value": "要求打JCTIMES 标志! 加急",
        "field_name": "标志要求/备注",
        "item_index": 3,
        "document_id": "20",
        "extraction_result_id": "14323"
      }
    ]
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "PC光学级薄片模头（产量100-300KG/每小时）",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {
            "text": "Row 8, B8"
          },
          "original": false,
          "raw_text": "PC光学级薄片模头（产量100-300KG/每小时）",
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀并识别应用领域后缀",
              "raw_value": "PC光学级薄片模头（产量100-300KG/每小时）",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            },
            {
              "type": "value_no_match",
              "message": "字段值未命中字典，已创建字段值候选",
              "evidence": {
                "text": "Row 8, B8"
              },
              "raw_value": "PC光学级薄片模头（产量100-300KG/每小时）",
              "term_type": "application",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "raw_value": "光学级薄片",
            "term_type": "application",
            "item_index": 1,
            "candidate_id": "3862",
            "candidate_type": "value",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "PC光学级薄片模头（产量100-300KG/每小时）",
          "confidence": 0.9,
          "dictionary": {
            "values": [
              {
                "rawValue": "PC",
                "confidence": 1,
                "displayName": "PC",
                "canonicalValue": "PC"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "PC",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PC",
            "normalized_value": "pc光学级薄片模头产量100300kg/每小时",
            "material_prefix_split": {
              "sourceRawValue": "PC光学级薄片模头（产量100-300KG/每小时）",
              "suffixRawValue": "光学级薄片模头产量100300kg、每小时",
              "matchedMaterialTokens": [
                "PC"
              ],
              "suffixCandidateTermType": "application"
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {
            "text": "Row 10, B10"
          },
          "original": false,
          "raw_text": "0.1-0.50mm",
          "warnings": [],
          "raw_value": "0.1-0.50mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "0.50",
              "rangeMax": "0.5",
              "rangeMin": "0.1",
              "rawValue": "0.1-0.50mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "0.1",
              "displayUnit": "mm",
              "numericText": "0.1-0.50",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "0.1-0.50 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "0.1-0.50 mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {
            "text": "Row 12, B12"
          },
          "original": false,
          "raw_text": "850-550mm （做防粘处理）",
          "warnings": [
            {
              "type": "number_unit_trailing_text",
              "message": "number_unit 解析存在异常，请人工确认",
              "raw_value": "850-550mm （做防粘处理）",
              "term_type": "die_effective_width",
              "field_name": "模头有效宽度",
              "item_index": 1
            }
          ],
          "raw_value": "850-550mm （做防粘处理）",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "die_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "550",
              "rangeMax": "850",
              "rangeMin": "550",
              "rawValue": "850-550mm （做防粘处理）",
              "warnings": [
                "number_unit_trailing_text"
              ],
              "numberKind": "range",
              "rangeStart": "850",
              "displayUnit": "mm",
              "numericText": "850-550",
              "trailingText": "做防粘处理",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "850-550 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "850-550 mm",
            "normalized_field_name": "模头有效宽度"
          },
          "field_name": "模头有效宽度"
        },
        {
          "evidence": {
            "text": "Row 7, B7"
          },
          "original": false,
          "raw_text": "不是",
          "selected": true,
          "warnings": [],
          "raw_value": "不是",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "specification_compatible_with_original",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "不是",
            "normalized_field_name": "规格型号与原产品互配"
          },
          "field_name": "规格型号与原产品互配"
        },
        {
          "evidence": {
            "text": "模唇厚度调节范围（      开口1.2mm          ）",
            "ruleSignals": [
              {
                "after": {
                  "itemIndex": 1,
                  "productType": "flat_die"
                },
                "before": {
                  "itemIndex": 2,
                  "productType": "feedblock"
                },
                "ruleId": "product_type_redirect",
                "message": "A field points to a different product item in the same extraction.",
                "confidence": 0.85,
                "relationType": "wrong_scope",
                "recommendedAction": "move_scope"
              }
            ]
          },
          "original": false,
          "raw_text": "模唇厚度调节范围（      开口1.2mm          ）",
          "warnings": [
            {
              "type": "field_product_type_redirected",
              "message": "字段名指向其它产品配置，已从当前 item 归入同一 extraction 中更匹配的 item",
              "evidence": {
                "text": "模唇厚度调节范围（      开口1.2mm          ）"
              },
              "raw_value": "开口1.2mm",
              "field_name": "模唇厚度调节范围",
              "item_index": 2
            }
          ],
          "qualifier": {
            "area": "lip",
            "sourceText": "模唇"
          },
          "raw_value": "开口1.2mm",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "lip_thickness_adjustment_range",
            "value_kind": "number_unit",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "开口1.2mm",
            "normalized_field_name": "模唇厚度调节范围"
          },
          "field_name": "模唇厚度调节范围"
        }
      ],
      "rawFieldCount": 0
    },
    {
      "itemIndex": 2,
      "itemName": "5层分配器",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {
            "text": "[SEL] 外堵式"
          },
          "original": false,
          "raw_text": "[SEL] 外堵式",
          "selected": true,
          "warnings": [],
          "raw_value": "外堵式",
          "confidence": 0.9,
          "dictionary": {
            "note": "泛称普通外挡",
            "matched": true,
            "term_type": "deckle_type",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "普通外挡",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "external_standard_deckle",
            "normalized_value": "外堵式",
            "normalized_field_name": "堵边方式"
          },
          "field_name": "堵边方式"
        }
      ],
      "rawFieldCount": 0
    },
    {
      "itemIndex": 3,
      "itemName": "3层分配器",
      "quantity": "2套",
      "fields": [
        {
          "evidence": {
            "text": "总计共（    2    ）套"
          },
          "original": false,
          "raw_text": "总计共（    2    ）套",
          "warnings": [],
          "qualifier": {
            "area": "feedblock",
            "sourceText": "分配器"
          },
          "raw_value": "2套",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "item_quantity",
            "value_kind": "number",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "2套",
            "normalized_field_name": "分配器数量"
          },
          "field_name": "分配器数量"
        },
        {
          "evidence": {
            "text": "LDPE LLDPE"
          },
          "original": false,
          "raw_text": "LDPE LLDPE",
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀",
              "raw_value": "LDPE LLDPE",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 3
            }
          ],
          "raw_value": "LDPE LLDPE",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "LDPE",
                "confidence": 1,
                "displayName": "LDPE",
                "canonicalValue": "LDPE"
              },
              {
                "rawValue": "LLDPE",
                "confidence": 1,
                "displayName": "LLDPE",
                "canonicalValue": "LLDPE"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "LDPE",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "LDPE",
            "normalized_value": "ldpelldpe",
            "material_prefix_split": {
              "sourceRawValue": "LDPE LLDPE",
              "matchedMaterialTokens": [
                "LDPE",
                "LLDPE"
              ]
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {
            "text": "（      3     ）层"
          },
          "original": false,
          "raw_text": "（      3     ）层",
          "
```

### Candidate
```json
[
  {
    "id": 287,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PC",
    "normalizedRawValue": "pc",
    "proposedCanonicalValue": "PC",
    "status": "done_287",
    "confidence": null,
    "evidence": {
      "cell": "B8",
      "text": "2200mm PC 中空板模头",
      "sheet": "生产明细表",
      "source": "sheet text",
      "block_id": "B8",
      "sourceRawValue": "PC",
      "splitFromRawValue": "PC"
    }
  },
  {
    "id": 312,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PC",
    "normalizedRawValue": "pc",
    "proposedCanonicalValue": "PC",
    "status": "done_312",
    "confidence": null,
    "evidence": {
      "cell": "B8",
      "text": "2200mm PC 中空板模头",
      "sheet": "生产明细表",
      "source": "sheet text",
      "block_id": "B8",
      "sourceRawValue": "PC",
      "splitFromRawValue": "PC"
    }
  },
  {
    "id": 704,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PC光学级薄片模头（产量100-300KG",
    "normalizedRawValue": "pc光学级薄片模头产量100300kg",
    "proposedCanonicalValue": "PC",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "text": "Row 8, B8",
      "sourceRawValue": "PC光学级薄片模头（产量100-300KG/每小时）",
      "splitFromRawValue": "PC光学级薄片模头（产量100-300KG"
    }
  },
  {
    "id": 2919,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "光学级薄片模头产量100300kg、每小时",
    "normalizedRawValue": "光学级薄片模头产量100300kg每小时",
    "proposedCanonicalValue": null,
    "status": "done_2919",
    "confidence": "0.72",
    "evidence": {
      "text": "Row 8, B8",
      "sourceRawValue": "PC光学级薄片模头（产量100-300KG/每小时）",
      "suffixRawValue": "光学级薄片模头产量100300kg、每小时",
      "splitFromRawValue": "光学级薄片模头产量100300kg、每小时",
      "matchedMaterialTokens": [
        "PC"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 3246,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "光学级薄片",
    "normalizedRawValue": "光学级薄片",
    "proposedCanonicalValue": null,
    "status": "done_3246",
    "confidence": "0.72",
    "evidence": {
      "text": "Row 8, B8",
      "routedBy": "plastic_material_residual_classifier",
      "splitRule": "plastic_material_residual_classifier",
      "residualPart": "产量100300kg",
      "sourceRawValue": "PC光学级薄片模头（产量100-300KG/每小时）",
      "suffixRawValue": "光学级薄片",
      "splitFromRawValue": "光学级薄片",
      "applicationLikePart": "光学级薄片",
      "matchedMaterialTokens": [
        "PC"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 3862,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "光学级薄片",
    "normalizedRawValue": "光学级薄片",
    "proposedCanonicalValue": null,
    "status": "pending",
    "confidence": "0.72",
    "evidence": {
      "text": "Row 8, B8",
      "routedBy": "plastic_material_residual_classifier",
      "splitRule": "plastic_material_residual_classifier",
      "residualPart": "产量100300kg",
      "sourceRawValue": "PC光学级薄片模头（产量100-300KG/每小时）",
      "suffixRawValue": "光学级薄片",
      "splitFromRawValue": "光学级薄片",
      "applicationLikePart": "光学级薄片",
      "matchedMaterialTokens": [
        "PC"
      ],
      "suffixCandidateTermType": "application"
    }
  }
]
```

### Lines
- L1: 文件名：模头生产明细表（191225-E）2019--09-19-850mm PC光学级薄片模头+5层分配器(1).xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 模具编号：191225-E
- L14: 客户ID：40315
- L15: [ ] 国内使用
- L17: 国家(       越南                    )
- L21: 合同编号：7190110
- L22: 合同规定交货日期：
- L26: 下单日期：2019-09-19
- L27: 交货日期：2019-11-25
- L28: 完工日期：
- L29: 实际发货日期：
- L31: [A6] 》》》要求打JCTIMES 标志! 客户要求极高，按照日本要求加工检测，请注意品质！！！
- L33: [A7] 规格型号与原产品互配
- L36: 原产品编号（             ）
- L44: [A9] 制品有效宽度
- L46: [A10] 制品有效厚度
- L51: [A12] 模头有效宽度
- L54: [A13] 模头宽度调节方式
- L63: [A14] 模唇厚度调节范围
- L64: [B14] 模唇厚度调节范围（      开口1.2mm          ）
- L66: 上下文：模唇厚度调节范围
- L73: [A16] 模唇数量
- L75: [ ] 上模唇（           ）套
- L76: [ ] 下模唇（         ）套
- L78: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L80: [A17] 模唇调节方式
- L81: [B17] [ ] 上模唇采用膨胀螺栓自动调节，参考图纸
- L82: option_set: {"options":[{"selected":false,"value":"上模唇采用膨胀螺栓自动调节，参考图纸"}]}
- L84: 上下文：模唇调节方式
- L86: [ ] 上模手动推式微调
- L88: option_set: {"options":[{"selected":false,"value":"上模手动推式微调"},{"selected":true,"value":"手动推、拉式微调"}]}
- L90: 上下文：模唇调节方式
- L96: 上下文：模唇调节方式
- L97: [B20] [ ] 下模唇可预调节
- L98: option_set: {"options":[{"selected":false,"value":"下模唇可预调节"}]}
- L100: 上下文：模唇调节方式
- L101: [B21] [ ] 下模唇固定、并可更换
- L102: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L104: 上下文：模唇调节方式
- L105: [B22] [SEL] 下模整体结构
- L106: option_set: {"options":[{"selected":true,"value":"下模整体结构"}]}
- L108: 上下文：模唇调节方式
- L123: [ ] 上模
- L124: [ ] 下模   ）
- L125: option_set: {"options":[{"selected":false,"value":"有            分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"}]}
- L127: [A26] 流道形式
- L131: [ ] 模内多流道
- L133: option_set: {"options":[{"selected":true,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":false,"value":"其他"}]}
- L135: [A27] 加热方式
- L137: [SEL] 不锈钢加热棒
- L138: [ ] 加热板
- L140: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L142: [A28] 模头加热分区
- L145: 两侧板
- L148: 模唇
- L153: [A29] 模唇加热方式
- L155: [SEL] 加热棒
- L160: [ ] 加热板
- L161: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":false,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L163: [A30] 加热电压
- L166: [A31] 每区功率
- L168: [A32] 接线方式
- L170: [SEL] 带护罩全封闭接线
- L171: [ ] 模体开槽接线
- L173: option_set: {"options":[{"selected":true,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":false,"value":"其他"}]}
- L188: [A35] 侧板接插件
- L194: [A36] 热电偶孔
- L199: [A37] 热电偶孔规格
- L201: [SEL] 根据需方定做，需方未做说明时螺纹规格M12×1.75，热电偶由需方自配。
- L202: [ ] 客户要求
- L203: option_set: {"options":[{"selected":true,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.75，热电偶由需方自配。"},{"selected":false,"value":"客户要求"}]}
- L208: [A39] 模头材料选用
- L219: 模唇表面粗糙度：
- L224: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L237: 表面镀层要求：
- L241: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L245: 流道表面镀层厚度：
- L250: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L254: 流道表面镀层硬度：
- L257: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L261: 外表面镀层厚度：
- L266: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L268: [A47] 模头安装方式
- L273: [ ] 45°斜挤出安装 （分为：
- L276: option_set: {"options":[{"selected":false,"value":"平挤出"},{"selected":true,"value":"下挤出"},{"selected":false,"value":"其他"},{"selected":false,"value":"45°斜挤出安装 （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":false,"value":"45°挤出微调朝下"
- L278: [A48] 平挤出安装方式时
- L279: [B48] 支架孔规格、型号（                                                     ）
- L281: 上下文：平挤出安装方式时
- L289: [A50] 其它安装方式时
- L290: [B50] 吊装孔规格、型号（                                                     ）
- L292: 上下文：其它安装方式时
- L293: [B51] 吊装时中心距、规格（                                                  ）
- L296: [B52] 平挤出安装方式时，在模头（                            ）边
- L299: [B53] 其他安装方式时，在模头（                                ）边
- L301: [A54] 进料口方式
- L303: [ ] 中央圆口进料
- L304: [SEL] 中央方口进料
- L305: [ ] 其他形状或不同位置进料
- L306: option_set: {"options":[{"selected":false,"value":"中央圆口进料"},{"selected":true,"value":"中央方口进料"},{"selected":false,"value":"其他形状或不同位置进料"}]}
- L308: [A55] 进料口尺寸
- L315: [A56] 配合三辊进料方式
- L317: [ ] 中、上辊进料
- L318: [ ] 中、下辊进料
- L320: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}
- L324: [ ] 有　　数量：共（          ）件
- L326: option_set: {"options":[{"selected":false,"value":"有　　数量：共（          ）件"},{"selected":true,"value":"没有"}]}
- L328: [A58] 连接器加热方式
- L330: [ ] 不锈钢加热圈
- L331: [ ] 铸铝加热圈

## Document 21 模头生产明细表（191297-E）2019-10-10-1350mmPVC防结皮发泡板模头.xls

- extractionResultId: 14322
- approxBlocksTokens: 6052
- candidates: 8

### Normalized
```json
{
  "documentInfo": {
    "customer_notes": [
      {
        "evidence": {
          "text": "Row 6, A6及global_context"
        },
        "raw_text": "要求打JCTIMES 标志! 加急。",
        "raw_value": "要求打JCTIMES 标志! 加急。",
        "field_name": "标志要求/备注",
        "item_index": 1,
        "document_id": "21",
        "extraction_result_id": "14322"
      },
      {
        "evidence": {
          "text": "》》》要求打JCTIMES 标志! 加急"
        },
        "raw_text": "》》》要求打JCTIMES 标志! 加急",
        "raw_value": "要求打JCTIMES 标志! 加急",
        "field_name": "标志要求/备注",
        "item_index": 2,
        "document_id": "21",
        "extraction_result_id": "14322"
      }
    ]
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "PVC仿结皮发泡板模头（产量350KG/每小时）",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {
            "text": "Row 8, B8"
          },
          "original": false,
          "raw_text": "PVC仿结皮发泡板模头（产量350KG/每小时）",
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀并识别应用领域后缀",
              "raw_value": "PVC仿结皮发泡板模头（产量350KG/每小时）",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "PVC仿结皮发泡板模头（产量350KG/每小时）",
          "confidence": 0.9,
          "dictionary": {
            "values": [
              {
                "rawValue": "PVC",
                "confidence": 1,
                "displayName": "PVC",
                "canonicalValue": "PVC"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "PVC",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PVC",
            "normalized_value": "pvc仿结皮发泡板模头产量350kg/每小时",
            "material_prefix_split": {
              "sourceRawValue": "PVC仿结皮发泡板模头（产量350KG/每小时）",
              "suffixRawValue": "仿结皮发泡板模头产量350kg、每小时",
              "matchedMaterialTokens": [
                "PVC"
              ],
              "suffixCandidateTermType": "application"
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {
            "text": "Row 9, B9"
          },
          "original": false,
          "raw_text": "1220MM",
          "warnings": [],
          "raw_value": "1220MM",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "1220",
              "unitRaw": "MM",
              "rawValue": "1220MM",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "1220",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1220 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1220 mm",
            "normalized_field_name": "制品有效宽度"
          },
          "field_name": "制品有效宽度"
        },
        {
          "evidence": {
            "text": "Row 10, B10"
          },
          "original": false,
          "raw_text": "3-20mm",
          "warnings": [],
          "raw_value": "3-20mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "20",
              "rangeMax": "20",
              "rangeMin": "3",
              "rawValue": "3-20mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "3",
              "displayUnit": "mm",
              "numericText": "3-20",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "3-20 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "3-20 mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {
            "text": "Row 12, B12"
          },
          "original": false,
          "raw_text": "1350mm",
          "warnings": [],
          "raw_value": "1350mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "die_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "1350",
              "unitRaw": "mm",
              "rawValue": "1350mm",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "1350",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1350 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1350 mm",
            "normalized_field_name": "模头有效宽度"
          },
          "field_name": "模头有效宽度"
        },
        {
          "evidence": {
            "text": "Row 23, B23"
          },
          "original": false,
          "raw_text": "模唇调节采用PVC发泡专用推拉式弹性微调结构。上下模整体结构",
          "selected": true,
          "warnings": [],
          "qualifier": {
            "area": "lip",
            "sourceText": "模唇"
          },
          "raw_value": "其他",
          "confidence": 0.9,
          "dictionary": {
            "note": "lip_adjustment_method schema merge: position stored in qualifier.position",
            "matched": true,
            "term_type": "lip_adjustment_method",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "其他",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "other",
            "normalized_value": "其他",
            "normalized_field_name": "模唇调节方式"
          },
          "field_name": "模唇调节方式"
        },
        {
          "evidence": {
            "text": "Row 24, B24"
          },
          "original": false,
          "raw_text": "无",
          "selected": true,
          "warnings": [],
          "raw_value": "无",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "choker_bar_config",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "无",
            "normalized_field_name": "阻流棒配置"
          },
          "field_name": "阻流棒配置"
        },
        {
          "evidence": {
            "text": "Row 26, B26"
          },
          "original": false,
          "raw_text": "衣架式",
          "selected": true,
          "warnings": [],
          "raw_value": "衣架式",
          "confidence": 0.95,
          "dictionary": {
            "note": "Disabled by dictionary audit 2026-06-18: alias.term_type did not match linked dictionary_terms.term_type.",
            "matched": true,
            "term_type": "flow_channel_type",
            "confidence": 1,
            "risk_level": "high",
            "value_kind": "enum",
            "display_name": "衣架式",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "衣架式",
            "normalized_value": "衣架式",
            "normalized_field_name": "流道形式"
          },
          "field_name": "流道形式"
        },
        {
          "evidence": {
            "text": "Row 27, B27"
          },
          "original": false,
          "raw_text": "不锈钢加热棒",
          "selected": true,
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "不锈钢加热棒",
              "field_name": "产品主体加热方式",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 1,
            "candidate_id": "1787",
            "candidate_type": "term_type",
            "raw_field_name": "产品主体加热方式",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "body",
            "sourceText": "主体"
          },
          "raw_value": "不锈钢加热棒",
          "confidence": 0.95,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "不锈钢加热棒",
            "normalized_field_name": "产品主体加热方式"
          },
          "field_name": "产品主体加热方式"
        },
        {
          "evidence": {
            "text": "Row 28, B28"
          },
          "original": false,
          "raw_text": "模体（7）区",
          "warnings": [],
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "7",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "heating_zone_count",
            "value_kind": "number",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "7",
            "normalized_field_name": "模头加热分区"
          },
          "field_name": "模头加热分区"
        },
        {
          "evidence": {
            "text": "Row 28, B28"
          },
          "original": false,
          "raw_text": "有",
          "selected": true,
          "warnings": [],
          "qualifier": {
            "area": "side_plate",
            "sourceText": "侧板"
          },
          "raw_value": "有",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "heating_config",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "有",
            "normalized_field_name": "侧板加热配置"
          },
          "field_name": "侧板加热配置"
        },
        {
          "evidence": {
            "text": "Row 28, B28"
          },
          "original": false,
          "raw_text": "有",
          "selected": true,
          "warnings": [],
          "qualifier": {
            "area": "lip",
            "sourceText": "模唇"
          },
          "raw_value": "有",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "heating_config",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "有",
            "normalized_field_name": "模唇加热配置"
          },
          "field_name": "模唇加热配置"
        },
        {
          "evidence": {
            "text": "Row 29, B29"
          },
          "original": false,
          "raw_text": "油循环",
          "selected": true,
          "warnings": [],
          "qualifier": {
            "area": "lip",
            "sourceText": "模唇"
          },
          "raw_value": "油循环",
          "confidence": 0.95,
          "dictionary": {
            "note": "heating_method schema merge: area stored in qualifier.area",
            "matched": true,
            "term_type": "heating_method",
            "confidence":
```

### Candidate
```json
[
  {
    "id": 66,
    "candidateType": "value",
    "termType": "product_material",
    "rawValue": "A （1.2316不锈钢）",
    "normalizedRawValue": "a1.2316不锈钢",
    "proposedCanonicalValue": "1.2316_stainless_steel",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B39",
      "text": "[SEL] A （1.2316不锈钢）",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 288,
    "candidateType": "value",
    "termType": "heating_voltage",
    "rawValue": "220V/50Hz",
    "normalizedRawValue": "220v/50hz",
    "proposedCanonicalValue": "heating_voltage:undefined|heating_frequency:undefined",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B30",
      "text": "(          220         V )/(     50     Hz)",
      "sheet": "生产明细表",
      "phase1_snapshot": true,
      "phase1_snapshot_reason": [
        "non_enum_value_candidate"
      ]
    }
  },
  {
    "id": 290,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC",
    "normalizedRawValue": "pvc",
    "proposedCanonicalValue": "PVC",
    "status": "done_290",
    "confidence": null,
    "evidence": {
      "cell": "B8",
      "text": "PVC仿结皮发泡板模头",
      "sheet": "生产明细表",
      "source": "excel",
      "block_id": "Row 8",
      "sourceRawValue": "PVC",
      "splitFromRawValue": "PVC"
    }
  },
  {
    "id": 313,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC",
    "normalizedRawValue": "pvc",
    "proposedCanonicalValue": "PVC",
    "status": "done_313",
    "confidence": null,
    "evidence": {
      "cell": "B8",
      "text": "PVC仿结皮发泡板模头",
      "sheet": "生产明细表",
      "source": "excel",
      "block_id": "Row 8",
      "sourceRawValue": "PVC",
      "splitFromRawValue": "PVC"
    }
  },
  {
    "id": 356,
    "candidateType": "value",
    "termType": "heating_voltage",
    "rawValue": "加热电压",
    "normalizedRawValue": "加热电压",
    "proposedCanonicalValue": null,
    "status": "rejected",
    "confidence": null,
    "evidence": {
      "cell": "B12",
      "text": "(   220  V )/(     50   Hz)/ (      相 )\n功率 (    5  KW )",
      "sheet": "Sheet1",
      "phase1_snapshot": true,
      "phase1_snapshot_reason": [
        "non_enum_value_candidate"
      ]
    }
  },
  {
    "id": 414,
    "candidateType": "value",
    "termType": "heating_voltage",
    "rawValue": "220 V / 50 Hz",
    "normalizedRawValue": "220v/50hz",
    "proposedCanonicalValue": "",
    "status": "done_414",
    "confidence": null,
    "evidence": {
      "cell": "B30",
      "text": "(          220         V )/(     50     Hz)",
      "sheet": "生产明细表",
      "phase1_snapshot": true,
      "phase1_snapshot_reason": [
        "non_enum_value_candidate"
      ]
    }
  },
  {
    "id": 702,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC仿结皮发泡板模头（产量350KG",
    "normalizedRawValue": "pvc仿结皮发泡板模头产量350kg",
    "proposedCanonicalValue": "PVC",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "text": "Row 8, B8",
      "sourceRawValue": "PVC仿结皮发泡板模头（产量350KG/每小时）",
      "splitFromRawValue": "PVC仿结皮发泡板模头（产量350KG"
    }
  },
  {
    "id": 2920,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "仿结皮发泡板模头产量350kg、每小时",
    "normalizedRawValue": "仿结皮发泡板模头产量350kg每小时",
    "proposedCanonicalValue": null,
    "status": "done_2920",
    "confidence": "0.72",
    "evidence": {
      "text": "Row 8, B8",
      "sourceRawValue": "PVC仿结皮发泡板模头（产量350KG/每小时）",
      "suffixRawValue": "仿结皮发泡板模头产量350kg、每小时",
      "splitFromRawValue": "仿结皮发泡板模头产量350kg、每小时",
      "matchedMaterialTokens": [
        "PVC"
      ],
      "suffixCandidateTermType": "application"
    }
  }
]
```

### Lines
- L1: 文件名：模头生产明细表（191297-E）2019-10-10-1350mmPVC防结皮发泡板模头.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 模具编号：191297-E
- L14: 客户ID：40222
- L15: [ ] 国内使用
- L17: 国家(     伊朗                    )
- L21: 合同编号：7190703
- L22: 合同规定交货日期：
- L26: 下单日期：2019-10-10
- L27: 交货日期：2019-12-05
- L28: 完工日期：
- L29: 实际发货日期：
- L33: [A7] 规格型号与原产品互配
- L36: 原产品编号（ 150838  171382   171194            ）
- L39: option_set: {"options":[{"selected":true,"value":"是       原产品编号（ 150838  171382   171194            ）"},{"selected":false,"value":"不是"},{"selected":false,"value":"其他"}]}
- L44: [A9] 制品有效宽度
- L47: [A10] 制品有效厚度
- L52: [A12] 模头有效宽度
- L55: [A13] 模头宽度调节方式
- L64: [A14] 模唇厚度调节范围
- L65: [B14] 模唇厚度调节范围（                ）
- L67: 上下文：模唇厚度调节范围
- L74: [A16] 模唇数量
- L76: [ ] 上模唇（           ）套
- L77: [ ] 下模唇（         ）套
- L79: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L81: [A17] 模唇调节方式
- L82: [B17] [ ] 上模唇采用膨胀螺栓自动调节，参考图纸
- L83: option_set: {"options":[{"selected":false,"value":"上模唇采用膨胀螺栓自动调节，参考图纸"}]}
- L85: 上下文：模唇调节方式
- L87: [ ] 上模手动推式微调
- L89: option_set: {"options":[{"selected":false,"value":"上模手动推式微调"},{"selected":false,"value":"手动推、拉式微调"}]}
- L91: 上下文：模唇调节方式
- L97: 上下文：模唇调节方式
- L98: [B20] [ ] 下模唇可预调节
- L99: option_set: {"options":[{"selected":false,"value":"下模唇可预调节"}]}
- L101: 上下文：模唇调节方式
- L102: [B21] [ ] 下模唇固定、并可更换
- L103: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L105: 上下文：模唇调节方式
- L106: [B22] [ ] 下模整体结构
- L107: option_set: {"options":[{"selected":false,"value":"下模整体结构"}]}
- L109: 上下文：模唇调节方式
- L112: 模唇调节采用PVC发泡专用推拉式弹性微调结构。上下模整体结构
- L113: option_set: {"options":[{"selected":true,"value":"其他     模唇调节采用PVC发泡专用推拉式弹性微调结构。上下模整体结构"}]}
- L126: [ ] 上模
- L127: [ ] 下模   ）
- L128: option_set: {"options":[{"selected":false,"value":"有           分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"}]}
- L130: [A26] 流道形式
- L134: [ ] 模内多流道
- L136: option_set: {"options":[{"selected":true,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":false,"value":"其他"}]}
- L138: [A27] 加热方式
- L140: [SEL] 不锈钢加热棒
- L141: [ ] 加热板
- L143: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L145: [A28] 模头加热分区
- L148: 两侧板
- L151: 模唇
- L156: [A29] 模唇加热方式
- L158: [ ] 加热棒
- L163: [ ] 加热板
- L164: option_set: {"options":[{"selected":false,"value":"加热棒"},{"selected":true,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":true,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L166: [A30] 加热电压
- L169: [A31] 每区功率
- L171: [A32] 接线方式
- L173: [SEL] 带护罩全封闭接线
- L174: [ ] 模体开槽接线
- L176: option_set: {"options":[{"selected":true,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":false,"value":"其他"}]}
- L191: [A35] 侧板接插件
- L197: [A36] 热电偶孔
- L202: [A37] 热电偶孔规格
- L204: [SEL] 根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。
- L205: [ ] 客户要求
- L206: option_set: {"options":[{"selected":true,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。"},{"selected":false,"value":"客户要求"}]}
- L211: [A39] 模头材料选用
- L222: 模唇表面粗糙度：
- L227: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L240: 表面镀层要求：
- L244: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L248: 流道表面镀层厚度：
- L253: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L257: 流道表面镀层硬度：
- L260: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L264: 外表面镀层厚度：
- L269: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L271: [A47] 模头安装方式
- L276: [ ] 45°斜挤出安装 （分为：
- L279: option_set: {"options":[{"selected":true,"value":"平挤出"},{"selected":false,"value":"下挤出"},{"selected":false,"value":"其他"},{"selected":false,"value":"45°斜挤出安装 （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":true,"value":"45°挤出微调朝下"}
- L281: [A48] 平挤出安装方式时
- L282: [B48] 支架孔规格、型号（                                                     ）
- L284: 上下文：平挤出安装方式时
- L292: [A50] 其它安装方式时
- L293: [B50] 吊装孔规格、型号（                                                     ）
- L295: 上下文：其它安装方式时
- L296: [B51] 吊装时中心距、规格（                                                  ）
- L299: [B52] 平挤出安装方式时，在模头（                            ）边
- L302: [B53] 其他安装方式时，在模头（                                ）边
- L304: [A54] 进料口方式
- L306: [SEL] 中央圆口进料
- L307: [ ] 中央方口进料
- L308: [ ] 其他形状或不同位置进料
- L309: option_set: {"options":[{"selected":true,"value":"中央圆口进料"},{"selected":false,"value":"中央方口进料"},{"selected":false,"value":"其他形状或不同位置进料"}]}
- L311: [A55] 进料口尺寸
- L318: [A56] 配合三辊进料方式
- L320: [ ] 中、上辊进料
- L321: [ ] 中、下辊进料
- L323: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}
- L327: [ ] 有　　数量：共（          ）件
- L329: option_set: {"options":[{"selected":false,"value":"有　　数量：共（          ）件"},{"selected":true,"value":"没有"}]}
- L331: [A58] 连接器加热方式

## Document 22 模头生产明细表（191400-E）2019-10-10-2050mmPVC保鲜膜模头(1).xls

- extractionResultId: 14324
- approxBlocksTokens: 6037
- candidates: 3

### Normalized
```json
{
  "documentInfo": {
    "customer_notes": [
      {
        "evidence": {
          "text": "》》》要求打JCTIMES 标志! 加急"
        },
        "raw_text": "》》》要求打JCTIMES 标志! 加急",
        "raw_value": "要求打JCTIMES 标志! 加急",
        "field_name": "标志要求/备注",
        "item_index": 2,
        "document_id": "22",
        "extraction_result_id": "14324"
      }
    ]
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "PVC保鲜膜模头",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {
            "line": 8,
            "text": "PVC保鲜膜模头（产量500KG/每小时）"
          },
          "original": false,
          "raw_text": "PVC保鲜膜模头（产量500KG/每小时）",
          "selected": true,
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀",
              "raw_value": "PVC",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "PVC",
          "confidence": 0.9,
          "dictionary": {
            "values": [
              {
                "rawValue": "PVC",
                "confidence": 1,
                "displayName": "PVC",
                "canonicalValue": "PVC"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "PVC",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PVC",
            "normalized_value": "pvc",
            "material_prefix_split": {
              "sourceRawValue": "PVC",
              "matchedMaterialTokens": [
                "PVC"
              ]
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {
            "line": 8,
            "rule": "runtime_qualifier_matcher",
            "text": "PVC保鲜膜模头（产量500KG/每小时）",
            "qualifier": {
              "area": "die_body",
              "sourceText": "模头"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "层产量",
                  "qualifier": {
                    "area": "die_body",
                    "sourceText": "模头"
                  }
                },
                "before": {
                  "fieldName": "产量"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the field name into structured qualifier metadata.",
                "confidence": 0.86,
                "relationType": "qualifier_variant",
                "recommendedAction": "map_as_qualifier_variant"
              }
            ],
            "qualifierKey": "die_body",
            "baseFieldName": "层产量",
            "qualifierKind": "area",
            "qualifierRule": "runtime_qualifier_matcher",
            "originalFieldName": "产量",
            "qualifierSourceText": "模头",
            "matchedQualifierAlias": "模头"
          },
          "original": false,
          "raw_text": "PVC保鲜膜模头（产量500KG/每小时）",
          "selected": true,
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "500KG/每小时",
              "field_name": "层产量",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 1,
            "candidate_id": "1940",
            "candidate_type": "term_type",
            "raw_field_name": "层产量",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "500KG/每小时",
          "confidence": 0.9,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "500kg/每小时",
            "normalized_field_name": "层产量"
          },
          "field_name": "层产量"
        },
        {
          "evidence": {
            "line": 9,
            "text": "制品有效宽度\n[B9] 1800MM"
          },
          "original": false,
          "raw_text": "1800MM",
          "selected": true,
          "warnings": [],
          "raw_value": "1800MM",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "1800",
              "unitRaw": "MM",
              "rawValue": "1800MM",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "1800",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1800 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1800 mm",
            "normalized_field_name": "制品有效宽度"
          },
          "field_name": "制品有效宽度"
        },
        {
          "evidence": {
            "line": 10,
            "text": "制品有效厚度\n[B10] 0.01-0.015mm"
          },
          "original": false,
          "raw_text": "0.01-0.015mm",
          "selected": true,
          "warnings": [],
          "raw_value": "0.01-0.015mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "0.015",
              "rangeMax": "0.015",
              "rangeMin": "0.01",
              "rawValue": "0.01-0.015mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "0.01",
              "displayUnit": "mm",
              "numericText": "0.01-0.015",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "0.01-0.015 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "0.01-0.015 mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {
            "line": 12,
            "text": "模头有效宽度\n[B12] 2050mm ，螺丝规格改成18"
          },
          "original": false,
          "raw_text": "2050mm ，螺丝规格改成18",
          "selected": true,
          "warnings": [
            {
              "type": "number_unit_trailing_text",
              "message": "number_unit 解析存在异常，请人工确认",
              "raw_value": "2050mm ，螺丝规格改成18",
              "term_type": "die_effective_width",
              "field_name": "模头有效宽度",
              "item_index": 1
            }
          ],
          "raw_value": "2050mm ，螺丝规格改成18",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "die_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "2050",
              "unitRaw": "mm",
              "rawValue": "2050mm ，螺丝规格改成18",
              "warnings": [
                "number_unit_trailing_text"
              ],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "2050",
              "trailingText": "螺丝规格改成18",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "2050 mm",
              "trailingRawValue": "18",
              "normalizedUnitRaw": "mm",
              "trailingFieldName": "螺丝规格改成"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "2050 mm",
            "normalized_field_name": "模头有效宽度"
          },
          "field_name": "模头有效宽度"
        },
        {
          "evidence": {
            "line": 13,
            "text": "模头宽度调节方式\n[B13]\n[ ] 外堵式"
          },
          "original": false,
          "raw_text": "",
          "selected": false,
          "warnings": [],
          "raw_value": "外堵式",
          "confidence": 0.9,
          "dictionary": {
            "matched": false,
            "field_matched": false
          },
          "field_name": "模头宽度调节方式"
        }
      ],
      "rawFieldCount": 0
    },
    {
      "itemIndex": 2,
      "itemName": "3层分配器",
      "quantity": "2套",
      "fields": [
        {
          "evidence": {
            "text": "总计共（    2    ）套"
          },
          "original": false,
          "raw_text": "总计共（    2    ）套",
          "warnings": [],
          "qualifier": {
            "area": "feedblock",
            "sourceText": "分配器"
          },
          "raw_value": "2套",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "item_quantity",
            "value_kind": "number",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "2套",
            "normalized_field_name": "分配器数量"
          },
          "field_name": "分配器数量"
        },
        {
          "evidence": {
            "text": "LDPE LLDPE"
          },
          "original": false,
          "raw_text": "LDPE LLDPE",
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀",
              "raw_value": "LDPE LLDPE",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 2
            }
          ],
          "raw_value": "LDPE LLDPE",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "LDPE",
                "confidence": 1,
                "displayName": "LDPE",
                "canonicalValue": "LDPE"
              },
              {
                "rawValue": "LLDPE",
                "confidence": 1,
                "displayName": "LLDPE",
                "canonicalValue": "LLDPE"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "LDPE",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "LDPE",
            "normalized_value": "ldpelldpe",
            "material_prefix_split": {
              "sourceRawValue": "LDPE LLDPE",
              "matchedMaterialTokens": [
                "LDPE",
                "LLDPE"
              ]
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {
            "text": "（      3     ）层"
          },
          "original": false,
          "raw_text": "（      3     ）层",
          "warnings": [],
          "raw_value": "3层",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "layer_count",
            "value_kind": "number",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "3层",
            "normalized_field_name": "复合层次"
          },
          "field_name": "复合层次"
        },
        {
          "evidence": {
            "text": "ABA"
 
```

### Candidate
```json
[
  {
    "id": 58,
    "candidateType": "value",
    "termType": "product_material",
    "rawValue": "1.2714钢",
    "normalizedRawValue": "1.2714钢",
    "proposedCanonicalValue": "1.2714钢",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "cell": "B16",
      "text": "[SEL] 1.2714钢",
      "sheet": "Sheet1"
    }
  },
  {
    "id": 75,
    "candidateType": "value",
    "termType": "upper_lip_adjustment_method",
    "rawValue": "上模减力推拉",
    "normalizedRawValue": "上模减力推拉",
    "proposedCanonicalValue": "force_reduction_push_pull_mechanism",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B18",
      "text": "[SEL] 上模减力推拉",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 80,
    "candidateType": "value",
    "termType": "feed_inlet_method",
    "rawValue": "上模面圆口进料",
    "normalizedRawValue": "上模面圆口进料",
    "proposedCanonicalValue": "upper_die_face_center_round_feed",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B54",
      "text": "[SEL] 上模面圆口进料",
      "sheet": "生产明细表"
    }
  }
]
```

### Lines
- L1: 文件名：模头生产明细表（191400-E）2019-10-10-2050mmPVC保鲜膜模头(1).xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 模具编号：191400-E
- L14: 客户ID：40220
- L15: [ ] 国内使用
- L17: 国家(     伊朗                      )
- L21: 合同编号：7191007
- L22: 合同规定交货日期：
- L26: 下单日期：2019-10-10
- L27: 交货日期：2019-12-30
- L28: 完工日期：
- L29: 实际发货日期：
- L31: [A6] 》》》要求打JCTIMES 标志! 新客户，后续还有订单，请注意品质！
- L33: [A7] 规格型号与原产品互配
- L36: 原产品编号（  190893-E             ）
- L39: option_set: {"options":[{"selected":true,"value":"是       原产品编号（  190893-E             ）"},{"selected":false,"value":"不是"},{"selected":false,"value":"其他"}]}
- L44: [A9] 制品有效宽度
- L47: [A10] 制品有效厚度
- L52: [A12] 模头有效宽度
- L53: [B12] 2050mm ，螺丝规格改成18
- L55: [A13] 模头宽度调节方式
- L64: [A14] 模唇厚度调节范围
- L65: [B14] 模唇厚度调节范围（                ）
- L67: 上下文：模唇厚度调节范围
- L74: [A16] 模唇数量
- L76: [ ] 上模唇（           ）套
- L77: [ ] 下模唇（         ）套
- L79: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L81: [A17] 模唇调节方式
- L83: 上下文：模唇调节方式
- L85: [SEL] 上模减力推拉
- L87: option_set: {"options":[{"selected":true,"value":"上模减力推拉"},{"selected":false,"value":"手动推、拉式微调"}]}
- L89: 上下文：模唇调节方式
- L95: 上下文：模唇调节方式
- L96: [B20] [ ] 下模唇可预调节
- L97: option_set: {"options":[{"selected":false,"value":"下模唇可预调节"}]}
- L99: 上下文：模唇调节方式
- L100: [B21] [ ] 下模唇固定、并可更换
- L101: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L103: 上下文：模唇调节方式
- L104: [B22] [SEL] 下模整体结构
- L105: option_set: {"options":[{"selected":true,"value":"下模整体结构"}]}
- L107: 上下文：模唇调节方式
- L122: [ ] 上模
- L123: [ ] 下模   ）
- L124: option_set: {"options":[{"selected":false,"value":"有           分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"}]}
- L126: [A26] 流道形式
- L130: [ ] 模内多流道
- L132: option_set: {"options":[{"selected":true,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":false,"value":"其他"}]}
- L134: [A27] 加热方式
- L136: [SEL] 不锈钢加热棒
- L137: [ ] 加热板
- L139: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L141: [A28] 模头加热分区
- L144: 两侧板
- L147: 模唇
- L152: [A29] 模唇加热方式
- L154: [SEL] 加热棒
- L159: [ ] 加热板
- L160: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":false,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L162: [A30] 加热电压
- L165: [A31] 每区功率
- L167: [A32] 接线方式
- L169: [SEL] 带护罩全封闭接线
- L170: [ ] 模体开槽接线
- L172: option_set: {"options":[{"selected":true,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":false,"value":"其他"}]}
- L187: [A35] 侧板接插件
- L193: [A36] 热电偶孔
- L198: [A37] 热电偶孔规格
- L200: [SEL] 根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。
- L201: [ ] 客户要求
- L202: option_set: {"options":[{"selected":true,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。"},{"selected":false,"value":"客户要求"}]}
- L207: [A39] 模头材料选用
- L218: 模唇表面粗糙度：
- L223: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L236: 表面镀层要求：
- L240: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L244: 流道表面镀层厚度：
- L249: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L253: 流道表面镀层硬度：
- L256: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L260: 外表面镀层厚度：
- L265: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L267: [A47] 模头安装方式
- L272: [ ] 45°斜挤出安装 （分为：
- L275: option_set: {"options":[{"selected":false,"value":"平挤出"},{"selected":true,"value":"下挤出"},{"selected":false,"value":"其他"},{"selected":false,"value":"45°斜挤出安装 （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":false,"value":"45°挤出微调朝下"
- L277: [A48] 平挤出安装方式时
- L278: [B48] 支架孔规格、型号（                                                     ）
- L280: 上下文：平挤出安装方式时
- L288: [A50] 其它安装方式时
- L289: [B50] 吊装孔规格、型号（                                                     ）
- L291: 上下文：其它安装方式时
- L292: [B51] 吊装时中心距、规格（                                                  ）
- L295: [B52] 平挤出安装方式时，在模头（                            ）边
- L298: [B53] 其他安装方式时，在模头（                                ）边
- L300: [A54] 进料口方式
- L302: [SEL] 上模面圆口进料
- L303: [ ] 中央方口进料
- L304: [ ] 其他形状或不同位置进料
- L305: option_set: {"options":[{"selected":true,"value":"上模面圆口进料"},{"selected":false,"value":"中央方口进料"},{"selected":false,"value":"其他形状或不同位置进料"}]}
- L307: [A55] 进料口尺寸
- L314: [A56] 配合三辊进料方式
- L316: [ ] 中、上辊进料
- L317: [ ] 中、下辊进料
- L319: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}
- L323: [ ] 有　　数量：共（          ）件
- L325: option_set: {"options":[{"selected":false,"value":"有　　数量：共（          ）件"},{"selected":true,"value":"没有"}]}
- L327: [A58] 连接器加热方式
- L329: [ ] 不锈钢加热圈
- L330: [ ] 铸铝加热圈

## Document 23 模头生产明细表（191472-E）2019--11-26-950mm PP PS片材模头+3层分配器+连接器.xls

- extractionResultId: 14336
- approxBlocksTokens: 6973
- candidates: 27

### Normalized
```json
{
  "documentInfo": {
    "order_number": {
      "value": "",
      "rawKey": "order_number",
      "evidence": {
        "line": 0,
        "text": ""
      },
      "confidence": 0,
      "canonicalKey": "order_number"
    },
    "customer_notes": [
      {
        "evidence": {},
        "raw_text": "》》》要求打JCTIMES 标志! 客户要求极高，按照日本要求加工检测，请注意品质！！！",
        "raw_value": "要求打JCTIMES 标志! 客户要求极高，按照日本要求加工检测，请注意品质！！！",
        "field_name": "标志要求/备注",
        "item_index": 1,
        "document_id": "23",
        "extraction_result_id": "14336"
      },
      {
        "evidence": {},
        "raw_text": "要求打JCTIMES 标志! 加急",
        "raw_value": "要求打JCTIMES 标志! 加急",
        "field_name": "标志要求/备注",
        "item_index": 4,
        "document_id": "23",
        "extraction_result_id": "14336"
      }
    ],
    "product_number": {
      "value": "191472-E",
      "rawKey": "product_number",
      "evidence": {
        "line": 15,
        "text": "模具编号：191472-E"
      },
      "confidence": 0.9,
      "canonicalKey": "product_number"
    },
    "contract_number": {
      "value": "7191022",
      "rawKey": "contract_number",
      "evidence": {
        "line": 23,
        "text": "合同编号：7191022"
      },
      "confidence": 0.9,
      "canonicalKey": "contract_number"
    }
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "950mm PP PS片材模头",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "PP PS导电/防静电片材模头（产量300-450KG/每小时）",
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀并识别应用领域后缀",
              "raw_value": "PP PS导电/防静电片材模头（产量300-450KG/每小时）",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            },
            {
              "type": "value_no_match",
              "message": "字段值未命中字典，已创建字段值候选",
              "evidence": {},
              "raw_value": "PP PS导电/防静电片材模头（产量300-450KG/每小时）",
              "term_type": "application",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "raw_value": "防静电片材",
            "term_type": "application",
            "item_index": 1,
            "candidate_id": "3863",
            "candidate_type": "value",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "PP PS导电/防静电片材模头（产量300-450KG/每小时）",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "PP",
                "confidence": 1,
                "displayName": "PP",
                "canonicalValue": "PP"
              },
              {
                "rawValue": "PS",
                "confidence": 0.9,
                "displayName": "PS",
                "canonicalValue": "PS"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "PP",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PP",
            "normalized_value": "ppps导电/防静电片材模头产量300450kg/每小时",
            "material_prefix_split": {
              "sourceRawValue": "PP PS导电/防静电片材模头（产量300-450KG/每小时）",
              "suffixRawValue": "导电、防静电片材模头产量300450kg、每小时",
              "matchedMaterialTokens": [
                "PP",
                "PS"
              ],
              "suffixCandidateTermType": "application"
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "0.3-1.5mm,(0.3-0.8mm为主)",
          "warnings": [
            {
              "type": "number_unit_trailing_text",
              "message": "number_unit 解析存在异常，请人工确认",
              "raw_value": "0.3-1.5mm,(0.3-0.8mm为主)",
              "term_type": "product_effective_thickness",
              "field_name": "制品有效厚度",
              "item_index": 1
            }
          ],
          "raw_value": "0.3-1.5mm,(0.3-0.8mm为主)",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "1.5",
              "rangeMax": "1.5",
              "rangeMin": "0.3",
              "rawValue": "0.3-1.5mm,(0.3-0.8mm为主)",
              "warnings": [
                "number_unit_trailing_text"
              ],
              "numberKind": "range",
              "rangeStart": "0.3",
              "displayUnit": "mm",
              "numericText": "0.3-1.5",
              "trailingText": "0.3-0.8mm为主",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "0.3-1.5 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "0.3-1.5 mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "950-550mm",
          "warnings": [],
          "raw_value": "950-550mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "die_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "550",
              "rangeMax": "950",
              "rangeMin": "550",
              "rawValue": "950-550mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "950",
              "displayUnit": "mm",
              "numericText": "950-550",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "950-550 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "950-550 mm",
            "normalized_field_name": "模头有效宽度"
          },
          "field_name": "模头有效宽度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "单边挡200mm（做防粘处理）",
          "warnings": [],
          "raw_value": "单边挡200mm（做防粘处理）",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "single_side_deckle_width",
            "value_kind": "number_unit",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "单边挡200mm（做防粘处理）",
            "normalized_field_name": "单边挡块宽度"
          },
          "field_name": "单边挡块宽度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "[SEL] 是 原产品编号（   150065          ）",
          "warnings": [],
          "raw_value": "是",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "specification_compatible_with_original",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "是",
            "normalized_field_name": "规格型号与原产品互配"
          },
          "field_name": "规格型号与原产品互配"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "原产品编号（   150065          ）",
          "warnings": [],
          "raw_value": "150065",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "reference_product",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "150065",
            "normalized_field_name": "参考产品编号"
          },
          "field_name": "参考产品编号"
        }
      ],
      "rawFieldCount": 0
    },
    {
      "itemIndex": 2,
      "itemName": "3层分配器（PP PS）",
      "quantity": "1套",
      "fields": [],
      "rawFieldCount": 0
    },
    {
      "itemIndex": 3,
      "itemName": "连接器",
      "quantity": "1件",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "[A11] 适合产量",
          "warnings": [],
          "raw_value": "(未填写具体数值)",
          "confidence": 0.5,
          "dictionary": {
            "matched": true,
            "term_type": "capacity",
            "value_kind": "number_unit",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "(未填写具体数值)",
            "normalized_field_name": "适合产量"
          },
          "field_name": "适合产量"
        }
      ],
      "rawFieldCount": 0
    },
    {
      "itemIndex": 4,
      "itemName": "3层分配器（LDPE LLDPE）",
      "quantity": "2套",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "LDPE LLDPE",
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀",
              "raw_value": "LDPE LLDPE",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 4
            }
          ],
          "raw_value": "LDPE LLDPE",
          "confidence": 0.9,
          "dictionary": {
            "values": [
              {
                "rawValue": "LDPE",
                "confidence": 1,
                "displayName": "LDPE",
                "canonicalValue": "LDPE"
              },
              {
                "rawValue": "LLDPE",
                "confidence": 1,
                "displayName": "LLDPE",
                "canonicalValue": "LLDPE"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "LDPE",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "LDPE",
            "normalized_value": "ldpelldpe",
            "material_prefix_split": {
              "sourceRawValue": "LDPE LLDPE",
              "matchedMaterialTokens": [
                "LDPE",
                "LLDPE"
              ]
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "（      3     ）层",
          "warnings": [],
          "raw_value": "3",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "layer_count",
            "value_kind": "number",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "3",
            "normalized_field_name": "层数"
          },
          "field_name": "层数"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "ABA",
          "warnings": [],
          "raw_value": "ABA",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "layer_structure",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "aba",
         
```

### Candidate
```json
[
  {
    "id": 74,
    "candidateType": "value",
    "termType": "product_type",
    "rawValue": "片材模头",
    "normalizedRawValue": "片材模头",
    "proposedCanonicalValue": "flat_die",
    "status": "rejected",
    "confidence": null,
    "evidence": {
      "cell": "B8",
      "text": "片材模头",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row8"
    }
  },
  {
    "id": 81,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PP PS导电/防静电",
    "normalizedRawValue": "ppps导电/防静电",
    "proposedCanonicalValue": null,
    "status": "superseded_by_enums_split",
    "confidence": null,
    "evidence": {
      "cell": "B71",
      "text": "PP PS导电/防静电",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row71"
    }
  },
  {
    "id": 93,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PP",
    "normalizedRawValue": "pp",
    "proposedCanonicalValue": "PP",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B71",
      "text": "PP PS导电/防静电",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row71",
      "sourceRawValue": "PP PS导电/防静电",
      "splitFromRawValue": "PP"
    }
  },
  {
    "id": 94,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PS导电/防静电",
    "normalizedRawValue": "ps导电/防静电",
    "proposedCanonicalValue": "plastic_material:undefined|application:undefined",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B71",
      "text": "PP PS导电/防静电",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row71",
      "sourceRawValue": "PP PS导电/防静电",
      "splitFromRawValue": "PS导电/防静电"
    }
  },
  {
    "id": 125,
    "candidateType": "value",
    "termType": "product_material",
    "rawValue": "1.2714A钢",
    "normalizedRawValue": "1.2714a钢",
    "proposedCanonicalValue": "1.2714_Forged",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B80",
      "text": "[SEL] 1.2714A钢",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row80"
    }
  },
  {
    "id": 207,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PS",
    "normalizedRawValue": "ps",
    "proposedCanonicalValue": "PS",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B9",
      "text": "原料：PS",
      "source": "生产明细表",
      "block_id": "B9",
      "sourceRawValue": "PP PS",
      "splitFromRawValue": "PS"
    }
  },
  {
    "id": 259,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "导电/防静电",
    "normalizedRawValue": "导电/防静电",
    "proposedCanonicalValue": "application:导电|application:防静电",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B8",
      "text": "导电/防静电",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row8"
    }
  },
  {
    "id": 260,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PS导电",
    "normalizedRawValue": "ps导电",
    "proposedCanonicalValue": "plastic_material:undefined|application:undefined",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B71",
      "text": "PP PS导电/防静电",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row71",
      "sourceRawValue": "PP PS导电/防静电",
      "splitFromRawValue": "PS导电"
    }
  },
  {
    "id": 261,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "防静电",
    "normalizedRawValue": "防静电",
    "proposedCanonicalValue": null,
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B71",
      "text": "PP PS导电/防静电",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row71",
      "sourceRawValue": "PP PS导电/防静电",
      "splitFromRawValue": "防静电"
    }
  },
  {
    "id": 272,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PP",
    "normalizedRawValue": "pp",
    "proposedCanonicalValue": "PP",
    "status": "done_272",
    "confidence": null,
    "evidence": {
      "cell": "B9",
      "text": "适用塑料原料\n[B9] PP",
      "block_id": "Row 9",
      "sourceRawValue": "PP PS导电/防静电",
      "splitFromRawValue": "PP"
    }
  },
  {
    "id": 307,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PP",
    "normalizedRawValue": "pp",
    "proposedCanonicalValue": "PP",
    "status": "done_307",
    "confidence": null,
    "evidence": {
      "cell": "B9",
      "text": "适用塑料原料\n[B9] PP",
      "block_id": "Row 9",
      "sourceRawValue": "PP PS导电/防静电",
      "splitFromRawValue": "PP"
    }
  },
  {
    "id": 330,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "防静电",
    "normalizedRawValue": "防静电",
    "proposedCanonicalValue": "antistatic",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B71",
      "text": "PP PS导电/防静电",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row71",
      "sourceRawValue": "PP PS导电/防静电",
      "splitFromRawValue": "防静电"
    }
  },
  {
    "id": 344,
    "candidateType": "value",
    "termType": "heating_voltage",
    "rawValue": "220V/50Hz",
    "normalizedRawValue": "220v/50hz",
    "proposedCanonicalValue": "",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "cell": "B30",
      "text": "(       220       V )/(  50    Hz)",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row30",
      "phase1_snapshot": true,
      "phase1_snapshot_reason": [
        "non_enum_value_candidate"
      ]
    }
  },
  {
    "id": 368,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PS导电",
    "normalizedRawValue": "ps导电",
    "proposedCanonicalValue": "plastic_material:undefined|application:undefined",
    "status": "done_368",
    "confidence": null,
    "evidence": {
      "cell": "B71",
      "text": "PP PS导电/防静电",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row71",
      "sourceRawValue": "PP PS导电/防静电",
      "splitFromRawValue": "PS导电"
    }
  },
  {
    "id": 370,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "防静电",
    "normalizedRawValue": "防静电",
    "proposedCanonicalValue": null,
    "status": "done_370",
    "confidence": null,
    "evidence": {
      "cell": "B71",
      "text": "PP PS导电/防静电",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row71",
      "sourceRawValue": "PP PS导电/防静电",
      "splitFromRawValue": "防静电"
    }
  },
  {
    "id": 392,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PS导电",
    "normalizedRawValue": "ps导电",
    "proposedCanonicalValue": "",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "cell": "B71",
      "text": "PP PS导电/防静电",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row71",
      "sourceRawValue": "PP PS导电/防静电",
      "splitFromRawValue": "PS导电"
    }
  },
  {
    "id": 393,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "防静电",
    "normalizedRawValue": "防静电",
    "proposedCanonicalValue": "",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "cell": "B71",
      "text": "PP PS导电/防静电",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row71",
      "sourceRawValue": "PP PS导电/防静电",
      "splitFromRawValue": "防静电"
    }
  },
  {
    "id": 413,
    "candidateType": "value",
    "termType": "heating_voltage",
    "rawValue": "220V/50Hz",
    "normalizedRawValue": "220v/50hz",
    "proposedCanonicalValue": "",
    "status": "done_413",
    "confidence": null,
    "evidence": {
      "cell": "B30",
      "text": "(       220       V )/(  50    Hz)",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row30",
      "phase1_snapshot": true,
      "phase1_snapshot_reason": [
        "non_enum_value_candidate"
      ]
    }
  },
  {
    "id": 687,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PS导电",
    "normalizedRawValue": "ps导电",
    "proposedCanonicalValue": "PS",
    "status": "done_687",
    "confidence": null,
    "evidence": {
      "sourceRawValue": "PP PS导电/防静电片材模头（产量300-450KG/每小时）",
      "splitFromRawValue": "PS导电"
    }
  },
  {
    "id": 688,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "防静电片材模头（产量300-450KG",
    "normalizedRawValue": "防静电片材模头产量300450kg",
    "proposedCanonicalValue": null,
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "sourceRawValue": "PP PS导电/防静电片材模头（产量300-450KG/每小时）",
      "splitFromRawValue": "防静电片材模头（产量300-450KG"
    }
  },
  {
    "id": 2915,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "导电、防静电片材模头产量300450kg、每小时",
    "normalizedRawValue": "导电防静电片材模头产量300450kg每小时",
    "proposedCanonicalValue": null,
    "status": "done_2915",
    "confidence": "0.72",
    "evidence": {
      "sourceRawValue": "PP PS导电/防静电片材模头（产量300-450KG/每小时）",
      "suffixRawValue": "导电、防静电片材模头产量300450kg、每小时",
      "splitFromRawValue": "导电、防静电片材模头产量300450kg、每小时",
      "matchedMaterialTokens": [
        "PP",
        "PS"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 2933,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "导电、防静电",
    "normalizedRawValue": "导电防静电",
    "proposedCanonicalValue": "",
    "status": "auto_resolved",
    "confidence": "0.72",
    "evidence": {
      "cell": "B71",
      "text": "PP PS导电/防静电",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row71",
      "sourceRawValue": "PP PS导电/防静电",
      "suffixRawValue": "导电、防静电",
      "splitFromRawValue": "导电、防静电",
      "matchedMaterialTokens": [
        "PP",
        "PS"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 3249,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "防静电片材",
    "normalizedRawValue": "防静电片材",
    "proposedCanonicalValue": null,
    "status": "done_3249",
    "confidence": "0.72",
    "evidence": {
      "routedBy": "plastic_material_residual_classifier",
      "splitRule": "plastic_material_residual_classifier",
      "residualPart": "模头产量300450kg",
      "sourceRawValue": "PP PS导电/防静电片材模头（产量300-450KG/每小时）",
      "suffixRawValue": "防静电片材",
      "splitFromRawValue": "防静电片材",
      "applicationLikePart": "防静电片材",
      "matchedMaterialTokens": [
        "PP",
        "PS"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 3250,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "导电、防静电",
    "normalizedRawValue": "导电防静电",
    "proposedCanonicalValue": null,
    "status": "done_3250",
    "confidence": "0.72",
    "evidence": {
      "cell": "B71",
      "text": "PP PS导电/防静电",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row71",
      "routedBy": "plastic_material_residual_classifier",
      "sourceRawValue": "PP PS导电/防静电",
      "suffixRawValue": "导电、防静电",
      "splitFromRawValue": "导电、防静电",
      "matchedMaterialTokens": [
        "PP",
        "PS"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 3510,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "导电、防静电",
    "normalizedRawValue": "导电防静电",
    "proposedCanonicalValue": null,
    "status": "done_3510",
    "confidence": "0.72",
    "evidence": {
      "cell": "B71",
      "text": "PP PS导电/防静电",
      "sheet": "生产明细表",
      "source": "llm_text",
      "block_id": "Row71",
      "routedBy": "plastic_material_residual_classifier",
      "sourceRawValue": "PP PS导电/防静电",
      "suffixRawValue": "导电、防静电",
      "spl
```

### Lines
- L1: 文件名：模头生产明细表（191472-E）2019--11-26-950mm PP PS片材模头+3层分配器+连接器.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 模具编号：191472-E
- L14: 客户ID：40315
- L15: [ ] 国内使用
- L17: 国家(       越南                    )
- L21: 合同编号：7191022
- L22: 合同规定交货日期：
- L26: 下单日期：2019-11-26
- L27: 交货日期：2020-02-06
- L28: 完工日期：
- L29: 实际发货日期：
- L31: [A6] 》》》要求打JCTIMES 标志! 客户要求极高，按照日本要求加工检测，请注意品质！！！
- L33: [A7] 规格型号与原产品互配
- L36: 原产品编号（   150065          ）
- L44: [A9] 制品有效宽度
- L46: [A10] 制品有效厚度
- L51: [A12] 模头有效宽度
- L54: [A13] 模头宽度调节方式
- L63: [A14] 模唇厚度调节范围
- L65: 模唇厚度调节范围（
- L68: 上下文：模唇厚度调节范围
- L75: [A16] 模唇数量
- L77: [ ] 上模唇（           ）套
- L78: [ ] 下模唇（         ）套
- L80: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L82: [A17] 模唇调节方式
- L83: [B17] [ ] 上模唇采用膨胀螺栓自动调节，参考图纸
- L84: option_set: {"options":[{"selected":false,"value":"上模唇采用膨胀螺栓自动调节，参考图纸"}]}
- L86: 上下文：模唇调节方式
- L88: [ ] 上模手动推式微调
- L90: option_set: {"options":[{"selected":false,"value":"上模手动推式微调"},{"selected":true,"value":"手动推、拉式微调"}]}
- L92: 上下文：模唇调节方式
- L98: 上下文：模唇调节方式
- L99: [B20] [ ] 下模唇可预调节
- L100: option_set: {"options":[{"selected":false,"value":"下模唇可预调节"}]}
- L102: 上下文：模唇调节方式
- L103: [B21] [ ] 下模唇固定、并可更换
- L104: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L106: 上下文：模唇调节方式
- L107: [B22] [SEL] 下模整体结构
- L108: option_set: {"options":[{"selected":true,"value":"下模整体结构"}]}
- L110: 上下文：模唇调节方式
- L125: [ ] 上模
- L126: [ ] 下模   ）
- L127: option_set: {"options":[{"selected":false,"value":"有            分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"}]}
- L129: [A26] 流道形式
- L133: [ ] 模内多流道
- L135: option_set: {"options":[{"selected":true,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":false,"value":"其他"}]}
- L137: [A27] 加热方式
- L139: [SEL] 不锈钢加热棒
- L140: [ ] 加热板
- L142: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L144: [A28] 模头加热分区
- L147: 两侧板
- L150: 模唇
- L155: [A29] 模唇加热方式
- L157: [SEL] 加热棒
- L162: [ ] 加热板
- L163: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":false,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L165: [A30] 加热电压
- L168: [A31] 每区功率
- L170: [A32] 接线方式
- L172: [SEL] 带护罩全封闭接线
- L173: [ ] 模体开槽接线
- L175: option_set: {"options":[{"selected":true,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":false,"value":"其他"}]}
- L190: [A35] 侧板接插件
- L196: [A36] 热电偶孔
- L201: [A37] 热电偶孔规格
- L203: [SEL] 根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。
- L204: [ ] 客户要求
- L205: option_set: {"options":[{"selected":true,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。"},{"selected":false,"value":"客户要求"}]}
- L210: [A39] 模头材料选用
- L221: 模唇表面粗糙度：
- L226: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L239: 表面镀层要求：
- L243: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L247: 流道表面镀层厚度：
- L252: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L256: 流道表面镀层硬度：
- L259: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L263: 外表面镀层厚度：
- L268: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L270: [A47] 模头安装方式
- L275: [ ] 45°斜挤出安装 （分为：
- L278: option_set: {"options":[{"selected":true,"value":"平挤出"},{"selected":false,"value":"下挤出"},{"selected":false,"value":"其他"},{"selected":false,"value":"45°斜挤出安装 （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":false,"value":"45°挤出微调朝下"
- L280: [A48] 平挤出安装方式时
- L281: [B48] 支架孔规格、型号（                                                     ）
- L283: 上下文：平挤出安装方式时
- L291: [A50] 其它安装方式时
- L292: [B50] 吊装孔规格、型号（                                                     ）
- L294: 上下文：其它安装方式时
- L295: [B51] 吊装时中心距、规格（                                                  ）
- L298: [B52] 平挤出安装方式时，在模头（                            ）边
- L301: [B53] 其他安装方式时，在模头（                                ）边
- L303: [A54] 进料口方式
- L305: [ ] 中央圆口进料
- L306: [SEL] 中央方口进料
- L307: [ ] 其他形状或不同位置进料
- L308: option_set: {"options":[{"selected":false,"value":"中央圆口进料"},{"selected":true,"value":"中央方口进料"},{"selected":false,"value":"其他形状或不同位置进料"}]}
- L310: [A55] 进料口尺寸
- L317: [A56] 配合三辊进料方式
- L319: [ ] 中、上辊进料
- L320: [ ] 中、下辊进料
- L322: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}
- L326: [SEL] 有　　数量：共（          ）件
- L328: option_set: {"options":[{"selected":true,"value":"有　　数量：共（          ）件"},{"selected":false,"value":"没有"}]}
- L330: [A58] 连接器加热方式
- L332: [ ] 不锈钢加热圈
- L333: [ ] 铸铝加热圈

## Document 24 模头生产明细表（191681-E）2019-11-21-1320mm PVC仿结皮发泡板模头.xls

- extractionResultId: 14327
- approxBlocksTokens: 6005
- candidates: 3

### Normalized
```json
{
  "documentInfo": {
    "customer_notes": [
      {
        "evidence": {
          "text": "》》》要求打JCTIMES 标志! 加急",
          "source": "Row1"
        },
        "raw_text": "》》》要求打JCTIMES 标志! 加急",
        "raw_value": "要求打JCTIMES标志! 加急",
        "field_name": "标志要求/备注",
        "item_index": 2,
        "document_id": "24",
        "extraction_result_id": "14327"
      }
    ]
  },
  "items": [
    {
      "itemIndex": 1,
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "PVC仿结皮发泡板模头（产量600KG/每小时）",
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀并识别应用领域后缀",
              "raw_value": "PVC仿结皮发泡板模头（产量600KG/每小时）",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "PVC仿结皮发泡板模头（产量600KG/每小时）",
          "confidence": 0.9,
          "dictionary": {
            "values": [
              {
                "rawValue": "PVC",
                "confidence": 1,
                "displayName": "PVC",
                "canonicalValue": "PVC"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "PVC",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PVC",
            "normalized_value": "pvc仿结皮发泡板模头产量600kg/每小时",
            "material_prefix_split": {
              "sourceRawValue": "PVC仿结皮发泡板模头（产量600KG/每小时）",
              "suffixRawValue": "仿结皮发泡板模头产量600kg、每小时",
              "matchedMaterialTokens": [
                "PVC"
              ],
              "suffixCandidateTermType": "application"
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "1220MM",
          "warnings": [],
          "raw_value": "1220MM",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "1220",
              "unitRaw": "MM",
              "rawValue": "1220MM",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "1220",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1220 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1220 mm",
            "normalized_field_name": "制品有效宽度"
          },
          "field_name": "制品有效宽度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "3-30mm",
          "warnings": [],
          "raw_value": "3-30mm",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "30",
              "rangeMax": "30",
              "rangeMin": "3",
              "rawValue": "3-30mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "3",
              "displayUnit": "mm",
              "numericText": "3-30",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "3-30 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "3-30 mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "1320mm",
          "warnings": [],
          "raw_value": "1320mm",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "die_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "1320",
              "unitRaw": "mm",
              "rawValue": "1320mm",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "1320",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1320 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1320 mm",
            "normalized_field_name": "模头有效宽度"
          },
          "field_name": "模头有效宽度"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "其他 ：上下模整体结构。",
          "warnings": [],
          "qualifier": {
            "position": "upper_die",
            "sourceText": "其他 ：上下模整体结构。"
          },
          "raw_value": "其他 ：上下模整体结构。",
          "confidence": 0.9,
          "dictionary": {
            "note": "lip_adjustment_method schema merge: position stored in qualifier.position",
            "matched": true,
            "term_type": "lip_adjustment_method",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "整体结构",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "lip_integral_structure",
            "normalized_value": "其他上下模整体结构。",
            "normalized_field_name": "模唇调节方式"
          },
          "field_name": "模唇调节方式"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "其他 ：上下模整体结构。",
          "warnings": [],
          "qualifier": {
            "position": "lower_die",
            "sourceText": "其他 ：上下模整体结构。"
          },
          "raw_value": "其他 ：上下模整体结构。",
          "confidence": 0.9,
          "dictionary": {
            "note": "lip_adjustment_method schema merge: position stored in qualifier.position",
            "matched": true,
            "term_type": "lip_adjustment_method",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "整体结构",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "lip_integral_structure",
            "normalized_value": "其他上下模整体结构。",
            "normalized_field_name": "模唇调节方式"
          },
          "field_name": "模唇调节方式"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "无",
          "warnings": [],
          "raw_value": "无",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "choker_bar_config",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "无",
            "normalized_field_name": "阻流棒配置"
          },
          "field_name": "阻流棒配置"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "衣架式",
          "warnings": [],
          "raw_value": "衣架式",
          "confidence": 0.9,
          "dictionary": {
            "note": "Disabled by dictionary audit 2026-06-18: alias.term_type did not match linked dictionary_terms.term_type.",
            "matched": true,
            "term_type": "flow_channel_type",
            "confidence": 1,
            "risk_level": "high",
            "value_kind": "enum",
            "display_name": "衣架式",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "衣架式",
            "normalized_value": "衣架式",
            "normalized_field_name": "流道形式"
          },
          "field_name": "流道形式"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "不锈钢加热棒",
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "不锈钢加热棒",
              "field_name": "产品主体加热方式",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 1,
            "candidate_id": "1787",
            "candidate_type": "term_type",
            "raw_field_name": "产品主体加热方式",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "body",
            "sourceText": "主体"
          },
          "raw_value": "不锈钢加热棒",
          "confidence": 0.9,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "不锈钢加热棒",
            "normalized_field_name": "产品主体加热方式"
          },
          "field_name": "产品主体加热方式"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "7",
          "warnings": [],
          "qualifier": {
            "area": "die_body",
            "sourceText": "模体"
          },
          "raw_value": "7",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "heating_zone_count",
            "value_kind": "number",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "7",
            "normalized_field_name": "模头加热分区模体"
          },
          "field_name": "模头加热分区（模体）"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "有",
          "warnings": [],
          "qualifier": {
            "area": "side_plate",
            "sourceText": "侧板"
          },
          "raw_value": "有",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "heating_config",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "有",
            "normalized_field_name": "侧板加热配置"
          },
          "field_name": "侧板加热配置"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "有",
          "warnings": [],
          "qualifier": {
            "area": "lip",
            "sourceText": "模唇"
          },
          "raw_value": "有",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "heating_config",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "有",
            "normalized_field_name": "模唇加热配置"
          },
          "field_name": "模唇加热配置"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "油循环",
          "warnings": [],
          "qualifier": {
            "area": "lip",
            "sourceText": "模唇"
          },
          "raw_value": "油循环",
          "confidence": 0.9,
          "dictionary": {
            "note": "heating_method schema merge: area stored in qualifier.area",
            "matched": true,
            "term_type": "heating_method",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "油循环",
        
```

### Candidate
```json
[
  {
    "id": 126,
    "candidateType": "value",
    "termType": "upper_lip_adjustment_method",
    "rawValue": "其他 ：上下模整体结构。",
    "normalizedRawValue": "其他上下模整体结构。",
    "proposedCanonicalValue": "upper_lip_integral_structure",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B23",
      "text": "[SEL] 其他 ：上下模整体结构。",
      "sheet": "生产明细表",
      "block_id": "B23"
    }
  },
  {
    "id": 1529,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC仿结皮发泡板模头（产量600KG",
    "normalizedRawValue": "pvc仿结皮发泡板模头产量600kg",
    "proposedCanonicalValue": "PVC",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "sourceRawValue": "PVC仿结皮发泡板模头（产量600KG/每小时）",
      "splitFromRawValue": "PVC仿结皮发泡板模头（产量600KG"
    }
  },
  {
    "id": 2918,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "仿结皮发泡板模头产量600kg、每小时",
    "normalizedRawValue": "仿结皮发泡板模头产量600kg每小时",
    "proposedCanonicalValue": null,
    "status": "done_2918",
    "confidence": "0.72",
    "evidence": {
      "sourceRawValue": "PVC仿结皮发泡板模头（产量600KG/每小时）",
      "suffixRawValue": "仿结皮发泡板模头产量600kg、每小时",
      "splitFromRawValue": "仿结皮发泡板模头产量600kg、每小时",
      "matchedMaterialTokens": [
        "PVC"
      ],
      "suffixCandidateTermType": "application"
    }
  }
]
```

### Lines
- L1: 文件名：模头生产明细表（191681-E）2019-11-21-1320mm PVC仿结皮发泡板模头.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 模具编号：191681-E
- L14: 客户ID：40223
- L15: [ ] 国内使用
- L17: 国家(     孟加拉                      )
- L21: 合同编号：7191007
- L22: 合同规定交货日期：
- L26: 下单日期：2019-11-21
- L27: 交货日期：2020-1-4
- L28: 完工日期：
- L29: 实际发货日期：
- L33: [A7] 规格型号与原产品互配
- L36: 原产品编号（    160916         ）
- L44: [A9] 制品有效宽度
- L47: [A10] 制品有效厚度
- L52: [A12] 模头有效宽度
- L55: [A13] 模头宽度调节方式
- L64: [A14] 模唇厚度调节范围
- L65: [B14] 模唇厚度调节范围（                ）
- L67: 上下文：模唇厚度调节范围
- L74: [A16] 模唇数量
- L76: [ ] 上模唇（           ）套
- L77: [ ] 下模唇（         ）套
- L79: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L81: [A17] 模唇调节方式
- L82: [B17] [ ] 上模唇采用膨胀螺栓自动调节，参考图纸
- L83: option_set: {"options":[{"selected":false,"value":"上模唇采用膨胀螺栓自动调节，参考图纸"}]}
- L85: 上下文：模唇调节方式
- L87: [ ] 上模手动推式微调
- L89: option_set: {"options":[{"selected":false,"value":"上模手动推式微调"},{"selected":false,"value":"手动推、拉式微调"}]}
- L91: 上下文：模唇调节方式
- L97: 上下文：模唇调节方式
- L98: [B20] [ ] 下模唇可预调节
- L99: option_set: {"options":[{"selected":false,"value":"下模唇可预调节"}]}
- L101: 上下文：模唇调节方式
- L102: [B21] [ ] 下模唇固定、并可更换
- L103: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L105: 上下文：模唇调节方式
- L106: [B22] [ ] 下模整体结构
- L107: option_set: {"options":[{"selected":false,"value":"下模整体结构"}]}
- L109: 上下文：模唇调节方式
- L110: [B23] [SEL] 其他 ：上下模整体结构。
- L111: option_set: {"options":[{"selected":true,"value":"其他 ：上下模整体结构。"}]}
- L124: [ ] 上模
- L125: [ ] 下模   ）
- L126: option_set: {"options":[{"selected":false,"value":"有        分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"}]}
- L128: [A26] 流道形式
- L132: [ ] 模内多流道
- L134: option_set: {"options":[{"selected":true,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":false,"value":"其他"}]}
- L136: [A27] 加热方式
- L138: [SEL] 不锈钢加热棒
- L139: [ ] 加热板
- L141: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L143: [A28] 模头加热分区
- L146: 两侧板
- L149: 模唇
- L154: [A29] 模唇加热方式
- L156: [ ] 加热棒
- L161: [ ] 加热板
- L162: option_set: {"options":[{"selected":false,"value":"加热棒"},{"selected":true,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":true,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L164: [A30] 加热电压
- L167: [A31] 每区功率
- L169: [A32] 接线方式
- L171: [SEL] 带护罩全封闭接线
- L172: [ ] 模体开槽接线
- L174: option_set: {"options":[{"selected":true,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":false,"value":"其他"}]}
- L189: [A35] 侧板接插件
- L195: [A36] 热电偶孔
- L200: [A37] 热电偶孔规格
- L202: [SEL] 根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。
- L203: [ ] 客户要求
- L204: option_set: {"options":[{"selected":true,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。"},{"selected":false,"value":"客户要求"}]}
- L209: [A39] 模头材料选用
- L220: 模唇表面粗糙度：
- L225: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L238: 表面镀层要求：
- L242: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L246: 流道表面镀层厚度：
- L251: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L255: 流道表面镀层硬度：
- L258: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L262: 外表面镀层厚度：
- L267: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L269: [A47] 模头安装方式
- L274: [ ] 45°斜挤出安装 （分为：
- L277: option_set: {"options":[{"selected":true,"value":"平挤出"},{"selected":false,"value":"下挤出"},{"selected":false,"value":"其他"},{"selected":false,"value":"45°斜挤出安装 （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":false,"value":"45°挤出微调朝下"
- L279: [A48] 平挤出安装方式时
- L280: [B48] 支架孔规格、型号（                                                     ）
- L282: 上下文：平挤出安装方式时
- L290: [A50] 其它安装方式时
- L291: [B50] 吊装孔规格、型号（                                                     ）
- L293: 上下文：其它安装方式时
- L294: [B51] 吊装时中心距、规格（                                                  ）
- L297: [B52] 平挤出安装方式时，在模头（                            ）边
- L300: [B53] 其他安装方式时，在模头（                                ）边
- L302: [A54] 进料口方式
- L304: [SEL] 中央圆口进料
- L305: [ ] 中央方口进料
- L306: [ ] 其他形状或不同位置进料
- L307: option_set: {"options":[{"selected":true,"value":"中央圆口进料"},{"selected":false,"value":"中央方口进料"},{"selected":false,"value":"其他形状或不同位置进料"}]}
- L309: [A55] 进料口尺寸
- L316: [A56] 配合三辊进料方式
- L318: [ ] 中、上辊进料
- L319: [ ] 中、下辊进料
- L321: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}
- L325: [ ] 有　　数量：共（          ）件
- L327: option_set: {"options":[{"selected":false,"value":"有　　数量：共（          ）件"},{"selected":true,"value":"没有"}]}
- L329: [A58] 连接器加热方式
- L331: [ ] 不锈钢加热圈

## Document 25 模头生产明细表（191911-E）2019-12-28-2250mmPVC自由发泡板模头+连接器.xls

- extractionResultId: 14332
- approxBlocksTokens: 6092
- candidates: 18

### Normalized
```json
{
  "documentInfo": {
    "customer_notes": [
      {
        "evidence": {
          "line": 6,
          "text": "》》》要求打JCTIMES 标志! 请注意交货时间，逾期客户会追索罚款！"
        },
        "raw_text": "要求打JCTIMES 标志! 请注意交货时间，逾期客户会追索罚款！",
        "raw_value": "要求打JCTIMES 标志! 请注意交货时间，逾期客户会追索罚款！",
        "field_name": "标志要求/备注",
        "item_index": 1,
        "document_id": "25",
        "extraction_result_id": "14332"
      }
    ]
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "2250mm PVC自由发泡板模头",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {
            "line": 8,
            "text": "B8 PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快"
          },
          "original": false,
          "raw_text": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
          "selected": true,
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀并识别应用领域后缀",
              "raw_value": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            },
            {
              "type": "value_no_match",
              "message": "字段值未命中字典，已创建字段值候选",
              "evidence": {
                "line": 8,
                "text": "B8 PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快"
              },
              "raw_value": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
              "term_type": "application",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "raw_value": "自由发泡板",
            "term_type": "application",
            "item_index": 1,
            "candidate_id": "3856",
            "candidate_type": "value",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "position": "upper_die",
            "sourceText": "B8 PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快"
          },
          "raw_value": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "PVC",
                "confidence": 1,
                "displayName": "PVC",
                "canonicalValue": "PVC"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "PVC",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PVC",
            "normalized_value": "pvc自由发泡板模头上下模中间区域配铝散热板并设计有流体冷却循环孔下模安装孔加不锈钢丝套模体紧固螺丝孔设计螺纹套配打液压手板孔配防护快",
            "material_prefix_split": {
              "sourceRawValue": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
              "suffixRawValue": "自由发泡板模头、上下模中间区域配铝散热板并设计有流体冷却循环孔、下模安装孔加不锈钢丝套模体紧固螺丝孔设计螺纹套、配打液压手板孔、配防护快",
              "matchedMaterialTokens": [
                "PVC"
              ],
              "suffixCandidateTermType": "application"
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {
            "line": 8,
            "text": "B8 PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快"
          },
          "original": false,
          "raw_text": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
          "selected": true,
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀并识别应用领域后缀",
              "raw_value": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            },
            {
              "type": "value_no_match",
              "message": "字段值未命中字典，已创建字段值候选",
              "evidence": {
                "line": 8,
                "text": "B8 PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快"
              },
              "raw_value": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
              "term_type": "application",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "raw_value": "自由发泡板",
            "term_type": "application",
            "item_index": 1,
            "candidate_id": "3856",
            "candidate_type": "value",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "position": "lower_die",
            "sourceText": "B8 PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快"
          },
          "raw_value": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "PVC",
                "confidence": 1,
                "displayName": "PVC",
                "canonicalValue": "PVC"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "PVC",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PVC",
            "normalized_value": "pvc自由发泡板模头上下模中间区域配铝散热板并设计有流体冷却循环孔下模安装孔加不锈钢丝套模体紧固螺丝孔设计螺纹套配打液压手板孔配防护快",
            "material_prefix_split": {
              "sourceRawValue": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
              "suffixRawValue": "自由发泡板模头、上下模中间区域配铝散热板并设计有流体冷却循环孔、下模安装孔加不锈钢丝套模体紧固螺丝孔设计螺纹套、配打液压手板孔、配防护快",
              "matchedMaterialTokens": [
                "PVC"
              ],
              "suffixCandidateTermType": "application"
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {
            "line": 9,
            "text": "B9 2050MM"
          },
          "original": false,
          "raw_text": "2050MM",
          "selected": true,
          "warnings": [],
          "raw_value": "2050MM",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "2050",
              "unitRaw": "MM",
              "rawValue": "2050MM",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "2050",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "2050 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "2050 mm",
            "normalized_field_name": "制品有效宽度"
          },
          "field_name": "制品有效宽度"
        },
        {
          "evidence": {
            "line": 10,
            "text": "B10 1-6mm"
          },
          "original": false,
          "raw_text": "1-6mm",
          "selected": true,
          "warnings": [],
          "raw_value": "1-6mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "6",
              "rangeMax": "6",
              "rangeMin": "1",
              "rawValue": "1-6mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "1",
              "displayUnit": "mm",
              "numericText": "1-6",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1-6 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1-6 mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {
            "line": 11,
            "text": "B11 （产量600-900 kg/hr）"
          },
          "original": false,
          "raw_text": "产量600-900 kg/hr",
          "selected": true,
          "warnings": [],
          "raw_value": "产量600-900 kg/hr",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "capacity",
            "value_kind": "number_unit",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "产量600-900 kg/hr",
            "normalized_field_name": "适合产量"
          },
          "field_name": "适合产量"
        },
        {
          "evidence": {
            "line": 7,
            "text": "[SEL] 不是"
          },
          "original": false,
          "raw_text": "不是",
          "selected": true,
          "warnings": [],
          "raw_value": "不是",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "specification_compatible_with_original",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "不是",
            "normalized_field_name": "规格型号与原产品互配"
          },
          "field_name": "规格型号与原产品互配"
        }
      ],
      "rawFieldCount": 0
    },
    {
      "itemIndex": 2,
      "itemName": "连接器",
      "quantity": "1件",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "（产量600-900 kg/hr）",
          "warnings": [],
          "raw_value": "产量600-900 kg/hr",
          "confidence": 0.85,
          "dictionary": {
            "matched": true,
            "term_type": "capacity",
            "value_kind": "number_unit",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "产量600-900 kg/hr",
            "normalized_field_name": "适合产量"
          },
          "field_name": "适合产量"
        }
      ],
      "rawFieldCount": 0
    },
    {
      "itemIndex": 3,
      "itemName": "3层分配器",
      "quantity": "2套",
      "fields": [
        {
          "evidence": {},
          "original": false,
          "raw_text": "[ ] 镶块式",
          "selected": false,
          "warnings": [],
          "raw_value": "镶块式",
          "confidence": 0.9,
          "dictionary": {
            "matched": false,
            "field_matched": false
          },
          "field_name": "分配器型号"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "[ ] 摆叶式",
          "selected": false,
          "warnings": [],
          "raw_value": "摆叶式",
          "confidence": 0.9,
          "dictionary": {
            "matched": false,
            "field_matched": false
          },
          "field_name": "分配器型号"
        },
        {
          "evidence": {},
          "original": false,
          "raw_text": "[ ] 芯棒旋转式",
          "selected": false,
          "warnings": [],
          "raw_value": "芯棒旋转式",
     
```

### Candidate
```json
[
  {
    "id": 60,
    "candidateType": "value",
    "termType": "lip_heating_method",
    "rawValue": "油循环",
    "normalizedRawValue": "油循环",
    "proposedCanonicalValue": "oil_circulation",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B29",
      "text": "[SEL] 油循环",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 67,
    "candidateType": "value",
    "termType": "feed_inlet_method",
    "rawValue": "中央圆口进料",
    "normalizedRawValue": "中央圆口进料",
    "proposedCanonicalValue": "center_round_feed",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B54",
      "text": "[SEL] 中央圆口进料",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 76,
    "candidateType": "value",
    "termType": "product_material",
    "rawValue": "B（1.2316不锈钢）",
    "normalizedRawValue": "b1.2316不锈钢",
    "proposedCanonicalValue": "1.2316_stainless_steel",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B39",
      "text": "[SEL] B（1.2316不锈钢）",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 108,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC自由发泡板",
    "normalizedRawValue": "pvc自由发泡板",
    "proposedCanonicalValue": "plastic_material:PVC|application:PVC自由发泡板",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B8",
      "text": "PVC自由发泡板模头",
      "sheet": "生产明细表",
      "sourceRawValue": "PVC自由发泡板",
      "splitFromRawValue": "PVC自由发泡板"
    }
  },
  {
    "id": 109,
    "candidateType": "value",
    "termType": "product_material",
    "rawValue": "1.2316不锈钢钢材",
    "normalizedRawValue": "1.2316不锈钢钢材",
    "proposedCanonicalValue": "1.2316_stainless_steel",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B57",
      "text": "1.2316不锈钢钢材",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 110,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "LDPE",
    "normalizedRawValue": "ldpe",
    "proposedCanonicalValue": "LDPE",
    "status": "done_110",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "LDPE LLDPE",
      "splitFromRawValue": "LDPE"
    }
  },
  {
    "id": 111,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "LLDPE",
    "normalizedRawValue": "lldpe",
    "proposedCanonicalValue": "LLDPE",
    "status": "done_111",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "LDPE LLDPE",
      "splitFromRawValue": "LLDPE"
    }
  },
  {
    "id": 115,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC自由发泡板",
    "normalizedRawValue": "pvc自由发泡板",
    "proposedCanonicalValue": "plastic_material:PVC|application:PVC自由发泡板",
    "status": "done_115",
    "confidence": null,
    "evidence": {
      "cell": "B8",
      "text": "PVC自由发泡板模头",
      "sheet": "生产明细表",
      "sourceRawValue": "PVC自由发泡板",
      "splitFromRawValue": "PVC自由发泡板"
    }
  },
  {
    "id": 116,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "适用塑料原料",
    "normalizedRawValue": "适用塑料原料",
    "proposedCanonicalValue": "PVC",
    "status": "done_116",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "适用塑料原料",
      "splitFromRawValue": "适用塑料原料"
    }
  },
  {
    "id": 117,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC自由发泡板",
    "normalizedRawValue": "pvc自由发泡板",
    "proposedCanonicalValue": "plastic_material:PVC|application:PVC自由发泡板",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "cell": "B8",
      "text": "PVC自由发泡板模头",
      "sheet": "生产明细表",
      "sourceRawValue": "PVC自由发泡板",
      "splitFromRawValue": "PVC自由发泡板"
    }
  },
  {
    "id": 391,
    "candidateType": "value",
    "termType": "heating_voltage",
    "rawValue": "(230V)/(50Hz)",
    "normalizedRawValue": "230v/50hz",
    "proposedCanonicalValue": "heating_voltage:230|heating_frequency:50",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B30",
      "text": "(230V)/(50Hz)",
      "sheet": "生产明细表",
      "phase1_snapshot": true,
      "phase1_snapshot_reason": [
        "non_enum_value_candidate"
      ]
    }
  },
  {
    "id": 668,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC自由发泡板模头",
    "normalizedRawValue": "pvc自由发泡板模头",
    "proposedCanonicalValue": "PVC",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "line": 8,
      "text": "B8 PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
      "sourceRawValue": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
      "splitFromRawValue": "PVC自由发泡板模头"
    }
  },
  {
    "id": 669,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "上下模中间区域配铝散热板并设计有流体冷却循环孔",
    "normalizedRawValue": "上下模中间区域配铝散热板并设计有流体冷却循环孔",
    "proposedCanonicalValue": null,
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "line": 8,
      "text": "B8 PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
      "sourceRawValue": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
      "splitFromRawValue": "上下模中间区域配铝散热板并设计有流体冷却循环孔"
    }
  },
  {
    "id": 670,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】",
    "normalizedRawValue": "下模安装孔加不锈钢丝套模体紧固螺丝孔设计螺纹套",
    "proposedCanonicalValue": null,
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "line": 8,
      "text": "B8 PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
      "sourceRawValue": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
      "splitFromRawValue": "下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】"
    }
  },
  {
    "id": 671,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "配打液压手板孔",
    "normalizedRawValue": "配打液压手板孔",
    "proposedCanonicalValue": null,
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "line": 8,
      "text": "B8 PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
      "sourceRawValue": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
      "splitFromRawValue": "配打液压手板孔"
    }
  },
  {
    "id": 672,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "配防护快",
    "normalizedRawValue": "配防护快",
    "proposedCanonicalValue": null,
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "line": 8,
      "text": "B8 PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
      "sourceRawValue": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
      "splitFromRawValue": "配防护快"
    }
  },
  {
    "id": 2917,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "自由发泡板模头、上下模中间区域配铝散热板并设计有流体冷却循环孔、下模安装孔加不锈钢丝套模体紧固螺丝孔设计螺纹套、配打液压手板孔、配防护快",
    "normalizedRawValue": "自由发泡板模头上下模中间区域配铝散热板并设计有流体冷却循环孔下模安装孔加不锈钢丝套模体紧固螺丝孔设计螺纹套配打液压手板孔配防护快",
    "proposedCanonicalValue": null,
    "status": "done_2917",
    "confidence": "0.72",
    "evidence": {
      "line": 8,
      "text": "B8 PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
      "sourceRawValue": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
      "suffixRawValue": "自由发泡板模头、上下模中间区域配铝散热板并设计有流体冷却循环孔、下模安装孔加不锈钢丝套模体紧固螺丝孔设计螺纹套、配打液压手板孔、配防护快",
      "splitFromRawValue": "自由发泡板模头、上下模中间区域配铝散热板并设计有流体冷却循环孔、下模安装孔加不锈钢丝套模体紧固螺丝孔设计螺纹套、配打液压手板孔、配防护快",
      "matchedMaterialTokens": [
        "PVC"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 3633,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "自由发泡板",
    "normalizedRawValue": "自由发泡板",
    "proposedCanonicalValue": null,
    "status": "done_3633",
    "confidence": "0.72",
    "evidence": {
      "line": 8,
      "text": "B8 PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
      "routedBy": "plastic_material_residual_classifier",
      "sourceRawValue": "PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快",
      "suffixRawValue": "自由发泡板",
      "splitFromRawValue": "自由发泡板",
      "matchedMaterialTokens": [
        "PVC"
      ],
      "suffixCandidateTermType": "application"
    }
  }
]
```

### Lines
- L1: 文件名：模头生产明细表（191911-E）2019-12-28-2250mmPVC自由发泡板模头+连接器.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 模具编号：191911-E
- L14: 客户ID：40224
- L15: [ ] 国内使用
- L17: 国家(     俄罗斯                      )
- L21: 合同编号：7191129
- L22: 合同规定交货日期：
- L26: 下单日期：2019-12-28
- L27: 交货日期：2020-03-12
- L28: 完工日期：
- L29: 实际发货日期：
- L31: [A6] 》》》要求打JCTIMES 标志! 请注意交货时间，逾期客户会追索罚款！
- L33: [A7] 规格型号与原产品互配
- L36: 原产品编号（             ）
- L42: [B8] PVC自由发泡板模头 ，上下模中间区域配铝散热板并设计有流体冷却循环孔，下模安装孔加不锈钢丝套【模体紧固螺丝孔设计螺纹套】，配打液压手板孔，配防护快
- L44: [A9] 制品有效宽度
- L47: [A10] 制品有效厚度
- L53: [A12] 模头有效宽度
- L56: [A13] 模头宽度调节方式
- L65: [A14] 模唇厚度调节范围
- L66: [B14] 模唇厚度调节范围（                ）
- L68: 上下文：模唇厚度调节范围
- L75: [A16] 模唇数量
- L77: [ ] 上模唇（           ）套
- L78: [ ] 下模唇（         ）套
- L80: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L82: [A17] 模唇调节方式
- L84: 上下文：模唇调节方式
- L86: [ ] 上模减力推拉
- L88: option_set: {"options":[{"selected":false,"value":"上模减力推拉"},{"selected":true,"value":"手动推、拉式微调"}]}
- L90: 上下文：模唇调节方式
- L96: 上下文：模唇调节方式
- L97: [B20] [ ] 下模唇可预调节
- L98: option_set: {"options":[{"selected":false,"value":"下模唇可预调节"}]}
- L100: 上下文：模唇调节方式
- L101: [B21] [ ] 下模唇固定、并可更换
- L102: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L104: 上下文：模唇调节方式
- L105: [B22] [SEL] 下模整体结构
- L106: option_set: {"options":[{"selected":true,"value":"下模整体结构"}]}
- L108: 上下文：模唇调节方式
- L125: [ ] 上模
- L126: [ ] 下模   ）
- L127: option_set: {"options":[{"selected":false,"value":"有           分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"}]}
- L129: [A26] 流道形式
- L133: [ ] 模内多流道
- L135: option_set: {"options":[{"selected":true,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":false,"value":"其他"}]}
- L137: [A27] 加热方式
- L139: [SEL] 不锈钢加热棒
- L140: [ ] 加热板
- L142: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L144: [A28] 模头加热分区
- L147: 两侧板
- L150: 模唇
- L155: [A29] 模唇加热方式
- L157: [ ] 加热棒
- L162: [ ] 加热板
- L163: option_set: {"options":[{"selected":false,"value":"加热棒"},{"selected":true,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":true,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L165: [A30] 加热电压
- L168: [A31] 每区功率
- L170: [A32] 接线方式
- L172: [SEL] 带护罩全封闭接线
- L173: [ ] 模体开槽接线
- L175: option_set: {"options":[{"selected":true,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":false,"value":"其他"}]}
- L190: [A35] 侧板接插件
- L196: [A36] 热电偶孔
- L201: [A37] 热电偶孔规格
- L203: [ ] 根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。
- L204: [SEL] 客户要求
- L205: 2套哈丁接插件分别用于电源加热和热电偶，上下模均需要配热电偶，型号J，接口规格M14X1.5，哈丁接插件24芯，具体型号见图纸
- L206: option_set: {"options":[{"selected":false,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。"},{"selected":true,"value":"客户要求  2套哈丁接插件分别用于电源加热和热电偶，上下模均需要配热电偶，型号J，接口规格M14X1.5，哈丁接插件24芯，具体型号见图纸"}]}
- L211: [A39] 模头材料选用
- L222: 模唇表面粗糙度：
- L227: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L240: 表面镀层要求：
- L244: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L248: 流道表面镀层厚度：
- L253: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L257: 流道表面镀层硬度：
- L260: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L264: 外表面镀层厚度：
- L269: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L271: [A47] 模头安装方式
- L276: [ ] 45°斜挤出安装 （分为：
- L279: option_set: {"options":[{"selected":true,"value":"平挤出"},{"selected":false,"value":"下挤出"},{"selected":false,"value":"其他"},{"selected":false,"value":"45°斜挤出安装 （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":false,"value":"45°挤出微调朝下"
- L281: [A48] 平挤出安装方式时
- L282: [B48] 支架孔规格、型号（                                                     ）
- L284: 上下文：平挤出安装方式时
- L292: [A50] 其它安装方式时
- L293: [B50] 吊装孔规格、型号（                                                     ）
- L295: 上下文：其它安装方式时
- L296: [B51] 吊装时中心距、规格（                                                  ）
- L299: [B52] 平挤出安装方式时，在模头（                            ）边
- L302: [B53] 其他安装方式时，在模头（                                ）边
- L304: [A54] 进料口方式
- L306: [SEL] 中央圆口进料
- L307: [ ] 中央方口进料
- L308: [ ] 其他形状或不同位置进料
- L309: option_set: {"options":[{"selected":true,"value":"中央圆口进料"},{"selected":false,"value":"中央方口进料"},{"selected":false,"value":"其他形状或不同位置进料"}]}
- L311: [A55] 进料口尺寸
- L318: [A56] 配合三辊进料方式
- L320: [ ] 中、上辊进料
- L321: [ ] 中、下辊进料
- L323: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}
- L327: [SEL] 有　　数量：共（     1     ）件
- L330: option_set: {"options":[{"selected":true,"value":"有　　数量：共（     1     ）件　  1.2316不锈钢钢材"},{"selected":false,"value":"没有"}]}
- L332: [A58] 连接器加热方式
- L334: [ ] 不锈钢加热圈
- L335: [ ] 铸铝加热圈

## Document 26 分配器生产明细表（2020-381-E-300）2019-04-24连接器.xls

- extractionResultId: 14325
- approxBlocksTokens: 2231
- candidates: 10

### Normalized
```json
{
  "documentInfo": {
    "country": {
      "value": "波兰",
      "rawKey": "国家",
      "evidence": {
        "text": "国家(     波兰                      )"
      },
      "confidence": 0.9,
      "canonicalKey": "country"
    },
    "order_number": {
      "value": "",
      "rawKey": "order_number",
      "evidence": {
        "line": 0,
        "text": ""
      },
      "confidence": 0,
      "canonicalKey": "order_number"
    },
    "usage_market": {
      "value": "出口使用",
      "rawKey": "出口使用",
      "evidence": {
        "text": "[SEL] 出口使用"
      },
      "confidence": 0.9,
      "canonicalKey": "usage_market"
    },
    "customer_notes": [
      {
        "evidence": {
          "text": "》》》要求打JCTIMES 标志!"
        },
        "raw_text": "》》》要求打JCTIMES 标志!",
        "raw_value": "要求打JCTIMES 标志!",
        "field_name": "标志要求/备注",
        "item_index": 1,
        "document_id": "26",
        "extraction_result_id": "14325"
      }
    ],
    "product_number": {
      "value": "2020-381-E-300",
      "rawKey": "配件编号",
      "evidence": {
        "text": "配件编号：2020-381-E-300"
      },
      "confidence": 0.95,
      "canonicalKey": "product_number"
    },
    "contract_number": {
      "value": "7200910",
      "rawKey": "contract_number",
      "evidence": {
        "line": 23,
        "text": "合同编号：7200910"
      },
      "confidence": 0.95,
      "canonicalKey": "contract_number"
    }
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "3层分配器",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {
            "text": "总计共（   1  ）套"
          },
          "original": false,
          "raw_text": "总计共（   1  ）套",
          "warnings": [],
          "qualifier": {
            "area": "feedblock",
            "sourceText": "分配器"
          },
          "raw_value": "1套",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "item_quantity",
            "value_kind": "number",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1套",
            "normalized_field_name": "分配器数量"
          },
          "field_name": "分配器数量"
        },
        {
          "evidence": {
            "text": "PVC石塑地板共挤"
          },
          "original": false,
          "raw_text": "PVC石塑地板共挤",
          "warnings": [
            {
              "type": "plastic_material_residual_suppressed",
              "source": "material_residual_classifier",
              "message": "塑料原料残片 共挤 更像工艺、参数或结构说明，已跳过 plastic_material 候选",
              "raw_value": "PVC石塑地板共挤",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            },
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀并跳过非应用后缀候选",
              "raw_value": "PVC石塑地板共挤",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "raw_value": "PVC石塑地板共挤",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "PVC",
                "confidence": 0.9,
                "displayName": "PVC",
                "canonicalValue": "PVC"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 0.9,
            "value_kind": "enums",
            "display_name": "PVC",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PVC",
            "normalized_value": "pvc石塑地板共挤",
            "material_prefix_split": {
              "sourceRawValue": "PVC石塑地板共挤",
              "suffixRawValue": "共挤",
              "matchedMaterialTokens": [
                "PVC"
              ],
              "suffixCandidateTermType": "application"
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {
            "text": "（    3  ）层"
          },
          "original": false,
          "raw_text": "（    3  ）层",
          "warnings": [],
          "raw_value": "3层",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "layer_count",
            "value_kind": "number",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "3层",
            "normalized_field_name": "复合层次"
          },
          "field_name": "复合层次"
        },
        {
          "evidence": {
            "text": "ABA"
          },
          "original": false,
          "raw_text": "ABA",
          "warnings": [],
          "raw_value": "ABA",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "layer_structure",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "aba",
            "normalized_field_name": "结构形式"
          },
          "field_name": "结构形式"
        },
        {
          "evidence": {
            "text": "A15% ,B 70%,A15%"
          },
          "original": false,
          "raw_text": "A15% ,B 70%,A15%",
          "warnings": [],
          "raw_value": "A15% ,B 70%,A15%",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "layer_ratio",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "每层复合比例: A15% ,B 70%,A15%",
            "normalized_field_name": "每层复合比例"
          },
          "field_name": "每层复合比例"
        },
        {
          "evidence": {
            "text": "[SEL] 加热棒"
          },
          "original": false,
          "raw_text": "[SEL] 加热棒",
          "selected": true,
          "warnings": [],
          "raw_value": "加热棒",
          "confidence": 0.95,
          "dictionary": {
            "note": "active term canonical/display self alias",
            "matched": true,
            "term_type": "heating_method",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "加热棒",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "heating_rod",
            "normalized_value": "加热棒",
            "normalized_field_name": "加热方式"
          },
          "field_name": "加热方式"
        },
        {
          "evidence": {
            "text": "(  400  V )/(     50   Hz)/ (      相 )\n功率 (    KW )",
            "ruleSignals": [
              {
                "after": [
                  {
                    "value": "400 V",
                    "field_name": "加热电压"
                  },
                  {
                    "value": "50 Hz",
                    "field_name": "加热频率"
                  },
                  {
                    "value": "（未明确）",
                    "field_name": "加热相"
                  },
                  {
                    "value": "（未填写）",
                    "field_name": "加热功率"
                  }
                ],
                "before": {
                  "value": "(  400  V )/(     50   Hz)/ (      相 ) 功率 (    KW )",
                  "fieldName": "电压及加热功率"
                },
                "ruleId": "selection_split",
                "message": "LLM split_fields were normalized into selected option fields.",
                "confidence": 0.8,
                "relationType": "split_component",
                "recommendedAction": "split_value"
              }
            ]
          },
          "original": true,
          "raw_text": "(  400  V )/(     50   Hz)/ (      相 )\n功率 (    KW )",
          "warnings": [
            {
              "type": "split_original_retained",
              "message": "字段值包含多个业务属性，已拆分为独立字段",
              "evidence": {
                "text": "(  400  V )/(     50   Hz)/ (      相 )\n功率 (    KW )"
              },
              "raw_value": "(  400  V )/(     50   Hz)/ (      相 ) 功率 (    KW )",
              "field_name": "电压及加热功率",
              "item_index": 1
            }
          ],
          "raw_value": "(  400  V )/(     50   Hz)/ (      相 ) 功率 (    KW )",
          "confidence": 0.9,
          "dictionary": {
            "note": "复合字段已拆分，原字段仅保留作追溯",
            "matched": false,
            "field_matched": false
          },
          "field_name": "电压及加热功率"
        },
        {
          "evidence": {
            "text": "(  400  V )/(     50   Hz)/ (      相 )\n功率 (    KW )"
          },
          "original": false,
          "raw_text": "(  400  V )/(     50   Hz)/ (      相 )\n功率 (    KW )",
          "warnings": [],
          "raw_value": "400V",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "heating_voltage",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "400",
              "unitRaw": "V",
              "rawValue": "400 V",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "V",
              "numericText": "400",
              "unitCanonical": "V",
              "matchedAliasId": "34",
              "normalizedValue": "400V",
              "normalizedUnitRaw": "v"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "400V",
            "normalized_field_name": "加热电压"
          },
          "field_name": "加热电压"
        },
        {
          "evidence": {
            "text": "(  400  V )/(     50   Hz)/ (      相 )\n功率 (    KW )"
          },
          "original": false,
          "raw_text": "(  400  V )/(     50   Hz)/ (      相 )\n功率 (    KW )",
          "warnings": [],
          "raw_value": "50 Hz",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "heating_frequency",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "50",
              "unitRaw": "Hz",
              "rawValue": "50 Hz",
              "warnings": [],
              "numberKind": "single",
              "numericText": "50",
              "normalizedValue": "50Hz",
              "normalizedUnitRaw": "hz"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "50Hz",
            "normalized_field_name": "加热频率"
          },
          "field_name": "加热频率"
        },
        {
          "evidence": {
            "text": "(  400  V )/(     50   Hz)/ (      相 )\n功率 (    KW )"
          },
          "original": false,
          "raw_text": "(  400  V )/(     50   Hz)/ (      相 )\n功率 (    KW )",
          "warnings": [
            {
              "type": "value_no_match",
              "message": "字段值未命中字典，请人工确认",
              "raw_value": "（未明确）",
              "term_type": "heating_phase",
              "field_name": "加热相",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "raw_value": "（未明确）",
            "term_type": "heating_phase",
            "item_index": 1,
            "candidate_id": "703",
            "candidate_type": "value",
            "source_product_type": "feedblock"
          },
          "raw_value": "（未明确）",
          "confidence": 0.9,
          "dictionary": {
            "matched": false,
            "term_type": "heating_phase",
            "match_method": "none",
            "field_matched": true,
            "normalized_value": "未明确",
            "normalized_field_name": "加热相"
        
```

### Candidate
```json
[
  {
    "id": 119,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC石塑地板共挤",
    "normalizedRawValue": "pvc石塑地板共挤",
    "proposedCanonicalValue": "plastic_material:undefined|application:undefined",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B12",
      "text": "PVC石塑地板共挤",
      "sheet": "生产明细表",
      "block_id": "B12",
      "sourceRawValue": "PVC石塑地板共挤",
      "splitFromRawValue": "PVC石塑地板共挤"
    }
  },
  {
    "id": 282,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "LDPE",
    "normalizedRawValue": "ldpe",
    "proposedCanonicalValue": "LDPE",
    "status": "done_282",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "LDPE LLDPE",
      "splitFromRawValue": "LDPE"
    }
  },
  {
    "id": 283,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "LLDPE",
    "normalizedRawValue": "lldpe",
    "proposedCanonicalValue": "LLDPE",
    "status": "done_283",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "LDPE LLDPE",
      "splitFromRawValue": "LLDPE"
    }
  },
  {
    "id": 286,
    "candidateType": "value",
    "termType": "heating_voltage",
    "rawValue": "400 V",
    "normalizedRawValue": "400v",
    "proposedCanonicalValue": "400",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B17",
      "text": "(  400  V )/(     50   Hz)/ (      相 )",
      "sheet": "生产明细表",
      "block_id": "B17",
      "phase1_snapshot": true,
      "phase1_snapshot_reason": [
        "non_enum_value_candidate"
      ]
    }
  },
  {
    "id": 310,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "LDPE",
    "normalizedRawValue": "ldpe",
    "proposedCanonicalValue": "LDPE",
    "status": "done_310",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "LDPE LLDPE",
      "splitFromRawValue": "LDPE"
    }
  },
  {
    "id": 311,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "LLDPE",
    "normalizedRawValue": "lldpe",
    "proposedCanonicalValue": "LLDPE",
    "status": "done_311",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "LDPE LLDPE",
      "splitFromRawValue": "LLDPE"
    }
  },
  {
    "id": 409,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC石塑地板共挤",
    "normalizedRawValue": "pvc石塑地板共挤",
    "proposedCanonicalValue": "",
    "status": "done_409",
    "confidence": null,
    "evidence": {
      "text": "PVC石塑地板共挤",
      "block_id": "B12",
      "sourceRawValue": "PVC石塑地板共挤",
      "splitFromRawValue": "PVC石塑地板共挤"
    }
  },
  {
    "id": 418,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC石塑地板共挤",
    "normalizedRawValue": "pvc石塑地板共挤",
    "proposedCanonicalValue": "",
    "status": "done_418",
    "confidence": null,
    "evidence": {
      "cell": "B12",
      "text": "PVC石塑地板共挤",
      "sheet": "生产明细表",
      "source": "local",
      "block_id": "B12",
      "sourceRawValue": "PVC石塑地板共挤",
      "splitFromRawValue": "PVC石塑地板共挤"
    }
  },
  {
    "id": 703,
    "candidateType": "value",
    "termType": "heating_phase",
    "rawValue": "（未明确）",
    "normalizedRawValue": "未明确",
    "proposedCanonicalValue": null,
    "status": "pending",
    "confidence": null,
    "evidence": {
      "text": "(  400  V )/(     50   Hz)/ (      相 )\n功率 (    KW )"
    }
  },
  {
    "id": 1416,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC石塑地板共挤",
    "normalizedRawValue": "pvc石塑地板共挤",
    "proposedCanonicalValue": "",
    "status": "done_1416",
    "confidence": null,
    "evidence": {
      "text": "PVC石塑地板共挤",
      "sourceRawValue": "PVC石塑地板共挤",
      "splitFromRawValue": "PVC石塑地板共挤"
    }
  }
]
```

### Lines
- L1: 文件名：分配器生产明细表（2020-381-E-300）2019-04-24连接器.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 配件编号：2020-381-E-300
- L14: 客户ID：40230
- L15: [ ] 国内使用
- L17: 国家(     波兰                      )
- L21: 合同编号：7200910
- L22: 合同规定交货日期：
- L26: 下单日期：2020-09-28
- L27: 交货日期：2020-11-16
- L28: 完工日期：
- L29: 实际发货日期：
- L32: 2）3层分配器
- L35: [A7] 分配器型号
- L38: 镶块数量：（            ）块
- L39: option_set: {"options":[{"selected":false,"value":"镶块式     镶块数量：（            ）块"}]}
- L41: 上下文：分配器型号
- L44: 分流杆数量：（            ）支
- L45: option_set: {"options":[{"selected":false,"value":"摆叶式     分流杆数量：（            ）支"}]}
- L47: 上下文：分配器型号
- L51: 上下文：分配器型号
- L55: [A11] 分配器数量
- L58: 大分流芯棒数量（            ）套
- L63: [A13] 复合层次
- L64: [B13] （    3  ）层
- L69: [A15] 每层复合比例
- L72: [A16] 加热方式
- L74: [SEL] 加热棒
- L75: [ ] 加热板
- L76: [ ] 加热棒、加热板组合
- L77: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"加热棒、加热板组合"}]}
- L79: [A17] 电压及加热功率
- L82: 功率 (    KW )
- L90: [A20] 接线方式
- L91: [B20] 专用接线盒封闭接线
- L93: [A21] 分配器材料选用
- L99: [A22] 表面镀层要求
- L116: 合同制作人：蔡金枝
- L120: 合同及生产单审核人员1：
- L130: 1）3层分配器
- L133: [A2] 分配器型号
- L136: 镶块数量：（            ）块
- L137: option_set: {"options":[{"selected":false,"value":"镶块式     镶块数量：（            ）块"}]}
- L139: 上下文：分配器型号
- L142: 分流杆数量：（            ）支
- L143: option_set: {"options":[{"selected":false,"value":"摆叶式     分流杆数量：（            ）支"}]}
- L145: 上下文：分配器型号
- L149: 上下文：分配器型号
- L153: [A6] 分配器数量
- L156: 大分流芯棒数量（            ）套
- L161: [A8] 复合层次
- L162: [B8] （      3     ）层
- L167: [A10] 每层复合比例
- L170: [A11] 加热方式
- L172: [SEL] 加热棒
- L173: [ ] 加热板
- L174: [ ] 加热棒、加热板组合
- L175: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"加热棒、加热板组合"}]}
- L177: [A12] 电压及加热功率
- L180: 功率 (    5  KW )
- L188: [A15] 接线方式
- L189: [B15] 专用接线盒封闭接线
- L191: [A16] 分配器材料选用
- L197: [A17] 表面镀层要求
- L214: 合同制作人：华丽莎
- L218: 合同及生产单审核人员1：

## Document 27 模头生产明细表（200142-E）2020-02-14-1380mmUPVC波浪板模头+三层分配器.xls

- extractionResultId: 14333
- approxBlocksTokens: 6349
- candidates: 15

### Normalized
```json
{
  "documentInfo": {
    "order_number": {
      "value": "",
      "rawKey": "order_number",
      "evidence": {
        "line": 0,
        "text": ""
      },
      "confidence": 0,
      "canonicalKey": "order_number"
    },
    "customer_notes": [
      {
        "evidence": {
          "line": 6,
          "text": "》》》要求打JCTIMES 标志!"
        },
        "raw_text": "要求打JCTIMES 标志",
        "raw_value": "要求打JCTIMES 标志",
        "field_name": "标志要求/备注",
        "item_index": 1,
        "document_id": "27",
        "extraction_result_id": "14333"
      }
    ],
    "product_number": {
      "value": "200142-E",
      "rawKey": "product_number",
      "evidence": {
        "line": 27,
        "text": "模具编号：200142-E"
      },
      "confidence": 0.95,
      "canonicalKey": "product_number"
    },
    "contract_number": {
      "value": "7191127",
      "rawKey": "contract_number",
      "evidence": {
        "line": 22,
        "text": "合同编号：7191127"
      },
      "confidence": 0.95,
      "canonicalKey": "contract_number"
    }
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "1380mm PVC+UPVC波浪板模头",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {
            "line": 9,
            "text": "B9 1380mm PVC+UPVC波浪板模头，可参考模头编号10682"
          },
          "original": false,
          "raw_text": "1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
          "selected": true,
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀并识别应用领域后缀",
              "raw_value": "1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            },
            {
              "type": "value_no_match",
              "message": "字段值未命中字典，已创建字段值候选",
              "evidence": {
                "line": 9,
                "text": "B9 1380mm PVC+UPVC波浪板模头，可参考模头编号10682"
              },
              "raw_value": "1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
              "term_type": "application",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "raw_value": "波浪板",
            "term_type": "application",
            "item_index": 1,
            "candidate_id": "3551",
            "candidate_type": "value",
            "source_product_type": "sizing_die"
          },
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
          "confidence": 0.95,
          "dictionary": {
            "values": [
              {
                "rawValue": "PVC",
                "confidence": 1,
                "displayName": "PVC",
                "canonicalValue": "PVC"
              },
              {
                "rawValue": "UPVC",
                "confidence": 1,
                "displayName": "UPVC",
                "canonicalValue": "UPVC"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "PVC",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PVC",
            "normalized_value": "1380mmpvc+upvc波浪板模头可参考模头编号10682",
            "material_prefix_split": {
              "sourceRawValue": "1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
              "suffixRawValue": "波浪板模头、可参考模头编号10682",
              "matchedMaterialTokens": [
                "PVC",
                "UPVC"
              ],
              "suffixCandidateTermType": "application"
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {
            "line": 11,
            "text": "B11 1.5-3.5mm"
          },
          "original": false,
          "raw_text": "1.5-3.5mm",
          "selected": true,
          "warnings": [],
          "raw_value": "1.5-3.5mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "3.5",
              "rangeMax": "3.5",
              "rangeMin": "1.5",
              "rawValue": "1.5-3.5mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "1.5",
              "displayUnit": "mm",
              "numericText": "1.5-3.5",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1.5-3.5 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1.5-3.5 mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {
            "line": 12,
            "text": "B12 500KG/hr"
          },
          "original": false,
          "raw_text": "500KG/hr",
          "selected": true,
          "warnings": [],
          "raw_value": "500KG/hr",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "capacity",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "500",
              "unitRaw": "KG/hr",
              "rawValue": "500KG/hr",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "kg/h",
              "numericText": "500",
              "unitCanonical": "kg/h",
              "matchedAliasId": "7",
              "normalizedValue": "500 kg/h",
              "normalizedUnitRaw": "kg/h"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "500 kg/h",
            "normalized_field_name": "适合产量"
          },
          "field_name": "适合产量"
        },
        {
          "evidence": {
            "line": 7,
            "text": "[SEL] 不是"
          },
          "original": false,
          "raw_text": "不是",
          "selected": true,
          "warnings": [],
          "raw_value": "不是",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "specification_identical_to_original",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "不是",
            "normalized_field_name": "规格型号与原产品相同"
          },
          "field_name": "规格型号与原产品相同"
        },
        {
          "evidence": {
            "line": 8,
            "text": "[SEL] 不是"
          },
          "original": false,
          "raw_text": "不是",
          "selected": true,
          "warnings": [],
          "raw_value": "不是",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "specification_compatible_with_original",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "不是",
            "normalized_field_name": "规格型号与原产品互配"
          },
          "field_name": "规格型号与原产品互配"
        }
      ],
      "rawFieldCount": 0
    },
    {
      "itemIndex": 2,
      "itemName": "3层分配器",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {
            "line": [
              67,
              84
            ]
          },
          "original": false,
          "raw_text": "3层分配器",
          "selected": true,
          "warnings": [],
          "raw_value": "3",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "layer_count",
            "value_kind": "number",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "3",
            "normalized_field_name": "层数"
          },
          "field_name": "层数"
        }
      ],
      "rawFieldCount": 0
    }
  ]
}
```

### Candidate
```json
[
  {
    "id": 69,
    "candidateType": "value",
    "termType": "lower_lip_adjustment_method",
    "rawValue": "下模唇可预调节（粗调）",
    "normalizedRawValue": "下模唇可预调节粗调",
    "proposedCanonicalValue": "lower_adjustable_lip",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B21",
      "text": "[SEL] 下模唇可预调节（粗调）",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 70,
    "candidateType": "value",
    "termType": "wiring_method",
    "rawValue": "精诚标准接线",
    "normalizedRawValue": "精诚标准接线",
    "proposedCanonicalValue": "jctimes_standard_wiring",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B33",
      "text": "[SEL] 精诚标准接线",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 82,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC+UPVC",
    "normalizedRawValue": "pvc+upvc",
    "proposedCanonicalValue": "PVC",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B73",
      "text": "PVC+UPVC",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 83,
    "candidateType": "value",
    "termType": "product_material",
    "rawValue": "A（1.2714A钢材）",
    "normalizedRawValue": "a1.2714a钢材",
    "proposedCanonicalValue": "1.2714_Forged",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B40",
      "text": "[SEL] A （ 1.2714A钢材）",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 95,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC",
    "normalizedRawValue": "pvc",
    "proposedCanonicalValue": "PVC",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "sourceRawValue": "PVC+UPVC",
      "splitFromRawValue": "PVC"
    }
  },
  {
    "id": 96,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "UPVC",
    "normalizedRawValue": "upvc",
    "proposedCanonicalValue": "UPVC",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "sourceRawValue": "PVC+UPVC",
      "splitFromRawValue": "UPVC"
    }
  },
  {
    "id": 97,
    "candidateType": "value",
    "termType": "product_material",
    "rawValue": "2714A钢",
    "normalizedRawValue": "2714a钢",
    "proposedCanonicalValue": "1.2714_Forged",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B82",
      "text": "[SEL] 2714A钢",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 98,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PVC",
    "normalizedRawValue": "pvc",
    "proposedCanonicalValue": "PVC",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "sourceRawValue": "PVC+UPVC",
      "splitFromRawValue": "PVC"
    }
  },
  {
    "id": 99,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "UPVC",
    "normalizedRawValue": "upvc",
    "proposedCanonicalValue": "UPVC",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "sourceRawValue": "PVC+UPVC",
      "splitFromRawValue": "UPVC"
    }
  },
  {
    "id": 390,
    "candidateType": "value",
    "termType": "heating_voltage",
    "rawValue": "460V",
    "normalizedRawValue": "460v",
    "proposedCanonicalValue": "460",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B78",
      "text": "(   460  V )",
      "sheet": "生产明细表",
      "phase1_snapshot": true,
      "phase1_snapshot_reason": [
        "non_enum_value_candidate"
      ]
    }
  },
  {
    "id": 673,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "1380mm",
    "normalizedRawValue": "1380mm",
    "proposedCanonicalValue": null,
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "line": 9,
      "text": "B9 1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
      "sourceRawValue": "1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
      "splitFromRawValue": "1380mm"
    }
  },
  {
    "id": 674,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "UPVC波浪板模头",
    "normalizedRawValue": "upvc波浪板模头",
    "proposedCanonicalValue": "UPVC",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "line": 9,
      "text": "B9 1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
      "sourceRawValue": "1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
      "splitFromRawValue": "UPVC波浪板模头"
    }
  },
  {
    "id": 675,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "可参考模头编号10682",
    "normalizedRawValue": "可参考模头编号10682",
    "proposedCanonicalValue": null,
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "line": 9,
      "text": "B9 1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
      "sourceRawValue": "1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
      "splitFromRawValue": "可参考模头编号10682"
    }
  },
  {
    "id": 2914,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "波浪板模头、可参考模头编号10682",
    "normalizedRawValue": "波浪板模头可参考模头编号10682",
    "proposedCanonicalValue": null,
    "status": "done_2914",
    "confidence": "0.72",
    "evidence": {
      "line": 9,
      "text": "B9 1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
      "sourceRawValue": "1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
      "suffixRawValue": "波浪板模头、可参考模头编号10682",
      "splitFromRawValue": "波浪板模头、可参考模头编号10682",
      "matchedMaterialTokens": [
        "PVC",
        "UPVC"
      ],
      "suffixCandidateTermType": "application"
    }
  },
  {
    "id": 3253,
    "candidateType": "value",
    "termType": "application",
    "rawValue": "波浪板",
    "normalizedRawValue": "波浪板",
    "proposedCanonicalValue": null,
    "status": "done_3253",
    "confidence": "0.72",
    "evidence": {
      "line": 9,
      "text": "B9 1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
      "routedBy": "plastic_material_residual_classifier",
      "sourceRawValue": "1380mm PVC+UPVC波浪板模头，可参考模头编号10682",
      "suffixRawValue": "波浪板",
      "splitFromRawValue": "波浪板",
      "matchedMaterialTokens": [
        "PVC",
        "UPVC"
      ],
      "suffixCandidateTermType": "application"
    }
  }
]
```

### Lines
- L1: 文件名：模头生产明细表（200142-E）2020-02-14-1380mmUPVC波浪板模头+三层分配器.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 客户ID：40226
- L14: [ ] 国内使用
- L15: [SEL] 出口使用
- L16: 国家(       )
- L17: option_set: {"options":[{"selected":false,"value":"国内使用"},{"selected":true,"value":"出口使用"}],"field":"客户ID"}
- L20: 合同编号：7191127
- L21: 合同规定交货日期：2020-04-20
- L24: 模具编号：200142-E下单日期：2020-02-14
- L25: 交货日期：2020-04-20
- L26: 完工日期：
- L30: [A7] 规格型号与原产品相同
- L33: 原产品编号（                          ）
- L38: [A8] 规格型号与原产品互配
- L41: 原产品编号（                        ）
- L51: [A10] 制品有效宽度
- L53: [A11] 制品有效厚度
- L59: [A13] 模头有效宽度
- L62: [A14] 模头宽度调节方式
- L70: [A15] 模唇厚度调节范围
- L71: [B15] 模唇厚度调节范围（        ）
- L73: 上下文：模唇厚度调节范围
- L80: [A17] 模唇数量
- L82: [ ] 上模唇（           ）套
- L83: [ ] 下模唇（         ）套
- L85: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L87: [A18] 模唇调节方式
- L88: [B18] [ ] 上模唇采用减力推、拉式机械装置微调结构，下模唇可更换或固定。（90°）
- L89: option_set: {"options":[{"selected":false,"value":"上模唇采用减力推、拉式机械装置微调结构，下模唇可更换或固定。（90°）"}]}
- L91: 上下文：模唇调节方式
- L97: 上下文：模唇调节方式
- L103: 上下文：模唇调节方式
- L104: [B21] [SEL] 下模唇可预调节（粗调）
- L105: option_set: {"options":[{"selected":true,"value":"下模唇可预调节（粗调）"}]}
- L107: 上下文：模唇调节方式
- L108: [B22] [ ] 下模唇固定、并可更换
- L109: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L111: 上下文：模唇调节方式
- L112: [B23] [ ] 下模整体结构
- L113: option_set: {"options":[{"selected":false,"value":"下模整体结构"}]}
- L115: 上下文：模唇调节方式
- L130: [ ] 上模
- L131: [ ] 下模   ）
- L134: [ ] 上模
- L135: [ ] 下模   ）
- L136: option_set: {"options":[{"selected":true,"value":"有     分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"},{"selected":true,"value":"70° 阻流棒"},{"sele
- L138: [A27] 流道形式
- L142: [ ] 模内多流道
- L144: option_set: {"options":[{"selected":true,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":false,"value":"其他"}]}
- L146: [A28] 加热方式
- L148: [SEL] 不锈钢加热棒
- L149: [ ] 加热板
- L151: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L153: [A29] 模头加热分区
- L156: 两侧板
- L159: 模唇
- L164: [A30] 模唇加热方式
- L166: [ ] 加热棒
- L171: [ ] 加热板
- L172: option_set: {"options":[{"selected":false,"value":"加热棒"},{"selected":false,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":false,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L174: [A31] 加热电压
- L177: [A32] 每区功率
- L179: [A33] 接线方式
- L181: [ ] 带护罩全封闭接线
- L182: [ ] 模体开槽接线
- L183: [SEL] 精诚标准接线
- L184: option_set: {"options":[{"selected":false,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":true,"value":"精诚标准接线"}]}
- L199: [A36] 侧板接插件
- L205: [A37] 热电偶孔
- L207: [ ] 上模
- L208: [ ] 下模
- L211: option_set: {"options":[{"selected":false,"value":"上模"},{"selected":false,"value":"下模"}]}
- L213: [A38] 热电偶孔规格
- L215: [SEL] 根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。
- L216: [ ] 客户要求
- L217: option_set: {"options":[{"selected":true,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。"},{"selected":false,"value":"客户要求"}]}
- L222: [A40] 模头材料选用
- L232: 模唇表面粗糙度：
- L237: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L250: 表面镀层要求：
- L254: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L258: 流道表面镀层厚度：
- L263: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L267: 流道表面镀层硬度：
- L270: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L274: 外表面镀层厚度：
- L279: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L281: [A48] 模头安装方式
- L286: [ ] 45°斜挤出安装
- L290: option_set: {"options":[{"selected":true,"value":"平挤出"},{"selected":false,"value":"其他"},{"selected":false,"value":"45°斜挤出安装    （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":false,"value":"45°挤出微调朝下"}]}
- L292: [A49] 平挤出安装方式时
- L293: [B49] 支架孔规格、型号（                                                     ）
- L295: 上下文：平挤出安装方式时
- L303: [A51] 其它安装方式时
- L304: [B51] 吊装孔规格、型号（                                                     ）
- L306: 上下文：其它安装方式时
- L307: [B52] 吊装时中心距、规格（                                                  ）
- L310: [B53] 平挤出安装方式时，在模头（                            ）边
- L313: [B54] 其他安装方式时，在模头（                                ）边
- L315: [A55] 进料口方式
- L317: [ ] 中央圆口进料
- L318: [SEL] 中央方口进料
- L319: [ ] 其他形状或不同位置进料
- L320: option_set: {"options":[{"selected":false,"value":"中央圆口进料"},{"selected":true,"value":"中央方口进料"},{"selected":false,"value":"其他形状或不同位置进料"}]}
- L322: [A56] 进料口尺寸
- L328: [A57] 配合三辊进料方式
- L330: [ ] 中、上辊进料
- L331: [ ] 中、下辊进料
- L333: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}

## Document 28 模头生产明细表（202064-E）2020-06-18-2200mm PC 中空板模头.xls

- extractionResultId: 14326
- approxBlocksTokens: 5990
- candidates: 17

### Normalized
```json
{
  "documentInfo": {
    "order_number": {
      "value": "",
      "rawKey": "order_number",
      "evidence": {
        "line": 0,
        "text": ""
      },
      "confidence": 0,
      "canonicalKey": "order_number"
    },
    "customer_notes": [
      {
        "evidence": {
          "line": 6,
          "text": "要求打JCTIMES 标志! 请注意交货时间，逾期客户会追索罚款！"
        },
        "raw_text": "要求打JCTIMES 标志! 请注意交货时间，逾期客户会追索罚款！",
        "raw_value": "要求打JCTIMES 标志! 请注意交货时间，逾期客户会追索罚款！",
        "field_name": "标志要求/备注",
        "item_index": 1,
        "document_id": "28",
        "extraction_result_id": "14326"
      }
    ],
    "product_number": {
      "value": "202064-E",
      "rawKey": "product_number",
      "evidence": {
        "line": 15,
        "text": "模具编号：202064-E"
      },
      "confidence": 1,
      "canonicalKey": "product_number"
    },
    "contract_number": {
      "value": "7200218",
      "rawKey": "contract_number",
      "evidence": {
        "line": 23,
        "text": "合同编号：7200218"
      },
      "confidence": 1,
      "canonicalKey": "contract_number"
    }
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "2200mm PC 中空板模头",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {
            "line": 8,
            "text": "2200mm PC 中空板模头"
          },
          "original": false,
          "raw_text": "2200mm PC 中空板模头",
          "selected": true,
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀",
              "raw_value": "PC",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "PC",
          "confidence": 0.9,
          "dictionary": {
            "values": [
              {
                "rawValue": "PC",
                "confidence": 1,
                "displayName": "PC",
                "canonicalValue": "PC"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 1,
            "value_kind": "enums",
            "display_name": "PC",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "PC",
            "normalized_value": "pc",
            "material_prefix_split": {
              "sourceRawValue": "PC",
              "matchedMaterialTokens": [
                "PC"
              ]
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {
            "line": 9,
            "text": "制品有效宽度\n[B9] 2100mm"
          },
          "original": false,
          "raw_text": "2100mm",
          "selected": true,
          "warnings": [],
          "raw_value": "2100mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "2100",
              "unitRaw": "mm",
              "rawValue": "2100mm",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "2100",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "2100 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "2100 mm",
            "normalized_field_name": "制品有效宽度"
          },
          "field_name": "制品有效宽度"
        },
        {
          "evidence": {
            "line": 10,
            "text": "制品有效厚度\n[B10] 4-6mm"
          },
          "original": false,
          "raw_text": "4-6mm",
          "selected": true,
          "warnings": [],
          "raw_value": "4-6mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "6",
              "rangeMax": "6",
              "rangeMin": "4",
              "rawValue": "4-6mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "4",
              "displayUnit": "mm",
              "numericText": "4-6",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "4-6 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "4-6 mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {
            "line": 11,
            "text": "适合产量\n[B11] （产量350 kg/hr）"
          },
          "original": false,
          "raw_text": "产量350 kg/hr",
          "selected": true,
          "warnings": [],
          "raw_value": "产量350 kg/hr",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "capacity",
            "value_kind": "number_unit",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "产量350 kg/hr",
            "normalized_field_name": "产量"
          },
          "field_name": "产量"
        },
        {
          "evidence": {
            "line": 12,
            "text": "模头有效宽度\n[B12] 2200mm"
          },
          "original": false,
          "raw_text": "2200mm",
          "selected": true,
          "warnings": [],
          "raw_value": "2200mm",
          "confidence": 0.95,
          "dictionary": {
            "matched": true,
            "term_type": "die_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "value": "2200",
              "unitRaw": "mm",
              "rawValue": "2200mm",
              "warnings": [],
              "numberKind": "single",
              "displayUnit": "mm",
              "numericText": "2200",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "2200 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "2200 mm",
            "normalized_field_name": "模头有效宽度"
          },
          "field_name": "模头有效宽度"
        },
        {
          "evidence": {
            "line": 13,
            "text": "模头宽度调节方式\n[B13]\n[ ] 外堵式\n（）\n[ ] 外堵丝杆\n[ ] 内堵式\n[ ] 其他"
          },
          "original": false,
          "raw_text": "外堵式、外堵丝杆、内堵式",
          "selected": false,
          "warnings": [],
          "raw_value": "",
          "confidence": 0.9,
          "dictionary": {
            "matched": false,
            "field_matched": false
          },
          "field_name": "模头宽度调节方式"
        },
        {
          "evidence": {
            "line": 14,
            "text": "模唇厚度调节范围\n[B14] 模唇厚度调节范围（                ）"
          },
          "original": false,
          "raw_text": "模唇厚度调节范围（                ）",
          "selected": false,
          "warnings": [
            {
              "type": "empty_value",
              "message": "字段值为空，已跳过字典匹配",
              "evidence": {
                "line": 14,
                "text": "模唇厚度调节范围\n[B14] 模唇厚度调节范围（                ）"
              },
              "raw_value": "",
              "field_name": "模唇厚度调节范围",
              "item_index": 1
            }
          ],
          "raw_value": "",
          "confidence": 0.9,
          "dictionary": {
            "matched": false,
            "field_matched": false
          },
          "field_name": "模唇厚度调节范围"
        },
        {
          "evidence": {
            "line": 16,
            "text": "模唇数量\n[B16]\n[ ] 上模唇（           ）套\n[ ] 下模唇（         ）套\n[ ] 其他"
          },
          "original": false,
          "raw_text": "上模唇（           ）套、下模唇（         ）套",
          "selected": false,
          "warnings": [],
          "raw_value": "",
          "confidence": 0.9,
          "dictionary": {
            "matched": false,
            "field_matched": false
          },
          "field_name": "模唇数量"
        },
        {
          "evidence": {
            "line": 18,
            "rule": "runtime_qualifier_matcher",
            "text": "模唇调节方式\n[B18]\n[ ] 上模减力推拉\n[SEL] 手动推式微调",
            "qualifier": {
              "area": "lip",
              "position": "upper_die",
              "sourceText": "上模"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "唇调节方式",
                  "qualifier": {
                    "area": "lip",
                    "position": "upper_die",
                    "sourceText": "上模"
                  }
                },
                "before": {
                  "fieldName": "上模唇调节方式"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the field name into structured qualifier metadata.",
                "confidence": 0.86,
                "relationType": "qualifier_variant",
                "recommendedAction": "map_as_qualifier_variant"
              }
            ],
            "qualifierKey": "upper_die",
            "baseFieldName": "唇调节方式",
            "qualifierKind": "position",
            "qualifierRule": "runtime_qualifier_matcher",
            "originalFieldName": "上模唇调节方式",
            "qualifierSourceText": "上模",
            "matchedQualifierAlias": "上模"
          },
          "original": false,
          "raw_text": "手动推式微调",
          "selected": true,
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "手动推式微调",
              "field_name": "唇调节方式",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 1,
            "candidate_id": "1901",
            "candidate_type": "term_type",
            "raw_field_name": "唇调节方式",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "lip",
            "position": "upper_die",
            "sourceText": "上模"
          },
          "raw_value": "手动推式微调",
          "confidence": 0.95,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "手动推式微调",
            "normalized_field_name": "唇调节方式"
          },
          "field_name": "唇调节方式"
        },
        {
          "evidence": {
            "line": 20,
            "rule": "runtime_qualifier_matcher",
            "text": "模唇调节方式\n[B20] [ ] 下模唇可预调节\n[B21] [ ] 下模唇固定、并可更换\n[B22] [ ] 下模整体结构",
            "qualifier": {
              "area": "lip",
              "position": "lower_die",
              "sourceText": "下模"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "唇调节方式",
                  "qualifier": {
                    "area": "lip",
                    "position": "lower_die",
                    "sourceText": "下模"
                  }
                },
                "before": {
                  "fieldName": "下模唇调节方式"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the f
```

### Candidate
```json
[
  {
    "id": 48,
    "candidateType": "value",
    "termType": "lip_heating_method",
    "rawValue": "加热棒",
    "normalizedRawValue": "加热棒",
    "proposedCanonicalValue": "heating_rod",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B29",
      "text": "[SEL] 加热棒",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 50,
    "candidateType": "value",
    "termType": "other_surface_roughness",
    "rawValue": "A级（0.03-0.04μm)",
    "normalizedRawValue": "a级0.030.04μm",
    "proposedCanonicalValue": "A级（0.03-0.04μm)",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B42",
      "text": "[SEL] A级（0.03-0.04μm)",
      "sheet": "生产明细表",
      "phase1_snapshot": true,
      "phase1_snapshot_reason": [
        "non_enum_value_candidate",
        "text_value_candidate"
      ]
    }
  },
  {
    "id": 52,
    "candidateType": "value",
    "termType": "channel_plating_hardness",
    "rawValue": "Rockwellc65—70",
    "normalizedRawValue": "rockwellc65—70",
    "proposedCanonicalValue": "Rockwellc65-70",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B45",
      "text": "[SEL] Rockwellc65—70",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 57,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "LDPE LLDPE",
    "normalizedRawValue": "ldpelldpe",
    "proposedCanonicalValue": "plastic_material:LDPE|plastic_material:LLDPE",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "LDPE LLDPE",
      "splitFromRawValue": "LDPE LLDPE"
    }
  },
  {
    "id": 79,
    "candidateType": "value",
    "termType": "product_material",
    "rawValue": "A （1.2714A）",
    "normalizedRawValue": "a1.2714a",
    "proposedCanonicalValue": "1.2714_Forged",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B39",
      "text": "[SEL] A （1.2714A）",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 84,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "PC",
    "normalizedRawValue": "pc",
    "proposedCanonicalValue": "PC",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B8",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 85,
    "candidateType": "value",
    "termType": "upper_lip_adjustment_method",
    "rawValue": "其他（上、下模唇均采用全推式弹性微调）",
    "normalizedRawValue": "其他上下模唇均采用全推式弹性微调",
    "proposedCanonicalValue": "upper_lip_adjustment_method:上下模唇全推式弹性微调（中空专用）|lower_lip_adjustment_method:上下模唇全推式弹性微调（中空专用）",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B23",
      "text": "[SEL] 其他（上、下模唇均采用全推式弹性微调）",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 86,
    "candidateType": "value",
    "termType": "flow_channel_type",
    "rawValue": "中空板专用流道",
    "normalizedRawValue": "中空板专用流道",
    "proposedCanonicalValue": "hollow_sheet_specific_manifold",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B26",
      "text": "[SEL] 其他\n中空板专用流道",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 87,
    "candidateType": "value",
    "termType": "feed_inlet_method",
    "rawValue": "中央上下双椭圆口进料",
    "normalizedRawValue": "中央上下双椭圆口进料",
    "proposedCanonicalValue": "center_double_oval_feed",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B54",
      "text": "[SEL] 其他形状\n中央上下双椭圆口进料",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 91,
    "candidateType": "value",
    "termType": "flow_channel_type",
    "rawValue": "其他 中空板专用流道",
    "normalizedRawValue": "其他中空板专用流道",
    "proposedCanonicalValue": "hollow_sheet_specific_manifold",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B26",
      "text": "[SEL] 其他\n中空板专用流道",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 92,
    "candidateType": "value",
    "termType": "feed_inlet_method",
    "rawValue": "其他形状 中央上下双椭圆口进料",
    "normalizedRawValue": "其他形状中央上下双椭圆口进料",
    "proposedCanonicalValue": "center_double_oval_feed",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B54",
      "text": "[SEL] 其他形状\n中央上下双椭圆口进料",
      "sheet": "生产明细表"
    }
  },
  {
    "id": 100,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "LDPE",
    "normalizedRawValue": "ldpe",
    "proposedCanonicalValue": "LDPE",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "LDPE LLDPE",
      "splitFromRawValue": "LDPE"
    }
  },
  {
    "id": 101,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "LLDPE",
    "normalizedRawValue": "lldpe",
    "proposedCanonicalValue": "LLDPE",
    "status": "approved",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "LDPE LLDPE",
      "splitFromRawValue": "LLDPE"
    }
  },
  {
    "id": 102,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "LDPE",
    "normalizedRawValue": "ldpe",
    "proposedCanonicalValue": "LDPE",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "LDPE LLDPE",
      "splitFromRawValue": "LDPE"
    }
  },
  {
    "id": 103,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "LLDPE",
    "normalizedRawValue": "lldpe",
    "proposedCanonicalValue": "LLDPE",
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "LDPE LLDPE",
      "splitFromRawValue": "LLDPE"
    }
  },
  {
    "id": 104,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "LDPE",
    "normalizedRawValue": "ldpe",
    "proposedCanonicalValue": "LDPE",
    "status": "done_104",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "LDPE LLDPE",
      "splitFromRawValue": "LDPE"
    }
  },
  {
    "id": 105,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "LLDPE",
    "normalizedRawValue": "lldpe",
    "proposedCanonicalValue": "LLDPE",
    "status": "done_105",
    "confidence": null,
    "evidence": {
      "cell": "B7",
      "text": "LDPE LLDPE",
      "sheet": "Sheet1",
      "sourceRawValue": "LDPE LLDPE",
      "splitFromRawValue": "LLDPE"
    }
  }
]
```

### Lines
- L1: 文件名：模头生产明细表（202064-E）2020-06-18-2200mm PC 中空板模头.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 模具编号：202064-E
- L14: 客户ID：40228
- L15: [ ] 国内使用
- L17: 国家(     俄罗斯                      )
- L21: 合同编号：7200218
- L22: 合同规定交货日期：
- L26: 下单日期：2020-06-18
- L27: 交货日期：2020-11-8
- L28: 完工日期：
- L29: 实际发货日期：
- L31: [A6] 》》》要求打JCTIMES 标志! 请注意交货时间，逾期客户会追索罚款！
- L33: [A7] 规格型号与原产品互配
- L36: 原产品编号（             ）
- L45: [A9] 制品有效宽度
- L48: [A10] 制品有效厚度
- L54: [A12] 模头有效宽度
- L57: [A13] 模头宽度调节方式
- L66: [A14] 模唇厚度调节范围
- L67: [B14] 模唇厚度调节范围（                ）
- L69: 上下文：模唇厚度调节范围
- L76: [A16] 模唇数量
- L78: [ ] 上模唇（           ）套
- L79: [ ] 下模唇（         ）套
- L81: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L83: [A17] 模唇调节方式
- L85: 上下文：模唇调节方式
- L87: [ ] 上模减力推拉
- L89: option_set: {"options":[{"selected":false,"value":"上模减力推拉"},{"selected":true,"value":"手动推式微调"}]}
- L91: 上下文：模唇调节方式
- L97: 上下文：模唇调节方式
- L98: [B20] [ ] 下模唇可预调节
- L99: option_set: {"options":[{"selected":false,"value":"下模唇可预调节"}]}
- L101: 上下文：模唇调节方式
- L102: [B21] [ ] 下模唇固定、并可更换
- L103: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L105: 上下文：模唇调节方式
- L106: [B22] [ ] 下模整体结构
- L107: option_set: {"options":[{"selected":false,"value":"下模整体结构"}]}
- L109: 上下文：模唇调节方式
- L110: [B23] [SEL] 其他（上、下模唇均采用全推式弹性微调）
- L111: option_set: {"options":[{"selected":true,"value":"其他（上、下模唇均采用全推式弹性微调）"}]}
- L124: [ ] 上模
- L125: [ ] 下模   ）
- L126: option_set: {"options":[{"selected":false,"value":"有           分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"}]}
- L128: [A26] 流道形式
- L132: [ ] 模内多流道
- L134: 中空板专用流道
- L135: option_set: {"options":[{"selected":false,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":true,"value":"其他"}]}
- L137: [A27] 加热方式
- L139: [SEL] 不锈钢加热棒
- L140: [ ] 加热板
- L142: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L144: [A28] 模头加热分区
- L147: 两侧板
- L150: 模唇
- L155: [A29] 模唇加热方式
- L157: [SEL] 加热棒
- L162: [ ] 加热板
- L163: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":true,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L165: [A30] 加热电压
- L168: [A31] 每区功率
- L170: [A32] 接线方式
- L172: [SEL] 带护罩全封闭接线
- L173: [ ] 模体开槽接线
- L175: option_set: {"options":[{"selected":true,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":false,"value":"其他"}]}
- L190: [A35] 侧板接插件
- L196: [A36] 热电偶孔
- L201: [A37] 热电偶孔规格
- L203: [SEL] 根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。
- L204: [ ] 客户要求
- L205: option_set: {"options":[{"selected":true,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。"},{"selected":false,"value":"客户要求"}]}
- L210: [A39] 模头材料选用
- L221: 模唇表面粗糙度：
- L226: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L239: 表面镀层要求：
- L243: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L247: 流道表面镀层厚度：
- L252: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L256: 流道表面镀层硬度：
- L259: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L263: 外表面镀层厚度：
- L268: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L270: [A47] 模头安装方式
- L275: [ ] 45°斜挤出安装 （分为：
- L278: option_set: {"options":[{"selected":true,"value":"平挤出"},{"selected":false,"value":"下挤出"},{"selected":false,"value":"其他"},{"selected":false,"value":"45°斜挤出安装 （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":false,"value":"45°挤出微调朝下"
- L280: [A48] 平挤出安装方式时
- L281: [B48] 支架孔规格、型号（                                                     ）
- L283: 上下文：平挤出安装方式时
- L291: [A50] 其它安装方式时
- L292: [B50] 吊装孔规格、型号（                                                     ）
- L294: 上下文：其它安装方式时
- L295: [B51] 吊装时中心距、规格（                                                  ）
- L298: [B52] 平挤出安装方式时，在模头（                            ）边
- L301: [B53] 其他安装方式时，在模头（                                ）边
- L303: [A54] 进料口方式
- L305: [ ] 中央圆口进料
- L306: [ ] 中央方口进料
- L308: 中央上下双椭圆口进料
- L309: option_set: {"options":[{"selected":false,"value":"中央圆口进料"},{"selected":false,"value":"中央方口进料"},{"selected":true,"value":"其他形状"}]}
- L311: [A55] 进料口尺寸
- L318: [A56] 配合三辊进料方式
- L320: [ ] 中、上辊进料
- L321: [ ] 中、下辊进料
- L323: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}
- L327: [ ] 有　　数量：共（         ）件
- L329: option_set: {"options":[{"selected":false,"value":"有　　数量：共（         ）件"},{"selected":false,"value":"没有"}]}
- L331: [A58] 连接器加热方式
- L333: [ ] 不锈钢加热圈

## Document 29 模头生产明细表（203131-E）2020-10-27-1200mm APET PETG片材模头.xls

- extractionResultId: 14328
- approxBlocksTokens: 5970
- candidates: 1

### Normalized
```json
{
  "documentInfo": {
    "customer_notes": [
      {
        "evidence": {
          "line": 6,
          "text": "》》》要求打JCTIMES 标志!"
        },
        "raw_text": "》》》要求打JCTIMES 标志!",
        "raw_value": "要求打JCTIMES 标志!",
        "field_name": "标志要求/备注",
        "item_index": 1,
        "document_id": "29",
        "extraction_result_id": "14328"
      },
      {
        "evidence": {},
        "raw_text": "要求打JCTIMES 标志! 加急",
        "raw_value": "要求打JCTIMES 标志! 加急",
        "field_name": "标志要求/备注",
        "item_index": 2,
        "document_id": "29",
        "extraction_result_id": "14328"
      }
    ]
  },
  "items": [
    {
      "itemIndex": 1,
      "itemName": "1200mm APET PETG片材模头",
      "quantity": "1套",
      "fields": [
        {
          "evidence": {
            "line": 7,
            "text": "[SEL] 是"
          },
          "original": false,
          "raw_text": "是",
          "warnings": [],
          "raw_value": "是",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "specification_compatible_with_original",
            "value_kind": "boolean",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "是",
            "normalized_field_name": "规格型号与原产品互配"
          },
          "field_name": "规格型号与原产品互配"
        },
        {
          "evidence": {
            "line": 7,
            "text": "原产品编号（     180709        ）"
          },
          "original": false,
          "raw_text": "180709",
          "warnings": [],
          "raw_value": "180709",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "reference_product",
            "value_kind": "text",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "180709",
            "normalized_field_name": "参考产品编号"
          },
          "field_name": "参考产品编号"
        },
        {
          "evidence": {
            "line": 8,
            "text": "1200mm APET/PETG 片材模头"
          },
          "original": false,
          "raw_text": "1200mm APET/PETG 片材模头",
          "warnings": [
            {
              "type": "plastic_material_prefix_split_applied",
              "source": "material_prefix_split",
              "message": "塑料原料字段含产品/应用描述，已提取明确材料前缀并识别应用领域后缀",
              "raw_value": "1200mm APET/PETG 片材模头",
              "term_type": "plastic_material",
              "field_name": "适用塑料原料",
              "item_index": 1
            }
          ],
          "qualifier": {
            "area": "die_body",
            "sourceText": "模头"
          },
          "raw_value": "1200mm APET/PETG 片材模头",
          "confidence": 0.9,
          "dictionary": {
            "values": [
              {
                "rawValue": "APET",
                "confidence": 0.9,
                "displayName": "APET",
                "canonicalValue": "APET"
              },
              {
                "rawValue": "PETG",
                "confidence": 1,
                "displayName": "PETG",
                "canonicalValue": "PETG"
              }
            ],
            "matched": true,
            "term_type": "plastic_material",
            "confidence": 0.9,
            "value_kind": "enums",
            "display_name": "APET",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "APET",
            "normalized_value": "1200mmapet/petg片材模头",
            "material_prefix_split": {
              "sourceRawValue": "1200mm APET/PETG 片材模头",
              "suffixRawValue": "片材模头",
              "matchedMaterialTokens": [
                "APET",
                "PETG"
              ],
              "suffixCandidateTermType": "application"
            },
            "normalized_field_name": "适用塑料原料"
          },
          "field_name": "适用塑料原料"
        },
        {
          "evidence": {
            "line": 10,
            "text": "0.2-1.2mm"
          },
          "original": false,
          "raw_text": "0.2-1.2mm",
          "warnings": [],
          "raw_value": "0.2-1.2mm",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "product_effective_thickness",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "1.2",
              "rangeMax": "1.2",
              "rangeMin": "0.2",
              "rawValue": "0.2-1.2mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "0.2",
              "displayUnit": "mm",
              "numericText": "0.2-1.2",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "0.2-1.2 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "0.2-1.2 mm",
            "normalized_field_name": "制品有效厚度"
          },
          "field_name": "制品有效厚度"
        },
        {
          "evidence": {
            "line": 11,
            "text": "产量400 kg/hr"
          },
          "original": false,
          "raw_text": "产量400 kg/hr",
          "warnings": [],
          "raw_value": "产量400 kg/hr",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "capacity",
            "value_kind": "number_unit",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "产量400 kg/hr",
            "normalized_field_name": "产量"
          },
          "field_name": "产量"
        },
        {
          "evidence": {
            "line": 12,
            "text": "1200-800mm"
          },
          "original": false,
          "raw_text": "1200-800mm",
          "warnings": [],
          "raw_value": "1200-800mm",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "die_effective_width",
            "value_kind": "number_unit",
            "number_unit": {
              "unitRaw": "mm",
              "rangeEnd": "800",
              "rangeMax": "1200",
              "rangeMin": "800",
              "rawValue": "1200-800mm",
              "warnings": [],
              "numberKind": "range",
              "rangeStart": "1200",
              "displayUnit": "mm",
              "numericText": "1200-800",
              "unitCanonical": "mm",
              "matchedAliasId": "13",
              "normalizedValue": "1200-800 mm",
              "normalizedUnitRaw": "mm"
            },
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "1200-800 mm",
            "normalized_field_name": "模头有效宽度"
          },
          "field_name": "模头有效宽度"
        },
        {
          "evidence": {
            "line": 13,
            "text": "[SEL] 外堵式"
          },
          "original": false,
          "raw_text": "外堵式",
          "warnings": [],
          "raw_value": "外堵式",
          "confidence": 0.9,
          "dictionary": {
            "note": "泛称普通外挡",
            "matched": true,
            "term_type": "deckle_type",
            "confidence": 1,
            "risk_level": "normal",
            "value_kind": "enum",
            "display_name": "普通外挡",
            "match_method": "alias_exact",
            "field_matched": true,
            "canonical_value": "external_standard_deckle",
            "normalized_value": "外堵式",
            "normalized_field_name": "堵边/调幅结构"
          },
          "field_name": "堵边 / 调幅结构"
        },
        {
          "evidence": {
            "line": 13,
            "text": "（单边200mm）"
          },
          "original": false,
          "raw_text": "单边200mm",
          "warnings": [],
          "raw_value": "单边200mm",
          "confidence": 0.9,
          "dictionary": {
            "matched": true,
            "term_type": "single_side_deckle_width",
            "value_kind": "number_unit",
            "match_method": "term_type_only",
            "field_matched": true,
            "normalized_value": "单边200mm",
            "normalized_field_name": "单边挡块宽度"
          },
          "field_name": "单边挡块宽度"
        },
        {
          "evidence": {
            "line": 18,
            "rule": "runtime_qualifier_matcher",
            "text": "[SEL] 手动推式微调",
            "qualifier": {
              "area": "lip",
              "position": "upper_die",
              "sourceText": "上模"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "唇调节方式",
                  "qualifier": {
                    "area": "lip",
                    "position": "upper_die",
                    "sourceText": "上模"
                  }
                },
                "before": {
                  "fieldName": "上模唇调节方式"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the field name into structured qualifier metadata.",
                "confidence": 0.86,
                "relationType": "qualifier_variant",
                "recommendedAction": "map_as_qualifier_variant"
              }
            ],
            "qualifierKey": "upper_die",
            "baseFieldName": "唇调节方式",
            "qualifierKind": "position",
            "qualifierRule": "runtime_qualifier_matcher",
            "originalFieldName": "上模唇调节方式",
            "qualifierSourceText": "上模",
            "matchedQualifierAlias": "上模"
          },
          "original": false,
          "raw_text": "手动推式微调",
          "warnings": [
            {
              "type": "term_type_no_match",
              "message": "字段名未命中字典，请人工确认",
              "raw_value": "手动推式微调",
              "field_name": "唇调节方式",
              "item_index": 1
            }
          ],
          "candidate": {
            "status": "pending",
            "item_index": 1,
            "candidate_id": "1901",
            "candidate_type": "term_type",
            "raw_field_name": "唇调节方式",
            "source_product_type": "flat_die"
          },
          "qualifier": {
            "area": "lip",
            "position": "upper_die",
            "sourceText": "上模"
          },
          "raw_value": "手动推式微调",
          "confidence": 0.9,
          "dictionary": {
            "matched": false,
            "match_method": "none",
            "field_matched": false,
            "normalized_value": "手动推式微调",
            "normalized_field_name": "唇调节方式"
          },
          "field_name": "唇调节方式"
        },
        {
          "evidence": {
            "line": 20,
            "rule": "runtime_qualifier_matcher",
            "text": "[SEL] 下模唇可预调节",
            "qualifier": {
              "area": "lip",
              "position": "lower_die",
              "sourceText": "下模"
            },
            "ruleSignals": [
              {
                "after": {
                  "fieldName": "唇调节方式",
                  "qualifier": {
                    "area": "lip",
                    "position": "lower_die",
                    "sourceText": "下模"
                  }
                },
                "before": {
                  "fieldName": "下模唇调节方式"
                },
                "ruleId": "structured_qualifier_normalized",
                "message": "Qualifier text was moved from the field name into structured qualifier metadata.",
                "confidence": 0.86,
                "relationType": "qualifier_variant",
                "recommendedAction": "map_as_qualifier_variant"
              }
            ],
            "qualifierKey": "lower_die",
            "baseFieldName": "唇调节方式",
            "qualifierKind": "position",
            "qualifierRule": "runtime_qualifier_matche
```

### Candidate
```json
[
  {
    "id": 725,
    "candidateType": "value",
    "termType": "plastic_material",
    "rawValue": "1200mm",
    "normalizedRawValue": "1200mm",
    "proposedCanonicalValue": null,
    "status": "auto_resolved",
    "confidence": null,
    "evidence": {
      "line": 8,
      "text": "1200mm APET/PETG 片材模头",
      "sourceRawValue": "1200mm APET/PETG 片材模头",
      "splitFromRawValue": "1200mm"
    }
  }
]
```

### Lines
- L1: 文件名：模头生产明细表（203131-E）2020-10-27-1200mm APET PETG片材模头.xls
- L2: 来源：local
- L3: 说明：
- L4: [SEL] 表示该选项被选中。
- L5: [ ] 表示该选项未选中。
- L6: 若文本出现结构化选项块（option_set），请优先按 selected 字段判断；仅当文本中没有结构化块时按 [SEL]/[ ] 推断。
- L7: [ ] 仅为未选中备选项，不输出为最终值。
- L8: 空括号表示未填写。
- L9: 文本中的 [A1]、[B7] 等表示 Excel 原始单元格坐标。
- L10: Sheet：生产明细表
- L11: Row 3:
- L12: [A3]
- L13: 模具编号：203131-E
- L14: 客户ID：40232
- L15: [ ] 国内使用
- L17: 国家(                           )
- L21: 合同编号：7201016
- L22: 合同规定交货日期：
- L26: 下单日期：2020-10-16
- L27: 交货日期：2020-12-10
- L28: 完工日期：
- L29: 实际发货日期：
- L33: [A7] 规格型号与原产品互配
- L36: 原产品编号（     180709        ）
- L44: [A9] 制品有效宽度
- L46: [A10] 制品有效厚度
- L52: [A12] 模头有效宽度
- L55: [A13] 模头宽度调节方式
- L64: [A14] 模唇厚度调节范围
- L65: [B14] 模唇厚度调节范围（                ）
- L67: 上下文：模唇厚度调节范围
- L74: [A16] 模唇数量
- L76: [ ] 上模唇（           ）套
- L77: [ ] 下模唇（         ）套
- L79: option_set: {"options":[{"selected":false,"value":"上模唇（           ）套"},{"selected":false,"value":"下模唇（         ）套"},{"selected":false,"value":"其他"}]}
- L81: [A17] 模唇调节方式
- L83: 上下文：模唇调节方式
- L85: [ ] 上模减力推拉
- L87: option_set: {"options":[{"selected":false,"value":"上模减力推拉"},{"selected":true,"value":"手动推式微调"}]}
- L89: 上下文：模唇调节方式
- L95: 上下文：模唇调节方式
- L96: [B20] [ ] 下模唇可预调节
- L97: option_set: {"options":[{"selected":false,"value":"下模唇可预调节"}]}
- L99: 上下文：模唇调节方式
- L100: [B21] [ ] 下模唇固定、并可更换
- L101: option_set: {"options":[{"selected":false,"value":"下模唇固定、并可更换"}]}
- L103: 上下文：模唇调节方式
- L104: [B22] [SEL] 下模整体结构
- L105: option_set: {"options":[{"selected":true,"value":"下模整体结构"}]}
- L107: 上下文：模唇调节方式
- L108: [B23] [ ] 其他（上、下模唇均采用全推式弹性微调）
- L109: option_set: {"options":[{"selected":false,"value":"其他（上、下模唇均采用全推式弹性微调）"}]}
- L122: [ ] 上模
- L123: [ ] 下模   ）
- L124: option_set: {"options":[{"selected":false,"value":"有           分为："},{"selected":false,"value":"45°阻流棒"},{"selected":false,"value":"90°阻流棒"},{"selected":false,"value":"上模"},{"selected":false,"value":"下模"}]}
- L126: [A26] 流道形式
- L130: [ ] 模内多流道
- L132: 中空板专用流道
- L133: option_set: {"options":[{"selected":false,"value":"衣架式"},{"selected":false,"value":"特殊支管式"},{"selected":false,"value":"模内多流道"},{"selected":true,"value":"其他"}]}
- L135: [A27] 加热方式
- L137: [SEL] 不锈钢加热棒
- L138: [ ] 加热板
- L140: option_set: {"options":[{"selected":true,"value":"不锈钢加热棒"},{"selected":false,"value":"加热板"},{"selected":false,"value":"其他"}]}
- L142: [A28] 模头加热分区
- L145: 两侧板
- L148: 模唇
- L153: [A29] 模唇加热方式
- L155: [SEL] 加热棒
- L160: [ ] 加热板
- L161: option_set: {"options":[{"selected":true,"value":"加热棒"},{"selected":false,"value":"油循环   (模温控制器配置："},{"selected":false,"value":"有"},{"selected":false,"value":"没有)"},{"selected":false,"value":"加热板"}]}
- L163: [A30] 加热电压
- L166: [A31] 每区功率
- L168: [A32] 接线方式
- L170: [SEL] 带护罩全封闭接线
- L171: [ ] 模体开槽接线
- L173: option_set: {"options":[{"selected":true,"value":"带护罩全封闭接线"},{"selected":false,"value":"模体开槽接线"},{"selected":false,"value":"其他"}]}
- L188: [A35] 侧板接插件
- L194: [A36] 热电偶孔
- L199: [A37] 热电偶孔规格
- L201: [SEL] 根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。
- L202: [ ] 客户要求
- L203: option_set: {"options":[{"selected":true,"value":"根据需方定做，需方未做说明时螺纹规格M12×1.5，热电偶由需方自配。"},{"selected":false,"value":"客户要求"}]}
- L208: [A39] 模头材料选用
- L219: 模唇表面粗糙度：
- L224: option_set: {"options":[{"selected":true,"value":"A级（0.02-0.03μm)"},{"selected":false,"value":"B级（0.04-0.05μm)"},{"selected":false,"value":"C级（0.05-0.06μm)"},{"selected":false,"value":"其他"}],"field":"模唇表面粗糙度"}
- L237: 表面镀层要求：
- L241: option_set: {"options":[{"selected":true,"value":"镀铬"},{"selected":false,"value":"镀镍磷合金"},{"selected":false,"value":"其他"}],"field":"表面镀层要求"}
- L245: 流道表面镀层厚度：
- L250: option_set: {"options":[{"selected":true,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"0.04-0.05mm"},{"selected":false,"value":"其他"}],"field":"流道表面镀层厚度"}
- L254: 流道表面镀层硬度：
- L257: option_set: {"options":[{"selected":true,"value":"Rockwellc65—70"},{"selected":false,"value":"其他"}],"field":"流道表面镀层硬度"}
- L261: 外表面镀层厚度：
- L266: option_set: {"options":[{"selected":true,"value":"0.01—0.02mm"},{"selected":false,"value":"0.02-0.03mm"},{"selected":false,"value":"0.03-0.04mm"},{"selected":false,"value":"其他"}],"field":"外表面镀层厚度"}
- L268: [A47] 模头安装方式
- L273: [ ] 45°斜挤出安装 （分为：
- L276: option_set: {"options":[{"selected":false,"value":"平挤出"},{"selected":true,"value":"下挤出"},{"selected":false,"value":"其他"},{"selected":false,"value":"45°斜挤出安装 （分为："},{"selected":false,"value":"45°挤出微调朝上"},{"selected":false,"value":"45°挤出微调朝下"
- L278: [A48] 平挤出安装方式时
- L279: [B48] 支架孔规格、型号（                                                     ）
- L281: 上下文：平挤出安装方式时
- L289: [A50] 其它安装方式时
- L290: [B50] 吊装孔规格、型号（                                                     ）
- L292: 上下文：其它安装方式时
- L293: [B51] 吊装时中心距、规格（                                                  ）
- L296: [B52] 平挤出安装方式时，在模头（                            ）边
- L299: [B53] 其他安装方式时，在模头（                                ）边
- L301: [A54] 进料口方式
- L303: [ ] 中央圆口进料
- L304: [SEL] 中央方口进料
- L306: option_set: {"options":[{"selected":false,"value":"中央圆口进料"},{"selected":true,"value":"中央方口进料"},{"selected":false,"value":"其他形状"}]}
- L308: [A55] 进料口尺寸
- L315: [A56] 配合三辊进料方式
- L317: [ ] 中、上辊进料
- L318: [ ] 中、下辊进料
- L320: option_set: {"options":[{"selected":false,"value":"中、上辊进料"},{"selected":false,"value":"中、下辊进料"},{"selected":false,"value":"其他形式"}]}
- L324: [ ] 有　　数量：共（         ）件
- L326: option_set: {"options":[{"selected":false,"value":"有　　数量：共（         ）件"},{"selected":false,"value":"没有"}]}
- L328: [A58] 连接器加热方式
- L330: [ ] 不锈钢加热圈
- L331: [ ] 铸铝加热圈
- L333: option_set: {"options":[{"selected":false,"value":"不锈钢加热圈"},{"selected":false,"value":"铸铝加热圈"},{"selected":false,"value":"其他"}]}
