import type { ReactNode } from "react";
import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCurrentAuthUser } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";

export default function RequireAuth({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const setUser = useAuthStore((state) => state.setUser);
  const clearUser = useAuthStore((state) => state.clearUser);
  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getCurrentAuthUser,
    retry: false,
    staleTime: 60_000,
  });
  const currentUser = meQuery.data?.data ?? null;
  const shouldRedirect = !meQuery.isLoading && (meQuery.isError || !currentUser);

  useEffect(() => {
    if (currentUser) {
      setUser(currentUser);
    }
  }, [currentUser, setUser]);

  useEffect(() => {
    if (shouldRedirect) {
      clearUser();
    }
  }, [clearUser, shouldRedirect]);

  if (meQuery.isLoading) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">正在确认登录状态...</div>;
  }

  if (shouldRedirect) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  return <>{children ?? <Outlet />}</>;
}
