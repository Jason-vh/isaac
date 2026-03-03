import { Elysia } from "elysia";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { passkeyCredentials } from "../db/schema";
import { env } from "../env";
import { setChallenge, getChallenge } from "../auth/challenges";
import { signToken, verifyToken } from "../auth/jwt";

const USER_ID = "isaac-owner";

async function credentialCount(): Promise<number> {
  const rows = await db.select().from(passkeyCredentials);
  return rows.length;
}

async function requireAuth(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return verifyToken(header.slice(7));
}

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  // Status: is setup needed?
  .get("/status", async () => {
    const count = await credentialCount();
    return { needsSetup: count === 0 };
  })

  // Registration: generate options
  .post("/register/options", async ({ request }) => {
    const count = await credentialCount();
    // If credentials exist, require JWT (adding a new passkey)
    if (count > 0) {
      const authed = await requireAuth(request);
      if (!authed) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
    }

    const existingCreds = await db.select().from(passkeyCredentials);
    const options = await generateRegistrationOptions({
      rpName: "Isaac",
      rpID: env.WEBAUTHN_RP_ID,
      userName: USER_ID,
      excludeCredentials: existingCreds.map((c) => ({
        id: c.credentialId,
        transports: c.transports
          ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
          : undefined,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    setChallenge("reg", options.challenge);
    return options;
  })

  // Registration: verify response
  .post("/register/verify", async ({ request, body }) => {
    const count = await credentialCount();
    if (count > 0) {
      const authed = await requireAuth(request);
      if (!authed) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
    }

    const { response, label } = body as {
      response: any;
      label: string;
    };

    const challenge = getChallenge("reg");
    if (!challenge) {
      return new Response(
        JSON.stringify({ error: "Challenge expired or missing" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: env.WEBAUTHN_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return new Response(
        JSON.stringify({ error: "Registration verification failed" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const { credential } = verification.registrationInfo;

    await db.insert(passkeyCredentials).values({
      credentialId: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      label,
      transports: credential.transports
        ? JSON.stringify(credential.transports)
        : null,
      createdAt: new Date(),
    });

    const token = await signToken();
    return { verified: true, token };
  })

  // Authentication: generate options
  .post("/authenticate/options", async () => {
    const existingCreds = await db.select().from(passkeyCredentials);
    const options = await generateAuthenticationOptions({
      rpID: env.WEBAUTHN_RP_ID,
      allowCredentials: existingCreds.map((c) => ({
        id: c.credentialId,
        transports: c.transports
          ? (JSON.parse(c.transports) as AuthenticatorTransportFuture[])
          : undefined,
      })),
      userVerification: "preferred",
    });

    setChallenge("auth", options.challenge);
    return options;
  })

  // Authentication: verify response
  .post("/authenticate/verify", async ({ body }) => {
    const { response } = body as { response: any };

    const challenge = getChallenge("auth");
    if (!challenge) {
      return new Response(
        JSON.stringify({ error: "Challenge expired or missing" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const credentialId = response.id;
    const rows = await db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.credentialId, credentialId));

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Credential not found" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const cred = rows[0];
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: env.WEBAUTHN_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
      credential: {
        id: cred.credentialId,
        publicKey: cred.publicKey,
        counter: cred.counter,
        transports: cred.transports
          ? (JSON.parse(cred.transports) as AuthenticatorTransportFuture[])
          : undefined,
      },
    });

    if (!verification.verified) {
      return new Response(
        JSON.stringify({ error: "Authentication verification failed" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Update counter
    await db
      .update(passkeyCredentials)
      .set({ counter: verification.authenticationInfo.newCounter })
      .where(eq(passkeyCredentials.credentialId, credentialId));

    const token = await signToken();
    return { verified: true, token };
  })

  // Refresh: issue new JWT (requires existing valid JWT)
  .post("/refresh", async ({ request }) => {
    const authed = await requireAuth(request);
    if (!authed) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    const token = await signToken();
    return { token };
  });
