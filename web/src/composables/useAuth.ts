import { ref, computed } from "vue";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { api } from "../api/client";

const token = ref<string | null>(localStorage.getItem("token"));
const needsSetup = ref(false);

export const isAuthenticated = computed(() => !!token.value);

export function useAuth() {
  async function checkStatus(): Promise<void> {
    const { needsSetup: setup } = await api.get<{ needsSetup: boolean }>(
      "/auth/status"
    );
    needsSetup.value = setup;
  }

  async function register(label: string): Promise<void> {
    const options = await api.post<any>("/auth/register/options", {});
    const attResp = await startRegistration({ optionsJSON: options });
    const { token: jwt } = await api.post<{ verified: boolean; token: string }>(
      "/auth/register/verify",
      { response: attResp, label }
    );
    token.value = jwt;
    localStorage.setItem("token", jwt);
  }

  async function authenticate(): Promise<void> {
    const options = await api.post<any>("/auth/authenticate/options", {});
    const assertResp = await startAuthentication({ optionsJSON: options });
    const { token: jwt } = await api.post<{
      verified: boolean;
      token: string;
    }>("/auth/authenticate/verify", { response: assertResp });
    token.value = jwt;
    localStorage.setItem("token", jwt);
  }

  function logout(): void {
    token.value = null;
    localStorage.removeItem("token");
  }

  return {
    token,
    isAuthenticated,
    needsSetup,
    checkStatus,
    register,
    authenticate,
    logout,
  };
}
