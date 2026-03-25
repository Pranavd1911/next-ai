export default function PrivacyPage() {
  return (
    <div className="legal-shell">
      <div className="legal-card">
        <h1>Privacy Policy</h1>
        <p>
          This Privacy Policy explains what data NEXA collects, how it is used,
          and how user content is handled.
        </p>

        <h2>What We Collect</h2>
        <ul>
          <li>Account information such as email address when you sign up.</li>
          <li>Goal selections, preferences, progress state, and usage activity.</li>
          <li>Chat content, uploaded files, and generated outputs when needed to provide the product.</li>
          <li>Basic analytics such as clicks, drop-off points, and feature usage.</li>
        </ul>

        <h2>How We Use Data</h2>
        <ul>
          <li>To generate plans, outputs, reminders, and progress tracking.</li>
          <li>To improve product quality, reliability, and safety.</li>
          <li>To maintain account security and prevent abuse.</li>
        </ul>

        <h2>Chat and Output Storage</h2>
        <p>
          NEXA may store chats, preferences, progress state, and generated outputs
          so users can return to ongoing work. Sensitive data should not be shared
          unless necessary.
        </p>

        <h2>Security</h2>
        <p>
          NEXA uses secure authentication and avoids exposing API keys in the client.
          No system can guarantee absolute security, so users should avoid entering
          highly sensitive information unless required.
        </p>

        <h2>Contact</h2>
        <p>
          If you have privacy questions, contact the NEXA operator before using the product for sensitive workflows.
        </p>
      </div>
    </div>
  );
}
