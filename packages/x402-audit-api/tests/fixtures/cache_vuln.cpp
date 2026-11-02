#include <map>
// Range proof verification with a memoized result, keyed on the output's txid.
static std::map<uint256, bool> g_proof_verify_cache;

bool VerifyRangeProof(const CTxOut& out, const CTxIn& in) {
    if (g_proof_verify_cache.count(out.txid)) {
        return true;
    }
    bool ok = secp256k1_rangeproof_verify(ctx, &min, &max, &out.commitment, out.proof.data());
    g_proof_verify_cache.insert(out.txid, ok);
    return ok;
}
