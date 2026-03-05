import { Elysia } from "elysia";
import { signShareToken } from "../auth/jwt";
import { env } from "../env";

export const shareRoutes = new Elysia({ prefix: "/api" }).post(
  "/share",
  async () => {
    const token = await signShareToken();
    const url = `${env.WEBAUTHN_ORIGIN}/share/${token}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    return { url, expiresAt };
  }
);
