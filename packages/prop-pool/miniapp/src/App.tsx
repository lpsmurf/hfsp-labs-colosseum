import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { getProgram, createAndJoin, joinProp, claim, fetchProp, type CreateParams } from "./propPool";

const tg = (window as any).Telegram?.WebApp;

function useParams() {
  return useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    const get = (k: string) => q.get(k) ?? "";
    return {
      mode: (get("mode") || "join") as "create" | "join",
      prop: get("prop"),
      creator: get("creator"),
      nonce: get("nonce"),
      fixtureId: get("fixtureId"),
      statKey: Number(get("statKey") || 0),
      period: Number(get("period") || 4),
      threshold: Number(get("threshold") || 0),
      cmp: (get("cmp") || "gt") as "lt" | "gt",
      mint: get("mint"),
    };
  }, []);
}

const usdc = (n: number) => (n / 1e6).toFixed(2);

export function App() {
  const p = useParams();
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [prop, setProp] = useState<any | null>(null);
  const [side, setSide] = useState<boolean>(p.cmp === "gt");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const program = useMemo(() => (wallet ? getProgram(connection, wallet) : null), [connection, wallet]);
  const propPk = useMemo(() => (p.prop ? new PublicKey(p.prop) : null), [p.prop]);

  useEffect(() => { tg?.ready?.(); tg?.expand?.(); }, []);

  const refresh = useCallback(async () => {
    if (!program || !propPk) return;
    setProp(await fetchProp(program, propPk));
  }, [program, propPk]);
  useEffect(() => { void refresh(); }, [refresh]);

  const exists = !!prop;
  const isCreator = wallet?.publicKey?.toBase58() === p.creator;
  const settled = prop && "settled" in (prop.status ?? {});
  const iWin = settled && side === prop.winningSide;

  const act = async (fn: () => Promise<string>, label: string) => {
    setBusy(true); setMsg("");
    try {
      const sig = await fn();
      setMsg(`${label} ✅ ${sig.slice(0, 8)}…`);
      await refresh();
    } catch (e: any) {
      setMsg(`Error: ${e?.message ?? String(e)}`.slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  const amountUnits = Math.round(Number(amount || "0") * 1e6);

  const onCreate = () =>
    act(() => createAndJoin(program!, p as CreateParams, side, amountUnits), "Created + staked");
  const onJoin = () =>
    act(() => joinProp(program!, propPk!, new PublicKey(prop.stakeMint), side, amountUnits), "Joined");
  const onClaim = () => act(() => claim(program!, propPk!, prop), "Claimed");

  return (
    <div className="wrap">
      <h1>PropPool</h1>
      <p className="sub">Parametric prop bets, auto-settled by TxLINE on-chain proofs · devnet</p>

      <div className="card">
        <div className="prop-title">
          {p.statKey ? `stat ${p.statKey}` : "prop"} {p.cmp === "gt" ? "over" : "under"} {p.threshold}
        </div>
        <div className="muted">fixture {p.fixtureId}</div>
        {prop && (
          <div className="pool">
            <div><span>OVER</span><b>{usdc(Number(prop.overStake))} USDC</b></div>
            <div><span>UNDER</span><b>{usdc(Number(prop.underStake))} USDC</b></div>
            <div><span>status</span><b>{Object.keys(prop.status)[0]}</b></div>
          </div>
        )}
      </div>

      <div className="connect"><WalletMultiButton /></div>

      {!wallet ? (
        <p className="muted">Connect a wallet (Phantom / Solflare) to continue.</p>
      ) : settled ? (
        <div className="card">
          <div className="prop-title">Settled — {prop.winningSide ? "OVER" : "UNDER"} won</div>
          {iWin ? (
            <button disabled={busy} onClick={onClaim}>Claim winnings</button>
          ) : (
            <p className="muted">This prop is settled.</p>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="side-row">
            <button className={side ? "sel" : ""} onClick={() => setSide(true)}>OVER ▲</button>
            <button className={!side ? "sel" : ""} onClick={() => setSide(false)}>UNDER ▼</button>
          </div>
          <label>Amount (USDC)
            <input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          {p.mode === "create" && !exists && isCreator ? (
            <button disabled={busy} onClick={onCreate}>Create pool & stake</button>
          ) : exists ? (
            <button disabled={busy} onClick={onJoin}>Join & stake</button>
          ) : (
            <p className="muted">Waiting for the creator to open this pool…</p>
          )}
        </div>
      )}

      {msg && <p className="msg">{msg}</p>}
      <p className="foot">UNAUDITED · devnet only · stakes in USDC</p>
    </div>
  );
}
