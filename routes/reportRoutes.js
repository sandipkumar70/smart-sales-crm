const express = require("express");
const { getHistoricalData } = require("../controllers/reportController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/historical", protect, getHistoricalData);

module.exports = router;