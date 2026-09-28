import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "@headlessui/react";
import { t } from "@lingui/core/macro";
import { env } from "next-runtime-env";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { HiBolt } from "react-icons/hi2";
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
} from "react-icons/tb";
import { twMerge } from "tailwind-merge";

import type { Subscription } from "@kan/shared/utils";
import { hasActiveSubscription } from "@kan/shared/utils";

import type { KeyboardShortcut } from "~/providers/keyboard-shortcuts";
import boardsIconDark from "~/assets/boards-dark.json";
import boardsIconLight from "~/assets/boards-light.json";
import membersIconDark from "~/assets/members-dark.json";
import membersIconLight from "~/assets/members-light.json";
import settingsIconDark from "~/assets/settings-dark.json";
import settingsIconLight from "~/assets/settings-light.json";
import templatesIconDark from "~/assets/templates-dark.json";
import templatesIconLight from "~/assets/templates-light.json";
import ButtonComponent from "~/components/Button";
import NotificationMenu from "~/components/NotificationMenu";
import ReactiveButton from "~/components/ReactiveButton";
import UserMenu from "~/components/UserMenu";
import WorkspaceMenu from "~/components/WorkspaceMenu";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

interface SideNavigationProps {
  user: UserType;
  isLoading: boolean;
  onCloseSideNav?: () => void;
}

interface UserType {
  displayName?: string | null | undefined;
  email?: string | null | undefined;
  image?: string | null | undefined;
}

export default function SideNavigation({
  user,
  isLoading,
  onCloseSideNav,
}: SideNavigationProps) {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isInitialised, setIsInitialised] = useState(false);

  const { data: workspaceData } = api.workspace.byId.useQuery(
    { workspacePublicId: workspace.publicId },
    { enabled: !!workspace.publicId && workspace.publicId.length >= 12 },
  );

  const subscriptions = workspaceData?.subscriptions as
    | Subscription[]
    | undefined;

  useEffect(() => {
    const savedState = localStorage.getItem("kan_sidebar-collapsed");
    if (savedState !== null) {
      setIsCollapsed(Boolean(JSON.parse(savedState)));
    }
    setIsInitialised(true);
  }, []);

  useEffect(() => {
    if (isInitialised) {
      localStorage.setItem(
        "kan_sidebar-collapsed",
        JSON.stringify(isCollapsed),
      );
    }
  }, [isCollapsed, isInitialised]);

  const { pathname } = router;

  const { resolvedTheme } = useTheme();

  const isCloudEnv = env("NEXT_PUBLIC_KAN_ENV") === "cloud";

  const isDarkMode = resolvedTheme === "dark";

  const navigation: {
    name: string;
    href: string;
    icon: object;
    keyboardShortcut: KeyboardShortcut;
  }[] = [
    {
      name: t`Boards`,
      href: "/boards",
      icon: isDarkMode ? boardsIconDark : boardsIconLight,
      keyboardShortcut: {
        type: "SEQUENCE",
        strokes: [{ key: "G" }, { key: "B" }],
        action: () => router.push("/boards"),
        group: "NAVIGATION",
        description: t`Go to boards`,
      },
    },
    {
      name: t`Private files`,
      href: "/private-files",
      icon: isDarkMode ? boardsIconDark : boardsIconLight,
      keyboardShortcut: {
        type: "SEQUENCE",
        strokes: [{ key: "G" }, { key: "F" }],
        action: () => router.push("/private-files"),
        group: "NAVIGATION",
        description: t`Go to private files`,
      },
    },
    {
      name: t`Templates`,
      href: "/templates",
      icon: isDarkMode ? templatesIconDark : templatesIconLight,
      keyboardShortcut: {
        type: "SEQUENCE",
        strokes: [{ key: "G" }, { key: "T" }],
        action: () => router.push("/templates"),
        group: "NAVIGATION",
        description: t`Go to templates`,
      },
    },
    {
      name: t`Members`,
      href: "/members",
      icon: isDarkMode ? membersIconDark : membersIconLight,
      keyboardShortcut: {
        type: "SEQUENCE",
        strokes: [{ key: "G" }, { key: "M" }],
        action: () => router.push("/members"),
        group: "NAVIGATION",
        description: t`Go to members`,
      },
    },
    {
      name: t`Settings`,
      href: "/settings",
      icon: isDarkMode ? settingsIconDark : settingsIconLight,
      keyboardShortcut: {
        type: "SEQUENCE",
        strokes: [{ key: "G" }, { key: "S" }],
        action: () => router.push("/settings"),
        group: "NAVIGATION",
        description: t`Go to settings`,
      },
    },
  ];

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <>
      <nav
        className={twMerge(
          "flex h-full w-60 flex-col justify-between bg-gradient-to-b from-brand-800 via-brand-700 to-brand-900 p-3 shadow-xl md:border-r-0 md:py-0 md:pl-0",
          isCollapsed && "md:w-auto",
        )}
      >
        <div>
          <div className="mx-3 hidden h-[72px] items-center justify-between border-b border-white/15 md:flex">
            {!isCollapsed && (
              <Link href="/" className="block">
                <Image
                  src="/branding/cakra-motor-11-logo.png"
                  alt="Cakra Motor 11"
                  width={132}
                  height={37}
                  className="h-9 w-[132px] object-contain"
                  priority
                />
              </Link>
            )}
            <Button
              onClick={toggleCollapse}
              className={twMerge(
                "flex h-8 items-center justify-center rounded-md text-white/80 hover:bg-white/15 hover:text-white",
                isCollapsed ? "w-full" : "w-8",
              )}
            >
              {isCollapsed ? (
                <TbLayoutSidebarLeftExpand size={18} className="text-white" />
              ) : (
                <TbLayoutSidebarLeftCollapse size={18} className="text-white" />
              )}
            </Button>
          </div>
          <div className={twMerge("px-3", isCollapsed && "md:px-0")}>
            <WorkspaceMenu isCollapsed={isCollapsed} />
            <ul role="list" className="space-y-1">
              {navigation.map((item) => (
                <li key={item.name}>
                  <ReactiveButton
                    href={item.href}
                    current={pathname.includes(item.href)}
                    name={item.name}
                    json={item.icon}
                    isCollapsed={isCollapsed}
                    onCloseSideNav={onCloseSideNav}
                    keyboardShortcut={item.keyboardShortcut}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          className={twMerge(
            "space-y-1 border-t border-white/15 px-3 pt-3",
            isCollapsed && "md:px-0",
          )}
        >
          <NotificationMenu isCollapsed={isCollapsed} />
          <UserMenu
            displayName={user.displayName ?? undefined}
            email={user.email ?? "Email not provided?"}
            imageUrl={user.image ?? undefined}
            isLoading={isLoading}
            isCollapsed={isCollapsed}
            onCloseSideNav={onCloseSideNav}
          />
          {isCloudEnv &&
            !hasActiveSubscription(subscriptions, "pro") &&
            !hasActiveSubscription(subscriptions, "team") && (
              <div className={twMerge(isCollapsed && "flex justify-center")}>
                {isCollapsed ? (
                  <ButtonComponent
                    iconLeft={<HiBolt />}
                    variant="secondary"
                    href={`/upgrade/select-plan?plan=pro&workspacePublicId=${workspace.publicId}&returnUrl=${encodeURIComponent("/settings/billing")}`}
                    aria-label={t`Start free trial`}
                    title={t`Start free trial`}
                    iconOnly
                  />
                ) : (
                  <ButtonComponent
                    iconLeft={<HiBolt />}
                    fullWidth
                    variant="secondary"
                    href={`/upgrade/select-plan?plan=pro&workspacePublicId=${workspace.publicId}&returnUrl=${encodeURIComponent("/settings/billing")}`}
                  >
                    {t`Start free trial`}
                  </ButtonComponent>
                )}
              </div>
            )}
        </div>
      </nav>
    </>
  );
}
