import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbsItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbsItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav
      aria-label="breadcrumb"
      className={cn("mb-4", className)}
      data-testid="breadcrumbs"
    >
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((it, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="inline-flex items-center gap-1.5 min-w-0">
              {i > 0 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {isLast || !it.href ? (
                <span
                  className="text-foreground font-medium truncate"
                  aria-current={isLast ? "page" : undefined}
                  data-testid={`breadcrumb-current-${i}`}
                >
                  {it.label}
                </span>
              ) : (
                <Link
                  href={it.href}
                  className="hover:text-foreground transition-colors truncate"
                  data-testid={`breadcrumb-link-${i}`}
                >
                  {it.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
