/**
 * Shared types for distribution bots
 */

export interface TradingSignal {
  id: string;
  agent_id: string;
  service: string;
  action: string;
  target_price: number;
  confidence: number;
  reason: string;
  risk_level: string;
  actual_price: number;
  outcome_recorded: boolean;
  created_at: string;
  outcome_at: string | null;
  posted_to_twitter: boolean;
  posted_to_telegram: boolean;
  twitter_post_id: string | null;
  telegram_message_id: string | null;
  post_error: string | null;
}

export interface TwitterMetrics {
  postsCount: number;
  followers: number;
  lastPostTime: number;
}

export interface TelegramMetrics {
  messagesCount: number;
  memberCount: number;
  lastMessageTime: number;
}

export interface DistributionStatus {
  twitter: {
    running: boolean;
    posts: number;
    followers: number;
  };
  telegram: {
    running: boolean;
    messages: number;
    members: number;
  };
  lastSignalPolled: number;
  nextPollTime: number;
}
