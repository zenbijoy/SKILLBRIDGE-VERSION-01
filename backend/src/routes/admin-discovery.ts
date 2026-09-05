import { Router } from "express";
import { admin as db } from "../lib/db.js";
import { wrap } from "../middleware/error.js";

export const adminDiscoveryRoutes = Router();

adminDiscoveryRoutes.get(
  "/",
  wrap(async (_req, res) => {
    // Fetch real metrics from database
    const [
      { data: profilesData },
      { count: totalRequests },
      { count: acceptedRequests },
      { count: totalRooms },
      { count: totalMemberships },
      { data: searchEvents, count: totalSearchEvents },
      { data: zeroEvents }
    ] = await Promise.all([
      db.from("profiles").select("research_interests").limit(200),
      db.from("connection_requests").select("*", { count: "exact", head: true }),
      db.from("connection_requests").select("*", { count: "exact", head: true }).eq("status", "accepted"),
      db.from("rooms").select("*", { count: "exact", head: true }),
      db.from("room_members").select("*", { count: "exact", head: true }),
      db.from("search_analytics_events").select("search_query_normalized, result_count, created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(200),
      db.from("search_analytics_events").select("search_query_normalized, result_count, created_at").eq("result_count", 0).order("created_at", { ascending: false }).limit(50)
    ]);

    // Aggregate research interest topics
    const researchCounts = new Map<string, number>();
    for (const p of profilesData ?? []) {
      if (Array.isArray(p.research_interests)) {
        for (const topic of p.research_interests) {
          const norm = String(topic).trim();
          if (norm) {
            researchCounts.set(norm, (researchCounts.get(norm) ?? 0) + 1);
          }
        }
      }
    }

    const popularResearch = Array.from(researchCounts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Aggregate real top searches from search_analytics_events
    const searchFreq = new Map<string, { count: number; totalResults: number }>();
    let successfulSearchesCount = 0;

    for (const ev of searchEvents ?? []) {
      const q = ev.search_query_normalized;
      if (ev.result_count > 0) successfulSearchesCount++;
      const curr = searchFreq.get(q) ?? { count: 0, totalResults: 0 };
      searchFreq.set(q, {
        count: curr.count + 1,
        totalResults: curr.totalResults + ev.result_count,
      });
    }

    const topSearches = Array.from(searchFreq.entries())
      .map(([query, stat]) => ({
        query,
        count: stat.count,
        resultCount: Math.round(stat.totalResults / stat.count),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Aggregate real zero-result searches
    const zeroFreq = new Map<string, { count: number; lastSearched: string }>();
    for (const ev of zeroEvents ?? []) {
      const q = ev.search_query_normalized;
      const curr = zeroFreq.get(q);
      if (!curr) {
        zeroFreq.set(q, { count: 1, lastSearched: ev.created_at });
      } else {
        zeroFreq.set(q, { count: curr.count + 1, lastSearched: curr.lastSearched });
      }
    }

    const zeroResultSearches = Array.from(zeroFreq.entries())
      .map(([query, stat]) => ({
        query,
        count: stat.count,
        lastSearched: stat.lastSearched,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const totalEvents = totalSearchEvents ?? (searchEvents?.length ?? 0);
    const searchSuccessRate = totalEvents > 0
      ? Math.round((successfulSearchesCount / totalEvents) * 100)
      : 100;

    const connectionAcceptanceRate = (totalRequests ?? 0) > 0
      ? Math.round(((acceptedRequests ?? 0) / (totalRequests ?? 0)) * 100)
      : 0;

    const roomAvgMembers = (totalRooms ?? 0) > 0
      ? Number(((totalMemberships ?? 0) / (totalRooms ?? 0)).toFixed(1))
      : 0;

    res.json({
      metrics: {
        searchSuccessRate,
        connectionAcceptanceRate,
        roomAvgMembers,
        totalDiscoveryQueries: totalEvents,
      },
      topSearches,
      zeroResultSearches,
      popularResearch,
    });
  }),
);
