import React from "react";
import type { ButtonProps } from "@/components/ui/core";
import { ExtruderFormItem } from "./ExtruderFormItem";
import TailFormListWrapper from "./TailFormListWrapper";

const ExtruderForm = ({
  items,
  count,
  creatorButtonProps = { position: "bottom" },
}: {
  items: string[];
  count?: number;
  creatorButtonProps?:
    | false
    | (ButtonProps & {
        creatorButtonText?: React.ReactNode;
        position?: "top" | "bottom";
      })
    | undefined;
}) => {
  return (
    <TailFormListWrapper
      name="extruderModel"
      label="挤出机型号"
      min={count}
      max={count}
      canCreate={!count}
      canDelete={!count}
      formItems={<ExtruderFormItem items={items} />}
    />
  );
};

export default ExtruderForm;
