import { HashRouter, Route, Routes } from "react-router";
import { ErrorMessage, Page } from "./components/Page.tsx";
import { DayListPage } from "./pages/DayListPage.tsx";
import { DayPage } from "./pages/DayPage.tsx";
import { TripListPage } from "./pages/TripListPage.tsx";
import { strings } from "./strings.ts";

/** Routes (SPEC section 10.2). Hash routing, so the site needs no server configuration. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<TripListPage />} />
      <Route path="/:slug" element={<DayListPage />} />
      <Route path="/:slug/:date" element={<DayPage />} />
      <Route path="/:slug/:date/:mediaId" element={<DayPage />} />
      <Route
        path="*"
        element={
          <Page back={{ to: "/", label: strings.backToTrips }}>
            <ErrorMessage title={strings.pageNotFound} />
          </Page>
        }
      />
    </Routes>
  );
}

export function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
