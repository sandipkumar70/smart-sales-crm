const mongoose = require("mongoose");
const User = require("../models/User");

// Confirms the user being assigned exists and holds a sales-related role.
// Shared across Lead, FollowUp and Deal controllers to avoid duplicating this check.
const validateAssignedUser = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return { valid: false, message: "Invalid assigned user ID" };
  }
  const user = await User.findById(userId);
  if (!user) {
    return { valid: false, message: "Assigned user not found" };
  }
  if (!["sales_agent", "sales_manager"].includes(user.role)) {
    return { valid: false, message: "Can only be assigned to a sales agent or sales manager" };
  }
  return { valid: true };
};

module.exports = { validateAssignedUser };