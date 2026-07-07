import React, { useState, useMemo, useEffect } from "react";
import { Select, Spin } from "@/components/ui/core";
import type { SelectProps } from "@/components/ui/core";
import { useDebounce } from "use-debounce";
import { SearchOutlined } from "@/components/ui/icons";
import { CompanyOption } from "@/types/types";
import { CustomerService } from "@/api/services/customer.service";

interface CompanySearchSelectProps {
  value?: CompanyOption | string;
  onChange?: (value: CompanyOption) => void;
  fetchOptions?: (searchText: string) => Promise<CompanyOption[]>;
  placeholder?: string;
  style?: React.CSSProperties;
}

const CompanySearchSelect: React.FC<CompanySearchSelectProps> = ({
  value,
  onChange,
  fetchOptions = CustomerService.searchCompanies,
  placeholder = "请输入公司名称搜索",
  style,
}) => {
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [fetching, setFetching] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText] = useDebounce(searchText, 500);
  const [initialValueLoaded, setInitialValueLoaded] = useState(false);
  // 处理初始值
  useEffect(() => {
    if (value && !initialValueLoaded) {
      if (typeof value === "object" && value.name) {
        // 如果value是完整的CompanyOption对象，直接添加到options中
        setOptions([value]);
        setInitialValueLoaded(true);
      } else if (typeof value === "string") {
        // 如果value是ID字符串，可能需要异步获取对应的完整对象
        const fetchInitialValue = async () => {
          setFetching(true);
          try {
            // 假设有一个根据ID获取公司的方法
            // const data = await CustomerService.getCompanyById(value);
            // if (data) {
            //   setOptions([data]);
            // }
          } catch (error) {
            console.error("获取初始公司失败:", error);
          } finally {
            setFetching(false);
            setInitialValueLoaded(true);
          }
        };
        fetchInitialValue();
      }
    }
  }, [value, initialValueLoaded]);
  // useEffect(() => {
  //   console.log(value);
  // }, [value]);
  React.useEffect(() => {
    if (!debouncedSearchText) {
      setOptions([]);
      return;
    }

    const search = async () => {
      setFetching(true);
      try {
        const data = await fetchOptions(debouncedSearchText);
        setOptions(data);
      } catch (error) {
        console.error("搜索公司失败:", error);
        setOptions([]);
      } finally {
        setFetching(false);
      }
    };

    search();
  }, [debouncedSearchText, fetchOptions]);

  const handleSearch = (value: string) => {
    setSearchText(value);
  };

  const selectOptions: SelectProps["options"] = useMemo(
    () =>
      options.map((item) => ({
        label: item.name,
        value: item.jdyid,
        key: item.erpid,
        ...item,
      })),
    [options]
  );

  const handleChange = (value: string, option: any) => {
    // console.log(value, option);
    if (onChange) {
      if (Array.isArray(option)) {
        onChange(option[0]);
      } else {
        onChange(option);
      }
    }
  };

  return (
    <Select
      showSearch
      value={typeof value === "object" ? value?.name : value}
      placeholder={placeholder}
      style={style}
      defaultActiveFirstOption={false}
      filterOption={false}
      onSearch={handleSearch}
      onChange={handleChange}
      notFoundContent={fetching ? <Spin size="small" /> : null}
      options={selectOptions}
      loading={fetching}
      suffixIcon={<SearchOutlined />}
    />
  );
};

export default CompanySearchSelect;
