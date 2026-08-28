import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

interface AffiliateContextType {
  isAffiliate: boolean;
  affiliateId: number | null;
  isLoading: boolean;
}

const AffiliateContext = createContext<AffiliateContextType>({
  isAffiliate: false,
  affiliateId: null,
  isLoading: true,
});

export function AffiliateProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();

  const { data, isLoading } = useQuery<{ isAffiliate: boolean; affiliateId: number | null }>({
    queryKey: ["/api/affiliate/membership"],
    enabled: isAuthenticated,
  });

  return (
    <AffiliateContext.Provider
      value={{
        isAffiliate: data?.isAffiliate ?? false,
        affiliateId: data?.affiliateId ?? null,
        isLoading,
      }}
    >
      {children}
    </AffiliateContext.Provider>
  );
}

export function useAffiliate() {
  return useContext(AffiliateContext);
}
