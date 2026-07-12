import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { validateFullReviewAnnotation, type FullReviewAnnotation, type FullReviewPacket } from "./fullReview.model.js";
import { loadSealedFullReviewPackets, type ErpExport, type PackageExport, type ReviewSlot } from "./fullReviewMerge.js";

export type StoredReview = {
  revision: number;
  drafts: Record<string, FullReviewAnnotation>;
  submitted: Record<string, FullReviewAnnotation>;
  adjudications: Record<string, FullReviewAnnotation>;
  audit: Array<{ at: string; action: "draft" | "submit" | "adjudicate"; user_id: string; document_id: string; revision: number }>;
};

type Options = {
  baselineDir: string;
  storeFile: string;
  exportDir: string;
  now?: () => string;
  writeExportFile?: (file: string, value: unknown) => void;
};

export class FullReviewStore {
  private readonly packets: Map<string, FullReviewPacket>;
  private readonly now: () => string;

  constructor(private readonly options: Options) {
    this.packets = new Map(loadSealedFullReviewPackets(options.baselineDir).map((packet) => [packet.document_id, packet]));
    this.now = options.now ?? (() => new Date().toISOString());
  }

  draft(slot: ReviewSlot, userId: string, documentId: string, revision: number, annotation: FullReviewAnnotation) {
    return this.mutate("draft", slot, userId, documentId, revision, annotation);
  }

  submit(slot: ReviewSlot, userId: string, documentId: string, revision: number, annotation: FullReviewAnnotation) {
    return this.mutate("submit", slot, userId, documentId, revision, annotation);
  }

  adjudicate(userId: string, documentId: string, revision: number, annotation: FullReviewAnnotation) {
    return this.withLock(() => {
      const store = this.read();
      this.assertRevision(store, revision);
      const packet = this.assertAnnotation(documentId, annotation);
      if (!store.submitted[key("annotator-a", documentId)] || !store.submitted[key("annotator-b", documentId)]) throw new Error("both slots must submit before adjudication");
      if (store.adjudications[documentId]) throw new Error(`already adjudicated: ${documentId}`);
      store.adjudications[documentId] = annotation;
      this.record(store, "adjudicate", userId, packet.document_id);
      this.write(store);
      return { revision: store.revision };
    });
  }

  exportSubmitted() {
    return this.withLock(() => this.publishExports(this.read()));
  }

  private mutate(action: "draft" | "submit", slot: ReviewSlot, userId: string, documentId: string, revision: number, annotation: FullReviewAnnotation) {
    return this.withLock(() => {
      const store = this.read();
      this.assertRevision(store, revision);
      const packet = this.assertAnnotation(documentId, annotation);
      const storeKey = key(slot, documentId);
      if (store.submitted[storeKey]) throw new Error(`already submitted: ${documentId}`);
      store[action === "draft" ? "drafts" : "submitted"][storeKey] = annotation;
      if (action === "submit") delete store.drafts[storeKey];
      this.record(store, action, userId, packet.document_id);
      this.write(store);
      return { revision: store.revision };
    });
  }

  private publishExports(store: StoredReview) {
    const names = ["annotator-a-package.json", "annotator-b-package.json", "annotator-a-erp.json", "annotator-b-erp.json"] as const;
    const manifestFile = path.join(this.options.exportDir, "exports-manifest.json");
    if (fs.existsSync(manifestFile)) throw new Error("refusing to overwrite immutable export");
    fs.mkdirSync(this.options.exportDir, { recursive: true });
    const staging = path.join(this.options.exportDir, ".export-set.staging");
    fs.rmSync(staging, { recursive: true, force: true });
    for (const name of names) fs.rmSync(path.join(this.options.exportDir, name), { force: true });
    fs.mkdirSync(staging);
    const write = this.options.writeExportFile ?? atomicWrite;
    try {
      for (const slot of ["annotator-a", "annotator-b"] as const) {
        const submitted = [...this.packets.values()].flatMap((packet) => {
          const annotation = store.submitted[key(slot, packet.document_id)];
          if (!annotation) return [];
          this.assertAnnotation(packet.document_id, annotation);
          return [{ packet, annotation }];
        });
        const metadata = (packet: FullReviewPacket) => ({ schema_version: packet.schema_version, document_id: packet.document_id, cohort: packet.cohort, evidence_hash: packet.evidence_hash, slot });
        const packages: PackageExport[] = submitted.map(({ packet, annotation }) => ({ ...metadata(packet), admission: annotation.admission, package: annotation.package, configuration_fields: annotation.configuration_fields }));
        const erp: ErpExport[] = submitted.map(({ packet, annotation }) => ({ ...metadata(packet), erp: annotation.erp }));
        write(path.join(staging, `${slot}-package.json`), packages);
        write(path.join(staging, `${slot}-erp.json`), erp);
      }
      const artifacts = Object.fromEntries(names.map((name) => {
        const file = path.join(staging, name);
        return [name, { sha256: fileHash(file), bytes: fs.statSync(file).size }];
      }));
      for (const name of names) fs.renameSync(path.join(staging, name), path.join(this.options.exportDir, name));
      fs.rmSync(staging, { recursive: true });
      atomicWrite(manifestFile, { schema_version: "product-config-golden-full-review-exports-v2", immutable: true, directory: ".", artifacts });
      return Object.fromEntries(names.map((name) => [name, path.join(this.options.exportDir, name)])) as Record<(typeof names)[number], string>;
    } catch (error) {
      fs.rmSync(staging, { recursive: true, force: true });
      for (const name of names) fs.rmSync(path.join(this.options.exportDir, name), { force: true });
      throw error;
    }
  }

  private withLock<T>(operation: () => T) {
    const lock = `${this.options.storeFile}.lock`;
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    try {
      fs.mkdirSync(lock);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("full review store is locked by another mutation");
      throw error;
    }
    try { return operation(); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
  }

  private assertAnnotation(documentId: string, annotation: unknown) {
    const packet = this.packets.get(documentId);
    if (!packet) throw new Error(`unexpected sample: ${documentId}`);
    const result = validateFullReviewAnnotation(annotation, packet);
    if (!result.passed) throw new Error(`invalid annotation: ${result.errors.join("; ")}`);
    return packet;
  }

  private assertRevision(store: StoredReview, revision: number) {
    if (!Number.isInteger(revision) || revision !== store.revision) throw new Error(`stale revision: expected ${store.revision}`);
  }

  private record(store: StoredReview, action: StoredReview["audit"][number]["action"], userId: string, documentId: string) {
    store.revision += 1;
    store.audit.push({ at: this.now(), action, user_id: userId, document_id: documentId, revision: store.revision });
  }

  private read(): StoredReview {
    if (!fs.existsSync(this.options.storeFile)) return { revision: 0, drafts: {}, submitted: {}, adjudications: {}, audit: [] };
    return JSON.parse(fs.readFileSync(this.options.storeFile, "utf8")) as StoredReview;
  }

  private write(store: StoredReview) { atomicWrite(this.options.storeFile, store); }
}

function key(slot: ReviewSlot, documentId: string) { return `${slot}:${documentId}`; }

function atomicWrite(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary);
  }
}

function fileHash(file: string) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
