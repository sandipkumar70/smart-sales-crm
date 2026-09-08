const express = require("express");
const {
  createDeal,
  getDeals,
  getDealById,
  updateDeal,
  deleteDeal,
} = require("../controllers/dealController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createDeal);
router.get("/", protect, getDeals);
router.get("/:id", protect, getDealById);
router.put("/:id", protect, updateDeal);
router.delete("/:id", protect, deleteDeal);

module.exports = router;