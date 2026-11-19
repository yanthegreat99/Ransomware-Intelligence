import service from "../../service.mjs";

/** The Prisma ORM 8 client, wired by the app's Composer service. Call inside pages and route handlers. */
export function getDb() {
  return service.load().db.client;
}

/** The app's declared input. Call inside pages and route handlers. */
export function getAppInput() {
  return service.input();
}

export type Db = ReturnType<typeof getDb>;
export type AppInput = ReturnType<typeof getAppInput>;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export function asJson(value: unknown): Json {
  return value as Json;
}
