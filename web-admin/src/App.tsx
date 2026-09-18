import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPages";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DashboardPage } from "./pages/DashboardPages";
import { LocationsPage } from "./pages/LocationPages";
import { DepartmentsPages } from "./pages/DepartmentsPages";
import { AssetCategoriesPages } from "./pages/AssetCategoriesPages";
import { UsersPages } from "./pages/UsersPages";
import { RolesPages } from "./pages/RolesPages";
import { AssetMovementsPage } from "./pages/AssetMovementPages";
import { AssetsPages } from "./pages/AssetsPages";
import { Layout } from "./components/Layout";
import { IssueBatchesPages } from "./pages/IssueBatchesPages";
import { StockTakesPages } from "./pages/StockTakesPages";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace/>} />
      <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/locations" element={<LocationsPage />} />
            <Route path="/departments" element={<DepartmentsPages />} />
            <Route path="/assets" element={<AssetsPages />} />
            <Route path="/asset-categories" element={<AssetCategoriesPages />} />
            <Route path="/issue-batches" element={<IssueBatchesPages />} />
            <Route path="/stock-takes" element={<StockTakesPages />} />
            <Route path="/users" element={<UsersPages />} />
            <Route path="/roles" element={<RolesPages />} />
            <Route path="/asset-movements" element={<AssetMovementsPage />} />
          </Route>
        </Route>
    </Routes>
  );
}

export default App;
