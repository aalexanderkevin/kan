import Link from "next/link";
import { t } from "@lingui/core/macro";
import { motion } from "framer-motion";
import {
  HiArrowUpRight,
  HiOutlineRectangleStack,
  HiOutlineStar,
  HiStar,
  HiViewColumns,
} from "react-icons/hi2";

import Button from "~/components/Button";
import { Tooltip } from "~/components/Tooltip";
import { usePermissions } from "~/hooks/usePermissions";
import { useModal } from "~/providers/modal";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

export function BoardsList({
  isTemplate,
  archived = false,
}: {
  isTemplate?: boolean;
  archived?: boolean;
}) {
  const { workspace } = useWorkspace();
  const { openModal } = useModal();
  const { canCreateBoard } = usePermissions();

  const utils = api.useUtils();
  const updateBoard = api.board.update.useMutation({
    onSuccess: () => {
      void utils.board.all.invalidate();
    },
  });

  const { data, isLoading } = api.board.all.useQuery(
    {
      workspacePublicId: workspace.publicId,
      type: isTemplate ? "template" : "regular",
      archived: archived,
    },
    { enabled: workspace.publicId ? true : false },
  );

  const handleToggleFavorite = (
    e: React.MouseEvent,
    boardPublicId: string,
    currentFavorite: boolean | undefined,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    updateBoard.mutate({
      boardPublicId,
      favorite: !currentFavorite,
    });
  };

  if (isLoading)
    return (
      <div className="3xl:grid-cols-4 grid h-fit w-full grid-cols-1 gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3">
        <div className="mr-5 flex h-[150px] w-full animate-pulse rounded-md bg-light-200 dark:bg-dark-100" />
        <div className="mr-5 flex h-[150px] w-full animate-pulse rounded-md bg-light-200 dark:bg-dark-100" />
        <div className="mr-5 flex h-[150px] w-full animate-pulse rounded-md bg-light-200 dark:bg-dark-100" />
      </div>
    );

  if (data?.length === 0)
    return (
      <div className="z-10 flex h-full w-full flex-col items-center justify-center space-y-8 pb-[150px]">
        <div className="flex flex-col items-center">
          <HiOutlineRectangleStack className="h-10 w-10 text-light-800 dark:text-dark-800" />
          <p className="mb-2 mt-4 text-[14px] font-bold text-light-1000 dark:text-dark-950">
            {archived
              ? t`No archived boards`
              : t`No ${isTemplate ? "templates" : "boards"}`}
          </p>
          <p className="text-[14px] text-light-900 dark:text-dark-900">
            {archived
              ? t`Boards you archive will appear here.`
              : t`Get started by creating a new ${isTemplate ? "template" : "board"}`}
          </p>
        </div>
        <Tooltip
          content={!canCreateBoard ? t`You don't have permission` : undefined}
        >
          <Button
            onClick={() => {
              if (canCreateBoard) openModal("NEW_BOARD");
            }}
            disabled={!canCreateBoard}
          >
            {t`Create new ${isTemplate ? "template" : "board"}`}
          </Button>
        </Tooltip>
      </div>
    );

  return (
    <motion.div
      className="3xl:grid-cols-4 grid h-fit w-full grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3"
      layout
    >
      {data?.map((board) => (
        <motion.div
          key={board.publicId}
          layout
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            layout: {
              type: "spring",
              stiffness: 300,
              damping: 30,
              mass: 1,
            },
            opacity: { duration: 0.2 },
            scale: { duration: 0.2 },
          }}
        >
          <Link
            href={`${isTemplate ? "templates" : "boards"}/${board.publicId}`}
          >
            <div className="group relative flex min-h-[172px] w-full flex-col overflow-hidden rounded-xl border border-light-300 bg-light-50 p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg dark:border-dark-600 dark:bg-dark-50 dark:hover:bg-dark-100">
              <div className="absolute inset-x-0 top-0 h-1 bg-brand-600" />
              <button
                onClick={(e) =>
                  handleToggleFavorite(e, board.publicId, board.favorite)
                }
                className={`absolute right-4 top-4 z-10 rounded-md p-1.5 transition-all hover:bg-brand-100 dark:hover:bg-dark-200 ${
                  board.favorite
                    ? ""
                    : "md:opacity-0 md:group-hover:opacity-100"
                }`}
                aria-label={
                  board.favorite ? "Remove from favorites" : "Add to favorites"
                }
              >
                {board.favorite ? (
                  <HiStar className="h-5 w-5 text-amber-400" />
                ) : (
                  <HiOutlineStar className="h-5 w-5 text-light-900 dark:text-dark-800" />
                )}
              </button>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                <HiViewColumns className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="mt-auto flex items-end justify-between gap-3 pt-6">
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-600">
                    {isTemplate ? t`Template` : t`Board`}
                  </p>
                  <p className="truncate text-base font-bold text-light-1000 dark:text-dark-1000">
                    {board.name}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-light-200 text-brand-700 transition-colors group-hover:bg-brand-700 group-hover:text-white dark:bg-dark-200">
                  <HiArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </div>
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}
