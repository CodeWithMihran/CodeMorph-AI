import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-content">
        <div className="footer-left">
          <span className="footer-brand">CODEMORPH AI</span>
          <span className="footer-bullet">·</span>
          <span>AUTONOMOUS CODEBASE AUDITING &amp; VERIFIABLE STACK MIGRATION</span>
        </div>
        <div className="footer-badges">
          <span className="footer-pill">ZERO HOST EXECUTION</span>
          <span className="footer-pill">DOCKER NETWORK=NONE</span>
          <span className="footer-pill">AST IMPORTS VALIDATED</span>
        </div>
        <div className="footer-right">
          <Link href="/audit" className="footer-link">Audit</Link>
          <Link href="/feasibility" className="footer-link">Feasibility</Link>
          <Link href="/migrate" className="footer-link">Migration</Link>
          <Link href="/memory" className="footer-link">Procedural Rules</Link>
        </div>
      </div>
    </footer>
  );
}
