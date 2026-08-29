import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/context-platform.css";
import "./styles/context-school.css";
import "./styles/context-public.css";

createRoot(document.getElementById("root")!).render(<App />);
