import React from "react";

type IconProps = React.HTMLAttributes<HTMLSpanElement> & {
  style?: React.CSSProperties;
};

const makeIcon =
  (symbol: string) =>
  ({ className, style, ...props }: IconProps) => (
    <span
      aria-hidden="true"
      className={className}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", ...style }}
      {...props}
    >
      {symbol}
    </span>
  );

const SearchIcon = ({ className, style, ...props }: IconProps) => (
  <span
    aria-hidden="true"
    className={className}
    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", ...style }}
    {...props}
  >
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  </span>
);

const EditIcon = ({ className, style, ...props }: IconProps) => (
  <span
    aria-hidden="true"
    className={className}
    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", ...style }}
    {...props}
  >
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  </span>
);

const svgIcon =
  (paths: React.ReactNode) =>
  ({ className, style, ...props }: IconProps) => (
    <span
      aria-hidden="true"
      className={className}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", ...style }}
      {...props}
    >
      <svg
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        {paths}
      </svg>
    </span>
  );

export const MenuFoldOutlined = makeIcon("=");
export const MenuUnfoldOutlined = makeIcon("=");
export const UserOutlined = makeIcon("U");
export const HomeOutlined = svgIcon(
  <>
    <path d="m3 10 9-7 9 7" />
    <path d="M5 10v10h14V10" />
    <path d="M9 20v-6h6v6" />
  </>,
);
export const SettingOutlined = makeIcon("*");
export const LogoutOutlined = makeIcon("<");
export const SearchOutlined = SearchIcon;
export const PlusOutlined = makeIcon("+");
export const DeleteOutlined = makeIcon("x");
export const EditOutlined = EditIcon;
export const HistoryOutlined = svgIcon(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const FileTextOutlined = svgIcon(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
    <path d="M14 3v6h6" />
    <path d="M8 13h8" />
    <path d="M8 17h6" />
  </>,
);
export const InboxOutlined = svgIcon(
  <>
    <path d="M4 4h16v12H4z" />
    <path d="M4 16l3 4h10l3-4" />
    <path d="M8 10h8" />
  </>,
);
export const CheckSquareOutlined = svgIcon(
  <>
    <path d="M4 4h16v16H4z" />
    <path d="m8 12 3 3 5-6" />
  </>,
);
export const LayoutOutlined = svgIcon(
  <>
    <path d="M4 5h16v14H4z" />
    <path d="M4 10h16" />
    <path d="M10 10v9" />
  </>,
);
export const FileSearchOutlined = svgIcon(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7" />
    <path d="M14 3v6h6" />
    <path d="M9 14h2" />
    <circle cx="16.5" cy="16.5" r="3" />
    <path d="m19 19 2 2" />
  </>,
);
export const ClusterOutlined = svgIcon(
  <>
    <circle cx="7" cy="7" r="3" />
    <circle cx="17" cy="7" r="3" />
    <circle cx="12" cy="17" r="3" />
    <path d="m9.5 8.5 5 0" />
    <path d="m8.5 9.5 2 4" />
    <path d="m15.5 9.5-2 4" />
  </>,
);
export const DatabaseOutlined = svgIcon(
  <>
    <ellipse cx="12" cy="5" rx="7" ry="3" />
    <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
    <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
  </>,
);
export const LinkOutlined = makeIcon(">");
export const QuestionCircleOutlined = makeIcon("?");
export const HolderOutlined = makeIcon("#");
export const ShareAltOutlined = makeIcon(">");
export const DownOutlined = makeIcon("v");
export const FullscreenOutlined = makeIcon("[]");
export const FullscreenExitOutlined = makeIcon("][");
export const CheckOutlined = makeIcon("ok");
export const CloseCircleOutlined = makeIcon("x");
export const CopyOutlined = makeIcon("copy");
