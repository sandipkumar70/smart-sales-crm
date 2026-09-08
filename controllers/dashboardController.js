// const Customer = require("../models/Customer");
// const Lead = require("../models/Lead");
// const Deal = require("../models/Deal");
// const User = require("../models/User");

// // @route  GET /api/dashboard/stats
// const getDashboardStats = async (req, res) => {
//   try {
//     const isAgent = req.user.role === "sales_agent";

//     // Agents only see stats for their own assigned records; admin/manager see everything
//     const leadFilter = isAgent ? { assignedTo: req.user._id } : {};
//     const dealFilter = isAgent ? { assignedTo: req.user._id } : {};
//     // Customers don't have an "assignedTo" concept — scope by who created them for agents
//     const customerFilter = isAgent ? { createdBy: req.user._id } : {};

//     const [totalCustomers, totalLeads, totalDeals, dealsByStatus, revenueResult] = await Promise.all([
//       Customer.countDocuments(customerFilter),
//       Lead.countDocuments(leadFilter),
//       Deal.countDocuments(dealFilter),
//       Deal.aggregate([
//         { $match: dealFilter },
//         { $group: { _id: "$status", count: { $sum: 1 } } },
//       ]),
//       Deal.aggregate([
//         { $match: { ...dealFilter, status: "won" } },
//         { $group: { _id: null, total: { $sum: "$value" } } },
//       ]),
//     ]);

//     // dealsByStatus comes back as [{ _id: "open", count: 3 }, ...] — turn it into a simple lookup
//     const statusCounts = { open: 0, won: 0, lost: 0 };
//     dealsByStatus.forEach((row) => {
//       statusCounts[row._id] = row.count;
//     });

//     const totalRevenue = revenueResult[0]?.total || 0;

//     // Conversion rate: won deals out of total leads (simple, explainable definition)
//     const conversionRate = totalLeads > 0 ? Number(((statusCounts.won / totalLeads) * 100).toFixed(1)) : 0;

//     const stats = {
//       totalCustomers,
//       totalLeads,
//       totalDeals,
//       openDeals: statusCounts.open,
//       wonDeals: statusCounts.won,
//       lostDeals: statusCounts.lost,
//       totalRevenue,
//       conversionRate,
//     };

//     // Admin/manager also get a per-agent performance breakdown
//     if (!isAgent) {
//       const agents = await User.find({ role: { $in: ["sales_agent", "sales_manager"] } }).select("name email role");

//       const agentPerformance = await Promise.all(
//         agents.map(async (agent) => {
//           const [leadsAssigned, wonDealsForAgent, revenueForAgent] = await Promise.all([
//             Lead.countDocuments({ assignedTo: agent._id }),
//             Deal.countDocuments({ assignedTo: agent._id, status: "won" }),
//             Deal.aggregate([
//               { $match: { assignedTo: agent._id, status: "won" } },
//               { $group: { _id: null, total: { $sum: "$value" } } },
//             ]),
//           ]);

//           return {
//             agentId: agent._id,
//             name: agent.name,
//             role: agent.role,
//             leadsAssigned,
//             wonDeals: wonDealsForAgent,
//             revenue: revenueForAgent[0]?.total || 0,
//             conversionRate: leadsAssigned > 0 ? Number(((wonDealsForAgent / leadsAssigned) * 100).toFixed(1)) : 0,
//           };
//         })
//       );

//       stats.agentPerformance = agentPerformance;
//     }

//     return res.status(200).json({ stats });
//   } catch (error) {
//     return res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

// module.exports = { getDashboardStats };










const Customer = require("../models/Customer");
const Lead = require("../models/Lead");
const Deal = require("../models/Deal");
const User = require("../models/User");
const FollowUp = require("../models/FollowUp");

// @route  GET /api/dashboard/stats
const getDashboardStats = async (req, res) => {
  try {
    const isAgent = req.user.role === "sales_agent";

    const leadFilter = isAgent ? { assignedTo: req.user._id } : {};
    const dealFilter = isAgent ? { assignedTo: req.user._id } : {};
    const customerFilter = isAgent ? { createdBy: req.user._id } : {};
    const followUpFilter = isAgent ? { assignedTo: req.user._id } : {};

    // ── Core KPI queries ──
    const [totalCustomers, totalLeads, totalDeals, dealsByStatus, revenueResult] = await Promise.all([
      Customer.countDocuments(customerFilter),
      Lead.countDocuments(leadFilter),
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
      ? Number(((statusCounts.won / totalLeads) * 100).toFixed(1))
      : 0;

    // ── Revenue Trend (last 6 months) ──
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const revenueTrendRaw = await Deal.aggregate([
      { $match: { ...dealFilter, status: "won", createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          revenue: { $sum: "$value" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const revenueTrend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const found = revenueTrendRaw.find((r) => r._id.year === y && r._id.month === m);
      revenueTrend.push({ month: monthNames[m - 1], revenue: found?.revenue || 0 });
    }

    // ── Upcoming Follow-ups (next 7 days, pending only) ──
    const now = new Date();
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

    const upcomingFollowUps = await FollowUp.find({
      ...followUpFilter,
      status: "pending",
      dueDate: { $gte: now, $lte: sevenDaysLater },
    })
      .sort({ dueDate: 1 })
      .limit(5)
      .populate("lead", "name")
      .populate("assignedTo", "name");

    // ── Recent Leads (last 5) ──
    const recentLeads = await Lead.find(leadFilter)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("assignedTo", "name")
      .select("name company status priority createdAt assignedTo");

    const stats = {
      totalCustomers,
      totalLeads,
      totalDeals,
      openDeals: statusCounts.open,
      wonDeals: statusCounts.won,
      lostDeals: statusCounts.lost,
      totalRevenue,
      conversionRate,
      revenueTrend,
      upcomingFollowUps,
      recentLeads,
    };

    // ── Agent Performance (admin/manager only) ──
    if (!isAgent) {
      const agents = await User.find({ role: { $in: ["sales_agent", "sales_manager"] } }).select("name email role");

      const agentPerformance = await Promise.all(
        agents.map(async (agent) => {
          const [leadsAssigned, wonDealsForAgent, revenueForAgent] = await Promise.all([
            Lead.countDocuments({ assignedTo: agent._id }),
            Deal.countDocuments({ assignedTo: agent._id, status: "won" }),
            Deal.aggregate([
              { $match: { assignedTo: agent._id, status: "won" } },
              { $group: { _id: null, total: { $sum: "$value" } } },
            ]),
          ]);

          return {
            agentId: agent._id,
            name: agent.name,
            role: agent.role,
            leadsAssigned,
            wonDeals: wonDealsForAgent,
            revenue: revenueForAgent[0]?.total || 0,
            conversionRate: leadsAssigned > 0
              ? Number(((wonDealsForAgent / leadsAssigned) * 100).toFixed(1))
              : 0,
          };
        })
      );

      stats.agentPerformance = agentPerformance;
    }

    return res.status(200).json({ stats });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { getDashboardStats };