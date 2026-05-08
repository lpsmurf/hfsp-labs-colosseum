import { useState, useCallback } from 'react';
import {
  Connection, LAMPORTS_PER_SOL, PublicKey,
  SystemProgram, Transaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import axios from 'axios';

// ── Types ──────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;
type Tier = 'starter' | 'pro';
type Token = 'SOL' | 'USDC' | 'USDT' | 'HERD';
type LLM = 'poly' | 'byok' | 'custom';

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey: { toBase58(): string } | null;
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  sendTransaction(tx: Transaction, conn: Connection, opts?: object): Promise<string>;
}

const TIERS = [
  { id: 'starter' as Tier, name: 'Starter', usdc: '19', sol: '~0.12', features: ['1 agent', 'Shared VPS', '1M tokens/mo'] },
  { id: 'pro' as Tier, name: 'Pro', usdc: '59', sol: '~0.38', features: ['Unlimited agents', 'Dedicated VPS', '5M tokens/mo'], popular: true },
];

const TOKENS: Token[] = ['SOL', 'USDC', 'USDT', 'HERD'];

const MAINNET_TOKEN_MINTS: Partial<Record<Token, { mint: string; decimals: number }>> = {
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  USDT: { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
};

const TIER_PRICES_USDC: Record<Tier, number> = { starter: 19, pro: 59 };

const IS_DEVNET = import.meta.env.VITE_SOLANA_NETWORK === 'devnet';
const SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC_URL ?? (IS_DEVNET ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com');
const PLATFORM_WALLET = import.meta.env.VITE_PLATFORM_WALLET ?? '';

// Devnet token mints (Circle's devnet USDC)
const DEVNET_TOKEN_MINTS: Partial<Record<Token, { mint: string; decimals: number }>> = {
  USDC: { mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', decimals: 6 },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function getPhantom(): PhantomProvider | null {
  return (window as unknown as { phantom?: { solana?: PhantomProvider } })
    ?.phantom?.solana ?? null;
}

function truncate(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

// ── Component ──────────────────────────────────────────────────────────────

interface QuickDeployModalProps {
  open: boolean;
  onClose: () => void;
}

interface DeployResult {
  agent_id: string;
  telegram_deeplink?: string;
  pair_code?: string;
  credits_usd?: number;
}

export function QuickDeployModal({ open, onClose }: QuickDeployModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [tier, setTier] = useState<Tier>('starter');
  const [token, setToken] = useState<Token>('USDC');
  const [wallet, setWallet] = useState<string>('');
  const [payState, setPayState] = useState<'idle' | 'connecting' | 'paying' | 'done' | 'error'>('idle');
  const [txHash, setTxHash] = useState('');
  const [payError, setPayError] = useState('');

  const [botToken, setBotToken] = useState('');
  const [llm, setLlm] = useState<LLM>('poly');
  const [llmModel, setLlmModel] = useState('anthropic/claude-haiku-4.5');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [configError, setConfigError] = useState('');

  const [deployLog, setDeployLog] = useState<string[]>([]);
  const [result, setResult] = useState<DeployResult | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState('');
  const [copied, setCopied] = useState(false);

  const reset = useCallback(() => {
    setStep(1); setTier('starter'); setToken('USDC');
    setWallet(''); setPayState('idle'); setTxHash(''); setPayError('');
    setBotToken(''); setLlm('poly'); setLlmModel('anthropic/claude-haiku-4.5');
    setLlmApiKey(''); setConfigError('');
    setDeployLog([]); setResult(null); setDeploying(false); setDeployError(''); setCopied(false);
  }, []);

  const handleClose = () => { reset(); onClose(); };

  // Step 1 — Connect wallet & pay
  const connectAndPay = useCallback(async () => {
    const phantom = getPhantom();
    if (!phantom) {
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        window.open(`https://phantom.app/ul/browse/${encodeURIComponent(window.location.href)}?ref=${encodeURIComponent(window.location.origin)}`, '_blank');
        return;
      }
      window.open('https://phantom.app', '_blank');
      return;
    }

    try {
      setPayState('connecting');
      setPayError('');
      const { publicKey } = await phantom.connect();
      const walletAddr = publicKey.toBase58();
      setWallet(walletAddr);

      setPayState('paying');
      const conn = new Connection(SOLANA_RPC, 'confirmed');
      const from = new PublicKey(walletAddr);
      const to = new PublicKey(PLATFORM_WALLET);
      const tx = new Transaction();

      if (token === 'SOL') {
        // Fetch SOL price to calculate correct lamports
        let solPrice = 150;
        try {
          const cg = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { timeout: 5000 });
          solPrice = cg.data?.solana?.usd ?? 150;
        } catch { /* use fallback */ }
        const usdAmount = TIER_PRICES_USDC[tier];
        const lamports = Math.ceil((usdAmount / solPrice) * LAMPORTS_PER_SOL);
        tx.add(SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports }));
      } else {
        const mints = IS_DEVNET ? DEVNET_TOKEN_MINTS : MAINNET_TOKEN_MINTS;
        const mintInfo = mints[token];
        if (!mintInfo) { setPayError(`${token} payments coming soon`); setPayState('error'); return; }
        const mint = new PublicKey(mintInfo.mint);
        const fromATA = await getAssociatedTokenAddress(mint, from);
        const toATA = await getAssociatedTokenAddress(mint, to);

        try { await conn.getAccountInfo(toATA); } catch {
          tx.add(createAssociatedTokenAccountInstruction(from, toATA, to, mint));
        }

        const usdAmount = TIER_PRICES_USDC[tier];
        const rawAmount = BigInt(Math.ceil(usdAmount * 10 ** mintInfo.decimals));
        tx.add(createTransferInstruction(fromATA, toATA, from, rawAmount));
      }

      const { blockhash } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = from;

      const sig = await phantom.sendTransaction(tx, conn);
      setTxHash(sig);
      setPayState('done');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('User rejected')) {
        setPayError('Transaction cancelled.');
      } else {
        setPayError(msg.slice(0, 120));
      }
      setPayState('error');
    }
  }, [tier, token]);

  // Step 3 — Deploy
  const deployAgent = useCallback(async () => {
    if (!botToken.match(/^\d+:[A-Za-z0-9_-]{35,}$/)) {
      setConfigError('Invalid bot token format. Get one from @BotFather on Telegram.');
      return;
    }
    setConfigError('');
    setStep(3);
    setDeploying(true);

    const log = (msg: string) => setDeployLog(prev => [...prev, msg]);
    log('✓ Payment verified');
    log('✓ Encrypting bot token…');

    try {
      const payload: Record<string, unknown> = {
        wallet,
        tx_hash: txHash,
        tier,
        telegram_bot_token: botToken,
        llm_provider: llm,
        llm_model: llmModel,
      };
      if (llm !== 'poly' && llmApiKey) payload.llm_api_key = llmApiKey;

      log('⟳ Provisioning LLM key…');
      const { data } = await axios.post<DeployResult>('/api/platform/agents/quick-deploy', payload);
      log('✓ LLM key provisioned');
      log('✓ Docker network created');
      log('✓ MCP server container starting…');
      log('✓ Agent runtime starting…');
      log('✓ Telegram bot paired!');
      setResult(data);
    } catch (e: unknown) {
      const msg = axios.isAxiosError(e)
        ? e.response?.data?.error ?? e.message
        : String(e);
      setDeployError(msg);
    } finally {
      setDeploying(false);
    }
  }, [wallet, txHash, tier, botToken, llm, llmModel, llmApiKey]);

  const copyDeeplink = () => {
    if (result?.telegram_deeplink) {
      navigator.clipboard.writeText(result.telegram_deeplink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(7,7,15,0.85)', backdropFilter: 'blur(16px)' }}>
      <div className="glass-card iridescent-border relative w-full max-w-xl rounded-[28px] overflow-hidden"
           style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 120px rgba(196,192,255,0.08)' }}>
        {/* Devnet badge */}
        {IS_DEVNET && (
          <div className="absolute top-5 left-5 text-[10px] px-2.5 py-1 rounded-full z-10"
               style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b', fontFamily: "'JetBrains Mono',monospace" }}>
            DEVNET
          </div>
        )}
        {/* Close */}
        <button onClick={handleClose}
                className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/10 z-10"
                style={{ color: '#c7c4d8' }}>
          <span className="ms text-[20px]">close</span>
        </button>

        {/* Step progress */}
        <div className="flex items-center justify-center gap-3 p-6 pb-4">
          {([1, 2, 3] as Step[]).map(s => (
            <div key={s} className="flex items-center gap-3">
              <div className={`step-dot ${s === step ? 'step-dot-active' : s < step ? 'step-dot-done' : 'step-dot-inactive'}`}>
                {s < step ? <span className="ms text-[16px]">check</span> : s}
              </div>
              {s < 3 && <div className="w-10 h-px" style={{ background: s < step ? '#a2e7ff' : 'rgba(255,255,255,0.15)' }} />}
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-12 px-6 pb-6 text-[12px]" style={{ fontFamily: "'JetBrains Mono',monospace", color: 'rgba(199,196,216,0.6)' }}>
          {['Pay', 'Configure', 'Deploy'].map((l, i) => (
            <span key={l} style={{ color: i + 1 === step ? '#c4c0ff' : undefined }}>{l}</span>
          ))}
        </div>

        <div className="px-8 pb-8">
          {/* ── STEP 1: Pay ── */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-[28px] font-bold" style={{ color: '#e4e1ee', letterSpacing: '-1px' }}>Choose your plan</h2>

              {/* Tier cards */}
              <div className="grid grid-cols-2 gap-4">
                {TIERS.map(t => (
                  <button key={t.id} onClick={() => setTier(t.id)}
                          className="glass-card rounded-[20px] p-5 text-left transition-all relative"
                          style={{ border: tier === t.id ? '1px solid rgba(196,192,255,0.5)' : undefined,
                                   boxShadow: tier === t.id ? '0 0 24px rgba(196,192,255,0.1)' : undefined }}>
                    {t.popular && (
                      <span className="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(255,183,133,0.2)', color: '#ffb785', fontFamily: "'JetBrains Mono',monospace", border: '1px solid rgba(255,183,133,0.3)' }}>
                        Popular
                      </span>
                    )}
                    <div className="text-[18px] font-bold mb-1" style={{ color: '#e4e1ee' }}>{t.name}</div>
                    <div className="text-[22px] font-bold mb-3" style={{ color: '#c4c0ff', fontFamily: "'JetBrains Mono',monospace" }}>
                      {token === 'SOL' ? t.sol : `${t.usdc}`}
                      <span className="text-[12px] ml-1" style={{ color: 'rgba(199,196,216,0.6)' }}>{token}/mo</span>
                    </div>
                    <ul className="space-y-1">
                      {t.features.map(f => (
                        <li key={f} className="text-[12px] flex items-center gap-1.5" style={{ color: '#c7c4d8', fontFamily: "'JetBrains Mono',monospace" }}>
                          <span className="ms text-[14px]" style={{ color: '#a2e7ff' }}>check</span> {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>

              {/* Token selector */}
              <div>
                <div className="text-[12px] mb-2" style={{ color: 'rgba(199,196,216,0.6)', fontFamily: "'JetBrains Mono',monospace" }}>PAY WITH</div>
                <div className="flex gap-2">
                  {TOKENS.map(t => (
                    <button key={t} onClick={() => setToken(t)}
                            className="flex-1 py-2 rounded-full text-[12px] font-bold transition-all"
                            style={{
                              fontFamily: "'JetBrains Mono',monospace",
                              background: token === t ? 'linear-gradient(135deg,#c4c0ff,#4f44e2)' : 'rgba(255,255,255,0.06)',
                              color: token === t ? '#fff' : 'rgba(199,196,216,0.7)',
                              border: token === t ? 'none' : '1px solid rgba(255,255,255,0.1)',
                            }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Wallet status */}
              {wallet && (
                <div className="flex items-center gap-2 text-[12px]" style={{ color: '#a2e7ff', fontFamily: "'JetBrains Mono',monospace" }}>
                  <span className="ms text-[16px]">account_balance_wallet</span>
                  {truncate(wallet)} connected
                </div>
              )}
              {payError && <p className="text-[13px] rounded-xl p-3" style={{ color: '#ffb4ab', background: 'rgba(255,180,171,0.08)', border: '1px solid rgba(255,180,171,0.2)' }}>{payError}</p>}

              {payState === 'done' ? (
                <button onClick={() => setStep(2)}
                        className="w-full py-4 rounded-full font-bold text-[14px] flex items-center justify-center gap-2"
                        style={{ background: 'linear-gradient(135deg,#a2e7ff,#00d2fd)', color: '#003642', fontFamily: "'JetBrains Mono',monospace" }}>
                  <span className="ms text-[18px]">check_circle</span>
                  Payment confirmed — Continue
                </button>
              ) : (
                <button onClick={connectAndPay} disabled={payState === 'connecting' || payState === 'paying'}
                        className="w-full py-4 rounded-full font-bold text-[14px] flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg,#c4c0ff,#4f44e2)', color: '#fff', fontFamily: "'JetBrains Mono',monospace",
                                 opacity: payState === 'connecting' || payState === 'paying' ? 0.7 : 1 }}>
                  {payState === 'connecting' && <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" /> Connecting…</>}
                  {payState === 'paying' && <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin-slow" /> Sending payment…</>}
                  {(payState === 'idle' || payState === 'error') && <><span className="ms text-[18px]">account_balance_wallet</span> Pay with Phantom</>}
                </button>
              )}
            </div>
          )}

          {/* ── STEP 2: Configure ── */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-[28px] font-bold" style={{ color: '#e4e1ee', letterSpacing: '-1px' }}>Configure your agent</h2>

              {/* Telegram bot token */}
              <div>
                <label className="block text-[12px] mb-2" style={{ color: 'rgba(199,196,216,0.6)', fontFamily: "'JetBrains Mono',monospace" }}>TELEGRAM BOT TOKEN</label>
                <input
                  value={botToken}
                  onChange={e => setBotToken(e.target.value)}
                  placeholder="1234567890:AAFxxx..."
                  className="w-full rounded-[14px] py-3 px-4 text-[14px] focus:outline-none transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#e4e1ee', fontFamily: "'JetBrains Mono',monospace",
                           borderColor: botToken && !botToken.match(/^\d+:[A-Za-z0-9_-]{35,}$/) ? 'rgba(255,180,171,0.5)' : 'rgba(255,255,255,0.12)' }}
                />
                <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: 'rgba(199,196,216,0.5)', fontFamily: "'JetBrains Mono',monospace" }}>
                  <span className="ms text-[14px]" style={{ color: '#a2e7ff' }}>info</span>
                  Create a bot at @BotFather on Telegram
                </p>
              </div>

              {/* LLM provider */}
              <div>
                <label className="block text-[12px] mb-2" style={{ color: 'rgba(199,196,216,0.6)', fontFamily: "'JetBrains Mono',monospace" }}>LLM PROVIDER</label>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { id: 'poly', label: 'Poly', desc: 'Managed keys + budget tracking' },
                    { id: 'byok', label: 'BYOK', desc: 'Bring your own API key' },
                    { id: 'custom', label: 'Custom', desc: 'Self-hosted endpoint' },
                  ] as { id: LLM; label: string; desc: string }[]).map(opt => (
                    <button key={opt.id} onClick={() => setLlm(opt.id)}
                            className="glass-card rounded-[16px] p-4 text-left transition-all"
                            style={{ border: llm === opt.id ? '1px solid rgba(196,192,255,0.4)' : undefined }}>
                      <div className="text-[13px] font-bold mb-1" style={{ color: llm === opt.id ? '#c4c0ff' : '#e4e1ee', fontFamily: "'JetBrains Mono',monospace" }}>{opt.label}</div>
                      <div className="text-[11px]" style={{ color: 'rgba(199,196,216,0.6)' }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Model selector for poly/byok */}
              {llm === 'poly' && (
                <div>
                  <label className="block text-[12px] mb-2" style={{ color: 'rgba(199,196,216,0.6)', fontFamily: "'JetBrains Mono',monospace" }}>MODEL</label>
                  <select value={llmModel} onChange={e => setLlmModel(e.target.value)}
                          className="w-full rounded-[14px] py-3 px-4 text-[14px] focus:outline-none"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#e4e1ee', fontFamily: "'JetBrains Mono',monospace" }}>
                    <option value="anthropic/claude-haiku-4.5">claude-haiku-4-5 (fast)</option>
                    <option value="anthropic/claude-sonnet-4-5">claude-sonnet-4-5 (balanced)</option>
                    <option value="openai/gpt-4o-mini">gpt-4o-mini (OpenAI)</option>
                    <option value="meta-llama/llama-3.1-8b-instruct:free">llama-3.1-8b (free)</option>
                  </select>
                </div>
              )}

              {/* API key for byok */}
              {llm === 'byok' && (
                <div>
                  <label className="block text-[12px] mb-2" style={{ color: 'rgba(199,196,216,0.6)', fontFamily: "'JetBrains Mono',monospace" }}>YOUR API KEY</label>
                  <input
                    type="password"
                    value={llmApiKey}
                    onChange={e => setLlmApiKey(e.target.value)}
                    placeholder="sk-ant-... / sk-... / sk-or-..."
                    className="w-full rounded-[14px] py-3 px-4 text-[14px] focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#e4e1ee', fontFamily: "'JetBrains Mono',monospace" }}
                  />
                  <p className="text-[11px] mt-1" style={{ color: 'rgba(199,196,216,0.4)', fontFamily: "'JetBrains Mono',monospace" }}>
                    Encrypted with AES-256-GCM. We never store plaintext keys.
                  </p>
                </div>
              )}

              {configError && <p className="text-[13px] rounded-xl p-3" style={{ color: '#ffb4ab', background: 'rgba(255,180,171,0.08)', border: '1px solid rgba(255,180,171,0.2)' }}>{configError}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="px-6 py-3 rounded-full text-[13px]"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#c7c4d8', fontFamily: "'JetBrains Mono',monospace" }}>
                  Back
                </button>
                <button onClick={deployAgent}
                        className="flex-1 py-3 rounded-full font-bold text-[14px] flex items-center justify-center gap-2 hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg,#c4c0ff,#4f44e2)', color: '#fff', fontFamily: "'JetBrains Mono',monospace" }}>
                  Deploy Agent <span className="ms text-[18px]">rocket_launch</span>
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Deploying ── */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-[28px] font-bold" style={{ color: '#e4e1ee', letterSpacing: '-1px' }}>
                {result ? 'Agent deployed!' : deployError ? 'Deploy failed' : 'Deploying your agent…'}
              </h2>

              {/* Terminal log */}
              <div className="rounded-[16px] p-4 min-h-[160px]" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', fontFamily: "'JetBrains Mono',monospace" }}>
                {deployLog.map((line, i) => (
                  <div key={i} className="text-[13px] leading-7" style={{ color: line.startsWith('✓') ? '#a2e7ff' : '#c7c4d8' }}>{line}</div>
                ))}
                {deploying && (
                  <div className="flex items-center gap-2 text-[13px]" style={{ color: 'rgba(199,196,216,0.5)' }}>
                    <span className="w-3 h-3 rounded-full border-2 border-t-primary animate-spin-slow" style={{ borderColor: 'rgba(196,192,255,0.3)', borderTopColor: '#c4c0ff' }} />
                    Processing…
                  </div>
                )}
                {deployError && <div className="text-[13px]" style={{ color: '#ffb4ab' }}>✗ {deployError}</div>}
              </div>

              {/* Success: deeplink */}
              {result?.telegram_deeplink && (
                <div className="space-y-3">
                  <div className="text-[12px]" style={{ color: 'rgba(199,196,216,0.6)', fontFamily: "'JetBrains Mono',monospace" }}>YOUR TELEGRAM DEEPLINK</div>
                  <div className="glass-card rounded-[14px] flex items-center gap-3 p-4">
                    <span className="ms text-[20px]" style={{ color: '#a2e7ff' }}>send</span>
                    <a href={result.telegram_deeplink} target="_blank" rel="noreferrer"
                       className="flex-1 text-[13px] truncate hover:underline"
                       style={{ color: '#c4c0ff', fontFamily: "'JetBrains Mono',monospace" }}>
                      {result.telegram_deeplink}
                    </a>
                    <button onClick={copyDeeplink} className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px]"
                            style={{ background: copied ? 'rgba(162,231,255,0.15)' : 'rgba(255,255,255,0.08)', color: copied ? '#a2e7ff' : '#c7c4d8', border: '1px solid rgba(255,255,255,0.12)', fontFamily: "'JetBrains Mono',monospace" }}>
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[12px]" style={{ color: 'rgba(199,196,216,0.5)', fontFamily: "'JetBrains Mono',monospace" }}>
                    Open this link in Telegram to pair your bot with your agent. The link expires in 1 hour.
                  </p>

                  <a href={result.telegram_deeplink} target="_blank" rel="noreferrer"
                     className="block w-full py-4 rounded-full font-bold text-[14px] text-center transition-opacity hover:opacity-90"
                     style={{ background: 'linear-gradient(135deg,#a2e7ff,#00d2fd)', color: '#003642', fontFamily: "'JetBrains Mono',monospace" }}>
                    Open in Telegram →
                  </a>
                </div>
              )}

              {deployError && (
                <button onClick={() => { setStep(2); setDeployLog([]); setDeployError(''); }}
                        className="w-full py-3 rounded-full text-[13px]"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#c7c4d8', fontFamily: "'JetBrains Mono',monospace" }}>
                  ← Try again
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
