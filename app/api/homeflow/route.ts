import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { requireHomeflowUser } from "@/auth";
import { db } from "@/db";
import { budgets, categories, recurring, transactions } from "@/db/schema";

const HOUSEHOLD_ID = "onn-noy-home";
const defaults = [["דיור", "#6366f1"], ["רכב ודלק", "#f97316"], ["קניות", "#14b8a6"], ["שונות", "#64748b"], ["אוכל בחוץ", "#e879f9"], ["מנויים", "#8b5cf6"], ["חשבונות", "#0ea5e9"], ["בריאות", "#ef4444"], ["הכנסה", "#22c55e"]] as const;

async function authorize() {
  return requireHomeflowUser();
}

async function seed() {
  const existing = await db.select({ id: categories.id }).from(categories).where(eq(categories.householdId, HOUSEHOLD_ID)).limit(1);
  if (!existing.length) await db.insert(categories).values(defaults.map(([name, color]) => ({ householdId: HOUSEHOLD_ID, name, color })));
}

export async function GET(req: Request) {
  if (!await authorize()) return Response.json({ error: "unauthorized" }, { status: 401 });
  await seed();
  const month = new URL(req.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const [cats, tx, rules, buds] = await Promise.all([
    db.select().from(categories).where(eq(categories.householdId, HOUSEHOLD_ID)).orderBy(asc(categories.id)),
    db.select().from(transactions).where(and(eq(transactions.householdId, HOUSEHOLD_ID), gte(transactions.date, `${month}-01`), lte(transactions.date, `${month}-31`))).orderBy(desc(transactions.date)),
    db.select().from(recurring).where(eq(recurring.householdId, HOUSEHOLD_ID)).orderBy(desc(recurring.createdAt)),
    db.select().from(budgets).where(and(eq(budgets.householdId, HOUSEHOLD_ID), eq(budgets.month, month))),
  ]);
  return Response.json({ categories: cats, transactions: tx, recurring: rules, budgets: buds });
}

export async function POST(req: Request) {
  if (!await authorize()) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json() as Record<string, unknown>;
  const action = String(body.action ?? "");
  if (action === "tx") {
    await db.insert(transactions).values({ householdId: HOUSEHOLD_ID, date: String(body.date), description: String(body.description), type: String(body.type), amount: Math.round(Number(body.amount) * 100), categoryId: Number(body.categoryId), member: String(body.member), status: String(body.status ?? "completed"), source: String(body.source ?? "occasional") });
    return Response.json({ ok: true });
  }
  if (action === "delete") {
    await db.delete(transactions).where(and(eq(transactions.householdId, HOUSEHOLD_ID), eq(transactions.id, Number(body.id))));
    return Response.json({ ok: true });
  }
  if (action === "category") {
    await db.insert(categories).values({ householdId: HOUSEHOLD_ID, name: String(body.name), color: String(body.color) });
    return Response.json({ ok: true });
  }
  if (action === "rule") {
    await db.insert(recurring).values({ householdId: HOUSEHOLD_ID, title: String(body.title), amount: Math.round(Number(body.amount) * 100), categoryId: Number(body.categoryId), member: String(body.member), day: Number(body.day), startDate: String(body.startDate) });
    return Response.json({ ok: true });
  }
  if (action === "generate") {
    const [rule] = await db.select().from(recurring).where(and(eq(recurring.householdId, HOUSEHOLD_ID), eq(recurring.id, Number(body.id)))).limit(1);
    if (rule) await db.insert(transactions).values({ householdId: HOUSEHOLD_ID, date: `${body.month}-${String(Math.min(28, rule.day)).padStart(2, "0")}`, description: rule.title, type: "expense", amount: rule.amount, categoryId: rule.categoryId, member: rule.member, status: "planned", source: "fixed" });
    return Response.json({ ok: true });
  }
  if (action === "budget") {
    const amount = Math.round(Number(body.amount) * 100);
    await db.insert(budgets).values({ householdId: HOUSEHOLD_ID, month: String(body.month), categoryId: Number(body.categoryId), amount }).onConflictDoUpdate({ target: [budgets.householdId, budgets.month, budgets.categoryId], set: { amount } });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "unsupported" }, { status: 400 });
}
