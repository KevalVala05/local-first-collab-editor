import React from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage()
{
  const session = await getServerSession(authOptions);

  if (!session)
  {
    redirect("/login");
  }

  return <DashboardClient session={session} />;
}
