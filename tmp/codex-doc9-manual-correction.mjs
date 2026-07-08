export const doc9ManualExtraction = {
  extraction: {
    document_info: {
      "客户ID": "40211",
      "使用地区": "出口使用",
      "国家": "印度",
      "合同编号": "7180518",
      "合同规定交货日期": "2018-06-29",
      "product_number": "2018-231-E",
      "下单日期": "2018-05-29",
      "交货日期": "2018-6-29",
    },
    items: [
      {
        item_index: 1,
        item_name: "GD-E45计量泵泵体",
        item_quantity: "壹套",
        product_type_hint: {
          value: "metering_pump",
          raw_value: "计量泵",
          display_name: "计量泵",
          confidence: 0.99,
          evidence: { cell: "A6", text: "计量泵" },
        },
        raw_fields: [
          field("计量泵型号", "GD-E45", "B7", "GD-E45"),
          field("数量", "壹套", "B7", "壹套 [泵体序列号：2018060174]"),
          field("泵体序列号", "2018060174", "B7", "泵体序列号：2018060174"),
          field("计量泵配置", "泵体", "B8", "[SEL] 泵体"),
          field("产量", "150kg/h", "B9", "产量150kg/h"),
          field("适用塑料原料", "PP", "B10", "原料：PP"),
          field("排量", "46.3 cm3/rev", "B11", "46.3 cm3/rev"),
          field("转速", "10-130转可调/每分钟", "B12", "（  10－130  )转可调/每分钟"),
          field("电源电压及加热功率", "220V / 50Hz", "B13", "电源电压及加热功率： ( 220V )/( 50 Hz)"),
          field("加热功率", "5.5-7.5KW", "B13", "功率 ( 5.5-7.5 KW )"),
          field("加热方式", "加热棒", "B13", "[SEL] 加热棒"),
          field("紧固件", "12.9高强度", "B13", "紧固件（螺丝）：12.9高强度"),
          field("接线方式", "专用接线盒封闭接线", "B14", "接线方式：专用接线盒封闭接线"),
          field("泵体材料选用", "标准", "B15", "[SEL] 标准"),
          field("热电偶孔规格", "根据需方定做,热电偶由需方自配。", "B16", "[SEL] 根据需方定做,热电偶由需方自配。"),
          field("压力传感器孔尺寸", "按照客户要求", "B17", "按照客户要求"),
          field("连接器配置", "没有", "B19", "[SEL] 没有"),
          field("连接器加热方式", "不锈钢加热圈", "B20", "[SEL] 不锈钢加热圈"),
          field("计量泵说明书要求", "中英文", "B24", "[SEL] 中英文"),
          field("品牌标志", "古迪Goodee", "A6", ">>>打“古迪Goodee\"标志！"),
        ],
      },
    ],
  },
  warnings: [
    {
      type: "manual_correction_from_blocks",
      message: "Codex 人工读取 document_blocks 后补正 doc9 漏抽；未调用业务 LLM。",
      evidence: { documentId: 9 },
    },
  ],
};

function field(field_name, value, cell, text) {
  return {
    field_name,
    value,
    raw_text: String(value),
    selected: true,
    confidence: 0.98,
    evidence: { cell, text, source: "codex_manual_blocks_read" },
  };
}
