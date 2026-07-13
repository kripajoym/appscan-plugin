declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

declare const console: {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

declare function fetch(input: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

declare const TextEncoder: {
  new (): {
    encode(input: string): Uint8Array;
  };
};

declare const TextDecoder: {
  new (): {
    decode(input: Uint8Array): string;
  };
};

declare function atob(data: string): string;
declare function btoa(data: string): string;