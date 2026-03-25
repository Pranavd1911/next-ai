export type GoalId =
  | "career"
  | "build"
  | "make_money"
  | "improve_self";

export type GoalQuestion = {
  id: string;
  label: string;
  placeholder: string;
};

export type GoalTask = {
  id: string;
  title: string;
  completed: boolean;
  dueLabel: string;
};

export type GoalMilestone = {
  id: string;
  label: string;
  target: string;
  done: boolean;
};

export type RoadmapWeek = {
  title: string;
  focus: string;
  deliverables: string[];
};

export type OutputCard = {
  id: string;
  title: string;
  kind: "plan" | "strategy" | "resume" | "message" | "roadmap" | "tracker";
  content: string;
  cta: string;
};

export type GoalWorkspace = {
  goalId: GoalId;
  goalLabel: string;
  generatedAt: string;
  answers: Record<string, string>;
  recommendation: string;
  reasoning: string;
  stepPlan: string[];
  roadmap: RoadmapWeek[];
  tasks: GoalTask[];
  milestones: GoalMilestone[];
  outputs: OutputCard[];
  nextAction: string;
  planName: "Free" | "Pro";
  dailyGoalLimit: number;
  growthPrompt: string;
};

export type WorkspaceAnalytics = {
  goalClicks: Record<GoalId, number>;
  executeClicks: number;
  shareClicks: number;
  templateClicks: number;
  integrationClicks: number;
  voiceClicks: number;
  lastDropOffPoint: string;
};

export type PersonalWorkspace = {
  activeGoalId: GoalId | null;
  workspaces: GoalWorkspace[];
  preferences: {
    executionMode: boolean;
    pricingPlan: "free" | "pro";
  };
  usage: {
    date: string;
    goalsCreated: number;
  };
  momentum: {
    streakDays: number;
    completedActions: number;
    lastCompletedAt: string | null;
  };
  analytics: WorkspaceAnalytics;
  updatedAt: string;
};

export const GOAL_OPTIONS: Array<{
  id: GoalId;
  label: string;
  blurb: string;
  accent: string;
}> = [
  {
    id: "career",
    label: "Career",
    blurb: "Get hired faster with a structured plan.",
    accent: "#46c2ff"
  },
  {
    id: "build",
    label: "Build something",
    blurb: "Turn ideas into real products.",
    accent: "#73f0c6"
  },
  {
    id: "make_money",
    label: "Make money",
    blurb: "Find and execute income opportunities.",
    accent: "#f6c65b"
  },
  {
    id: "improve_self",
    label: "Improve yourself",
    blurb: "Build habits that actually stick.",
    accent: "#ff8b8b"
  }
];

const GOAL_QUESTIONS: Record<GoalId, GoalQuestion[]> = {
  career: [
    {
      id: "role_target",
      label: "What role are you targeting?",
      placeholder: "Software, design, marketing, ops, product, consulting, etc."
    },
    {
      id: "background",
      label: "What experience do you already have?",
      placeholder: "Projects, internships, freelance work, or strongest skills"
    }
  ],
  build: [
    {
      id: "idea_space",
      label: "Idea Space",
      placeholder: "Which market or problem space are you most interested in?"
    },
    {
      id: "time_budget",
      label: "Time Budget",
      placeholder: "How many hours per week can you commit?"
    }
  ],
  make_money: [
    {
      id: "income_target",
      label: "Income Target",
      placeholder: "How much do you want to make and by when?"
    },
    {
      id: "skills",
      label: "Marketable Skills",
      placeholder: "What can you currently sell or learn quickly?"
    },
    {
      id: "available_time",
      label: "Time available",
      placeholder: "How many hours each week can you put in?"
    }
  ],
  improve_self: [
    {
      id: "habit_goal",
      label: "What do you want to improve?",
      placeholder: "Health, consistency, fitness, learning, focus, discipline"
    },
    {
      id: "current_state",
      label: "What’s your current routine?",
      placeholder: "What does a normal day or week look like right now?"
    }
  ]
};

function createTask(title: string, dueLabel: string, completed = false): GoalTask {
  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    completed,
    dueLabel
  };
}

function createMilestone(label: string, target: string): GoalMilestone {
  return {
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    label,
    target,
    done: false
  };
}

function buildRoadmap(goalId: GoalId): RoadmapWeek[] {
  switch (goalId) {
    case "career":
      return [
        {
          title: "Week 1",
          focus: "Position for the target role",
          deliverables: ["Resume draft", "20 target companies", "application tracker"]
        },
        {
          title: "Week 2",
          focus: "Start applications and outreach",
          deliverables: ["10 applications", "5 cold emails", "LinkedIn refresh"]
        },
        {
          title: "Week 3",
          focus: "Build proof and interview stories",
          deliverables: ["portfolio proof", "story bank", "interview notes"]
        },
        {
          title: "Week 4",
          focus: "Interview and follow-up sprint",
          deliverables: ["follow-ups", "mock interviews", "offer pipeline"]
        }
      ];
    case "build":
      return [
        {
          title: "Week 1",
          focus: "Narrow to one problem",
          deliverables: ["ICP definition", "Problem statement", "3 founder interviews"]
        },
        {
          title: "Week 2",
          focus: "Validate willingness to pay",
          deliverables: ["Offer test", "Landing page", "10 user calls"]
        },
        {
          title: "Week 3",
          focus: "Build the smallest useful product",
          deliverables: ["MVP scope", "Waitlist", "Pricing draft"]
        },
        {
          title: "Week 4",
          focus: "Launch and learn",
          deliverables: ["Public launch", "Feedback loop", "Retention review"]
        }
      ];
    case "make_money":
      return [
        {
          title: "Week 1",
          focus: "Choose one income engine",
          deliverables: ["Service offer", "Rate card", "Lead list"]
        },
        {
          title: "Week 2",
          focus: "Outbound and proof",
          deliverables: ["20 messages", "Portfolio proof", "1 paid pilot"]
        },
        {
          title: "Week 3",
          focus: "Systemize delivery",
          deliverables: ["Delivery checklist", "Upsell path", "Referral ask"]
        },
        {
          title: "Week 4",
          focus: "Scale the channel",
          deliverables: ["Repeatable outreach", "Case study", "Revenue review"]
        }
      ];
    case "improve_self":
      return [
        {
          title: "Week 1",
          focus: "Set baseline and remove friction",
          deliverables: ["Starting measurements", "Meal defaults", "Workout schedule"]
        },
        {
          title: "Week 2",
          focus: "Lock consistency",
          deliverables: ["4 workouts", "Sleep target", "Daily step streak"]
        },
        {
          title: "Week 3",
          focus: "Increase intensity carefully",
          deliverables: ["Progressive overload", "Nutrition review", "Energy log"]
        },
        {
          title: "Week 4",
          focus: "Review results and adjust",
          deliverables: ["Check-in photos", "Habit score", "Next month plan"]
        }
      ];
  }
}

function buildStepPlan(goalId: GoalId): string[] {
  switch (goalId) {
    case "career":
      return [
        "Choose one role target and align your proof to it.",
        "Build one sharp resume with quantified outcomes.",
        "Apply consistently instead of browsing endlessly.",
        "Use outreach to increase interview odds.",
        "Practice interview stories until they feel reusable."
      ];
    case "build":
      return [
        "Pick one painful problem in a market you can access quickly.",
        "Validate demand with calls before building.",
        "Launch a landing page and collect real intent signals.",
        "Build only the workflow users will pay for.",
        "Set pricing early and ship publicly fast."
      ];
    case "make_money":
      return [
        "Choose one offer that maps to an existing skill.",
        "Package the offer around a concrete business outcome.",
        "Run daily outreach instead of exploring too many options.",
        "Close a paid pilot and turn it into a case study.",
        "Double down on the best acquisition channel."
      ];
    case "improve_self":
      return [
        "Set a single measurable target instead of vague improvement.",
        "Create repeatable meal and movement defaults.",
        "Track adherence daily, not motivation.",
        "Increase training gradually and protect sleep.",
        "Review weekly metrics and adjust one lever at a time."
      ];
  }
}

function buildRecommendation(goalId: GoalId, answers: Record<string, string>) {
  switch (goalId) {
    case "career":
      return {
        recommendation:
          "You should narrow to one role target first.",
        reasoning:
          "A focused application story makes your resume, outreach, and interview prep materially stronger than applying broadly without a clear narrative."
      };
    case "build":
      return {
        recommendation:
          "You should start with a narrow B2B painkiller, not a broad consumer idea.",
        reasoning:
          "B2B validation is faster, pricing is clearer, and early customer conversations are easier to turn into revenue than chasing scale before demand exists."
      };
    case "make_money":
      return {
        recommendation:
          `You should start with a service offer before trying to build passive income.`,
        reasoning:
          "Services create cash, proof, and customer insight fastest. That gives you leverage to productize later instead of guessing what people will pay for."
      };
    case "improve_self":
      return {
        recommendation:
          "You should reduce friction before chasing intensity.",
        reasoning:
          "Simple daily habits stick longer, create visible progress, and make more advanced routines easier to sustain."
      };
  }
}

function buildTasks(goalId: GoalId): GoalTask[] {
  switch (goalId) {
    case "career":
      return [
        createTask("Finalize one role-specific resume", "Today"),
        createTask("Shortlist 20 companies and roles", "This week"),
        createTask("Send 10 targeted outreach messages", "This week"),
        createTask("Complete 2 mock interviews", "This week")
      ];
    case "build":
      return [
        createTask("Define one user segment and one painful workflow", "Today"),
        createTask("Book 10 validation calls", "This week"),
        createTask("Publish a landing page with pricing test", "This week"),
        createTask("Collect 3 strong willingness-to-pay signals", "This week")
      ];
    case "make_money":
      return [
        createTask("Choose one offer and one target customer", "Today"),
        createTask("Build a simple proof-of-work page", "This week"),
        createTask("Send 20 outbound messages", "This week"),
        createTask("Close 1 paid pilot", "This week")
      ];
    case "improve_self":
      return [
        createTask("Set one daily habit target", "Today"),
        createTask("Plan your weekly routine", "This week"),
        createTask("Create 2 low-friction defaults", "This week"),
        createTask("Log adherence for 7 days", "This week")
      ];
  }
}

function buildMilestones(goalId: GoalId): GoalMilestone[] {
  switch (goalId) {
    case "career":
      return [
        createMilestone("Interview-ready profile", "7 days"),
        createMilestone("50 targeted applications", "30 days"),
        createMilestone("First offer in pipeline", "90 days")
      ];
    case "build":
      return [
        createMilestone("10 validation conversations", "7 days"),
        createMilestone("First paying user", "30 days"),
        createMilestone("Repeatable acquisition loop", "90 days")
      ];
    case "make_money":
      return [
        createMilestone("First paid pilot", "7-14 days"),
        createMilestone("₹50k+ monthly revenue", "30-45 days"),
        createMilestone("Productized offer", "90 days")
      ];
    case "improve_self":
      return [
        createMilestone("7-day consistency streak", "7 days"),
        createMilestone("Visible routine lock-in", "30 days"),
        createMilestone("Measured health transformation", "90 days")
      ];
  }
}

function buildOutputs(goalId: GoalId, answers: Record<string, string>): OutputCard[] {
  const answerSummary = Object.entries(answers)
    .map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`)
    .join("\n");

  switch (goalId) {
    case "career":
      return [
        {
          id: "resume-card",
          title: "Resume",
          kind: "resume",
          cta: "Download",
          content:
            `ROLE-SPECIFIC RESUME\n\nHeadline: Outcome-driven candidate with clear proof of execution.\n\nSummary:\n- Strong fit for the role you are targeting\n- Evidence of ownership, communication, and measurable impact\n- Resume tailored for faster hiring conversion\n\nExperience bullets to use:\n- Improved a workflow or outcome through structured execution\n- Shipped work with measurable results\n- Worked across functions and communicated decisions clearly\n\nContext:\n${answerSummary}`
        },
        {
          id: "companies-card",
          title: "20 Companies",
          kind: "strategy",
          cta: "Download",
          content:
            "Microsoft\nGoogle\nAmazon\nMeta\nAdobe\nAtlassian\nNotion\nStripe\nFigma\nCanva\nRazorpay\nCRED\nMeesho\nSwiggy\nZepto\nBlinkit\nPhonePe\nGroww\nFreshworks\nHubSpot"
        },
        {
          id: "email-card",
          title: "Cold Email Template",
          kind: "message",
          cta: "Copy",
          content:
            "Subject: Quick question about breaking into this role\n\nHi [Name],\n\nI’m targeting roles in this area and have been building my proof around execution, problem solving, and measurable outcomes. I noticed your path and wanted to ask if you’d be open to a 10-minute chat or any advice on how to stand out.\n\nThanks,\n[Your Name]"
        },
        {
          id: "plan-card",
          title: "Plan",
          kind: "plan",
          cta: "Execute this",
          content:
            "Week 1: finalize resume, shortlist 20 companies, send 10 emails, and complete 2 mock interviews."
        }
      ];
    case "build":
      return [
        {
          id: "plan-card",
          title: "Plan",
          kind: "plan",
          cta: "Execute this",
          content:
            "Move from idea to validation to landing page to pricing to launch without adding side quests."
        },
        {
          id: "business-plan-card",
          title: "Business Plan",
          kind: "strategy",
          cta: "Download",
          content:
            `Problem, ICP, solution wedge, pricing hypothesis, and launch plan.\nContext:\n${answerSummary}`
        },
        {
          id: "roadmap-card",
          title: "Launch Strategy",
          kind: "roadmap",
          cta: "Edit",
          content:
            "Interview users, test willingness to pay, then ship a focused MVP and a public launch sequence."
        },
        {
          id: "message-card",
          title: "Validation Outreach",
          kind: "message",
          cta: "Copy",
          content:
            "I’m researching how teams currently handle this workflow and where it breaks. Could I get 15 minutes to learn how you solve it today?"
        }
      ];
    case "make_money":
      return [
        {
          id: "plan-card",
          title: "Plan",
          kind: "plan",
          cta: "Execute this",
          content:
            "Package one service around an outcome, send targeted outbound, then convert the first client into repeatable proof."
        },
        {
          id: "offer-card",
          title: "Strategy",
          kind: "strategy",
          cta: "Edit",
          content:
            `Offer: Solve one expensive problem fast.\nIdeal client: the buyer who already feels the pain.\nContext:\n${answerSummary}`
        },
        {
          id: "email-card",
          title: "Cold Email",
          kind: "message",
          cta: "Copy",
          content:
            "I noticed a gap in how you’re currently handling this workflow. I can help you improve it within 7 days with a focused pilot. Interested?"
        },
        {
          id: "tracker-card",
          title: "Revenue Tracker",
          kind: "tracker",
          cta: "Execute",
          content:
            "Track leads contacted, replies, calls booked, proposals sent, pilots closed, and revenue this week."
        }
      ];
    case "improve_self":
      return [
        {
          id: "plan-card",
          title: "Plan",
          kind: "plan",
          cta: "Execute this",
          content:
            "Start with sleep, steps, and 4 consistent workouts. Only add complexity after adherence is stable."
        },
        {
          id: "routine-card",
          title: "Strategy",
          kind: "strategy",
          cta: "Edit",
          content:
            `Default routine: protect sleep window, hit daily movement target, and train on a fixed schedule.\nContext:\n${answerSummary}`
        },
        {
          id: "checklist-card",
          title: "Weekly Roadmap",
          kind: "roadmap",
          cta: "Download",
          content:
            "Mon/Wed/Fri strength, Tue/Thu walking plus mobility, Sat review, Sun reset and prep."
        },
        {
          id: "tracker-card",
          title: "Progress Tracker",
          kind: "tracker",
          cta: "Execute",
          content:
            "Log sleep, workouts, steps, protein, water, and weekly measurements."
        }
      ];
  }
}

export function getGoalQuestions(goalId: GoalId) {
  return GOAL_QUESTIONS[goalId].slice(0, 2);
}

export function createWorkspace(goalId: GoalId, answers: Record<string, string>): GoalWorkspace {
  const option = GOAL_OPTIONS.find((item) => item.id === goalId);
  const recommendation = buildRecommendation(goalId, answers);

  return {
    goalId,
    goalLabel: option?.label || goalId,
    generatedAt: new Date().toISOString(),
    answers,
    recommendation: recommendation.recommendation,
    reasoning: recommendation.reasoning,
    stepPlan: buildStepPlan(goalId),
    roadmap: buildRoadmap(goalId),
    tasks: buildTasks(goalId),
    milestones: buildMilestones(goalId),
    outputs: buildOutputs(goalId, answers),
    nextAction: buildTasks(goalId)[0]?.title || "Start the first task",
    planName: "Free",
    dailyGoalLimit: 3,
    growthPrompt: "Share your plan"
  };
}

export function createEmptyWorkspace(): PersonalWorkspace {
  return {
    activeGoalId: null,
    workspaces: [],
    preferences: {
      executionMode: true,
      pricingPlan: "free"
    },
    usage: {
      date: new Date().toISOString().slice(0, 10),
      goalsCreated: 0
    },
    momentum: {
      streakDays: 3,
      completedActions: 0,
      lastCompletedAt: null
    },
    analytics: {
      goalClicks: {
        career: 0,
        build: 0,
        make_money: 0,
        improve_self: 0
      },
      executeClicks: 0,
      shareClicks: 0,
      templateClicks: 0,
      integrationClicks: 0,
      voiceClicks: 0,
      lastDropOffPoint: "none"
    },
    updatedAt: new Date().toISOString()
  };
}

export function upsertWorkspace(
  state: PersonalWorkspace,
  workspace: GoalWorkspace
): PersonalWorkspace {
  const workspaces = [
    workspace,
    ...state.workspaces.filter((item) => item.goalId !== workspace.goalId)
  ].slice(0, 8);

  return {
    ...state,
    activeGoalId: workspace.goalId,
    workspaces,
    updatedAt: new Date().toISOString()
  };
}

export function computeProgress(workspace?: GoalWorkspace | null) {
  if (!workspace) return 0;
  const completedTasks = workspace.tasks.filter((task) => task.completed).length;
  const completedMilestones = workspace.milestones.filter((item) => item.done).length;
  const total = workspace.tasks.length + workspace.milestones.length;
  if (total === 0) return 0;
  return Math.round(((completedTasks + completedMilestones) / total) * 100);
}

export function getWorkspaceStorageKey(ownerId: string) {
  return `nexa_workspace_v2:${ownerId}`;
}

export function getDailyGoalUsage(state: PersonalWorkspace) {
  const today = new Date().toISOString().slice(0, 10);
  if (state.usage.date !== today) {
    return {
      date: today,
      goalsCreated: 0
    };
  }

  return state.usage;
}
