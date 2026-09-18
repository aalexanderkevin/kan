import type { BetterAuthClientPlugin } from "better-auth";
import type { BetterFetchOption } from "better-auth/react";
import { apiKeyClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { hrisEmployeePlugin } from "./hris";

type HrisSignInResponse = {
  error?: { message: string } | null;
};

const hrisEmployeePluginClient = {
  id: "hris-employee-plugin",
  $InferServerPlugin: {} as ReturnType<typeof hrisEmployeePlugin>,
  getActions: ($fetch) => ({
    signInHris: async (
      input: { employeeId: string; password: string },
      fetchOptions?: BetterFetchOption,
    ) => {
      const response = await $fetch("/sign-in/hris", {
        method: "POST",
        body: input,
        ...fetchOptions,
      });
      return response.data as HrisSignInResponse;
    },
  }),
} satisfies BetterAuthClientPlugin;

export const authClient = createAuthClient({
  plugins: [apiKeyClient(), hrisEmployeePluginClient],
});
