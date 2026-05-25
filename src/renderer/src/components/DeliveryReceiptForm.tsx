// stub — will be replaced in Task 11
interface Props { open: boolean; onClose: () => void; soId: string; details: any[]; onSuccess: () => void }
export default function DeliveryReceiptForm({ open, onClose }: Props) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="bg-slate-800 p-6 rounded text-white">
        Delivery Receipt — coming soon
      </div>
    </div>
  )
}
