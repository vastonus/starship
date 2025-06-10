export interface TimeoutConfig {
  time_iota_ms?: number;
  timeout_propose?: string;
  timeout_propose_delta?: string;
  timeout_prevote?: string;
  timeout_prevote_delta?: string;
  timeout_precommit?: string;
  timeout_precommit_delta?: string;
  timeout_commit?: string;
} 