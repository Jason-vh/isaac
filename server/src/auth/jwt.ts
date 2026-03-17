import { SignJWT, jwtVerify } from "jose";
import { env } from "../env";

const ALG = "HS256";
const OWNER_SUBJECT = "isaac-owner";

function getSecret(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function signToken(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setSubject(OWNER_SUBJECT)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret(), { subject: OWNER_SUBJECT });
    return true;
  } catch {
    return false;
  }
}
