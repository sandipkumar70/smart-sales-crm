const mongoose = require("mongoose");
const Activity = require("../models/Activity");

const VALID_TYPES = ["call", "email", "meeting", "note"];

// @route  POST /api/activities
const createActivity = async (req, res) => {
  try {
    const { lead, customer, type, description, activityDate } = req.body;

    if (!type || !description) {
      return res.status(400).json({ message: "Type and description are required" });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ message: "Invalid activity type" });
    }
    if (lead && !mongoose.Types.ObjectId.isValid(lead)) {
      return res.status(400).json({ message: "Invalid lead ID" });
    }
    if (customer && !mongoose.Types.ObjectId.isValid(customer)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    // The performer of the activity is always the authenticated user —
    // keeps ownership simple and avoids trusting the frontend.
    const activity = await Activity.create({
      lead: lead || null,
      customer: customer || null,
      user: req.user._id,
      type,
      description,
      activityDate: activityDate || undefined,
      createdBy: req.user._id,
    });

    return res.status(201).json({ message: "Activity created successfully", activity });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  GET /api/activities
const getActivities = async (req, res) => {
  try {
    const { page = 1, limit = 10, lead, customer, type } = req.query;

    const query = {};
    if (lead) query.lead = lead;
    if (customer) query.customer = customer;
    if (type) query.type = type;

    // Sales agents can only see activities they performed
    if (req.user.role === "sales_agent") {
      query.user = req.user._id;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
    const skip = (pageNum - 1) * limitNum;

    const [activities, totalActivities] = await Promise.all([
      Activity.find(query)
        .populate("lead", "name company status")
        .populate("customer", "name email")
        .populate("user", "name email role")
        .sort({ activityDate: -1 })
        .skip(skip)
        .limit(limitNum),
      Activity.countDocuments(query),
    ]);

    return res.status(200).json({
      activities,
      currentPage: pageNum,
      totalPages: Math.ceil(totalActivities / limitNum),
      totalActivities,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  GET /api/activities/:id
const getActivityById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid activity ID" });
    }

    const activity = await Activity.findById(id)
      .populate("lead", "name company status")
      .populate("customer", "name email")
      .populate("user", "name email role");

    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }

    if (
      req.user.role === "sales_agent" &&
      String(activity.user._id) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Access denied. This activity is not yours" });
    }

    return res.status(200).json({ activity });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  PUT /api/activities/:id
const updateActivity = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid activity ID" });
    }

    const existing = await Activity.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Activity not found" });
    }

    if (
      req.user.role === "sales_agent" &&
      String(existing.user) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Access denied. This activity is not yours" });
    }

    const { createdBy, user, type, ...rest } = req.body;
    const updateData = { ...rest };

    if (type !== undefined) {
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ message: "Invalid activity type" });
      }
      updateData.type = type;
    }

    const activity = await Activity.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("lead", "name company status")
      .populate("customer", "name email")
      .populate("user", "name email role");

    return res.status(200).json({ message: "Activity updated successfully", activity });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  DELETE /api/activities/:id
const deleteActivity = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid activity ID" });
    }

    const existing = await Activity.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Activity not found" });
    }

    const isOwner = String(existing.user) === String(req.user._id);
    const isPrivileged = ["admin", "sales_manager"].includes(req.user.role);
    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ message: "Access denied. You can only delete your own activities" });
    }

    await Activity.findByIdAndDelete(id);
    return res.status(200).json({ message: "Activity deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createActivity,
  getActivities,
  getActivityById,
  updateActivity,
  deleteActivity,
};