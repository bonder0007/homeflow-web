import Link from "next/link";

export default function UnauthorizedPage() {
  return <main className="login-page"><section className="login-card">
    <div className="login-logo">!</div><h1>אין הרשאת גישה</h1>
    <p>החשבון שבחרת אינו אחד משני החשבונות המורשים.</p>
    <Link className="google-button" href="/login">חזרה לכניסה</Link>
  </section></main>;
}
