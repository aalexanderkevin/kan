import Link from "next/link";
import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { useEffect, useRef, useState } from "react";
import { TbFile, TbLock, TbPlus, TbUpload } from "react-icons/tb";

import Button from "~/components/Button";
import LoadingSpinner from "~/components/LoadingSpinner";
import Modal from "~/components/modal";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

const fieldClass =
  "w-full rounded-md border border-light-600 bg-light-50 p-2 text-sm text-light-1000 dark:border-dark-600 dark:bg-dark-100 dark:text-dark-1000";
const MAX_FILE_SIZE = 50 * 1024 * 1024;
type Role = "owner" | "editor" | "viewer";
function roleLabel(role: Role) {
  return role === "owner"
    ? t`Owner`
    : role === "editor"
      ? t`Editor`
      : t`Viewer`;
}

function usePrivateModalCleanup(workspacePublicId: string) {
  const { modalContentType, clearAllModals } = useModal();
  const modalType = useRef(modalContentType);
  modalType.current = modalContentType;
  useEffect(
    () => () => {
      if (modalType.current.startsWith("PRIVATE_")) clearAllModals();
    },
    [workspacePublicId, clearAllModals],
  );
}

function usePrivateFileError() {
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  return () => {
    showPopup({
      header: t`Action failed`,
      message: t`Please try again. Your access may have changed.`,
      icon: "error",
    });
    void utils.privateFiles.invalidate();
  };
}

function NameForm({
  workspacePublicId,
  roomPublicId,
  initialName = "",
}: {
  workspacePublicId: string;
  roomPublicId?: string;
  initialName?: string;
}) {
  const [name, setName] = useState(initialName);
  const { closeModal } = useModal();
  const router = useRouter();
  const utils = api.useUtils();
  const onError = usePrivateFileError();
  const create = api.privateFiles.create.useMutation({
    onError,
    onSuccess: (room) => {
      closeModal();
      void utils.privateFiles.list.invalidate();
      void router.push(`/private-files/${room.publicId}`);
    },
  });
  const rename = api.privateFiles.rename.useMutation({
    onError,
    onSuccess: () => {
      closeModal();
      void utils.privateFiles.invalidate();
    },
  });
  const busy = create.isPending || rename.isPending;
  return (
    <form
      className="space-y-4 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (roomPublicId)
          rename.mutate({ workspacePublicId, roomPublicId, name });
        else create.mutate({ workspacePublicId, name });
      }}
    >
      <h2 className="text-base font-semibold">
        {roomPublicId ? t`Rename room` : t`New private room`}
      </h2>
      <label className="block space-y-2">
        <span className="text-sm">{t`Room name`}</span>
        <input
          autoFocus
          required
          maxLength={255}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={fieldClass}
        />
      </label>
      {!roomPublicId && (
        <p className="text-sm text-light-900 dark:text-dark-900">{t`Only you and the members you add can see this room.`}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={closeModal}
          disabled={busy}
        >{t`Cancel`}</Button>
        <Button type="submit" isLoading={busy} disabled={busy || !name.trim()}>
          {roomPublicId ? t`Save` : t`Create`}
        </Button>
      </div>
    </form>
  );
}

export default function PrivateFilesView() {
  const { workspace } = useWorkspace();
  usePrivateModalCleanup(workspace.publicId);
  const { openModal, modalContentType } = useModal();
  const rooms = api.privateFiles.list.useQuery(
    { workspacePublicId: workspace.publicId },
    {
      enabled: !!workspace.publicId,
      retry: false,
      gcTime: 0,
      refetchInterval: 30000,
    },
  );
  return (
    <main className="p-4 text-light-1000 dark:text-dark-1000 sm:p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <TbLock aria-hidden />
            {t`Private files`}
          </h1>
          <p className="mt-2 text-sm text-light-900 dark:text-dark-900">{t`Important files, shared only with people you choose.`}</p>
        </div>
        {workspace.publicId && workspace.role !== "guest" && (
          <Button
            iconLeft={<TbPlus />}
            onClick={() => openModal("PRIVATE_ROOM_CREATE")}
          >{t`New private room`}</Button>
        )}
      </div>
      {!workspace.publicId || rooms.isLoading ? (
        <LoadingSpinner />
      ) : rooms.isError ? (
        <p role="alert">
          {t`Unable to load private rooms.`}{" "}
          <Button
            variant="ghost"
            onClick={() => void rooms.refetch()}
          >{t`Try again`}</Button>
        </p>
      ) : !rooms.data?.length ? (
        <div className="rounded-lg border border-dashed border-light-600 p-12 text-center dark:border-dark-600">
          <TbLock className="mx-auto mb-3" size={28} />
          <h2 className="font-medium">{t`No private rooms yet`}</h2>
          <p className="mt-2 text-sm text-light-900 dark:text-dark-900">{t`Rooms you create or receive access to will appear here.`}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.data.map((room) => (
            <Link
              key={room.publicId}
              href={`/private-files/${room.publicId}`}
              className="rounded-lg border border-light-300 p-5 hover:bg-light-100 dark:border-dark-300 dark:hover:bg-dark-100"
            >
              <TbLock
                className="mb-4 text-light-900 dark:text-dark-900"
                size={22}
              />
              <h2 className="break-words font-semibold">{room.name}</h2>
              <p className="mt-2 text-xs text-light-900 dark:text-dark-900">
                {roleLabel(room.role)}
              </p>
            </Link>
          ))}
        </div>
      )}
      <Modal isVisible={modalContentType === "PRIVATE_ROOM_CREATE"}>
        <NameForm
          key={workspace.publicId + modalContentType}
          workspacePublicId={workspace.publicId}
        />
      </Modal>
    </main>
  );
}

function MembersForm({
  workspacePublicId,
  roomPublicId,
}: {
  workspacePublicId: string;
  roomPublicId: string;
}) {
  const input = { workspacePublicId, roomPublicId };
  const { closeModal, openModal } = useModal();
  const utils = api.useUtils();
  const onError = usePrivateFileError();
  const [memberPublicId, setMemberPublicId] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const members = api.privateFiles.members.useQuery(input, {
    retry: false,
    gcTime: 0,
    refetchInterval: 30000,
  });
  const refresh = () => {
    void utils.privateFiles.members.invalidate(input);
    setMemberPublicId("");
  };
  const setMember = api.privateFiles.setMember.useMutation({
    onError,
    onSuccess: refresh,
  });
  const remove = api.privateFiles.removeMember.useMutation({
    onError,
    onSuccess: refresh,
  });
  const busy = setMember.isPending || remove.isPending;
  const candidates =
    members.data?.candidates.filter(
      (candidate) =>
        !members.data.members.some(
          (member) => member.memberPublicId === candidate.memberPublicId,
        ),
    ) ?? [];
  return (
    <div className="space-y-4 p-5">
      <h2 className="text-base font-semibold">{t`Manage access`}</h2>
      <p className="text-sm text-light-900 dark:text-dark-900">{t`Viewers can download. Editors can also upload and delete files.`}</p>
      {members.isLoading ? (
        <LoadingSpinner />
      ) : members.isError ? (
        <p role="alert">{t`Unable to load room members.`}</p>
      ) : (
        <>
          <ul className="max-h-72 space-y-3 overflow-y-auto">
            {members.data?.members.map((member) => (
              <li
                key={member.memberPublicId}
                className="flex flex-wrap items-center gap-2 rounded-md border border-light-300 p-3 dark:border-dark-300"
              >
                <span className="min-w-0 flex-1 break-words text-sm">
                  {member.name ?? t`Member`}
                  <span className="ml-2 text-xs text-light-900 dark:text-dark-900">
                    {member.memberPublicId}
                  </span>
                </span>
                {member.role === "owner" ? (
                  <span className="text-xs">{t`Owner`}</span>
                ) : (
                  <>
                    <select
                      aria-label={t`Access level`}
                      className={fieldClass + " !w-auto"}
                      value={member.role}
                      disabled={busy}
                      onChange={(event) =>
                        setMember.mutate({
                          ...input,
                          memberPublicId: member.memberPublicId,
                          role: event.target.value as "viewer" | "editor",
                        })
                      }
                    >
                      <option value="viewer">{t`Viewer`}</option>
                      <option value="editor">{t`Editor`}</option>
                    </select>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={busy}
                      onClick={() =>
                        remove.mutate({
                          ...input,
                          memberPublicId: member.memberPublicId,
                        })
                      }
                    >{t`Remove`}</Button>
                    <Button
                      variant="secondary"
                      size="xs"
                      disabled={busy}
                      onClick={() =>
                        openModal(
                          "PRIVATE_ROOM_TRANSFER",
                          member.memberPublicId,
                          member.name ?? t`Member`,
                        )
                      }
                    >{t`Make owner`}</Button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <form
            className="space-y-3 border-t border-light-300 pt-4 dark:border-dark-300"
            onSubmit={(event) => {
              event.preventDefault();
              setMember.mutate({ ...input, memberPublicId, role });
            }}
          >
            <label className="block space-y-2">
              <span className="text-sm">{t`Add workspace member`}</span>
              <select
                required
                className={fieldClass}
                value={memberPublicId}
                onChange={(event) => setMemberPublicId(event.target.value)}
              >
                <option value="">{t`Select a member`}</option>
                {candidates.map((candidate) => (
                  <option
                    key={candidate.memberPublicId}
                    value={candidate.memberPublicId}
                  >
                    {candidate.name ?? t`Member`} ({candidate.memberPublicId})
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <select
                aria-label={t`Access level`}
                className={fieldClass}
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as "viewer" | "editor")
                }
              >
                <option value="viewer">{t`Viewer`}</option>
                <option value="editor">{t`Editor`}</option>
              </select>
              <Button
                type="submit"
                disabled={busy || !memberPublicId}
              >{t`Add`}</Button>
            </div>
          </form>
        </>
      )}
      <div className="flex justify-end">
        <Button variant="secondary" onClick={closeModal}>{t`Close`}</Button>
      </div>
    </div>
  );
}

function ConfirmAction({
  workspacePublicId,
  roomPublicId,
  action,
}: {
  workspacePublicId: string;
  roomPublicId: string;
  action: "file" | "room" | "transfer";
}) {
  const { closeModal, closeModals, entityId, entityLabel } = useModal();
  const router = useRouter();
  const utils = api.useUtils();
  const onError = usePrivateFileError();
  const input = { workspacePublicId, roomPublicId };
  const deleted = () => {
    closeModal();
    void utils.privateFiles.invalidate();
  };
  const deleteFile = api.privateFiles.deleteFile.useMutation({
    onError,
    onSuccess: deleted,
  });
  const deleteRoom = api.privateFiles.deleteRoom.useMutation({
    onError,
    onSuccess: () => {
      deleted();
      void router.push("/private-files");
    },
  });
  const transfer = api.privateFiles.transferOwner.useMutation({
    onError,
    onSuccess: () => {
      closeModals(2);
      void utils.privateFiles.invalidate();
    },
  });
  const busy =
    deleteFile.isPending || deleteRoom.isPending || transfer.isPending;
  return (
    <div className="space-y-4 p-5">
      <h2 className="font-semibold">
        {action === "transfer"
          ? t`Transfer ownership`
          : action === "room"
            ? t`Delete room`
            : t`Delete file`}
      </h2>
      <p className="break-words text-sm">{entityLabel}</p>
      <p className="text-sm text-light-900 dark:text-dark-900">
        {action === "transfer"
          ? t`The selected member will manage this room. You will become an editor.`
          : action === "room"
            ? t`This room and all its files will become inaccessible to everyone.`
            : t`This file will no longer be available to room members.`}
      </p>
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={closeModal}
        >{t`Cancel`}</Button>
        <Button
          variant={action === "transfer" ? "primary" : "danger"}
          isLoading={busy}
          onClick={() => {
            if (action === "file")
              deleteFile.mutate({ ...input, filePublicId: entityId });
            else if (action === "room") deleteRoom.mutate(input);
            else transfer.mutate({ ...input, memberPublicId: entityId });
          }}
        >{t`Confirm`}</Button>
      </div>
    </div>
  );
}

export function PrivateRoomView({ roomPublicId }: { roomPublicId: string }) {
  const { workspace } = useWorkspace();
  // Remount transient upload/form state when navigating between rooms or workspaces.
  return (
    <RoomContent
      key={`${workspace.publicId}/${roomPublicId}`}
      workspacePublicId={workspace.publicId}
      roomPublicId={roomPublicId}
    />
  );
}

function RoomContent({
  workspacePublicId,
  roomPublicId,
}: {
  workspacePublicId: string;
  roomPublicId: string;
}) {
  const input = { workspacePublicId, roomPublicId };
  usePrivateModalCleanup(workspacePublicId);
  const { openModal, closeModal, modalContentType } = useModal();
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const onError = usePrivateFileError();
  const room = api.privateFiles.byId.useQuery(input, {
    enabled: !!workspacePublicId && roomPublicId.length === 12,
    retry: false,
    gcTime: 0,
    refetchInterval: 30000,
  });
  const prepare = api.privateFiles.prepareUpload.useMutation();
  const confirm = api.privateFiles.confirmUpload.useMutation();
  const download = api.privateFiles.download.useMutation({
    onError,
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadName, setUploadName] = useState("");
  const requestRef = useRef<XMLHttpRequest | null>(null);
  const mounted = useRef(true);
  const isMounted = () => mounted.current;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (room.isError && modalContentType.startsWith("PRIVATE_")) closeModal();
  }, [room.isError, modalContentType, closeModal]);

  async function upload(file: File) {
    if (!file.size || file.size > MAX_FILE_SIZE) {
      showPopup({
        header: t`Unable to upload file`,
        message: t`Choose a non-empty file up to 50 MB.`,
        icon: "error",
      });
      return;
    }
    setProgress(0);
    setUploadName(file.name);
    try {
      const contentType = file.type || "application/octet-stream";
      const reservation = await prepare.mutateAsync({
        ...input,
        filename: file.name,
        contentType,
        size: file.size,
      });
      if (!isMounted()) return;
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        requestRef.current = request;
        request.open("PUT", reservation.url);
        request.setRequestHeader("Content-Type", contentType);
        request.timeout = 5 * 60 * 1000;
        request.upload.onprogress = (event) => {
          if (event.lengthComputable && mounted.current)
            setProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onload = () => {
          if (request.status >= 200 && request.status < 300) resolve();
          else reject(new Error("Upload failed"));
        };
        request.onerror =
          request.ontimeout =
          request.onabort =
            () => reject(new Error("Upload interrupted"));
        request.send(file);
      });
      if (!isMounted()) return;
      await confirm.mutateAsync({
        ...input,
        filePublicId: reservation.filePublicId,
      });
      await utils.privateFiles.byId.invalidate(input);
    } catch {
      if (mounted.current) onError();
    } finally {
      if (mounted.current) {
        setProgress(null);
        setUploadName("");
      }
      requestRef.current = null;
    }
  }

  if (!workspacePublicId || room.isLoading)
    return (
      <div className="p-8">
        <LoadingSpinner />
      </div>
    );
  if (room.isError || !room.data)
    return (
      <div className="space-y-4 p-8 text-light-1000 dark:text-dark-1000">
        <p role="alert">{t`This private room is unavailable or you no longer have access.`}</p>
        <Button
          href="/private-files"
          variant="secondary"
        >{t`Back to private files`}</Button>
      </div>
    );
  const data = room.data;
  const editor = data.role !== "viewer";
  return (
    <main className="p-4 text-light-1000 dark:text-dark-1000 sm:p-8">
      <Link
        href="/private-files"
        className="text-sm text-light-900 hover:underline dark:text-dark-900"
      >{t`Back to private files`}</Link>
      <header className="mb-8 mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 break-all text-xl font-semibold">
            <TbLock className="shrink-0" />
            {data.name}
          </h1>
          <p className="mt-2 text-sm text-light-900 dark:text-dark-900">
            {roleLabel(data.role)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.role === "owner" && (
            <>
              <Button
                variant="secondary"
                onClick={() => openModal("PRIVATE_ROOM_MEMBERS")}
              >{t`Manage access`}</Button>
              <Button
                variant="ghost"
                onClick={() => openModal("PRIVATE_ROOM_RENAME")}
              >{t`Rename room`}</Button>
              <Button
                variant="ghost"
                onClick={() =>
                  openModal("PRIVATE_ROOM_DELETE", roomPublicId, data.name)
                }
              >{t`Delete room`}</Button>
            </>
          )}
          {editor && (
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-md bg-light-1000 px-3 py-2 text-sm font-semibold text-light-50 dark:bg-dark-1000 dark:text-dark-50 ${!data.storageConfigured || progress !== null ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <TbUpload />
              {t`Upload file`}
              <input
                type="file"
                className="sr-only"
                disabled={!data.storageConfigured || progress !== null}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void upload(file);
                }}
              />
            </label>
          )}
        </div>
      </header>
      {!data.storageConfigured && (
        <p
          role="status"
          className="mb-4 text-sm"
        >{t`File uploads are unavailable. Contact your administrator to configure private storage.`}</p>
      )}
      {progress !== null && (
        <div
          className="mb-6 space-y-2 rounded-lg border border-light-300 p-4 dark:border-dark-300"
          role="status"
        >
          <p className="break-all text-sm">
            {uploadName} —{" "}
            {progress === 100 ? t`Finishing upload…` : `${progress}%`}
          </p>
          <progress
            className="h-2 w-full"
            max={100}
            value={progress}
            aria-label={t`Upload progress`}
          />
        </div>
      )}
      {!data.files.length ? (
        <div className="rounded-lg border border-dashed border-light-600 p-12 text-center dark:border-dark-600">
          <TbFile size={28} className="mx-auto mb-3" />
          <h2 className="font-medium">{t`No files yet`}</h2>
          <p className="mt-2 text-sm text-light-900 dark:text-dark-900">
            {editor
              ? t`Upload important files up to 50 MB each.`
              : t`Files uploaded by room editors will appear here.`}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-light-300 rounded-lg border border-light-300 dark:divide-dark-300 dark:border-dark-300">
          {data.files.map((file) => (
            <li
              key={file.publicId}
              className="flex flex-wrap items-center gap-4 p-4"
            >
              <TbFile
                size={24}
                className="shrink-0 text-light-900 dark:text-dark-900"
              />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium">
                  {file.filename}
                </p>
                <p className="mt-1 text-xs text-light-900 dark:text-dark-900">
                  {new Intl.NumberFormat(undefined, {
                    style: "unit",
                    unit: "megabyte",
                    maximumFractionDigits: 2,
                  }).format(file.size / 1024 / 1024)}{" "}
                  · {file.uploadedBy ?? t`Member`} ·{" "}
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                  }).format(file.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={download.isPending}
                  onClick={() =>
                    download.mutate({ ...input, filePublicId: file.publicId })
                  }
                >{t`Download`}</Button>
                {editor && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      openModal(
                        "PRIVATE_FILE_DELETE",
                        file.publicId,
                        file.filename,
                      )
                    }
                  >{t`Delete`}</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal isVisible={modalContentType === "PRIVATE_ROOM_RENAME"}>
        <NameForm key={modalContentType} {...input} initialName={data.name} />
      </Modal>
      <Modal
        modalSize="md"
        isVisible={modalContentType === "PRIVATE_ROOM_MEMBERS"}
      >
        {modalContentType === "PRIVATE_ROOM_MEMBERS" && (
          <MembersForm {...input} />
        )}
      </Modal>
      <Modal
        isVisible={
          modalContentType === "PRIVATE_FILE_DELETE" ||
          modalContentType === "PRIVATE_ROOM_DELETE" ||
          modalContentType === "PRIVATE_ROOM_TRANSFER"
        }
      >
        <ConfirmAction
          {...input}
          action={
            modalContentType === "PRIVATE_ROOM_TRANSFER"
              ? "transfer"
              : modalContentType === "PRIVATE_ROOM_DELETE"
                ? "room"
                : "file"
          }
        />
      </Modal>
    </main>
  );
}
