import FinanceShellNavigation from "@/components/workspace/finance/FinanceShellNavigation";

export default function FinanceLayout({ children }) {
  return (
    <>
      <FinanceShellNavigation />
      {children}
    </>
  );
}
