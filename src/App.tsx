import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import Landing from "./pages/Landing.tsx";
import Auth from "./pages/Auth.tsx";
import Marketplace from "./pages/Marketplace.tsx";
import PentesterDetail from "./pages/PentesterDetail.tsx";
import MyPentesterProfile from "./pages/MyPentesterProfile.tsx";
import MyEngagements from "./pages/MyEngagements.tsx";
import EngagementDetail from "./pages/EngagementDetail.tsx";
import Connections from "./pages/Connections.tsx";
import Assets from "./pages/Assets.tsx";
import Compliance from "./pages/Compliance.tsx";
import AISecurity from "./pages/AISecurity.tsx";
import ThreatIntel from "./pages/ThreatIntel.tsx";
import ScansList from "./pages/ScansList.tsx";
import ScanDetail from "./pages/ScanDetail.tsx";
import BoardReport from "./pages/BoardReport.tsx";
import Vendors from "./pages/Vendors.tsx";
import Checklist from "./pages/Checklist.tsx";
import Incidents from "./pages/Incidents.tsx";
import Questionnaire from "./pages/Questionnaire.tsx";
import Digest from "./pages/Digest.tsx";
import NotFound from "./pages/NotFound.tsx";
import Pricing from "./pages/Pricing.tsx";
import BillingSuccess from "./pages/BillingSuccess.tsx";
import AISoc from "./pages/AISoc.tsx";
import AISocInvestigation from "./pages/AISocInvestigation.tsx";
import SiemConnections from "./pages/SiemConnections.tsx";
import AttackPaths from "./pages/AttackPaths.tsx";
import EmployeeHygiene from "./pages/EmployeeHygiene.tsx";
import { ProductTour } from "@/components/cspm/ProductTour";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ProductTour />
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/marketplace/pentester/:id" element={<PentesterDetail />} />
            <Route path="/dashboard" element={<Index />} />
            <Route path="/dashboard/pentester-profile" element={<MyPentesterProfile />} />
            <Route path="/dashboard/engagements" element={<MyEngagements />} />
            <Route path="/dashboard/engagements/:id" element={<EngagementDetail />} />
            <Route path="/connections" element={<Connections />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/compliance" element={<Compliance />} />
            <Route path="/ai-security" element={<AISecurity />} />
            <Route path="/threat-intel" element={<ThreatIntel />} />
            <Route path="/scans" element={<ScansList />} />
            <Route path="/scans/:id" element={<ScanDetail />} />
            <Route path="/report" element={<BoardReport />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/checklist" element={<Checklist />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/questionnaire" element={<Questionnaire />} />
            <Route path="/digest" element={<Digest />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/billing/success" element={<BillingSuccess />} />
            <Route path="/ai-soc" element={<AISoc />} />
            <Route path="/ai-soc/connections" element={<SiemConnections />} />
            <Route path="/ai-soc/:id" element={<AISocInvestigation />} />
            <Route path="/attack-paths" element={<AttackPaths />} />
            <Route path="/employee-hygiene" element={<EmployeeHygiene />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
