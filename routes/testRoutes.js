const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

// Any authenticated user (any role) can access this
router.get("/authenticated", protect, (req, res) => {
  res.status(200).json({
    message: `Hello ${req.user.name}, you are authenticated`,
    role: req.user.role,
  });
});

// Only admin can access this
router.get("/admin", protect, authorizeRoles("admin"), (req, res) => {
  res.status(200).json({ message: "Welcome Admin, access granted" });
});

// Admin and sales_manager can access this
router.get(
  "/manager",
  protect,
  authorizeRoles("admin", "sales_manager"),
  (req, res) => {
    res.status(200).json({ message: "Welcome Manager/Admin, access granted" });
  }
);

// All authenticated sales users (admin, sales_manager, sales_agent) can access this
router.get(
  "/sales",
  protect,
  authorizeRoles("admin", "sales_manager", "sales_agent"),
  (req, res) => {
    res.status(200).json({ message: "Welcome, sales team access granted" });
  }
);

module.exports = router;