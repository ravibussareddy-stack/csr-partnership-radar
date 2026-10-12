// Smooth page changes: the old page fades out and lifts slightly, the new one fades in and settles
// (React <ViewTransition> + the browser View Transitions API; browsers without it just switch pages).
import { ViewTransition } from "react";

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
