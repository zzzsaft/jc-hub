import React, { useEffect } from "react";
import { Typography } from "@/components/ui/core";
import QuoteTable from "@/components/quote/QuoteTable";
import { useAuthStore } from "@/store/useAuthStore";

const TodoQuoteTablePage: React.FC = () => {
  const userId = useAuthStore((state) => state.userid);
  useEffect(() => {
    console.log(useAuthStore.getState());
    console.log(userId);
  });
  return (
    <>
      <Typography.Title level={3}>代办任务</Typography.Title>
      <QuoteTable type="history" currentApprover={userId ?? ""} />
      {/* <QuoteTable type="oa" approvalNode="项目支持,报价单" /> */}
    </>
  );
};

export default TodoQuoteTablePage;
