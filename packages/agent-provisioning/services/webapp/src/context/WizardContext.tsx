import { createContext, useContext, useState, ReactNode } from 'react';

export type LLMProvider = 'anthropic' | 'openai' | 'openrouter' | 'kimi';
export type PaymentToken = 'SOL' | 'USDC' | 'USDT' | 'HERD';
export type TierId = 'free_trial' | 'pro';

export interface WizardState {
  wallet: string;
  tier_id: TierId;
  agent_name: string;
  telegram_token: string;
  llm_provider: LLMProvider;
  llm_model: string;
  llm_api_key: string;
  payment_token: PaymentToken;
  payment_tx_hash: string;
  agent_id: string;
  deployment_status: string;
  gateway_token: string;
  dashboard_port: number;
}

interface WizardContextType {
  state: WizardState;
  set: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
  setMany: (partial: Partial<WizardState>) => void;
  reset: () => void;
}

const DEFAULT_STATE: WizardState = {
  wallet: '',
  tier_id: 'free_trial',
  agent_name: '',
  telegram_token: '',
  llm_provider: 'anthropic',
  llm_model: 'claude-haiku-4-5-20251001',
  llm_api_key: '',
  payment_token: 'USDC',
  payment_tx_hash: '',
  agent_id: '',
  deployment_status: '',
  gateway_token: '',
  dashboard_port: 0,
};

const WizardContext = createContext<WizardContextType | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setState(prev => ({ ...prev, [key]: value }));

  const setMany = (partial: Partial<WizardState>) =>
    setState(prev => ({ ...prev, ...partial }));

  const reset = () => setState(DEFAULT_STATE);

  return (
    <WizardContext.Provider value={{ state, set, setMany, reset }}>
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error('useWizard must be used inside WizardProvider');
  return ctx;
}
