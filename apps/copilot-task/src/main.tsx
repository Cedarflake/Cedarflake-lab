import React from "react";
import ReactDOM from "react-dom/client";
import { TemplateProvider } from "./template/TemplateProvider";
import TasksWaitlistPage from "./pages/tasks-waitlist/TasksWaitlistPage";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TemplateProvider>
      <TasksWaitlistPage />
    </TemplateProvider>
  </React.StrictMode>,
);
