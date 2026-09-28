import Link from "next/link";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

import type { KeyboardShortcut } from "~/providers/keyboard-shortcuts";
import LottieIcon from "~/components/LottieIcon";
import { useIsMobile } from "~/hooks/useMediaQuery";
import { useKeyboardShortcut } from "~/providers/keyboard-shortcuts";

const Button: React.FC<{
  href: string;
  current: boolean;
  name: string;
  json: object;
  isCollapsed?: boolean;
  onCloseSideNav?: () => void;
  keyboardShortcut: KeyboardShortcut;
}> = ({
  href,
  current,
  name,
  json,
  isCollapsed = false,
  keyboardShortcut,
  onCloseSideNav,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [index, setIndex] = useState(0);
  const isMobile = useIsMobile();
  const { keys: shortcutKeys } = useKeyboardShortcut(keyboardShortcut);

  const handleMouseEnter = () => {
    setIsHovered(true);
    setIndex((index) => index + 1);
  };

  const handleClick = () => {
    if (onCloseSideNav && isMobile) {
      onCloseSideNav();
    }
  };

  return (
    <Link
      href={href}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      className={twMerge(
        "group flex h-10 items-center rounded-lg px-2.5 text-sm font-medium leading-6 transition-colors hover:bg-white/10 hover:text-white",
        isCollapsed ? "md:justify-center" : "justify-between",
        current ? "bg-white text-brand-800 shadow-sm" : "text-blue-100",
      )}
      title={isCollapsed ? name : undefined}
    >
      <div
        className={twMerge(
          "flex items-center",
          isCollapsed
            ? "justify-start gap-x-3 md:justify-center md:gap-x-0"
            : "gap-x-3",
        )}
      >
        <LottieIcon index={index} json={json} isPlaying={isHovered} />
        <span className={twMerge(isCollapsed && "md:hidden")}>{name}</span>
      </div>
      {!isCollapsed && (
        <div className="hidden md:group-hover:inline-flex">{shortcutKeys}</div>
      )}
    </Link>
  );
};

export default Button;
