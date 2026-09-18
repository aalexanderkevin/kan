import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/core/macro";
import { env } from "next-runtime-env";
import { useForm } from "react-hook-form";
import { HiXMark } from "react-icons/hi2";
import { z } from "zod";

import type { InviteMemberInput } from "@kan/api/types";
import type { Subscription } from "@kan/shared/utils";
import { getSubscriptionByPlan } from "@kan/shared/utils";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";

const GrantWorkspaceAccessSchema = z.object({
  employeeId: z
    .string()
    .trim()
    .min(1, t`Employee ID is required`),
  workspacePublicId: z.string(),
});

export function InviteMemberForm({
  subscriptions,
  unlimitedSeats,
  memberCount,
  seatLimit,
}: {
  subscriptions: Subscription[] | undefined;
  unlimitedSeats: boolean;
  memberCount: number;
  seatLimit: number | null;
}) {
  const utils = api.useUtils();
  const { closeModal } = useModal();
  const { workspace } = useWorkspace();
  const { showPopup } = usePopup();
  const isCloud = env("NEXT_PUBLIC_KAN_ENV") === "cloud";
  const teamSubscription = getSubscriptionByPlan(subscriptions, "team");
  const proSubscription = getSubscriptionByPlan(subscriptions, "pro");
  const isFreePlan = isCloud && !teamSubscription && !proSubscription;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteMemberInput>({
    defaultValues: {
      employeeId: "",
      workspacePublicId: workspace.publicId || "",
    },
    resolver: zodResolver(GrantWorkspaceAccessSchema),
  });

  const grantAccess = api.member.invite.useMutation({
    onSuccess: async () => {
      closeModal();
      await utils.workspace.byId.refetch();
      await utils.board.all.refetch();
    },
    onError: (error) => {
      reset();
      const message =
        error.data?.code === "CONFLICT"
          ? t`User is already a member of this workspace`
          : error.data?.code === "NOT_FOUND"
            ? t`This employee must sign in before access can be granted`
            : t`Please try again later, or contact customer support.`;
      showPopup({ header: t`Error granting access`, message, icon: "error" });
    },
  });

  return (
    <form onSubmit={handleSubmit((input) => grantAccess.mutate(input))}>
      <div className="px-5 pt-5">
        <div className="text-neutral-9000 flex w-full items-center justify-between pb-4 dark:text-dark-1000">
          <h2 className="text-sm font-bold">{t`Add member`}</h2>
          <button
            type="button"
            className="rounded p-1 focus:outline-none"
            onClick={closeModal}
          >
            <HiXMark size={18} className="dark:text-dark-9000 text-light-900" />
          </button>
        </div>
        <Input
          autoComplete="off"
          placeholder={t`Employee ID`}
          disabled={isFreePlan}
          {...register("employeeId")}
          errorMessage={errors.employeeId?.message}
        />
        <p className="mt-2 text-xs text-light-900 dark:text-dark-900">
          {t`The employee must have signed in with HRIS credentials before you can grant workspace access.`}
        </p>
        {isCloud && seatLimit !== null && !unlimitedSeats && (
          <p className="mt-3 text-xs text-light-900 dark:text-dark-900">
            {memberCount} / {seatLimit} {t`seats`}
          </p>
        )}
      </div>
      <div className="mt-12 flex justify-end border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
        {isFreePlan ? (
          <Button
            type="button"
            href={`/upgrade/select-plan?plan=pro&workspacePublicId=${workspace.publicId}&returnUrl=${encodeURIComponent("/members")}`}
          >
            {t`Choose plan`}
          </Button>
        ) : (
          <Button type="submit" isLoading={grantAccess.isPending}>
            {t`Grant access`}
          </Button>
        )}
      </div>
    </form>
  );
}
