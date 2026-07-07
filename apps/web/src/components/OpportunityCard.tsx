import { Card, Tag, Space, Typography, Divider, Tooltip } from "@/components/ui/core";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { Opportunity } from "../store/useQuoteStore";

const { Text, Title } = Typography;

const statusTagColor = {
  none: "gray",
  quoting: "blue",
  reviewing: "orange",
  completed: "green",
};

const statusText = {
  none: "未报价",
  quoting: "报价中",
  reviewing: "审核中",
  completed: "报价完成",
};

const OpportunityCard: React.FC<{
  opportunity: Opportunity;
  onClick?: () => void;
}> = ({ opportunity, onClick }) => {
  const navigate = useNavigate();

  const [showAllProducts, setShowAllProducts] = useState(false);

  // 处理产品名称显示
  const renderProductName = (name: string) => {
    if (name.length <= 5) return name;
    return (
      <Tooltip title={name}>
        <span>{name.substring(0, 5)}...</span>
      </Tooltip>
    );
  };
  // 处理产品显示
  const displayedProducts = showAllProducts
    ? opportunity.products
    : opportunity.products.slice(0, 2);

  const hasMoreProducts = opportunity.products.length > 2;

  return (
    <Card
      hoverable
      onClick={onClick}
      style={{
        width: "100%",
        maxWidth: 600,
        marginBottom: 16,
        cursor: "pointer",
        // minWidth: 350,
      }}
      styles={{
        body: { padding: "16px 20px" },
      }}
    >
      {/* 商机名称和状态 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4,
        }}
      >
        <Title level={5} style={{ margin: 0 }}>
          {opportunity.name}
        </Title>
        <Tag color={statusTagColor[opportunity.latestQuoteStatus]}>
          {statusText[opportunity.latestQuoteStatus]}
        </Tag>
      </div>

      {/* 客户名称和负责人 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <Text
          type="secondary"
          style={{
            fontSize: 12,
            color: "#faad14",
            marginRight: 8,
          }}
        >
          @{opportunity.customer.name}
        </Text>

        <Space size={8}>
          {/* 客户负责人 */}
          {opportunity.customer.charger &&
            opportunity.customer.charger !== opportunity.charger && (
              <Tooltip title="客户负责人">
                {" "}
                <Tag color="gold" style={{ margin: 0 }}>
                  {opportunity.customer.charger}
                </Tag>
              </Tooltip>
            )}

          {/* 商机负责人 */}
          <Tooltip title="商机负责人">
            <Tag color="cyan" style={{ margin: 0 }}>
              {opportunity.charger}
            </Tag>
          </Tooltip>
        </Space>
      </div>

      <Divider style={{ margin: "8px 0" }} />

      {/* 产品列表和右侧信息 */}
      <div style={{ display: "flex" }}>
        {/* 产品列表 */}
        <div style={{ flex: 1, marginBottom: 12 }}>
          {displayedProducts.map((product, index) => (
            <div key={index} style={{ marginBottom: 4 }}>
              <Text type="secondary">{product.productCategory.at(-1)}: </Text>
              <Text>{renderProductName(product.productName)}</Text>
            </div>
          ))}

          {hasMoreProducts && !showAllProducts && (
            <Tooltip
              title={
                <div>
                  {opportunity.products.slice(2).map((product, index) => (
                    <div key={index}>
                      {product.productCategory.at(-1)}: {product.productName}
                    </div>
                  ))}
                </div>
              }
            >
              <Text type="secondary" style={{ fontSize: 12 }}>
                ...还有{opportunity.products.length - 2}个产品
              </Text>
            </Tooltip>
          )}
        </div>

        {/* 右侧信息 */}
        <div style={{ width: 120, marginLeft: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <Text type="secondary">报价次数: {opportunity.quoteCount}</Text>
          </div>
          <div>
            <Text type="secondary">
              日期: {dayjs(opportunity.createdAt).format("YYYY-MM-DD")}
            </Text>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default OpportunityCard;
