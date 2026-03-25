type SharedPlanPayload = {
  goalLabel: string;
  recommendation: string;
  reasoning: string;
  nextAction: string;
  progress: number;
  stepPlan: string[];
  roadmap: Array<{ title: string; focus: string }>;
  tasks: Array<{ title: string; completed: boolean }>;
  milestones: Array<{ label: string; target: string; done: boolean }>;
};

function decodePayload(input: string | null): SharedPlanPayload | null {
  if (!input) return null;

  try {
    const json = decodeURIComponent(escape(atob(input)));
    return JSON.parse(json) as SharedPlanPayload;
  } catch {
    return null;
  }
}

export default async function SharedPlanPage({
  searchParams
}: {
  searchParams: Promise<{ payload?: string }>;
}) {
  const params = await searchParams;
  const payload = decodePayload(params.payload || null);

  if (!payload) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>Shared plan unavailable</h1>
          <p className="muted">This share link is invalid or expired.</p>
          <a href="/" className="button primary">
            Open Nexa
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 24,
        background:
          "radial-gradient(circle at top left, rgba(70,194,255,0.12), transparent 26%), radial-gradient(circle at bottom right, rgba(115,240,198,0.08), transparent 24%), linear-gradient(180deg, #08111f 0%, #050a13 100%)",
        color: "white"
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <a href="/" className="button" style={{ display: "inline-block", marginBottom: 16 }}>
          Back to Nexa
        </a>

        <div
          style={{
            borderRadius: 28,
            padding: 24,
            background: "linear-gradient(135deg, rgba(16,32,55,0.96), rgba(9,18,31,0.98))",
            border: "1px solid rgba(126,164,206,0.14)"
          }}
        >
          <div style={{ fontSize: 12, color: "#84d9ff", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Shared Nexa plan
          </div>
          <div style={{ marginTop: 10, fontSize: 40, fontWeight: 700, lineHeight: 1.05 }}>
            {payload.goalLabel}
          </div>
          <div style={{ marginTop: 16, fontSize: 22, fontWeight: 700 }}>
            {payload.recommendation}
          </div>
          <div style={{ marginTop: 10, maxWidth: 760, color: "#b8cadf", lineHeight: 1.7 }}>
            {payload.reasoning}
          </div>
          <div style={{ marginTop: 16, color: "#dce8f5" }}>
            Progress: {payload.progress}% • Next action: {payload.nextAction}
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14
          }}
        >
          <div className="login-card">
            <h2>Step-by-step plan</h2>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
              {payload.stepPlan.join("\n")}
            </div>
          </div>
          <div className="login-card">
            <h2>Weekly roadmap</h2>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
              {payload.roadmap.map((week) => `${week.title}: ${week.focus}`).join("\n")}
            </div>
          </div>
          <div className="login-card">
            <h2>Tasks checklist</h2>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
              {payload.tasks.map((task) => `${task.completed ? "[x]" : "[ ]"} ${task.title}`).join("\n")}
            </div>
          </div>
          <div className="login-card">
            <h2>Milestones</h2>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
              {payload.milestones.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.label} • ${item.target}`).join("\n")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
