import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? "csm-tower-secret-change-in-prod-32chars"
);

const COOKIE = "csm_session";

export interface SessionUser {
  name: string;
  email: string;
  picture: string;
}

export async function createSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .setIssuedAt()
    .sign(SECRET);
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      name: payload.name as string,
      email: payload.email as string,
      picture: payload.picture as string,
    };
  } catch {
    return null;
  }
}

export { COOKIE };
