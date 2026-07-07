import React, { useState, useEffect, useMemo } from "react";
import { Select, Spin, Avatar, Typography } from "@/components/ui/core";
import type { SelectProps } from "@/components/ui/core";
import { useDebounce } from "use-debounce";
import MemberAvatar from "./MemberAvatar"; // 假设你已经实现了这个组件
import { pinyin } from "pinyin-pro"; // 用于拼音搜索
import { useMemberStore } from "@/store/useMemberStore";

const { Text } = Typography;

interface Member {
  id: string;
  name: string;
  avatar?: string;
  department?: string;
}

interface MemberSelectProps extends Omit<SelectProps, "value" | "onChange"> {
  value?: string | Member;
  onChange?: (value: string | Member, member?: Member) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  initialDisplayCount?: number;
  mode?: "multiple" | "tags" | undefined;
  disabled?: boolean;
  /** 限制成员部门必须包含的关键字列表 */
  departmentKeywords?: string[];
}

const MemberSelect: React.FC<MemberSelectProps> = ({
  value,
  onChange,
  mode = undefined,
  placeholder = "搜索成员",
  style = { width: "100%" },
  initialDisplayCount = 5,
  disabled,
  departmentKeywords,
  ...restProps
}) => {
  const members = useMemberStore((state) => state.members);
  const fetchMembers = useMemberStore((state) => state.fetchMembers);
  const [options, setOptions] = useState<Member[]>([]);
  const [fetching, setFetching] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText] = useDebounce(searchText, 500);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const isValidDepartment = (member: Member) => {
    if (!departmentKeywords || departmentKeywords.length === 0) {
      return true;
    }
    return departmentKeywords.some((k) => member.department?.includes(k));
  };

  // 初始化加载成员
  useEffect(() => {
    if (members.length === 0 && !initialLoaded) {
      setFetching(true);
      fetchMembers()
        .then(() => setInitialLoaded(true))
        .finally(() => setFetching(false));
    }
  }, [members, fetchMembers, initialLoaded]);

  // 处理搜索
  useEffect(() => {
    const searchMembers = () => {
      if (!debouncedSearchText) {
        // 没有搜索词时显示前initialDisplayCount个成员
        setOptions(
          members.filter(isValidDepartment).slice(0, initialDisplayCount)
        );
        return;
      }

      setFetching(true);
      try {
        const filtered = members.filter((member) => {
          // 支持姓名、拼音首字母搜索

          const nameMatch = member.name.includes(debouncedSearchText);
          const pinyinMatch = pinyin(member.name, {
            pattern: "first",
            type: "array",
          })
            .join("")
            .toLowerCase()
            .includes(debouncedSearchText.toLowerCase());
          const pinyinMatchFull = pinyin(member.name, {
            pattern: "pinyin",
            toneType: "none",
            type: "array",
          })
            .join("")
            .toLowerCase()
            .includes(debouncedSearchText.toLowerCase());
          return nameMatch || pinyinMatch || pinyinMatchFull;
        }).filter(isValidDepartment);

        setOptions(filtered);
      } catch (error) {
        console.error("搜索成员失败:", error);
        setOptions([]);
      } finally {
        setFetching(false);
      }
    };

    searchMembers();
  }, [debouncedSearchText, members, initialDisplayCount]);

  const splitOrg = (org: string) => {
    const deps = org.split("/");
    if (deps.length > 2) {
      return `${deps[0]}/../${deps.at(-1)}`;
    }
    return org;
  };

  const selectOptions: SelectProps["options"] = useMemo(() => {
    return options.map((member) => ({
      label: (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div>
            <Text>{member.name}</Text>
            {member.department && (
              <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                {splitOrg(member.department)}
              </Text>
            )}
          </div>
        </div>
      ),
      value: member.id,
      key: member.id,
      member,
    }));
  }, [options]);

  const handleSearch = (value: string) => {
    setSearchText(value);
  };

  const handleChange = (value: string, option: any) => {
    if (onChange) {
      onChange(value, option.member);
    }
  };

  return (
    <Select
      disabled={disabled}
      showSearch
      mode={mode}
      value={typeof value === "object" ? value?.id : value}
      placeholder={placeholder}
      style={style}
      defaultActiveFirstOption={false}
      filterOption={false}
      onSearch={handleSearch}
      onChange={handleChange}
      notFoundContent={fetching ? <Spin size="small" /> : "无匹配成员"}
      options={selectOptions}
      loading={fetching}
      allowClear
      {...restProps}
      labelRender={(props) => {
        const memberId = props.value;
        const member = [...members, ...options].find((m) => m.id === memberId);

        return member ? (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            style={{
              display: mode === "multiple" ? "inline-flex" : "inline",
              alignItems: "center",
              height: "100%",
            }}
          >
            <MemberAvatar
              id={member.id}
              size={20}
              padding={mode === "multiple" ? 0 : 10}
            />
          </div>
        ) : (
          <span>{memberId}</span>
        );
      }}
    />
  );
};

export default MemberSelect;
