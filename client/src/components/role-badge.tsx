import { cn } from "@/lib/utils";

type RoleKey =
  | "platform_admin"
  | "support"
  | "tenant_admin"
  | "office_manager"
  | "instructor"
  | "student"
  | "parent";

const roleConfig: Record<RoleKey, { label: string; className: string }> = {
  platform_admin: {
    label: "Platform Admin",
    className: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700/50",
  },
  support: {
    label: "Support",
    className: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-700/50",
  },
  tenant_admin: {
    label: "Admin",
    className: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700/50",
  },
  office_manager: {
    label: "Office Manager",
    className: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700/50",
  },
  instructor: {
    label: "Instructor",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700/50",
  },
  student: {
    label: "Student",
    className: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-700/50",
  },
  parent: {
    label: "Parent",
    className: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700/50",
  },
};

interface RoleBadgeProps {
  role: string;
  className?: string;
  "data-testid"?: string;
}

export function RoleBadge({ role, className, ...props }: RoleBadgeProps) {
  const config = roleConfig[role as RoleKey] || {
    label: role,
    className: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold",
        config.className,
        className
      )}
      {...props}
    >
      {config.label}
    </span>
  );
}

export function getRoleLabel(role: string): string {
  return roleConfig[role as RoleKey]?.label || role;
}
