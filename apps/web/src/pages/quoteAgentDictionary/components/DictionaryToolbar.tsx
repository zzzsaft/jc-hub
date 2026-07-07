import { Button, Input } from "@/components/ui/core";
import { PlusOutlined, SearchOutlined } from "@/components/ui/icons";

type Props = {
  keyword: string;
  loading: boolean;
  onKeywordChange: (keyword: string) => void;
  onReload: () => void;
  onCreateTermType: () => void;
};

export function DictionaryToolbar({
  keyword,
  loading,
  onKeywordChange,
  onReload,
  onCreateTermType,
}: Props) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <SearchOutlined className="pointer-events-none absolute left-2 top-2 text-slate-400" />
          <Input
            className="pl-7"
            value={keyword}
            placeholder="搜索 key、名称、alias"
            onChange={(event: any) => onKeywordChange(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onReload()}>{loading ? "刷新中" : "刷新"}</Button>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={onCreateTermType}
        >
          新增
        </Button>
      </div>
    </div>
  );
}
