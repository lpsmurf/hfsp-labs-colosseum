use std::collections::HashMap;
struct Verifier { proof_cache: HashMap<[u8;32], bool> }

impl Verifier {
    fn verify_proof(&mut self, out: &Output) -> Result<()> {
        if self.proof_cache.contains_key(&out.id) {
            return Ok(());
        }
        let ok = range_proof_verify(&out.commitment, &out.proof)?;
        self.proof_cache.insert(out.id, ok);
        Ok(())
    }
}
