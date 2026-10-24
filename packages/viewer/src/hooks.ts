import { useEffect } from "react";
import { strings } from "./strings.ts";

export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ${strings.appTitle}` : strings.appTitle;
  }, [title]);
}
