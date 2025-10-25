export enum AssistantStatus {
  IDLE,
  LISTENING,
  THINKING,
  SPEAKING,
}

export interface TranscriptionEntry {
  user: string;
  assistant: string; // Will hold non-code text
  code?: {
    language: string;
    content: string;
  };
}