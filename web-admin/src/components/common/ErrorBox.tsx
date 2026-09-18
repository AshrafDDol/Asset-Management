import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ErrorBox({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <Alert variant="destructive">
      <AlertCircleIcon />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** Outcome message for the batch operations, which report counts back to the user. */
export function SuccessBox({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <Alert>
      <CheckCircle2Icon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
