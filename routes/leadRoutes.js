const express = require("express");
const {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  getPipeline,
} = require("../controllers/leadController");
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/", protect, createLead);
router.get("/", protect, getLeads);

// IMPORTANT: this must come BEFORE "/:id", otherwise Express would treat
// "pipeline" as an :id value and route it to getLeadById instead.
router.get("/pipeline", protect, getPipeline);

router.get("/:id", protect, getLeadById);
router.put("/:id", protect, updateLead);

// Only admin and sales_manager can delete a lead
router.delete("/:id", protect, authorizeRoles("admin", "sales_manager"), deleteLead);

module.exports = router;