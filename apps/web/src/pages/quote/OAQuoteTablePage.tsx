import React from "react";
import { Typography } from "@/components/ui/core";
import QuoteTable from "@/components/quote/QuoteTable";

const OAQuoteTablePage: React.FC = () => {
  return (
    <>
      <Typography.Title level={3}>OA报价单</Typography.Title>
      <QuoteTable type="oa" />
    </>
  );
};

export default OAQuoteTablePage;
