"use client";

import { useRouter } from "next/navigation";

export function DeleteVehicleButton({ id }: { id: string }) {
  const router = useRouter();

  async function handleDelete() {
    await fetch(`/api/v1/vehicles/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="rounded-full border border-line-strong px-3 py-1.5 text-sm font-semibold hover:border-danger hover:text-danger"
    >
      Remove
    </button>
  );
}
