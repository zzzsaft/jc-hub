import React, { useState, useEffect } from "react";
import { Cascader, Input, Button, Space, Form, App, AutoComplete } from "@/components/ui/core";
import type { CascaderProps } from "@/components/ui/core";

import AddressParse, { AREA, Utils } from "address-parse";
import { findKey } from "lodash-es";

const { TextArea } = Input;

interface AddressData {
  province?: string;
  city?: string;
  district?: string;
  details?: string | undefined;
}

interface AddressInputProps {
  value?: AddressData;
  onChange?: (value: AddressData) => void;
  addressOptions?: { value: string; label: string }[];
  disabled?: boolean;
}

interface AreaItem {
  value: string;
  label: string;
  children?: AreaItem[];
}
const AddressInput: React.FC<AddressInputProps> = ({
  value = {},
  disabled = false,
  onChange,
  addressOptions = [],
}) => {
  const { message } = App.useApp();
  const [areaOptions, setAreaOptions] = useState<AreaItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadAllAreaData = () => {
      try {
        const provinceList = AREA.province_list;
        const options = Object.entries(provinceList).map(
          ([provinceCode, provinceName]) => {
            // 获取当前省份下的城市
            const cities = Utils.getTargetAreaListByCode("city", provinceCode);
            const cityChildren = cities.map((city) => {
              // 获取当前城市下的区县
              const areas = Utils.getTargetAreaListByCode("area", city.code);
              const areaChildren = areas.map((area) => ({
                value: area.code,
                label: area.name,
              }));
              return {
                value: city.code,
                label: city.name,
                children: areaChildren,
              };
            });
            return {
              value: provinceCode,
              label: provinceName as string,
              children: cityChildren,
            };
          }
        );
        setAreaOptions(options);
      } catch (error) {
        message.error("加载地区数据失败");
        console.error("Error loading area data:", error);
      }
    };

    loadAllAreaData();
  }, []);
  // Handle AutoComplete selection
  const handleAutoCompleteSelect = (value1: string) => {
    // Update details first
    const newValue = {
      ...value,
      details: value1,
    };
    onChange?.(newValue);

    // Then parse the address
    parseAddress(value1);
  };

  // 解析地址
  const parseAddress = (inputText?: string) => {
    const details = inputText || value.details || "";
    if (!details.trim()) {
      message.warning("请输入地址内容");
      return;
    }
    setLoading(true);
    try {
      const [result, ...results] = AddressParse.parse(details, true);
      if (
        results.length == 0 ||
        (results.length != 0 && results[0].__parse < 2)
      ) {
        message.warning("地址解析可信度较低，请手动调整");
        return;
      }

      const newValue = {
        ...value,
        province: result.province,
        city: result.city,
        district: result.area,
        details: result.details,
      };
      onChange?.(newValue);
    } catch (error) {
      message.error("地址解析失败");
      console.error("地址解析错误:", error);
    }
  };

  // 处理级联选择变化
  const handleCascaderChange = (values: string[], selectedOptions: any[]) => {
    const newValue = {
      ...value,
      province: selectedOptions[0]?.label,
      city: selectedOptions[1]?.label,
      district: selectedOptions[2]?.label,
    };
    onChange?.(newValue);
  };

  // 处理详细地址变化
  const handleDetailsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.({
      ...value,
      details: e.target.value,
    });
  };

  // 获取当前选择的地区值
  const getCascaderValue = () => {
    if (!value?.province) return undefined;
    const provinceCode = findKey(
      AREA.province_list,
      (v) => v === value?.province
    );
    if (!provinceCode) return undefined;
    const result = [provinceCode];
    if (value?.city) {
      const cityCode = findKey(AREA.city_list, (v) => v === value?.city);
      if (cityCode) result.push(cityCode);
    }
    if (value?.district) {
      const areaCode = findKey(AREA.area_list, (v) => v === value?.district);
      if (areaCode) result.push(areaCode);
    }
    return result;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* 省市区选择器 */}
      <Cascader
        disabled={disabled}
        options={areaOptions}
        showSearch
        onChange={handleCascaderChange}
        value={getCascaderValue()}
        placeholder="请选择省市区"
      />

      {/* 详细地址（带自动完成） */}
      <div style={{ marginBottom: 0 }}>
        <AutoComplete
          disabled={disabled}
          value={value?.details ?? ""}
          options={addressOptions}
          onChange={(text) => onChange?.({ ...value, details: text })}
          onSelect={handleAutoCompleteSelect}
          placeholder="详细地址（街道、门牌号等）"
          style={{ width: "100%" }}
        >
          <TextArea
            autoSize={{ minRows: 2, maxRows: 4 }}
            style={{ width: "100%" }}
          />
        </AutoComplete>
      </div>

      {/* 解析按钮 */}
      <Button
        onClick={() => parseAddress()}
        // loading={loading}
        type="primary"
        style={{ width: "100%", alignSelf: "flex-start" }}
      >
        解析地址
      </Button>
    </div>
  );
};

export default AddressInput;
