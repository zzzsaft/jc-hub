import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";

export default function PermissionRoute({ permission }: { permission: string }) {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  return hasPermission(permission) ? <Outlet /> : <Navigate to="/error/no-permission" replace />;
}
