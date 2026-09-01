import { Menu, Transition } from "@headlessui/react";
import { t } from "@lingui/core/macro";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/router";
import { Fragment } from "react";
import { HiCheck, HiOutlineBell } from "react-icons/hi2";

import { api } from "~/utils/api";

export default function NotificationMenu({
  isCollapsed,
}: {
  isCollapsed: boolean;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: notifications = [] } = api.notification.list.useQuery({
    limit: 20,
  });
  const { data: unreadCount } = api.notification.unreadCount.useQuery(
    undefined,
    { refetchInterval: 60_000 },
  );

  const refreshNotifications = async () => {
    await Promise.all([
      utils.notification.list.invalidate(),
      utils.notification.unreadCount.invalidate(),
    ]);
  };

  const markAsRead = api.notification.markAsRead.useMutation({
    onSettled: refreshNotifications,
  });
  const markAllAsRead = api.notification.markAllAsRead.useMutation({
    onSettled: refreshNotifications,
  });

  const openNotification = async (notification: (typeof notifications)[number]) => {
    if (!notification.readAt) {
      await markAsRead.mutateAsync({
        notificationPublicId: notification.publicId,
      });
    }

    if (notification.card) {
      await router.push(`/cards/${notification.card.publicId}`);
    }
  };

  const unread = unreadCount?.count ?? 0;

  return (
    <Menu as="div" className="relative">
      <Menu.Button
        className="relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-light-900 hover:bg-light-200 dark:text-dark-900 dark:hover:bg-dark-200"
        title={t`Notifications`}
      >
        <HiOutlineBell className="h-5 w-5 shrink-0" />
        {!isCollapsed && <span>{t`Notifications`}</span>}
        {unread > 0 && (
          <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute bottom-0 left-full z-[100] ml-2 w-80 overflow-hidden rounded-lg border border-light-300 bg-light-50 shadow-xl focus:outline-none dark:border-dark-400 dark:bg-dark-200">
          <div className="flex items-center justify-between border-b border-light-300 px-3 py-2 dark:border-dark-400">
            <span className="font-semibold text-light-1000 dark:text-dark-1000">
              {t`Notifications`}
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllAsRead.mutate()}
                disabled={markAllAsRead.isPending}
                className="text-xs font-medium text-primary-600 hover:underline disabled:opacity-50 dark:text-primary-400"
              >
                {t`Mark all as read`}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto p-1">
            {notifications.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-light-700 dark:text-dark-700">
                {t`No notifications yet`}
              </p>
            ) : (
              notifications.map((notification) => (
                <Menu.Item key={notification.publicId}>
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className="flex w-full items-start gap-3 rounded-md px-3 py-3 text-left hover:bg-light-200 dark:hover:bg-dark-300"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        notification.readAt
                          ? "bg-transparent"
                          : "bg-primary-600 dark:bg-primary-400"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-light-1000 dark:text-dark-1000">
                        {notification.type === "mention"
                          ? t`You were mentioned in a comment`
                          : t`You have a new notification`}
                      </span>
                      {notification.card && (
                        <span className="mt-0.5 block truncate text-xs text-light-700 dark:text-dark-700">
                          {notification.card.title}
                        </span>
                      )}
                      <span className="mt-1 block text-xs text-light-600 dark:text-dark-800">
                        {formatDistanceToNow(notification.createdAt, {
                          addSuffix: true,
                        })}
                      </span>
                    </span>
                    {notification.readAt && (
                      <HiCheck className="mt-1 h-4 w-4 shrink-0 text-light-600 dark:text-dark-800" />
                    )}
                  </button>
                </Menu.Item>
              ))
            )}
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
