import type { Contract as GeneratedContract } from "./contract.d.ts";

type TableWithUnique<T, Columns extends readonly string[]> = Omit<T, "uniques"> & {
  readonly uniques: readonly [{ readonly columns: Columns }];
};

type Storage = GeneratedContract["storage"];
type Namespaces = Storage["namespaces"];
type PublicNamespace = Namespaces["public"];
type Entries = PublicNamespace["entries"];
type Tables = Entries["table"];

type TablesWithUniqueConstraints = Omit<Tables, "RansomwareGroup" | "DuplicateMatch"> & {
  readonly RansomwareGroup: TableWithUnique<Tables["RansomwareGroup"], readonly ["name"]>;
  readonly DuplicateMatch: TableWithUnique<
    Tables["DuplicateMatch"],
    readonly ["primaryVictimId", "candidateVictimId"]
  >;
};

export type Contract = Omit<GeneratedContract, "storage"> & {
  readonly storage: Omit<Storage, "namespaces"> & {
    readonly namespaces: Omit<Namespaces, "public"> & {
      readonly public: Omit<PublicNamespace, "entries"> & {
        readonly entries: Omit<Entries, "table"> & {
          readonly table: TablesWithUniqueConstraints;
        };
      };
    };
  };
};
