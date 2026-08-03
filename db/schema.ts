import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  householdId: text("household_id").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("cat_household_name").on(t.householdId, t.name)]);

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  householdId: text("household_id").notNull(),
  date: text("date").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  member: text("member").notNull().default("משותף"),
  status: text("status").notNull().default("completed"),
  source: text("source").notNull().default("occasional"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recurring = pgTable("recurring", {
  id: serial("id").primaryKey(),
  householdId: text("household_id").notNull(),
  title: text("title").notNull(),
  amount: integer("amount").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  member: text("member").notNull().default("משותף"),
  day: integer("day").notNull(),
  startDate: text("start_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  householdId: text("household_id").notNull(),
  month: text("month").notNull(),
  categoryId: integer("category_id").notNull().references(() => categories.id),
  amount: integer("amount").notNull(),
}, (t) => [uniqueIndex("budget_unique").on(t.householdId, t.month, t.categoryId)]);
