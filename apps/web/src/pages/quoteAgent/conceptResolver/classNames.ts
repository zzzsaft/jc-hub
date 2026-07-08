import detailStyles from "./detail.module.less";
import feedbackStyles from "./feedback.module.less";
import proposalStyles from "./proposal.module.less";
import styles from "./styles.module.less";
import tableStyles from "./table.module.less";

const crStyles: Record<string, string> = {
  ...styles,
  ...proposalStyles,
  ...tableStyles,
  ...detailStyles,
  ...feedbackStyles,
};

export function cr(...classes: Array<string | false | null | undefined>) {
  return classes
    .flatMap((className) => String(className || "").split(/\s+/))
    .filter(Boolean)
    .map((className) => className.startsWith("cr-") ? crStyles[className] ?? className : className)
    .join(" ");
}
