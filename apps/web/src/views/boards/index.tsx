import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { t } from "@lingui/core/macro";
import { useState } from "react";
import {
  HiArrowDownTray,
  HiChevronDown,
  HiOutlinePlusSmall,
} from "react-icons/hi2";

import Button from "~/components/Button";
import FeedbackModal from "~/components/FeedbackModal";
import Modal from "~/components/modal";
import { NewWorkspaceForm } from "~/components/NewWorkspaceForm";
import { PageHead } from "~/components/PageHead";
import { Tooltip } from "~/components/Tooltip";
import { usePermissions } from "~/hooks/usePermissions";
import { useKeyboardShortcut } from "~/providers/keyboard-shortcuts";
import { useModal } from "~/providers/modal";
import { useWorkspace } from "~/providers/workspace";
import { BoardsList } from "./components/BoardsList";
import { ImportBoardsForm } from "./components/ImportBoardsForm";
import { NewBoardForm } from "./components/NewBoardForm";

const boardsTabs = [
  { key: "boards" as const, label: t`Active` },
  { key: "archived" as const, label: t`Archived` },
];

export default function BoardsPage({ isTemplate }: { isTemplate?: boolean }) {
  const { openModal, modalContentType, isOpen } = useModal();
  const { workspace } = useWorkspace();
  const [activeTab, setActiveTab] = useState<"boards" | "archived">("boards");
  const { canCreateBoard } = usePermissions();

  const { tooltipContent: createModalShortcutTooltipContent } =
    useKeyboardShortcut({
      type: "PRESS",
      stroke: { key: "C" },
      action: () => canCreateBoard && openModal("NEW_BOARD"),
      description: t`Create new ${isTemplate ? "template" : "board"}`,
      group: "ACTIONS",
    });

  return (
    <>
      <PageHead
        title={t`${isTemplate ? "Templates" : "Boards"} | ${workspace.name ?? t`Workspace`}`}
      />
      <div className="m-auto h-full max-w-[1280px] p-5 md:p-8 lg:p-10">
        <div className="relative mb-8 overflow-hidden rounded-2xl bg-brand-700 px-5 py-6 shadow-lg sm:px-8 sm:py-7">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
          <div className="absolute -bottom-28 right-20 h-48 w-48 rounded-full border-[28px] border-white/10" />
          <div className="relative z-10 flex w-full items-center justify-between gap-6">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-200">
                {workspace.name ?? t`Workspace`}
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {t`${isTemplate ? "Templates" : "Boards"}`}
              </h1>
              <p className="mt-1 text-sm text-blue-100">
                {isTemplate
                  ? t`Start with a reusable workflow for your team.`
                  : t`Organize and keep your team work moving.`}
              </p>
            </div>
            <div className="flex gap-2">
              {!isTemplate && (
                <Tooltip
                  content={
                    !canCreateBoard ? t`You don't have permission` : undefined
                  }
                >
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      if (canCreateBoard) openModal("IMPORT_BOARDS");
                    }}
                    disabled={!canCreateBoard}
                    iconLeft={
                      <HiArrowDownTray aria-hidden="true" className="h-4 w-4" />
                    }
                  >
                    {t`Import`}
                  </Button>
                </Tooltip>
              )}
              <Tooltip
                content={
                  !canCreateBoard
                    ? t`You don't have permission`
                    : createModalShortcutTooltipContent
                }
              >
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    if (canCreateBoard) openModal("NEW_BOARD");
                  }}
                  disabled={!canCreateBoard}
                  iconLeft={
                    <HiOutlinePlusSmall
                      aria-hidden="true"
                      className="h-4 w-4"
                    />
                  }
                >
                  {t`New`}
                </Button>
              </Tooltip>
            </div>
          </div>
        </div>

        <>
          <Modal
            modalSize="md"
            isVisible={isOpen && modalContentType === "NEW_FEEDBACK"}
          >
            <FeedbackModal />
          </Modal>

          <Modal
            modalSize="sm"
            isVisible={isOpen && modalContentType === "NEW_BOARD"}
          >
            <NewBoardForm isTemplate={!!isTemplate} />
          </Modal>

          <Modal
            modalSize="sm"
            isVisible={isOpen && modalContentType === "IMPORT_BOARDS"}
          >
            <ImportBoardsForm />
          </Modal>

          <Modal
            modalSize="sm"
            isVisible={isOpen && modalContentType === "NEW_WORKSPACE"}
          >
            <NewWorkspaceForm />
          </Modal>
        </>

        {!isTemplate ? (
          <div className="flex h-full w-full flex-col">
            <div className="rounded-xl border border-light-300 bg-light-50 p-2 shadow-sm focus:outline-none dark:border-dark-400 dark:bg-dark-100 sm:p-3">
              <div className="sm:hidden">
                <Listbox
                  value={activeTab}
                  onChange={(tab) => setActiveTab(tab)}
                >
                  <div className="relative mb-4">
                    <ListboxButton className="w-full appearance-none rounded-lg border-0 bg-light-100 py-3 pl-3 pr-10 text-left text-sm font-semibold text-light-1000 shadow-sm ring-1 ring-inset ring-light-300 dark:bg-dark-50 dark:text-dark-1000 dark:ring-dark-300 dark:focus:ring-dark-500">
                      {boardsTabs.find((tab) => tab.key === activeTab)?.label ??
                        "Select a tab"}
                      <HiChevronDown
                        aria-hidden="true"
                        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-light-900 dark:text-dark-900"
                      />
                    </ListboxButton>
                    <ListboxOptions className="absolute z-10 mt-1 w-full rounded-lg bg-light-50 py-1 text-sm shadow-lg ring-1 ring-inset ring-light-300 dark:bg-dark-50 dark:ring-dark-300">
                      {boardsTabs.map((tab) => (
                        <ListboxOption
                          key={tab.key}
                          value={tab.key}
                          className={({ selected }) =>
                            `relative cursor-pointer select-none py-2 pl-3 pr-9 ${
                              selected
                                ? "font-bold text-light-1000 dark:text-dark-1000"
                                : "font-normal text-light-1000 dark:text-dark-1000"
                            }`
                          }
                        >
                          {tab.label}
                        </ListboxOption>
                      ))}
                    </ListboxOptions>
                  </div>
                </Listbox>
              </div>
              <div className="hidden sm:block">
                <div>
                  <nav
                    aria-label="Tabs"
                    className="flex gap-1 focus:outline-none"
                  >
                    {boardsTabs.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none ${
                          activeTab === tab.key
                            ? "bg-brand-700 text-white shadow-sm"
                            : "text-light-900 hover:bg-light-200 hover:text-light-1000 dark:text-dark-900 dark:hover:bg-dark-200 dark:hover:text-dark-950"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                </div>
              </div>
            </div>
            <div className="flex h-full flex-row pt-6 focus:outline-none">
              {activeTab === "boards" && (
                <BoardsList isTemplate={false} archived={false} />
              )}
              {activeTab === "archived" && (
                <BoardsList isTemplate={false} archived={true} />
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-row">
            <BoardsList isTemplate={!!isTemplate} />
          </div>
        )}
      </div>
    </>
  );
}
