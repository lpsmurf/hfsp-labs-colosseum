use std::collections::HashMap;
use lru::LruCache;
struct Verifier { proof_cache: LruCache<[u8;32], bool> }

impl Verifier {
    fn verify_proof(&mut self, out: &Output) -> Result<()> {
        // Key binds the complete output: commitment, asset tag, amount and proof.
        let key = sha256(&serialize_full(out));
        if let Some(true) = self.proof_cache.get(&key) {
            return self.reverify_if_stale(out);
        }
        let ok = range_proof_verify(&out.commitment, &out.proof)?;
        self.proof_cache.put(key, ok);
        self.proof_cache.clear_expired();
        Ok(())
    }
}
