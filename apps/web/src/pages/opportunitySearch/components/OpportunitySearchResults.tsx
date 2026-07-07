import { Button, Empty, Spin } from "@/components/ui/core";
import { PlusOutlined } from "@/components/ui/icons";
import OpportunityCard from "@/components/OpportunityCard";
import styles from "../opportunitySearchPage.module.less";

type OpportunitySearchResultsProps = {
  loading: boolean;
  opportunities: any[];
  onCreate: () => void;
  onCardClick: (opportunity: any) => void;
};

export function OpportunitySearchResults({ loading, opportunities, onCreate, onCardClick }: OpportunitySearchResultsProps) {
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" />
      </div>
    );
  }

  if (opportunities.length > 0) {
    return (
      <div className={styles.opportunityGrid}>
        {opportunities.map((opportunity) => (
          <OpportunityCard key={opportunity.id} opportunity={opportunity} onClick={() => onCardClick(opportunity)} />
        ))}
      </div>
    );
  }

  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <span>
          没有搜索到商机
          <br />
          <Button type="link" icon={<PlusOutlined />} onClick={onCreate} className={styles.createButton}>
            点击创建商机
          </Button>
        </span>
      }
      className={styles.emptyContainer}
    />
  );
}

