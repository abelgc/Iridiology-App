import { createAdminClient } from '@/lib/supabase/server'
import { proposeReportModification } from '@/lib/claude/modify-report'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient()
  const { id } = await params

  try {
    const { instruction } = (await request.json()) as { instruction: string }

    if (!instruction || !instruction.trim()) {
      return NextResponse.json({ error: 'Instruction is required' }, { status: 400 })
    }

    const { data: reportData, error: reportError } = await supabase
      .from('reports')
      .select('report_content')
      .eq('id', id)
      .single()

    if (reportError || !reportData) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const result = await proposeReportModification(reportData.report_content, instruction)

    if ('code' in result) {
      return NextResponse.json({ error: result.message }, { status: 422 })
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400 }
    )
  }
}
