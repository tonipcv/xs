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

    const { searchParams } = new URL(req.url)
    const period = searchParams.get("period") || "current"

    const mockUsageData = [
      {
        period: "Jan 2026",
        apiCalls: 125430,
        dataProcessed: 45600,
        cost: 342.5,
      },
      {
        period: "Dec 2025",
        apiCalls: 98200,
        dataProcessed: 38200,
        cost: 289.75,
      },
      {
        period: "Nov 2025",
        apiCalls: 112500,
        dataProcessed: 42100,
        cost: 315.2,
      },
    ]

    return NextResponse.json({ usage: mockUsageData })
  } catch (error) {
    console.error("Error fetching usage data:", error)
    return NextResponse.json({ error: "Failed to fetch usage data" }, { status: 500 })
  }
}
