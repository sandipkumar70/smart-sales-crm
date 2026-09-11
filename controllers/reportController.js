const Lead = require("../models/Lead");
const Deal = require("../models/Deal");
const Customer = require("../models/Customer");
const User = require("../models/User");

// @route GET /api/reports/historical
const getHistoricalData = async (req, res) => {
  try {
    const isAgent = req.user.role === "sales_agent";
    const { range, startDate, endDate } = req.query;

    // ── Date Range ──
    let start, end;
    end = new Date();

    if (range === "1year") {
      start = new Date();
      start.setFullYear(start.getFullYear() - 1);
    } else if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      // default: 6 months
      start = new Date();
      start.setMonth(start.getMonth() - 5);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }

    const leadFilter = isAgent
      ? { assignedTo: req.user._id, createdAt: { $gte: start, $lte: end } }
      : { createdAt: { $gte: start, $lte: end } };

    const dealFilter = isAgent
      ? { assignedTo: req.user._id, createdAt: { $gte: start, $lte: end } }
      : { createdAt: { $gte: start, $lte: end } };

    // ── KPI Cards ──
    const [totalLeads, wonLeads, lostLeads, totalDeals, dealsByStatus, revenueResult] =
      await Promise.all([
        Lead.countDocuments(leadFilter),
        Lead.countDocuments({ ...leadFilter, status: "won" }),
        Lead.countDocuments({ ...leadFilter, status: "lost" }),
        Deal.countDocuments(dealFilter),
        Deal.aggregate([
          { $match: dealFilter },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        Deal.aggregate([
          { $match: { ...dealFilter, status: "won" } },
          { $group: { _id: null, total: { $sum: "$value" } } },
        ]),
      ]);

    const statusCounts = { open: 0, won: 0, lost: 0 };
    dealsByStatus.forEach((row) => { statusCounts[row._id] = row.count; });

    const totalRevenue = revenueResult[0]?.total || 0;
    const conversionRate = totalLeads > 0
      ? Number(((wonLeads / totalLeads) * 100).toFixed(1))
      : 0;

    // ── Month helpers ──
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    const getMonthRange = () => {
      const months = [];
      const current = new Date(start);
      while (current <= end) {
        months.push({ year: current.getFullYear(), month: current.getMonth() + 1 });
        current.setMonth(current.getMonth() + 1);
      }
      return months;
    };
    const months = getMonthRange();

    // ── Revenue History ──
    const revenueRaw = await Deal.aggregate([
      { $match: { ...dealFilter, status: "won" } },
      { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, revenue: { $sum: "$value" } } },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const revenueHistory = months.map(({ year, month }) => {
      const found = revenueRaw.find((r) => r._id.year === year && r._id.month === month);
      return { month: `${monthNames[month - 1]} ${year}`, revenue: found?.revenue || 0 };
    });

    // ── Lead History ──
    const leadRaw = await Lead.aggregate([
      { $match: leadFilter },
      { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" }, status: "$status" }, count: { $sum: 1 } } },
    ]);

    const leadHistory = months.map(({ year, month }) => {
      const newLeads = leadRaw.filter((l) => l._id.year === year && l._id.month === month && l._id.status === "new").reduce((s, l) => s + l.count, 0);
      const won = leadRaw.filter((l) => l._id.year === year && l._id.month === month && l._id.status === "won").reduce((s, l) => s + l.count, 0);
      const lost = leadRaw.filter((l) => l._id.year === year && l._id.month === month && l._id.status === "lost").reduce((s, l) => s + l.count, 0);
      return { month: `${monthNames[month - 1]} ${year}`, new: newLeads, won, lost };
    });

    // ── Conversion Rate History ──
    const conversionHistory = months.map(({ year, month }) => {
      const total = leadRaw.filter((l) => l._id.year === year && l._id.month === month).reduce((s, l) => s + l.count, 0);
      const won = leadRaw.filter((l) => l._id.year === year && l._id.month === month && l._id.status === "won").reduce((s, l) => s + l.count, 0);
      return { month: `${monthNames[month - 1]} ${year}`, rate: total > 0 ? Number(((won / total) * 100).toFixed(1)) : 0 };
    });

    // ── Deal History Table ──
    const dealHistory = await Deal.find(dealFilter)
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("lead", "name")
      .populate("assignedTo", "name")
      .select("name value status createdAt lead assignedTo");

    // ── Agent Performance (admin/manager only) ──
    let agentPerformance = null;
    if (!isAgent) {
      const agents = await User.find({ role: { $in: ["sales_agent", "sales_manager"] } }).select("name role");
      agentPerformance = await Promise.all(
        agents.map(async (agent) => {
          const agentLeadFilter = { assignedTo: agent._id, createdAt: { $gte: start, $lte: end } };
          const agentDealFilter = { assignedTo: agent._id, createdAt: { $gte: start, $lte: end } };

          const [leads, wonDeals, lostDeals, revenueRes] = await Promise.all([
            Lead.countDocuments(agentLeadFilter),
            Deal.countDocuments({ ...agentDealFilter, status: "won" }),
            Deal.countDocuments({ ...agentDealFilter, status: "lost" }),
            Deal.aggregate([
              { $match: { ...agentDealFilter, status: "won" } },
              { $group: { _id: null, total: { $sum: "$value" } } },
            ]),
          ]);

          return {
            name: agent.name,
            role: agent.role,
            leads,
            wonDeals,
            lostDeals,
            revenue: revenueRes[0]?.total || 0,
            conversionRate: leads > 0 ? Number(((wonDeals / leads) * 100).toFixed(1)) : 0,
          };
        })
      );
    }

    return res.status(200).json({
      kpi: { totalLeads, wonLeads, lostLeads, totalDeals, wonDeals: statusCounts.won, totalRevenue, conversionRate },
      revenueHistory,
      leadHistory,
      conversionHistory,
      dealHistory,
      agentPerformance,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { getHistoricalData };