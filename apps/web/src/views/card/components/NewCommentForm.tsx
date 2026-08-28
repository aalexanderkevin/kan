import { t } from "@lingui/core/macro";
import { useRef, useState } from "react";
import { env } from "next-runtime-env";
import { useForm } from "react-hook-form";
import { HiOutlineArrowUp, HiOutlinePaperClip, HiXMark } from "react-icons/hi2";

import type { WorkspaceMember } from "~/components/Editor";
import Editor from "~/components/Editor";
import LoadingSpinner from "~/components/LoadingSpinner";
import { Tooltip } from "~/components/Tooltip";
import { usePermissions } from "~/hooks/usePermissions";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import { invalidateCard } from "~/utils/cardInvalidation";

interface FormValues {
  comment: string;
}

const NewCommentForm = ({
  cardPublicId,
  workspaceMembers,
}: {
  cardPublicId: string;
  workspaceMembers: WorkspaceMember[];
}) => {
  const utils = api.useUtils();
  const { showPopup } = usePopup();
  const { canCreateComment } = usePermissions();
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { handleSubmit, setValue, watch, reset } = useForm<FormValues>({
    values: {
      comment: "",
    },
  });

  const addCommentMutation = api.card.addComment.useMutation({
    onError: (_error, _newList) => {
      showPopup({
        header: t`Unable to add comment`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSuccess: async (newComment) => {
      try {
        const baseUrl = env("NEXT_PUBLIC_BASE_URL") ?? "";
        await Promise.all(
          files.map(async (file) => {
            const response = await fetch(
              `${baseUrl}/api/upload/attachment?cardPublicId=${encodeURIComponent(cardPublicId)}&commentPublicId=${encodeURIComponent(newComment.publicId)}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": file.type || "application/octet-stream",
                  "x-original-filename": encodeURIComponent(file.name),
                },
                body: file,
              },
            );
            if (!response.ok) throw new Error("Upload failed");
          }),
        );
      } catch {
        showPopup({
          header: t`Upload failed`,
          message: t`Your comment was added, but one or more files could not be uploaded.`,
          icon: "error",
        });
      } finally {
        setFiles([]);
        reset();
        await invalidateCard(utils, cardPublicId);
      }
    },
  });

  const onSubmit = (data: FormValues) => {
    addCommentMutation.mutate({
      cardPublicId,
      comment: data.comment,
      attachmentCount: files.length,
    });
  };

  const isMac =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

  const submitTooltip = (
    <div className="flex flex-row items-center gap-2 text-[11px]">
      {t`Submit`}
      <span className="inline-flex items-center justify-center rounded border border-light-400 bg-light-200 px-1.5 py-0.5 font-mono text-[8px] font-semibold text-neutral-900 dark:border-dark-400 dark:bg-dark-200 dark:text-dark-950">
        {isMac ? "⌘" : "Ctrl"}
      </span>
      <span className="inline-flex items-center justify-center rounded border border-light-400 bg-light-200 px-1.5 py-0.5 font-mono text-[8px] font-semibold text-neutral-900 dark:border-dark-400 dark:bg-dark-200 dark:text-dark-950">
        Enter
      </span>
    </div>
  );

  if (!canCreateComment) {
    return null;
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex w-full max-w-[800px] flex-col rounded-xl border border-light-600 bg-light-100 p-4 text-light-900 focus-visible:outline-none dark:border-dark-400 dark:bg-dark-100 dark:text-dark-1000 sm:text-sm sm:leading-6"
    >
      <Editor
        content={watch("comment")}
        onChange={(value) => setValue("comment", value)}
        onSubmit={handleSubmit(onSubmit)}
        workspaceMembers={workspaceMembers}
        enableYouTubeEmbed={false}
        placeholder={t`Add comment... (type '/' to open commands or '@' to mention)`}
        disableHeadings={true}
      />
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(event) => {
          setFiles((current) => [
            ...current,
            ...Array.from(event.target.files ?? []),
          ]);
          event.target.value = "";
        }}
      />
      {files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <span
              key={`${file.name}-${file.lastModified}-${index}`}
              className="flex max-w-full items-center gap-1 rounded-md bg-light-300 px-2 py-1 text-xs dark:bg-dark-300"
            >
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                onClick={() =>
                  setFiles((current) => current.filter((_, i) => i !== index))
                }
                aria-label={`Remove ${file.name}`}
              >
                <HiXMark className="h-4 w-4" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex justify-between">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-light-300 dark:hover:bg-dark-300"
          aria-label={t`Attach files`}
        >
          <HiOutlinePaperClip />
        </button>
        <Tooltip content={submitTooltip} placement="top">
          <button
            type="submit"
            disabled={
              addCommentMutation.isPending ||
              (!watch("comment").trim() && files.length === 0)
            }
            className="flex h-8 w-8 items-center justify-center rounded-full border border-light-600 bg-light-300 hover:bg-light-400 disabled:opacity-50 dark:border-dark-400 dark:bg-dark-200 dark:hover:bg-dark-400"
          >
            {addCommentMutation.isPending ? (
              <LoadingSpinner size="sm" />
            ) : (
              <HiOutlineArrowUp />
            )}
          </button>
        </Tooltip>
      </div>
    </form>
  );
};

export default NewCommentForm;
