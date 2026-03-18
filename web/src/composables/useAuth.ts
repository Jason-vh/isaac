import { ref, computed } from "vue";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { api } from "../api/client";

const token = ref<string | null>(localStorage.getItem("token"));
const shareToken = ref<string | null>(localStorage.getItem("share_token"));
const sharePath = ref<string | null>(localStorage.getItem("share_path"));
const needsSetup = ref(false);

export const isShareMode = computed(() => !!shareToken.value && !token.value);
export const isAuthenticated = computed(() => !!token.value || !!shareToken.value);
export const shareSection = computed(() => {
  if (!sharePath.value) return null;
  return sharePath.value.split("/").filter(Boolean)[0] || null;
});

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

  function setSharePath(path: string): void {
    sharePath.value = path;
    localStorage.setItem("share_path", path);
  }

  function logout(): void {
    token.value = null;
    shareToken.value = null;
    sharePath.value = null;
    localStorage.removeItem("token");
    localStorage.removeItem("share_token");
    localStorage.removeItem("share_path");
  }

  return {
    token,
    shareToken,
    sharePath,
    shareSection,
    isAuthenticated,
    isShareMode,
    needsSetup,
    checkStatus,
    register,
    authenticate,
    setSharePath,
    logout,
  };
}
