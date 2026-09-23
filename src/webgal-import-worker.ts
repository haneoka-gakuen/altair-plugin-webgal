import { importWebGal, type ImportWebGalOptions } from "./webgal.js";

interface SourceImportWorkerRequest {
  readonly id: number;
  readonly text: string;
  readonly options: ImportWebGalOptions;
}

type SourceImportWorkerResponse =
  | {
      readonly id: number;
      readonly result: ReturnType<typeof importWebGal>;
    }
  | {
      readonly id: number;
      readonly error: {
        readonly name: string;
        readonly message: string;
        readonly stack?: string;
      };
    };

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<SourceImportWorkerRequest>) => void) | null;
  postMessage(message: SourceImportWorkerResponse): void;
};

workerScope.onmessage = ({ data }) => {
  try {
    workerScope.postMessage({
      id: data.id,
      result: importWebGal(data.text, data.options),
    });
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    workerScope.postMessage({
      id: data.id,
      error: {
        name: failure.name,
        message: failure.message,
        ...(failure.stack ? { stack: failure.stack } : {}),
      },
    });
  }
};
