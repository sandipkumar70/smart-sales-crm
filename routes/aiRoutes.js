const express = require("express");
const {
  scoreLead,
  generateFollowupMessage,
  conversionProbability,
} = require("../controllers/aiController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/lead-score", protect, scoreLead);
router.post("/followup-message", protect, generateFollowupMessage);
router.post("/conversion-probability", protect, conversionProbability);

module.exports = router;