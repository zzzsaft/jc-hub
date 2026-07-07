import { Navigate, useLocation } from "react-router-dom";

type LegacyRedirectProps = {
  from?: string;
  to: string;
};

export function LegacyRedirect({ from, to }: LegacyRedirectProps) {
  const location = useLocation();
  const suffix = from && location.pathname.startsWith(from) ? location.pathname.slice(from.length) : "";

  return <Navigate to={`${to}${suffix}${location.search}${location.hash}`} replace />;
}
