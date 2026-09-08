const express = require("express");
const {
  createFollowUp,
  getFollowUps,
  getFollowUpById,
  updateFollowUp,
  deleteFollowUp,
} = require("../controllers/followUpController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createFollowUp);
router.get("/", protect, getFollowUps);
router.get("/:id", protect, getFollowUpById);
router.put("/:id", protect, updateFollowUp);
router.delete("/:id", protect, deleteFollowUp);

module.exports = router;