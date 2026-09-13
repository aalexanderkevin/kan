import Link from "next/link";
import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { useState } from "react";
import { TbFileText, TbPlus } from "react-icons/tb";

import Button from "~/components/Button";
import LoadingSpinner from "~/components/LoadingSpinner";
import Modal from "~/components/modal";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

export interface RoomScope {
  workspacePublicId: string;
  roomPublicId: string;
}
export const documentUrl = (roomPublicId: string, documentPublicId: string) =>
  `/private-files/${roomPublicId}/docs/${documentPublicId}`;

export default function Documents({
  workspacePublicId,
  roomPublicId,
  canEdit,
}: RoomScope & { canEdit: boolean }) {
  const input = { workspacePublicId, roomPublicId };
  const documents = api.privateFiles.listDocuments.useQuery(input, {
    retry: false,
    gcTime: 0,
    refetchInterval: 30000,
  });
  const { openModal, modalContentType } = useModal();
  const [search, setSearch] = useState("");
  const items =
    documents.data?.filter((document) =>
      document.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    ) ?? [];
  return (
    <section className="mb-8" aria-label={t`Docs`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <TbFileText />
          {t`Docs`}
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            aria-label={t`Search documents`}
            placeholder={t`Search documents`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-md border border-light-300 bg-transparent px-3 py-2 text-sm dark:border-dark-300"
          />
          {canEdit && (
            <Button
              iconLeft={<TbPlus />}
              onClick={() => openModal("PRIVATE_DOCUMENT_CREATE")}
            >{t`New doc`}</Button>
          )}
        </div>
      </div>
      {documents.isLoading ? (
        <LoadingSpinner />
      ) : documents.isError ? (
        <p role="alert" className="text-sm">
          {t`Unable to load documents.`}{" "}
          <Button
            variant="ghost"
            onClick={() => void documents.refetch()}
          >{t`Try again`}</Button>
        </p>
      ) : !items.length ? (
        <div className="rounded-lg border border-dashed border-light-600 p-8 text-center dark:border-dark-600">
          <TbFileText size={24} className="mx-auto mb-2" />
          <p className="text-sm">
            {search
              ? t`No matching documents.`
              : t`No docs yet. Write notes, plans, or a team wiki here.`}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-light-300 dark:border-dark-300">
          <table className="w-full text-left text-sm">
            <thead className="bg-light-100 text-xs text-light-900 dark:bg-dark-100 dark:text-dark-900">
              <tr>
                <th className="p-3">{t`Name`}</th>
                <th className="hidden p-3 sm:table-cell">{t`Updated by`}</th>
                <th className="whitespace-nowrap p-3">{t`Date updated`}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-light-300 dark:divide-dark-300">
              {items.map((document) => (
                <tr
                  key={document.publicId}
                  className="hover:bg-light-100 dark:hover:bg-dark-100"
                >
                  <td className="p-3">
                    <Link
                      className="flex items-center gap-2 break-words font-medium hover:underline"
                      href={documentUrl(roomPublicId, document.publicId)}
                    >
                      <TbFileText className="shrink-0 text-blue-500" />
                      {document.title}
                    </Link>
                  </td>
                  <td className="hidden p-3 sm:table-cell">
                    {document.updatedBy ?? t`Member`}
                  </td>
                  <td className="whitespace-nowrap p-3 text-xs">
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: "medium",
                    }).format(document.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal isVisible={modalContentType === "PRIVATE_DOCUMENT_CREATE"}>
        {modalContentType === "PRIVATE_DOCUMENT_CREATE" && canEdit && (
          <NewDocument {...input} />
        )}
      </Modal>
    </section>
  );
}
function NewDocument(input: RoomScope) {
  const [title, setTitle] = useState("");
  const router = useRouter();
  const utils = api.useUtils();
  const { closeModal } = useModal();
  const { showPopup } = usePopup();
  const create = api.privateFiles.createDocument.useMutation({
    onSuccess: (document) => {
      closeModal();
      void utils.privateFiles.listDocuments.invalidate(input);
      void router.push(documentUrl(input.roomPublicId, document.publicId));
    },
    onError: () =>
      showPopup({
        header: t`Action failed`,
        message: t`Please try again. Your access may have changed.`,
        icon: "error",
      }),
  });
  return (
    <form
      className="space-y-4 p-5 text-light-1000 dark:text-dark-1000"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate({ ...input, title });
      }}
    >
      <h2 className="font-semibold">{t`New doc`}</h2>
      <label className="block space-y-2">
        <span className="text-sm">{t`Document title`}</span>
        <input
          autoFocus
          required
          maxLength={255}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-md border border-light-600 bg-transparent p-2 dark:border-dark-600"
        />
      </label>
      <p className="text-sm text-light-900 dark:text-dark-900">{t`This document uses the same access as its private room.`}</p>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={closeModal}
          disabled={create.isPending}
        >{t`Cancel`}</Button>
        <Button
          type="submit"
          disabled={create.isPending || !title.trim()}
          isLoading={create.isPending}
        >{t`Create`}</Button>
      </div>
    </form>
  );
}
