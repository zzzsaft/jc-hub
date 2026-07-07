import detailStyles from "./detail.module.less";
import styles from "./styles.module.less";

const archiveStyles: Record<string, string> = {
  ...styles,
  ...detailStyles,
};

export function archiveClass(...classes: Array<string | false | null | undefined>) {
  return classes
    .flatMap((className) => String(className || "").split(/\s+/))
    .filter(Boolean)
    .map((className) =>
      className.startsWith("qa-archive-") || className.startsWith("qa-doc-") || className.startsWith("qa-version-")
        ? archiveStyles[className] ?? className
        : className,
    )
    .join(" ");
}
