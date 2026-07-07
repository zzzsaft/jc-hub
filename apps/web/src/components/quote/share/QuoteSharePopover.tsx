import React, { useEffect, useState } from "react";
import {
  Popover,
  Button,
  Switch,
  Space,
  DatePicker,
  Row,
  message,
} from "@/components/ui/core";
import InputWithButton from "@/components/general/InputWithButton";
import { useAuthStore } from "@/store/useAuthStore";
import { useQuoteStore } from "@/store/useQuoteStore";
import dayjs, { Dayjs } from "dayjs";
import { ShareAltOutlined } from "@/components/ui/icons";
import { QuoteItem } from "@/types/types";
import { QuoteService } from "@/api/services/quote.service";

interface QuoteSharePopoverProps {
  quoteItem?: QuoteItem;
  quoteId?: number;
}

const QuoteSharePopover: React.FC<QuoteSharePopoverProps> = ({
  quoteItem,
  quoteId,
}) => {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [expireDate, setExpireDate] = useState<Dayjs>(dayjs().add(1, "day"));
  const [viewLink, setViewLink] = useState("");
  const [editLink, setEditLink] = useState("");
  const [viewUuid, setViewUuid] = useState("");
  const [editUuid, setEditUuid] = useState("");
  const [isExpired, setIsExpired] = useState(false);

  const shareUserName = useAuthStore((s) => s.name) || "";
  const customerName =
    useQuoteStore(
      (s) => s.quotes.find((q) => q.id === quoteId)?.customerName
    ) || "";
  const productName = quoteItem?.productName || "";

  const base = typeof window !== "undefined" ? window.location.origin : "";

  const refreshLinks = async (date: Dayjs) => {
    if (!quoteItem) return;
    setLoading(true);
    try {
      const view = await QuoteService.createShareLink(
        quoteItem.id,
        date.toDate(),
        false
      );
      const edit = await QuoteService.createShareLink(
        quoteItem.id,
        date.toDate(),
        true
      );
      setViewLink(`${base}/quote/share/${view.uuid}?pwd=${view.pwd}`);
      setEditLink(`${base}/quote/share/${edit.uuid}?pwd=${edit.pwd}`);
      setViewUuid(view.uuid);
      setEditUuid(edit.uuid);
      setIsExpired(date.isBefore(dayjs(), "day"));
    } finally {
      setLoading(false);
    }
  };

  const disableShare = async () => {
    if (!quoteItem) return;
    setLoading(true);
    try {
      await QuoteService.disableShare(quoteItem.id);
    } finally {
      setViewLink("");
      setEditLink("");
      setViewUuid("");
      setEditUuid("");
      setIsExpired(false);
      setLoading(false);
    }
  };

  const loadShareInfo = async () => {
    if (!quoteItem) return;
    setLoading(true);
    try {
      const info = await QuoteService.getShareLinks(quoteItem.id);
      if (info?.viewUuid) {
        setEnabled(true);
        setViewLink(`${base}/quote/share/${info.viewUuid}?pwd=${info.viewPwd}`);
        setEditLink(`${base}/quote/share/${info.editUuid}?pwd=${info.editPwd}`);
        setViewUuid(info.viewUuid);
        setEditUuid(info.editUuid);
        if (info.expiresAt) {
          const date = dayjs(info.expiresAt);
          setExpireDate(date);
          setIsExpired(date.isBefore(dayjs(), "day"));
        }
      } else {
        setEnabled(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSwitch = async (checked: boolean) => {
    if (checked) {
      await refreshLinks(expireDate);
    } else {
      await disableShare();
    }
    setEnabled(checked);
    setIsExpired(false);
  };

  const handleUpdateExpire = async () => {
    if (!viewUuid || !editUuid) return;
    setLoading(true);
    try {
      await QuoteService.updateExpire(viewUuid, expireDate.toDate());
      await QuoteService.updateExpire(editUuid, expireDate.toDate());
      setIsExpired(expireDate.isBefore(dayjs(), "day"));
      message.success("已更新");
    } catch (e) {
      message.error("更新失败");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (editable: boolean) => {
    const link = editable ? editLink : viewLink;
    const typeLabel = editable ? "（可编辑）" : "（仅浏览）";
    const text = `${shareUserName}向你分享了${customerName}的${productName}${typeLabel}点击以下链接${link}`;
    navigator.clipboard
      .writeText(text)
      .then(() => message.success("已复制"))
      .catch(() => message.error("复制失败"));
  };

  useEffect(() => {
    if (visible) {
      loadShareInfo();
    }
  }, [visible]);

  const content = (
    <Space direction="vertical">
      <div>
        <Switch
          checked={enabled}
          onChange={handleSwitch}
          loading={loading}
          style={isExpired ? { backgroundColor: "red" } : {}}
        />
        分享 {isExpired && <span style={{ color: "red" }}>已过期</span>}
      </div>
      {enabled && (
        <>
          <Row gutter={8} align="middle">
            <span>有效期至:</span>
            <DatePicker
              value={expireDate}
              onChange={(d) => d && setExpireDate(d)}
              disabledDate={(current) => {
                const diff = current
                  ? current.startOf("day").diff(dayjs().startOf("day"), "day")
                  : 0;
                return diff < 1 || diff > 3;
              }}
            />
            <Button
              type="primary"
              size="small"
              onClick={handleUpdateExpire}
              loading={loading}
            >
              确认
            </Button>
          </Row>
          <InputWithButton
            readOnly
            value={viewLink}
            addonBefore="查看"
            buttonText="复制"
            onButtonClick={() => handleCopy(false)}
          />
          <InputWithButton
            readOnly
            value={editLink}
            addonBefore="编辑"
            buttonText="复制"
            onButtonClick={() => handleCopy(true)}
          />
        </>
      )}
    </Space>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={visible}
      onOpenChange={setVisible}
    >
      <Button type="link" icon={<ShareAltOutlined />} />
    </Popover>
  );
};

export default QuoteSharePopover;
