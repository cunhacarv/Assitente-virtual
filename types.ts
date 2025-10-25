
export enum AssistantStatus {
  IDLE,
  LISTENING,
  THINKING,
  SPEAKING,
}

export interface TranscriptionEntry {
  user: string;
  assistant: string;
}
