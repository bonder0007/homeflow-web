import { auth, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await auth()) redirect("/");
  const { error } = await searchParams;
  return <main className="login-page">
    <section className="login-card">
      <div className="login-logo">H</div>
      <p className="eyebrow">HOMEFLOW</p>
      <h1>התזרים הביתי שלנו</h1>
      <p>כניסה מאובטחת לחשבון המשותף של און ונוי</p>
      {error && <div className="login-error">החשבון הזה אינו מורשה להיכנס למערכת.</div>}
      <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
        <button className="google-button" type="submit"><span>G</span>המשך עם Google</button>
      </form>
      <small>הגישה מותרת רק לשני חשבונות Google שאושרו מראש.</small>
    </section>
  </main>;
}
