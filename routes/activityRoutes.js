const express = require("express");
const {
  createActivity,
  getActivities,
  getActivityById,
  updateActivity,
  deleteActivity,
} = require("../controllers/activityController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, createActivity);
router.get("/", protect, getActivities);
router.get("/:id", protect, getActivityById);
router.put("/:id", protect, updateActivity);
router.delete("/:id", protect, deleteActivity);

module.exports = router;