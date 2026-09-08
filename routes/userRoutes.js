const express = require("express");
const { getUsers, getProfile, updateProfile, changePassword } = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

// Assignment dropdown — admin/manager only
router.get("/", protect, authorizeRoles("admin", "sales_manager"), getUsers);

// Profile — any logged-in user
router.get("/profile", protect, getProfile);
router.put("/profile", protect, updateProfile);
router.put("/change-password", protect, changePassword);

module.exports = router;