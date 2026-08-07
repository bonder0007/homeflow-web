import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { requireHomeflowUser } from "@/auth";
import { db } from "@/db";
import { budgets, categories, recurring, transactions } from "@/db/schema";

const HOUSEHOLD_ID = "onn-noy-home";
const defaults = [["דיור", "#6366f1"], ["רכב ודלק", "#f97316"], ["קניות", "#14b8a6"], ["שונות", "#64748b"], ["אוכל בחוץ", "#e879f9"], ["מנויים", "#8b5cf6"], ["חשבונות", "#0ea5e9"], ["בריאות", "#ef4444"], ["הכנסה", "#22c55e"], ["BIT", "#2563eb"], ["PAYBOX", "#06b6d4"], ["AliExpress", "#ef4444"]] as const;

async function authorize() {
  return requireHomeflowUser();
}

async function seed() {
  await db.insert(categories)
    .values(defaults.map(([name, color]) => ({ householdId: HOUSEHOLD_ID, name, color })))
    .onConflictDoNothing({ target: [categories.householdId, categories.name] });
}

export async function GET(req: Request) {
  if (!await authorize()) return Response.json({ error: "unauthorized" }, { status: 401 });
  await seed();
  const params = new URL(req.url).searchParams;
  const month = params.get("month") ?? new Date().toISOString().slice(0, 7);
  const compareMonths = [...new Set((params.get("compare") ?? "").split(",").filter(m => /^\d{4}-\d{2}$/.test(m)))].slice(0, 12);
  const [cats, tx, pendingTransactions, rules, buds, compareTransactions] = await Promise.all([
    db.select().from(categories).where(eq(categories.householdId, HOUSEHOLD_ID)).orderBy(asc(categories.id)),
    db.select().from(transactions).where(and(eq(transactions.householdId, HOUSEHOLD_ID), gte(transactions.date, `${month}-01`), lte(transactions.date, `${month}-31`), ne(transactions.status, "pending_approval"))).orderBy(desc(transactions.date)),
    db.select().from(transactions).where(and(eq(transactions.householdId, HOUSEHOLD_ID), gte(transactions.date, `${month}-01`), lte(transactions.date, `${month}-31`), eq(transactions.status, "pending_approval"))).orderBy(desc(transactions.date)),
    db.select().from(recurring).where(eq(recurring.householdId, HOUSEHOLD_ID)).orderBy(desc(recurring.createdAt)),
    db.select().from(budgets).where(and(eq(budgets.householdId, HOUSEHOLD_ID), eq(budgets.month, month))),
    compareMonths.length ? db.select().from(transactions).where(and(eq(transactions.householdId, HOUSEHOLD_ID), ne(transactions.status, "pending_approval"), or(...compareMonths.map(m => and(gte(transactions.date, `${m}-01`), lte(transactions.date, `${m}-31`)))))).orderBy(asc(transactions.date)) : Promise.resolve([]),
  ]);
  await Promise.all(tx.filter(item => item.source === "fixed").map(async item => {
    const rule = rules.find(r => r.title === item.description && r.categoryId === item.categoryId && r.member === item.member);
    if (rule) await db.update(transactions).set({ source: `fixed:${rule.id}` }).where(and(eq(transactions.householdId, HOUSEHOLD_ID), eq(transactions.id, item.id), eq(transactions.source, "fixed")));
  }));
  const generatedRecurringIds = rules.filter(rule => tx.some(item => item.source === `fixed:${rule.id}` || (item.source === "fixed" && item.description === rule.title && item.categoryId === rule.categoryId && item.member === rule.member))).map(rule => rule.id);
  return Response.json({ categories: cats, transactions: tx, pendingTransactions, recurring: rules, budgets: buds, generatedRecurringIds, compareTransactions });
}

export async function POST(req: Request) {
  if (!await authorize()) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json() as Record<string, unknown>;
  const action = String(body.action ?? "");
  if (action === "tx") {
    await db.insert(transactions).values({ householdId: HOUSEHOLD_ID, date: String(body.date), description: String(body.description), type: String(body.type), amount: Math.round(Number(body.amount) * 100), categoryId: Number(body.categoryId), member: String(body.member), status: String(body.status ?? "completed"), source: String(body.source ?? "occasional") });
    return Response.json({ ok: true });
  }
  if (action === "editTx") {
    const id = Number(body.id), amount = Math.round(Math.abs(Number(body.amount)) * 100), date = String(body.date), description = String(body.description).trim();
    if (!Number.isFinite(id) || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !description) return Response.json({ error: "invalid_transaction" }, { status: 400 });
    await db.update(transactions).set({ date, description, type: body.type === "income" ? "income" : "expense", amount, categoryId: Number(body.categoryId), member: String(body.member) }).where(and(eq(transactions.householdId, HOUSEHOLD_ID), eq(transactions.id, id), ne(transactions.status, "pending_approval")));
    return Response.json({ ok: true });
  }
  if (action === "importLeumi" || action === "importStatement") {
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 2000) as Record<string, unknown>[] : [];
    if (rows.some(row => row.categoryId == null || !Number.isFinite(Number(row.categoryId)))) return Response.json({ error: "category_required" }, { status: 400 });
    const result = await db.transaction(async tx => {
      let imported = 0, duplicates = 0;
      const occurrences = new Map<string, number>();
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${HOUSEHOLD_ID}:statement-import`}))`);
      for (const row of rows) {
        const date = String(row.date ?? ""), description = String(row.description ?? "").trim(), type = row.type === "income" ? "income" : "expense", amount = Math.round(Math.abs(Number(row.amount)) * 100);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !description || !amount) continue;
        const key = `${date}\u0000${description}\u0000${type}\u0000${amount}`, occurrence = (occurrences.get(key) ?? 0) + 1;
        occurrences.set(key, occurrence);
        const [existing] = await tx.select({ count: sql<number>`count(*)::int` }).from(transactions).where(and(eq(transactions.householdId, HOUSEHOLD_ID), eq(transactions.date, date), eq(transactions.description, description), eq(transactions.type, type), eq(transactions.amount, amount)));
        if (existing.count >= occurrence) { duplicates++; continue; }
        const categoryId = row.categoryId == null ? null : Number(row.categoryId);
        const source = row.source === "max" ? "max-import" : "leumi-import";
        await tx.insert(transactions).values({ householdId: HOUSEHOLD_ID, date, description, type, amount, categoryId, member: "משותף", status: "pending_approval", source });
        imported++;
      }
      return { imported, duplicates };
    });
    return Response.json({ ok: true, ...result });
  }
  if (action === "categorizePending") {
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isFinite).slice(0, 2000) : [];
    if (ids.length) await db.update(transactions).set({ categoryId: Number(body.categoryId) }).where(and(eq(transactions.householdId, HOUSEHOLD_ID), eq(transactions.status, "pending_approval"), inArray(transactions.id, ids)));
    return Response.json({ ok: true });
  }
  if (action === "approvePending") {
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isFinite).slice(0, 2000) : [];
    if (ids.length) await db.update(transactions).set({ status: "completed" }).where(and(eq(transactions.householdId, HOUSEHOLD_ID), eq(transactions.status, "pending_approval"), isNotNull(transactions.categoryId), inArray(transactions.id, ids)));
    return Response.json({ ok: true });
  }
  if (action === "deletePending") {
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isFinite).slice(0, 2000) : [];
    if (ids.length) await db.delete(transactions).where(and(eq(transactions.householdId, HOUSEHOLD_ID), eq(transactions.status, "pending_approval"), inArray(transactions.id, ids)));
    return Response.json({ ok: true });
  }
  if (action === "delete") {
    await db.delete(transactions).where(and(eq(transactions.householdId, HOUSEHOLD_ID), eq(transactions.id, Number(body.id))));
    return Response.json({ ok: true });
  }
  if (action === "deleteMany") {
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number).filter(Number.isFinite))].slice(0, 2000) : [];
    if (ids.length) await db.delete(transactions).where(and(eq(transactions.householdId, HOUSEHOLD_ID), ne(transactions.status, "pending_approval"), inArray(transactions.id, ids)));
    return Response.json({ ok: true, deleted: ids.length });
  }
  if (action === "deleteRule") {
    await db.delete(recurring).where(and(eq(recurring.householdId, HOUSEHOLD_ID), eq(recurring.id, Number(body.id))));
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
  if (action === "editRule") {
    await db.update(recurring).set({ title: String(body.title), amount: Math.round(Number(body.amount) * 100), categoryId: Number(body.categoryId), member: String(body.member), day: Number(body.day), startDate: String(body.startDate) }).where(and(eq(recurring.householdId, HOUSEHOLD_ID), eq(recurring.id, Number(body.id))));
    return Response.json({ ok: true });
  }
  if (action === "generate") {
    const ruleId = Number(body.id), month = String(body.month);
    const added = await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${HOUSEHOLD_ID}:${ruleId}:${month}`}))`);
      const [rule] = await tx.select().from(recurring).where(and(eq(recurring.householdId, HOUSEHOLD_ID), eq(recurring.id, ruleId))).limit(1);
      if (!rule) return false;
      const [existing] = await tx.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.householdId, HOUSEHOLD_ID), gte(transactions.date, `${month}-01`), lte(transactions.date, `${month}-31`), or(eq(transactions.source, `fixed:${rule.id}`), and(eq(transactions.source, "fixed"), eq(transactions.description, rule.title), eq(transactions.member, rule.member))))).limit(1);
      if (existing) return false;
      await tx.insert(transactions).values({ householdId: HOUSEHOLD_ID, date: `${month}-${String(Math.min(28, rule.day)).padStart(2, "0")}`, description: rule.title, type: "expense", amount: rule.amount, categoryId: rule.categoryId, member: rule.member, status: "planned", source: `fixed:${rule.id}` });
      return true;
    });
    return Response.json({ ok: true, added });
  }
  if (action === "budget") {
    const amount = Math.round(Number(body.amount) * 100);
    await db.insert(budgets).values({ householdId: HOUSEHOLD_ID, month: String(body.month), categoryId: Number(body.categoryId), amount }).onConflictDoUpdate({ target: [budgets.householdId, budgets.month, budgets.categoryId], set: { amount } });
    return Response.json({ ok: true });
  }
  return Response.json({ error: "unsupported" }, { status: 400 });
}
