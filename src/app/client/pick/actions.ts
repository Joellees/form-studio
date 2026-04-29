"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, fail, ok, runAction } from "@/lib/actions";
import { CLIENT_TENANT_COOKIE, listClientMemberships } from "@/lib/trainer";

const schema = z.object({ tenantId: z.string().uuid() });

/**
 * Pin the active studio for this Clerk user. The portal layout reads
 * the cookie to resolve which `clients` row drives the page. Only
 * accepts tenants the user is actually a member of — no spoofing.
 */
export async function setActiveStudio(raw: unknown): Promise<ActionResult<void>> {
  return runAction(schema, raw, async ({ tenantId }) => {
    const memberships = await listClientMemberships();
    const owns = memberships.some((m) => m.tenantId === tenantId);
    if (!owns) return fail("Not a member of that studio.");

    const jar = await cookies();
    jar.set(CLIENT_TENANT_COOKIE, tenantId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      // 60 days — long enough that the picker stays out of the way,
      // short enough that an inactive client gets re-prompted.
      maxAge: 60 * 60 * 24 * 60,
    });
    revalidatePath("/client");
    return ok();
  });
}
