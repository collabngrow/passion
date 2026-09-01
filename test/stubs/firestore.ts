/**
 * In-memory Firestore, for the store modules.
 *
 * `CLAUDE.md` forbids browser verification and the suite runs no emulator, so
 * the alternative to this is leaving `bindInvitation` and `consumeAttempt`
 * untested -- the two places where the §86 matrix asks about concurrency and
 * windows, and where the logic is real rather than a passthrough.
 *
 * What it does model: documents, `get`/`set`/`update`/`delete`, merge
 * semantics, and a transaction that **buffers writes until the callback
 * returns**, so a read inside a transaction cannot see that transaction's own
 * uncommitted writes.
 *
 * What it deliberately does not model: Firestore's isolation and retry. A fake
 * cannot prove a real database's concurrency guarantee, and a test that
 * pretended to would be worse than none. What the binding tests below actually
 * assert is the property this codebase controls -- that the decision is made
 * from a value read *inside* the transaction, so the second caller sees the
 * first caller's committed write instead of stale state (§79).
 */

/** Minimal stand-in. Identity matters: rate-limit.ts does `instanceof Timestamp`. */
export class Timestamp {
  constructor(private readonly ms: number) {}

  static now(): Timestamp {
    return new Timestamp(Date.now());
  }

  static fromMillis(ms: number): Timestamp {
    return new Timestamp(ms);
  }

  static fromDate(date: Date): Timestamp {
    return new Timestamp(date.getTime());
  }

  toMillis(): number {
    return this.ms;
  }

  toDate(): Date {
    return new Date(this.ms);
  }
}

/** Only the sentinel this codebase uses. Resolved to a Timestamp on write. */
export const FieldValue = {
  serverTimestamp: () => SERVER_TIMESTAMP,
};

const SERVER_TIMESTAMP = Symbol("serverTimestamp");

type Doc = Record<string, unknown>;

function resolveSentinels(data: Doc): Doc {
  const out: Doc = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = value === SERVER_TIMESTAMP ? Timestamp.now() : value;
  }
  return out;
}

class Snapshot {
  constructor(
    readonly ref: DocRef,
    private readonly stored: Doc | undefined,
  ) {}

  get exists(): boolean {
    return this.stored !== undefined;
  }

  get id(): string {
    return this.ref.id;
  }

  data(): Doc | undefined {
    return this.stored ? { ...this.stored } : undefined;
  }
}

class DocRef {
  constructor(
    private readonly store: FakeFirestore,
    readonly path: string,
    readonly id: string,
  ) {}

  async get(): Promise<Snapshot> {
    return new Snapshot(this, this.store.read(this.path));
  }

  async set(data: Doc, options?: { merge?: boolean }): Promise<void> {
    this.store.write(this.path, data, options?.merge === true);
  }

  async update(data: Doc): Promise<void> {
    if (!this.store.read(this.path)) {
      // Matches the real client: update on a missing document rejects.
      throw new Error(`NOT_FOUND: no document to update at ${this.path}`);
    }
    this.store.write(this.path, data, true);
  }

  async delete(): Promise<void> {
    this.store.remove(this.path);
  }

  collection(name: string): CollectionRef {
    return new CollectionRef(this.store, `${this.path}/${name}`);
  }
}

class Query {
  constructor(
    protected readonly store: FakeFirestore,
    protected readonly path: string,
    protected readonly filters: [string, unknown][] = [],
    protected readonly max: number | null = null,
  ) {}

  where(field: string, op: string, value: unknown): Query {
    if (op !== "==") throw new Error(`fake firestore supports only "==", got ${op}`);
    return new Query(this.store, this.path, [...this.filters, [field, value]], this.max);
  }

  limit(n: number): Query {
    return new Query(this.store, this.path, this.filters, n);
  }

  orderBy(): Query {
    // Ordering is not modelled; no test here depends on it.
    return this;
  }

  async get(): Promise<{ docs: Snapshot[]; empty: boolean; size: number }> {
    let entries = this.store.list(this.path);

    for (const [field, value] of this.filters) {
      entries = entries.filter(([, doc]) => doc[field] === value);
    }
    if (this.max !== null) entries = entries.slice(0, this.max);

    const docs = entries.map(
      ([path, doc]) => new Snapshot(new DocRef(this.store, path, path.split("/").pop()!), doc),
    );
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class CollectionRef extends Query {
  doc(id: string): DocRef {
    return new DocRef(this.store, `${this.path}/${id}`, id);
  }
}

/** Buffers writes, so a transactional read never sees its own pending writes. */
class Transaction {
  private readonly pending: (() => void)[] = [];

  constructor(private readonly store: FakeFirestore) {}

  async get(ref: DocRef): Promise<Snapshot> {
    return new Snapshot(ref, this.store.read(ref.path));
  }

  set(ref: DocRef, data: Doc, options?: { merge?: boolean }): Transaction {
    this.pending.push(() => this.store.write(ref.path, data, options?.merge === true));
    return this;
  }

  update(ref: DocRef, data: Doc): Transaction {
    this.pending.push(() => this.store.write(ref.path, data, true));
    return this;
  }

  delete(ref: DocRef): Transaction {
    this.pending.push(() => this.store.remove(ref.path));
    return this;
  }

  commit(): void {
    for (const write of this.pending) write();
    this.pending.length = 0;
  }
}

export class FakeFirestore {
  private readonly docs = new Map<string, Doc>();

  /** Transactions opened, so a test can assert a read/write pair was atomic. */
  transactionCount = 0;

  read(path: string): Doc | undefined {
    const doc = this.docs.get(path);
    return doc ? { ...doc } : undefined;
  }

  write(path: string, data: Doc, merge: boolean): void {
    const resolved = resolveSentinels(data);
    const existing = merge ? (this.docs.get(path) ?? {}) : {};
    this.docs.set(path, { ...existing, ...resolved });
  }

  remove(path: string): void {
    this.docs.delete(path);
  }

  list(prefix: string): [string, Doc][] {
    return [...this.docs.entries()].filter(
      ([path]) => path.startsWith(`${prefix}/`) && !path.slice(prefix.length + 1).includes("/"),
    );
  }

  /** Test helper: seed or inspect a document directly. */
  seed(path: string, data: Doc): void {
    this.docs.set(path, data);
  }

  peek(path: string): Doc | undefined {
    return this.read(path);
  }

  /** Test helper: every document path currently held. */
  paths(): string[] {
    return [...this.docs.keys()];
  }

  collection(name: string): CollectionRef {
    return new CollectionRef(this, name);
  }

  async runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    const tx = new Transaction(this);
    const result = await fn(tx);
    tx.commit();
    return result;
  }

  settings(): void {}
}
