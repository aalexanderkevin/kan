import Link from "next/link";
import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";
import { TbFileText, TbLock } from "react-icons/tb";

import type { RoomScope } from "./documents";
import type { RouterOutputs } from "~/utils/api";
import Button from "~/components/Button";
import LoadingSpinner from "~/components/LoadingSpinner";
import Modal from "~/components/modal";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import DocumentEditor from "./document-editor";
import { documentUrl } from "./documents";

type DocumentScope = RoomScope & { documentPublicId: string };
type DocumentData = RouterOutputs["privateFiles"]["getDocument"];

export default function PrivateDocumentView({
  roomPublicId,
  documentPublicId,
}: {
  roomPublicId: string;
  documentPublicId: string;
}) {
  const { workspace } = useWorkspace();
  const scope = {
    workspacePublicId: workspace.publicId,
    roomPublicId,
    documentPublicId,
  };
  const document = api.privateFiles.getDocument.useQuery(scope, {
    enabled:
      !!workspace.publicId &&
      roomPublicId.length === 12 &&
      documentPublicId.length === 12,
    retry: false,
    gcTime: 0,
    refetchInterval: 15000,
  });
  if (!workspace.publicId || document.isLoading)
    return (
      <div className="p-8">
        <LoadingSpinner />
      </div>
    );
  const accessLost = ["NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN"].includes(
    document.error?.data?.code ?? "",
  );
  if (accessLost || !document.data)
    return (
      <div className="space-y-4 p-8 text-light-1000 dark:text-dark-1000">
        <p role="alert">{t`This document is unavailable or you no longer have access.`}</p>
        <Button
          href="/private-files"
          variant="secondary"
        >{t`Back to private files`}</Button>
      </div>
    );
  return (
    <DocumentPage
      key={`${workspace.publicId}/${roomPublicId}/${documentPublicId}`}
      scope={scope}
      document={document.data}
    />
  );
}

function DocumentPage({
  scope,
  document,
}: {
  scope: DocumentScope;
  document: DocumentData;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const { showPopup } = usePopup();
  const { openModal, closeModal, clearAllModals, modalContentType } =
    useModal();
  const [saved, setSaved] = useState(document);
  const [title, setTitle] = useState(document.title);
  const [content, setContent] = useState(document.content);
  const [saveError, setSaveError] = useState<"conflict" | "error" | null>(null);
  const [reloading, setReloading] = useState(false);
  const dirty = title !== saved.title || content !== saved.content;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const canEdit = document.role !== "viewer";
  const conflict =
    saveError === "conflict" || (dirty && document.version > saved.version);
  const list = api.privateFiles.listDocuments.useQuery(
    {
      workspacePublicId: scope.workspacePublicId,
      roomPublicId: scope.roomPublicId,
    },
    { retry: false, gcTime: 0, refetchInterval: 30000 },
  );
  const reportError = () =>
    showPopup({
      header: t`Action failed`,
      message: t`Please try again. Your access may have changed.`,
      icon: "error",
    });
  const save = api.privateFiles.updateDocument.useMutation({
    onSuccess: (result) => {
      setSaved({ ...document, ...result });
      setTitle(result.title);
      setContent(result.content);
      setSaveError(null);
      dirtyRef.current = false;
      void utils.privateFiles.getDocument.invalidate(scope);
      void utils.privateFiles.listDocuments.invalidate();
    },
    onError: (error) => {
      setSaveError(error.data?.code === "CONFLICT" ? "conflict" : "error");
      void utils.privateFiles.getDocument.invalidate(scope);
    },
  });
  const remove = api.privateFiles.deleteDocument.useMutation({
    onSuccess: () => {
      dirtyRef.current = false;
      closeModal();
      void utils.privateFiles.listDocuments.invalidate();
      void router.push(`/private-files/${scope.roomPublicId}`);
    },
    onError: (error) => {
      closeModal();
      if (error.data?.code === "CONFLICT") setSaveError("conflict");
      else reportError();
      void utils.privateFiles.getDocument.invalidate(scope);
    },
  });
  const busy = save.isPending || remove.isPending || reloading;
  const saveNow = () => {
    if (!canEdit || !dirty || !title.trim() || busy || conflict) return;
    save.mutate({ ...scope, title, content, version: saved.version });
  };
  const saveRef = useRef(saveNow);
  saveRef.current = saveNow;
  useEffect(() => {
    if (!dirty && document.version > saved.version) {
      setSaved(document);
      setTitle(document.title);
      setContent(document.content);
      setSaveError(null);
    }
  }, [document, dirty, saved.version]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const beforeRoute = (url: string) => {
      if (
        dirtyRef.current &&
        !window.confirm(t`Leave without saving your document?`)
      ) {
        const error = new Error("Document navigation cancelled");
        router.events.emit("routeChangeError", error, url, { shallow: false });
        throw error;
      }
    };
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("keydown", shortcut);
    router.events.on("routeChangeStart", beforeRoute);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("keydown", shortcut);
      router.events.off("routeChangeStart", beforeRoute);
    };
  }, [router.events]);
  const modalRef = useRef(modalContentType);
  modalRef.current = modalContentType;
  useEffect(
    () => () => {
      if (modalRef.current.startsWith("PRIVATE_DOCUMENT_")) clearAllModals();
    },
    [clearAllModals],
  );

  async function reload() {
    setReloading(true);
    try {
      const latest = await utils.privateFiles.getDocument.fetch(scope);
      setSaved(latest);
      setTitle(latest.title);
      setContent(latest.content);
      setSaveError(null);
      dirtyRef.current = false;
      closeModal();
    } catch {
      reportError();
    } finally {
      setReloading(false);
    }
  }

  return (
    <main className="flex min-h-full flex-col text-light-1000 dark:text-dark-1000">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-light-300 p-4 dark:border-dark-300 sm:px-6">
        <div className="min-w-0">
          <Link
            href={`/private-files/${scope.roomPublicId}`}
            className="flex items-center gap-2 text-sm text-light-900 hover:underline dark:text-dark-900"
          >
            <TbLock />
            {document.roomName}
          </Link>
          <p className="mt-1 text-xs text-light-900 dark:text-dark-900">{t`This document uses the same access as its private room.`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            role="status"
            className="text-xs text-light-900 dark:text-dark-900"
          >
            {save.isPending
              ? t`Saving…`
              : dirty
                ? t`Unsaved changes`
                : t`Saved`}
          </span>
          {canEdit && (
            <>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => openModal("PRIVATE_DOCUMENT_DELETE")}
              >{t`Delete doc`}</Button>
              <Button
                disabled={busy || !dirty || !title.trim() || conflict}
                isLoading={save.isPending}
                onClick={saveNow}
              >{t`Save`}</Button>
            </>
          )}
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-light-300 p-4 dark:border-dark-300 lg:block">
          <h2 className="mb-3 text-sm font-semibold">{t`Docs`}</h2>
          {list.isError ? (
            <p className="text-xs">{t`Unable to load documents.`}</p>
          ) : (
            <nav aria-label={t`Docs`} className="space-y-1">
              {list.data?.map((item) => (
                <Link
                  key={item.publicId}
                  href={documentUrl(scope.roomPublicId, item.publicId)}
                  aria-current={
                    item.publicId === scope.documentPublicId
                      ? "page"
                      : undefined
                  }
                  className={`flex items-start gap-2 rounded-md p-2 text-sm hover:bg-light-200 dark:hover:bg-dark-200 ${item.publicId === scope.documentPublicId ? "bg-light-200 dark:bg-dark-200" : ""}`}
                >
                  <TbFileText className="mt-0.5 shrink-0" />
                  <span className="break-words">{item.title}</span>
                </Link>
              ))}
            </nav>
          )}
        </aside>
        <div className="mx-auto w-full min-w-0 max-w-5xl p-4 sm:p-8">
          {(conflict || saveError === "error") && (
            <div
              role="alert"
              className="mb-4 space-y-2 rounded-lg border border-amber-500 p-4 text-sm"
            >
              <p>
                {conflict
                  ? t`Someone updated this document. Your draft is preserved. Copy any changes you need before reloading.`
                  : t`Could not save. Your draft is still here; try saving again.`}
              </p>
              <Button
                variant="secondary"
                onClick={() => openModal("PRIVATE_DOCUMENT_RELOAD")}
              >{t`Reload latest document`}</Button>
            </div>
          )}
          <label className="mb-6 block">
            <span className="sr-only">{t`Document title`}</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              readOnly={!canEdit || busy}
              maxLength={255}
              className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-light-700 focus:ring-0 sm:text-3xl"
              placeholder={t`Document title`}
            />
          </label>
          {canEdit && (
            <p className="mb-3 text-xs text-light-900 dark:text-dark-900">{t`Format your text below. Use Ctrl/Cmd + S to save.`}</p>
          )}
          <DocumentEditor
            content={content}
            onChange={setContent}
            readOnly={!canEdit || busy}
          />
        </div>
      </div>
      <Modal
        isVisible={
          modalContentType === "PRIVATE_DOCUMENT_DELETE" ||
          modalContentType === "PRIVATE_DOCUMENT_RELOAD"
        }
        closeOnClickOutside={!busy}
      >
        <div className="space-y-4 p-5">
          <h2 className="font-semibold">
            {modalContentType === "PRIVATE_DOCUMENT_DELETE"
              ? t`Delete doc`
              : t`Reload latest document`}
          </h2>
          <p className="text-sm">
            {modalContentType === "PRIVATE_DOCUMENT_DELETE"
              ? t`This document will no longer be available to room members.`
              : t`Your unsaved changes will be discarded.`}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={closeModal}
              disabled={busy}
            >{t`Cancel`}</Button>
            <Button
              variant={
                modalContentType === "PRIVATE_DOCUMENT_DELETE"
                  ? "danger"
                  : "primary"
              }
              disabled={busy}
              isLoading={busy}
              onClick={() => {
                if (modalContentType === "PRIVATE_DOCUMENT_DELETE")
                  remove.mutate({ ...scope, version: saved.version });
                else void reload();
              }}
            >{t`Confirm`}</Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
