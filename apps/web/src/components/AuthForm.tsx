import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/core/macro";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { authClient } from "@kan/auth/client";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { usePopup } from "~/providers/popup";

interface FormValues {
  employeeId: string;
  password: string;
}

interface AuthProps {
  setIsMagicLinkSent: (value: boolean, recipient: string) => void;
  isSignUp?: boolean;
  callbackURL?: string;
}

const EmployeeLoginSchema = z.object({
  employeeId: z
    .string()
    .trim()
    .min(1, t`Employee ID is required`),
  password: z.string().min(1, t`Password is required`),
});

export function Auth({ callbackURL = "/boards" }: AuthProps) {
  const [isPending, setIsPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { showPopup } = usePopup();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(EmployeeLoginSchema),
  });

  const onSubmit = async (values: FormValues) => {
    setIsPending(true);
    setLoginError(null);

    try {
      const result = await authClient.signInHris({
        employeeId: values.employeeId,
        password: values.password,
      });

      if (result.error) {
        setLoginError(result.error.message);
        return;
      }

      showPopup({
        header: t`Success`,
        message: t`You have been logged in successfully.`,
        icon: "success",
      });
      window.location.assign(callbackURL);
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : t`Unable to sign in. Please try again.`,
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <Input
          autoComplete="username"
          placeholder={t`Employee ID`}
          {...register("employeeId")}
          errorMessage={errors.employeeId?.message}
        />
        <Input
          type="password"
          autoComplete="current-password"
          placeholder={t`Enter your password`}
          {...register("password")}
          errorMessage={errors.password?.message}
        />
        {loginError && (
          <p className="mt-2 text-xs text-red-400">{loginError}</p>
        )}
      </div>
      <div className="mt-[1.5rem] flex items-center gap-4">
        <Button
          type="submit"
          isLoading={isPending}
          fullWidth
          size="lg"
          variant="secondary"
        >
          {t`Sign in`}
        </Button>
      </div>
    </form>
  );
}
