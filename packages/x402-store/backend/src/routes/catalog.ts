// Public catalog endpoints — proxy to Cryptorefills, no payment required.
// Agents use these to browse brands and products before placing an order.
import { Router } from "express";
import { getBrands, getCatalog } from "../services/cryptorefills.js";

const router = Router();

// GET /api/brands?country_code=us
router.get("/brands", async (req, res) => {
  const countryCode = (req.query.country_code as string | undefined)?.toLowerCase();
  if (!countryCode) {
    res.status(400).json({ ok: false, error: "country_code required" });
    return;
  }
  try {
    const data = await getBrands(countryCode);
    res.json(data);
  } catch (e: any) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// GET /api/catalog?country_code=us&brand_name=Amazon.com
router.get("/catalog", async (req, res) => {
  const countryCode = (req.query.country_code as string | undefined)?.toLowerCase();
  const brandName   = req.query.brand_name as string | undefined;
  if (!countryCode || !brandName) {
    res.status(400).json({ ok: false, error: "country_code and brand_name required" });
    return;
  }
  try {
    const data = await getCatalog(countryCode, brandName);
    res.json(data);
  } catch (e: any) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

export default router;
