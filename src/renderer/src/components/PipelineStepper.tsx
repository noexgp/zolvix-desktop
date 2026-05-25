// src/renderer/src/components/PipelineStepper.tsx
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// Steps when bypassApproval = false (normal flow)
const FULL_STEPS = ['Draft', 'Submitted', 'Pending Approval', 'Approved', 'Delivered', 'Invoiced']

// Steps when bypassApproval = true (submission auto-approves)
const BYPASS_STEPS = ['Draft', 'Submitted', 'Approved', 'Delivered', 'Invoiced']

// Map API status values to step index in each step array
const STATUS_INDEX_FULL: Record<string, number> = {
  draft:               0,
  pending_approval:    2,
  approved:            3,
  partially_delivered: 4,
  delivered:           4,
  invoiced:            5,
  rejected:            2,  // stuck at Pending Approval step when rejected
}

const STATUS_INDEX_BYPASS: Record<string, number> = {
  draft:               0,
  approved:            2,
  partially_delivered: 3,
  delivered:           3,
  invoiced:            4,
  rejected:            1,  // stuck at Submitted step when rejected
}

interface PipelineStepperProps {
  status: string
  bypassApproval: boolean
}

export default function PipelineStepper({ status, bypassApproval }: PipelineStepperProps) {
  const steps = bypassApproval ? BYPASS_STEPS : FULL_STEPS
  const indexMap = bypassApproval ? STATUS_INDEX_BYPASS : STATUS_INDEX_FULL
  const currentIdx = indexMap[status] ?? 0
  const isRejected = status === 'rejected'

  return (
    <div className="flex items-start gap-0 py-2">
      {steps.map((step, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        const isLast = i === steps.length - 1

        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center min-w-0">
              <div className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-[10px] border flex-shrink-0',
                done   && !isRejected && 'bg-green-500 border-green-500 text-white',
                active && !isRejected && 'bg-amber-500 border-amber-500 text-white',
                active && isRejected  && 'bg-red-500 border-red-500 text-white',
                !done && !active      && 'bg-slate-800 border-slate-600 text-slate-500'
              )}>
                {done && !isRejected ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className={cn(
                'text-[9px] mt-0.5 whitespace-nowrap text-center',
                done   && !isRejected && 'text-green-400',
                active && !isRejected && 'text-amber-400',
                active && isRejected  && 'text-red-400',
                !done && !active      && 'text-slate-600'
              )}>
                {step}
                {active && isRejected && ' ✕'}
              </span>
            </div>
            {!isLast && (
              <div className={cn(
                'h-0.5 flex-1 mb-3 mx-1',
                done && !isRejected ? 'bg-green-500' : 'bg-slate-700'
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}
