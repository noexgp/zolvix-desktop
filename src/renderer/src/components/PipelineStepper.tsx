// stub — will be replaced in Task 9
interface Props { status: string; bypassApproval: boolean }
export default function PipelineStepper({ status }: Props) {
  return <div className="text-xs text-slate-500">Status: {status}</div>
}
