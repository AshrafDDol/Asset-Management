import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Raises a toast whenever an error string transitions from empty to set.
 *
 * Success is reported at the call site, where the outcome is known. Failures are
 * watched here instead: the page hooks put the message in state rather than
 * returning it, and reading that state right after `await` would give the value
 * from the previous render.
 *
 * Handlers clear the error before each attempt, so repeating the same failure
 * still produces a new toast.
 */
export function useErrorToast(error?: string) {
  const previous = useRef("");

  useEffect(() => {
    const current = error || "";
    if (current && current !== previous.current) toast.error(current);
    previous.current = current;
  }, [error]);
}

/**
 * The same watcher for pages that already build a success message in state
 * (Issue Batches reports counts back this way), so the wording is not duplicated.
 */
export function useSuccessToast(message?: string) {
  const previous = useRef("");

  useEffect(() => {
    const current = message || "";
    if (current && current !== previous.current) toast.success(current);
    previous.current = current;
  }, [message]);
}
