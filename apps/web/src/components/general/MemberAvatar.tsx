import React, { useEffect } from "react";
import { Avatar, Button, Popover, Tag } from "@/components/ui/core";
import type { PopoverProps } from "@/components/ui/core";
import { useMemberStore } from "@/store/useMemberStore";
import { getLocation } from "@/utils/wecom";

interface Member {
  id: string;
  name: string;
  avatar?: string;
  department?: string;
}

interface MemberAvatarProps {
  id: string;
  size?: number;
  padding?: number;
  showPopover?: boolean;
  tagStyle?: React.CSSProperties;
  avatarStyle?: React.CSSProperties;
}

const MemberAvatar: React.FC<MemberAvatarProps> = ({
  id,
  size = 24,
  padding = 10,
  showPopover = true,
  tagStyle,
  avatarStyle,
}) => {
  const fetchMembers = useMemberStore((state) => state.fetchMembers);
  const member = useMemberStore((state) =>
    state.members.find((m) => m.id == id)
  );
  useEffect(() => {
    if (!member) fetchMembers();
  }, [fetchMembers, member]);
  // 默认Tag样式
  const defaultTagStyle: React.CSSProperties = {
    backgroundColor: "#f5f5f5",
    border: "none",
    borderRadius: 8,
    padding: "3px 8px",
    marginLeft: 8,
    cursor: "pointer",
    transition: "all 0.3s",
    ...tagStyle,
  };

  // 悬停时的Tag样式
  const hoverTagStyle: React.CSSProperties = {
    ...defaultTagStyle,
    backgroundColor: "#e6e6e6",
  };

  // Popover内容
  const popoverContent = (
    <div style={{ padding: 8 }}>
      <div>
        <strong>ID:</strong> {member?.id}
      </div>
      {member?.department && (
        <div>
          <strong>部门:</strong> {member.department}
        </div>
      )}
    </div>
  );

  // 头像和名字组合
  const avatarWithName = (
    <Button
      type="text"
      style={{
        display: "flex",
        alignItems: "center",
        paddingLeft: padding,
        paddingRight: padding,
        paddingTop: 0,
        paddingBottom: 0,
      }}
      onClick={(e) => {
        e.stopPropagation(); // 阻止事件冒泡
      }}
    >
      <Avatar
        src={member?.avatar}
        size={size}
        style={{
          marginRight: 0,
          ...avatarStyle,
        }}
      >
        {member?.name.charAt(0)}
      </Avatar>
      <span>{member?.name}</span>
    </Button>
  );

  // 带Popover的Tag
  const renderWithPopover = () => (
    <Popover
      content={popoverContent}
      trigger="click"
      placement="top"
      classNames={{ root: "member-avatar-popover" }}
    >
      {avatarWithName}
    </Popover>
  );

  // 不带Popover的普通显示
  const renderWithoutPopover = () => (
    <Tag
      style={defaultTagStyle}
      // hoverStyle={hoverTagStyle}
    >
      {avatarWithName}
    </Tag>
  );

  return showPopover ? renderWithPopover() : renderWithoutPopover();
};

export default MemberAvatar;
