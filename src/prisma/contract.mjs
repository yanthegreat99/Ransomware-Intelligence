// @ts-check
import { dataContract } from "@prisma/composer-prisma-cloud/orm";
import contractJson from "./contract.json" with { type: "json" };

/** @type {import("@prisma/composer-prisma-cloud/orm").PostgresContract<import("./contract-types").Contract>} */
export const contract = dataContract(contractJson);
