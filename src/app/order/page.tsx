import { prisma } from "@/lib/prisma";
import { getMenu } from "@/lib/catalog";
import { OrderClient } from "./order-client";

export const dynamic = "force-dynamic";

export default async function OnlineOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch: branchParam } = await searchParams;
  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { code: "asc" },
  });

  const branch = branches.find((b) => b.id === branchParam) ?? branches[0];

  if (!branch) {
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-bold text-coffee-900">Coffee Shopp</h1>
        <p className="mt-2 text-coffee-500">
          Online ordering isn&apos;t available right now.
        </p>
      </main>
    );
  }

  const menu = await getMenu(branch.id);

  return (
    <OrderClient
      branch={branch}
      branches={branches}
      menu={menu}
    />
  );
}
