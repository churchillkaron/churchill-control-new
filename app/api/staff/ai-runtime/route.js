import OpenAI from "openai";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import buildOperationalContext from "@/lib/runtime/buildOperationalContext";
import generateLiveMission from "@/lib/runtime/generateLiveMission";
import detectVIPTables from "@/lib/runtime/detectVIPTables";
import detectKitchenIssues from "@/lib/runtime/detectKitchenIssues";
import generateLiveNotifications from "@/lib/runtime/generateLiveNotifications";
import generateOperationalInsights from "@/lib/runtime/generateOperationalInsights";
import buildRealtimeSnapshot from "@/lib/runtime/buildRealtimeSnapshot";
import buildStaffRuntime from "@/lib/runtime/buildStaffRuntime";
import generateRealtimeRecommendations from "@/lib/runtime/generateRealtimeRecommendations";
import generateShiftInsights from "@/lib/runtime/generateShiftInsights";
import generateLiveTasks from "@/lib/runtime/generateLiveTasks";
import generateRealtimeFeed from "@/lib/runtime/generateRealtimeFeed";
import generateAIActions from "@/lib/runtime/generateAIActions";
import buildOperationalScore from "@/lib/runtime/buildOperationalScore";
import runFullIntelligenceCycle from "@/lib/intelligence/orchestrator/runFullIntelligenceCycle";
import classifyStaffAIIntent from "@/lib/intelligence/router/classifyStaffAIIntent";

const openai =
  new OpenAI({
    apiKey:
      process.env.OPENAI_API_KEY,
  });

export async function POST(req) {

  try {

    const body =
      await req.json();

    // =====================================
    // STAFF
    // =====================================

    const {
      data: staff,
    } = await supabaseAdmin

      .from("staff_accounts")

      .select("*")

      .eq(
        "tenant_id",
        "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4"
      )

      .limit(1)

      .single();

    // =====================================
    // ACTIVE TABLES
    // =====================================

    const {
      data: activeTables,
    } = await supabaseAdmin

      .from("restaurant_tables")

      .select("*")

      .eq(
        "status",
        "OCCUPIED"
      )

      .limit(10);

    // =====================================
    // ACTIVE ORDERS
    // =====================================

    const {
      data: activeOrders,
    } = await supabaseAdmin

      .from("orders")

      .select("*")

      .in(
        "status",
        [
          "OPEN",
          "IN_PROGRESS",
          "READY",
        ]
      )

      .limit(20);

    // =====================================
    // PAYMENTS TODAY
    // =====================================

    const {
      data: payments,
    } = await supabaseAdmin

      .from("pos_payments")

      .select("*")

      .limit(20);

    // =====================================
    // MEMORY
    // =====================================

    const {
      data: memories,
    } = await supabaseAdmin

      .from("ai_staff_memory")

      .select("*")

      .limit(10);

    // =====================================
    // LIVE STATS
    // =====================================

    const revenueToday =
      (payments || [])
        .reduce(
          (sum, p) =>
            sum +
            Number(
              p.amount_paid || 0
            ),
          0
        );

    const occupiedTables =
      activeTables?.length || 0;

    const openOrders =
      activeOrders?.length || 0;



    // =====================================
    // OPERATIONAL CONTEXT
    // =====================================

    const operationalContext =
      buildOperationalContext({

        tables:
          activeTables || [],

        orders:
          activeOrders || [],

        payments:
          payments || [],

      });



    // =====================================
    // AI DETECTION
    // =====================================

    const vipTables =
      detectVIPTables(
        activeTables || []
      );

    const kitchenIssues =
      detectKitchenIssues(
        activeOrders || []
      );


    const liveMission =
      generateLiveMission(
        operationalContext
      );






    // =====================================
    // AI INSIGHTS
    // =====================================

    const insights =
      generateOperationalInsights({

        operationalContext,

        vipTables,

        kitchenIssues,

      });


    // =====================================
    // LIVE NOTIFICATIONS
    // =====================================

    const notifications =
      generateLiveNotifications({

        insights,

        vipTables,

        kitchenIssues,

        operationalContext,

      });
















    // =====================================
    // OPERATIONAL SCORE
    // =====================================

    const operationalScore =
      buildOperationalScore({

        revenueToday:
          operationalContext.revenueToday,

        activeOrders:
          activeOrders?.length || 0,

        delayedOrders:
          kitchenIssues?.delayedOrders?.length || 0,

        vipTables:
          vipTables?.length || 0,

      });




    // =====================================
    // OPERATIONAL SCORE
    // =====================================

    


    // =====================================
    // AI ACTIONS
    // =====================================

    const aiActions =
      generateAIActions({

        vipTables,

        kitchenIssues,

        operationalContext,

      });





    // =====================================
    // LIVE TASKS
    // =====================================

    const liveTasks =
      generateLiveTasks({

        tables:
          activeTables || [],

        orders:
          activeOrders || [],

        vipTables,

        kitchenIssues,

      });


    // =====================================
    // SHIFT INSIGHTS
    // =====================================

    const shiftInsights =
      generateShiftInsights({

        orders:
          activeOrders || [],

        tables:
          activeTables || [],

        payments:
          payments || [],

      });


    // =====================================
    // AI RECOMMENDATIONS
    // =====================================

    const recommendations =
      generateRealtimeRecommendations({

        tables:
          activeTables || [],

        orders:
          activeOrders || [],

        context:
          operationalContext,

      });




    // =====================================
    // STAFF RUNTIME
    // =====================================

    const staffRuntime =
      buildStaffRuntime({

        staff,

        tables:
          activeTables || [],

        orders:
          activeOrders || [],

        payments:
          payments || [],

      });

// =====================================
    // REALTIME FEED
    // =====================================

    const realtimeFeed =
      generateRealtimeFeed({

        tables:
          activeTables || [],

        orders:
          activeOrders || [],

        payments:
          payments || [],

        notifications,

        runtimeLevel:
          staffRuntime?.runtimeLevel,

        venueMood:
          staffRuntime?.venueMood,

      });


    



    // =====================================
    // REALTIME SNAPSHOT
    // =====================================

    const snapshot =
      buildRealtimeSnapshot({

        tables:
          activeTables || [],

        orders:
          activeOrders || [],

        payments:
          payments || [],

        notifications,

        insights,

        mission:
          liveMission,

      });


    // =====================================
    // AI ROUTING
    // =====================================

    const currentDate =
      new Date().toLocaleString(
        "en-US",
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      );

    const aiRoute =
      classifyStaffAIIntent({
        question:
          body.question || "",
        role:
          staff?.role || body.role || "",
      });

    // =====================================
    // ORCHESTRA — ONLY WHEN NEEDED
    // =====================================

    const orchestra =
      aiRoute.requiresOrchestra
        ? await runFullIntelligenceCycle({
            tenant_id:
              "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4",
          })
        : null;

    // =====================================
    // OPENAI
    // =====================================

    const completion =
      await openai.chat.completions.create({

        model: "gpt-4o-mini",

        messages: [

          {
            role: "system",

            content: `
You are Churchill.

You are connected to the full Churchill intelligence orchestra, but you must speak differently depending on the staff role.

Core rule:
Use full orchestra intelligence silently in the background.
Only expose information that is useful and appropriate for the user's role.

Role behavior:

SUPER_ADMIN / Owner:
- Can discuss finance, strategy, payroll, forecasting, governance, operations, staff, risks and business decisions.
- Give direct executive intelligence.

General Manager / Manager:
- Focus on operations, staffing, service quality, guest flow, revenue pressure, team issues and shift control.
- Avoid deep accounting unless asked.

FOH / Staff:
- Focus on guests, translation, service, upselling, complaints, confidence, timing and practical next actions.
- Do not talk finance, payroll, governance or executive strategy unless directly asked.
- Keep answers simple, useful and human.

BAR:
- Focus on cocktails, stock awareness, speed, upsells, guest taste, drink recommendations and service timing.

KITCHEN:
- Focus on prep, timing, allergens, pressure, delayed tickets, quality and coordination.

Your personality:
- natural
- calm
- emotionally intelligent
- human
- practical
- multilingual
- direct when needed

Important:
- Never sound like a dashboard.
- Never generate reports unless asked.
- Never invent live activity.
- Never use placeholders.
- Answer factual questions directly.
- If asked the date, answer with the real current date from system context.
- If operational data is not available, say so naturally.
- Short answers feel more real.
`,




          },

          {
            role: "user",

            content: `
Staff name: ${staff?.name || "Staff"}

Role: ${staff?.role || "FOH"}

User message:
${body.question || "Hello"}

Venue mood:
${staffRuntime?.venueMood || "Luxury"}

Runtime level:
${staffRuntime?.runtimeLevel || "NORMAL"}

Current date and time:
${currentDate}

AI route:
${JSON.stringify(aiRoute)}

ORCHESTRA INTELLIGENCE:
${
  aiRoute.requiresOrchestra
    ? JSON.stringify(orchestra?.report || {})
    : "Not used for this request."
}

Routing rules:
- If intent is translation, translate directly. Do not mention finance, operations, or reports.
- If intent is date_time, answer the date/time directly.
- If intent is conversation, talk naturally without using orchestra.
- If intent is operations or finance, use orchestra intelligence only where useful.
- If data is unavailable, say it naturally.
`,

          },

        ],

      });

    return Response.json({

      success: true,

      runtimeLevel:
        staffRuntime?.runtimeLevel,

      venueMood:
        staffRuntime?.venueMood,

      nightlifePhase:
        staffRuntime?.nightlifePhase,

      pressureLevel:
        staffRuntime?.pressureLevel,

      aiConfidence:
        staffRuntime?.aiConfidence,

      shiftEnergy:
        staffRuntime?.shiftEnergy,

      realtimeFeed,

      liveTasks,

      shiftInsights,

      recommendations,

      operationalScore,

      message:
        completion
          .choices?.[0]
          ?.message
          ?.content || "",

      shiftInsights,

      recommendations,

      operationalScore,

      operationalScore,

      aiActions,

      operationalScore,

      aiActions,

      realtimeFeed,

      liveTasks,

      staffRuntime,

      snapshot,

      mission: liveMission,

      insights,

      notifications,

      vipTables,

      kitchenIssues,

      runtime: {

        revenueToday,

        occupiedTables,

        openOrders,

      },

    });

  } catch (error) {

    console.error(error);

    return Response.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );

  }

}