import jwt from "jsonwebtoken";

export type JwtUserPayload = {
  userID: string;
};

function getJwtSecret() {
  return process.env.JWT_SECRET || "dev-secret-change-me";
}

export function signUserToken(payload: JwtUserPayload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "90d" });
}

export function verifyUserToken(token: string): JwtUserPayload {
  return jwt.verify(token, getJwtSecret()) as JwtUserPayload;
}
