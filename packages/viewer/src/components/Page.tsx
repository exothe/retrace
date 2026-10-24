import { Link } from "react-router";
import { strings } from "../strings.ts";
import { ChevronLeftIcon } from "./icons.tsx";

/** Page frame: optional back link and a centered content column. */
export function Page({
  back,
  wide = false,
  children,
}: {
  back?: { to: string; label: string; state?: unknown };
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className={`mx-auto w-full px-4 pt-3 pb-16 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>
      {back && (
        <Link
          to={back.to}
          state={back.state}
          className="mb-2 -ml-1 inline-flex items-center gap-0.5 rounded-md py-1 pr-2 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ChevronLeftIcon className="size-4" />
          {back.label}
        </Link>
      )}
      {children}
    </main>
  );
}

export function Loading() {
  return (
    <p role="status" className="py-16 text-center text-zinc-500">
      {strings.loading}
    </p>
  );
}

export function ErrorMessage({
  title,
  detail,
  retry,
}: {
  title: string;
  detail?: string;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="py-16 text-center">
      <p className="font-medium">{title}</p>
      {detail && <p className="mt-1 text-sm text-zinc-500">{detail}</p>}
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-4 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {strings.retry}
        </button>
      )}
    </div>
  );
}
