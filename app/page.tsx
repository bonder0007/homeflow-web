import { redirect } from "next/navigation";
import { requireHomeflowUser } from "@/auth";
import HomeFlow from "./ui";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireHomeflowUser();
  if (!user) redirect("/login");
  return <HomeFlow name={user.name} />;
}
