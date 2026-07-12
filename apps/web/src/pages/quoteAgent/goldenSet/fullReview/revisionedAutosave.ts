import type { FullReviewAnnotation, RevisionResponse, SaveState } from "./types";

type Save = (documentId: string, revision: number, annotation: FullReviewAnnotation) => Promise<RevisionResponse>;
type Timer = ReturnType<typeof setTimeout>;

export function createRevisionedAutosaveCoordinator(options: {
  save: Save;
  onRevision?: (revision: number) => void;
  onState?: (state: SaveState) => void;
  delay?: number;
}) {
  let documentId = "";
  let currentRevision = 0;
  let generation = 0;
  let pending: FullReviewAnnotation | null = null;
  let latestRequested: FullReviewAnnotation | null = null;
  let timer: Timer | null = null;
  let inFlight: Promise<void> | null = null;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const drain = async (): Promise<void> => {
    if (inFlight) {
      await inFlight;
      if (pending) await drain();
      return;
    }
    const activeGeneration = generation;
    const activeDocumentId = documentId;
    const run = async () => {
      while (pending && generation === activeGeneration) {
        const annotation = pending;
        pending = null;
        options.onState?.("saving");
        try {
          const response = await options.save(activeDocumentId, currentRevision, annotation);
          if (generation !== activeGeneration) return;
          currentRevision = response.revision;
          options.onRevision?.(response.revision);
        } catch (error) {
          if (generation === activeGeneration) {
            pending ??= annotation;
            options.onState?.("failed");
          }
          throw error;
        }
      }
      if (generation === activeGeneration) options.onState?.("saved");
    };
    const running = run().finally(() => { if (inFlight === running) inFlight = null; });
    inFlight = running;
    await running;
  };

  const queue = (annotation: FullReviewAnnotation) => {
    latestRequested = annotation;
    pending = annotation;
    clearTimer();
    timer = setTimeout(() => { timer = null; void drain().catch(() => undefined); }, options.delay ?? 1200);
  };

  const flush = async (annotation?: FullReviewAnnotation) => {
    if (annotation && annotation !== latestRequested) {
      latestRequested = annotation;
      pending = annotation;
    }
    clearTimer();
    if (pending || inFlight) await drain();
  };

  return {
    activate(nextDocumentId: string, revision: number) {
      generation += 1;
      clearTimer();
      documentId = nextDocumentId;
      currentRevision = revision;
      pending = null;
      latestRequested = null;
      options.onState?.("idle");
    },
    queue,
    flush,
    revision: () => currentRevision,
    async submit(annotation: FullReviewAnnotation, submit: Save) {
      await flush(annotation);
      const activeGeneration = generation;
      const response = await submit(documentId, currentRevision, annotation);
      if (generation === activeGeneration) {
        currentRevision = response.revision;
        options.onRevision?.(response.revision);
        options.onState?.("saved");
      }
      return response;
    },
  };
}
