import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getTenantId } from "@/lib/xase/server-auth"

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const tenantId = await getTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
    }

    const mockBillingInfo = {
      plan: "Enterprise",
      nextBillingDate: "Feb 15, 2026",
      paymentMethod: "•••• 4242",
      totalSpent: 2847.45,
    }

    return NextResponse.json({ billing: mockBillingInfo })
  } catch (error) {
    console.error("Error fetching billing info:", error)
    return NextResponse.json({ error: "Failed to fetch billing info" }, { status: 500 })
  }
}
