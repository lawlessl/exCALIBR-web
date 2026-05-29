import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home/Home";
import Results from "./pages/Results/Results";
import Support from "./pages/Support/Support"
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/results/:jobId" element={<Results />} />
        <Route path="/support" element={<Support />} />
      </Routes>
    </BrowserRouter>
  );
}
