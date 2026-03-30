import { useConnectivityStore } from "@/stores/connectivity.store";

export function ConnectivityIndicator() {
  const isOnline = useConnectivityStore((s) => s.isOnline);

  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-2 w-2 rounded-full ${isOnline ? "bg-success" : "bg-destructive"}`}
      />
      <span className="text-xs text-muted-foreground">
        {isOnline ? "Online" : "Offline"}
      </span>
    </div>
  );
}
