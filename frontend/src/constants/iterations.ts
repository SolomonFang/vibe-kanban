export const ITERATIONS = [
  { value: '260116' },
  { value: '260313' },
  { value: '260410' },
  { value: '260515' },
  { value: '260612' },
  { value: '260717' },
  { value: '260814' },
  { value: '260911' },
  { value: '261016' },
  { value: '261113' },
  { value: '261211' },
] as const;

export type IterationCode = (typeof ITERATIONS)[number]['value'];
