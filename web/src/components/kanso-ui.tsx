import type * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type ClassNameProps = { className?: string };

export function PageHeader({
  children,
  className,
  ...props
}: React.ComponentProps<"header">): React.ReactElement {
  return (
    <header
      data-testid="page-header"
      className={cn(
        "kanso-page-header",
        className,
      )}
      {...props}
    >
      {children}
    </header>
  );
}

export function PageContent({
  children,
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div
      data-testid="page-content"
      className={cn("kanso-page-content flex-1 overflow-auto", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function SurfaceCard({
  children,
  className,
  ...props
}: React.ComponentProps<"div">): React.ReactElement {
  return (
    <div className={cn("kanso-surface-card", className)} {...props}>
      {children}
    </div>
  );
}

export function PrimaryButton({
  className,
  ...props
}: ButtonProps): React.ReactElement {
  return <Button className={cn("kanso-primary-button", className)} {...props} />;
}

export function QuietButton({
  className,
  ...props
}: ButtonProps): React.ReactElement {
  return <Button variant="outline" className={cn("kanso-quiet-button", className)} {...props} />;
}

export function FieldLabel({
  children,
  className,
  ...props
}: React.ComponentProps<"label">): React.ReactElement {
  return (
    <label
      className={cn("kanso-field-label", className)}
      {...props}
    >
      {children}
    </label>
  );
}


export function ActivityRow({
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & ClassNameProps): React.ReactElement {
  return (
    <div className={cn("activity-row flex items-center gap-3 py-3.5", className)} {...props}>
      {children}
    </div>
  );
}
