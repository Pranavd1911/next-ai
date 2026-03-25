import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nexa AI",
  description: "NEXA helps you plan and take action toward your goals."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer className="site-footer">
          <div className="site-footer-inner">
            <div className="site-footer-copy">
              NEXA helps you plan and take action toward your goals.
            </div>
            <div className="site-footer-links">
              <a href="/privacy">Privacy Policy</a>
              <a href="/terms">Terms of Service</a>
              <a href="/disclaimer">Disclaimer</a>
            </div>
            <div className="site-footer-note">
              NEXA provides AI-generated plans, suggestions, and outputs for informational and productivity purposes only. Users are responsible for reviewing and making their own decisions.
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
