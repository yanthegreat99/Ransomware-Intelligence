import { contractFromJson } from "@prisma/orm-postgres/static";
import contractJson from "./contract.json" with { type: "json" };

/** @type {import("./contract-types").Contract} */
export const runtimeContract = contractFromJson(contractJson);
