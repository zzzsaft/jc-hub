import React from "react";
import { ScrewFormItem } from "./ScrewFormItem";
import TailFormListWrapper from "./TailFormListWrapper";

const ScrewForm = ({
  items,
  creatorButtonProps = false,
}: {
  items: string[];
  creatorButtonProps?: false | undefined;
}) => {
  return (
    <TailFormListWrapper
      name="screwList"
      label="螺杆明细"
      canCreate={!!creatorButtonProps}
      canDelete
      copyable
      creatorButtonProps={creatorButtonProps || undefined}
      formItems={<ScrewFormItem items={items} />}
    />
  );
};

export default ScrewForm;
